'use strict';
// Northbound HTTP server: OSCQuery namespace + HOST_INFO, WebSocket (OSCQuery LISTEN/IGNORE
// with binary OSC updates, plus a JSON control protocol), REST helpers and the walk-around UI.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const osc = require('../osc/codec');
const ws = require('./ws');

const ACCESS = { r: 1, w: 2, rw: 3 };

class OscQueryServer {
  constructor(daemon) {
    this.daemon = daemon;
    this.shadow = daemon.shadow;
    this.log = daemon.log;
    this.clients = new Map(); // id -> client
    this._nextId = 1;
    this.server = http.createServer((req, res) => this._onRequest(req, res));
    this.server.on('upgrade', (req, socket, head) => this._onUpgrade(req, socket, head));
    this.shadow.on('changes', (changes) => this._broadcast(changes));
    this.shadow.on('stale', (ev) => this._broadcastJson({ COMMAND: 'STALE', DATA: ev }));
    daemon.on('deviceStatus', (st) => this._broadcastJson({ COMMAND: 'DEVICE_STATUS', DATA: st }));
    daemon.on('ruleFired', (ev) => this._broadcastJson({ COMMAND: 'RULE_FIRED', DATA: ev }));
    daemon.on('configChanged', (ev) => this._broadcastJson({ COMMAND: 'CONFIG_CHANGED', DATA: { ...ev, ui: daemon.config.ui, rules: daemon.rules.list(), devices: daemon.status().devices } }));
    this.shadow.on('unregister', () => this._broadcastJson({ COMMAND: 'TREE_CHANGED', DATA: {} }));
    this.uiFile = path.join(__dirname, '..', '..', 'ui', 'index.html');
    this._pingTimer = setInterval(() => { for (const c of this.clients.values()) c.conn.ping(); }, 20000);
    if (this._pingTimer.unref) this._pingTimer.unref();
  }

  listen(port, host) {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => { this.port = this.server.address().port; resolve(this.port); });
    });
  }

  close() {
    clearInterval(this._pingTimer);
    for (const c of this.clients.values()) c.conn.close(1001, 'server shutdown');
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  clientCount() { return this.clients.size; }

  // ---------------------------------------------------------------- HTTP
  _onRequest(req, res) {
    const u = url.parse(req.url, true);
    const pathname = decodeURIComponent(u.pathname.replace(/\/+$/, '') || '/');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      const auth = this.daemon.auth;
      if (pathname === '/ui' || pathname === '/ui/index.html' || 'HTML' in u.query) return this._serveUi(res);
      if ('HOST_INFO' in u.query) return json(res, this.hostInfo(req));
      if (pathname === '/api/auth' || pathname === '/api/login' || pathname === '/api/logout') return this._authApi(req, res, pathname, u);
      if (!auth.isAuthed(req, u.query)) {
        const readOnly = req.method === 'GET' && !pathname.startsWith('/api/');
        if (!(readOnly && auth.readPublic)) { res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer realm="koine"' }); return res.end(JSON.stringify({ error: 'PIN required', login: '/api/login' })); }
      }
      if (pathname.startsWith('/api/')) return this._api(req, res, pathname, u);
      if (req.method === 'POST') return this._postValue(req, res, pathname);
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      const node = this.buildTree(pathname);
      if (!node) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'no such node', path: pathname })); }
      const attrs = Object.keys(u.query).filter((k) => /^[A-Z_]+$/.test(k));
      if (attrs.length) {
        const attr = attrs[0];
        if (!(attr in node)) { res.writeHead(204); return res.end(); }
        return json(res, { [attr]: node[attr] });
      }
      return json(res, node);
    } catch (e) {
      this.log.error(`http ${req.method} ${req.url}: ${e.stack || e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  _authApi(req, res, pathname, u) {
    const auth = this.daemon.auth;
    if (pathname === '/api/auth' && req.method === 'GET') return json(res, auth.status(req, u.query));
    if (pathname === '/api/auth' && req.method === 'POST') {
      // Set or change the PIN. Allowed without a session only while no PIN exists yet.
      return readBody(req).then((body) => {
        const b = JSON.parse(body || '{}');
        if (auth.enabled() && !auth.isAuthed(req, u.query)) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'PIN required' })); }
        auth.setPin(b.current, b.pin === undefined ? null : b.pin);
        this.daemon.emit('configChanged', { what: 'auth' });
        // Everyone is logged out after a PIN change; the caller gets a fresh session.
        if (b.pin) { const r = auth.login(b.pin, req.socket.remoteAddress, 'pin-setter'); res.setHeader('Set-Cookie', auth.cookieHeader(r.token, r.exp)); return json(res, { ok: true, required: true, token: r.token }); }
        res.setHeader('Set-Cookie', auth.clearCookieHeader());
        return json(res, { ok: true, required: false });
      }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
    }
    if (pathname === '/api/login' && req.method === 'POST') {
      return readBody(req).then((body) => {
        const b = JSON.parse(body || '{}');
        if (!auth.enabled()) return json(res, { ok: true, required: false });
        const r = auth.login(b.pin, req.socket.remoteAddress, b.label || req.headers['user-agent'] || '');
        if (!r.ok) { this.log.warn(`login failed from ${req.socket.remoteAddress}: ${r.error}`); res.writeHead(r.retryInMs ? 429 : 401, { 'Content-Type': 'application/json', ...(r.retryInMs ? { 'Retry-After': String(Math.ceil(r.retryInMs / 1000)) } : {}) }); return res.end(JSON.stringify({ error: r.error, retryInMs: r.retryInMs })); }
        this.log.info(`login from ${req.socket.remoteAddress} (${b.label || 'browser'})`);
        res.setHeader('Set-Cookie', auth.cookieHeader(r.token, r.exp));
        return json(res, { ok: true, token: r.token, exp: r.exp });
      }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
    }
    if (pathname === '/api/logout' && req.method === 'POST') {
      auth.logout(auth.tokenFrom(req, u.query));
      res.setHeader('Set-Cookie', auth.clearCookieHeader());
      return json(res, { ok: true });
    }
    res.writeHead(405); res.end();
  }

  _serveUi(res) {
    let html;
    try { html = fs.readFileSync(this.uiFile); } catch (_) { res.writeHead(404); return res.end('ui not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  }

  _api(req, res, pathname, u) {
    if ((req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') && pathname !== '/api/set') return this._edit(req, res, pathname);
    if (pathname === '/api/status') return json(res, this.daemon.status());
    if (pathname === '/api/devices') return json(res, this.daemon.status().devices);
    if (pathname === '/api/profiles') return json(res, [...this.daemon.profiles.values()].map((p) => ({ id: p.id, name: p.name, vendor: p.vendor, models: p.models, transport: p.transport.type, verified: p.verified })));
    if (pathname === '/api/ui') return json(res, { name: this.daemon.config.daemon.name, ...this.daemon.config.ui });
    if (pathname === '/api/rules') return json(res, this.daemon.rules.list());
    if (pathname === '/api/paths') return json(res, [...this.shadow.nodes.values()].map((n) => ({ path: n.path, type: n.def.type, role: n.def.role, unit: n.def.unit, range: n.def.range, access: n.def.access })));
    if (pathname === '/api/snapshot') return json(res, this.shadow.snapshot(u.query.prefix || '/'));
    if (pathname === '/api/set') {
      if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
      return readBody(req).then((body) => {
        const b = JSON.parse(body || '{}');
        const items = Array.isArray(b) ? b : [b];
        const results = items.map((it) => ({ path: it.path, ...this.daemon.set(it.path, it.value, 'http') }));
        json(res, Array.isArray(b) ? results : results[0]);
      }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
    }
    if (pathname === '/api/resync') {
      for (const d of this.daemon.devices.values()) if (!u.query.device || u.query.device === d.id) d.resync();
      return json(res, { ok: true });
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unknown api endpoint' }));
  }

  /** Live editing endpoints: rules, pins, devices. Persisted to the store and broadcast to every client. */
  _edit(req, res, pathname) {
    return readBody(req).then((body) => {
      const b = body ? JSON.parse(body) : {};
      const { RulesEngine } = require('../rules/engine');
      const m = /^\/api\/(rules|ui|devices)(?:\/([^/]+))?(?:\/(test|enable))?$/.exec(pathname);
      if (!m) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'unknown api endpoint' })); }
      const [, kind, id, sub] = m;
      let out;
      if (kind === 'rules') {
        if (req.method === 'POST' && !id && sub !== 'test') out = this.daemon.addRuleLive(b);
        else if (req.method === 'POST' && (id === 'test' || sub === 'test')) { const c = RulesEngine.compile(b); out = { ok: true, name: c.name, when: c.when, actions: c.actions.map((a) => a.type), matches: [...this.shadow.nodes.keys()].filter((p) => c.whenRe.test(p)).slice(0, 50) }; }
        else if (req.method === 'POST' && id && sub === 'enable') { const r = this.daemon.rules.rules.find((x) => x.id === id); if (!r) throw new Error(`unknown rule "${id}"`); out = this.daemon.updateRuleLive(id, { ...r.raw, enabled: b.enabled !== false }); }
        else if (req.method === 'PUT' && id) out = this.daemon.updateRuleLive(id, b);
        else if (req.method === 'DELETE' && id) out = { removed: this.daemon.removeRuleLive(id) };
        else throw new Error('unsupported rules operation');
      } else if (kind === 'ui') {
        if (req.method === 'PUT' || req.method === 'POST') out = this.daemon.setUiLive(b);
        else throw new Error('unsupported ui operation');
      } else if (kind === 'devices') {
        if (req.method === 'POST' && !id) out = this.daemon.addDeviceLive(b);
        else if (req.method === 'DELETE' && id) out = { removed: this.daemon.removeDeviceLive(id) };
        else throw new Error('unsupported devices operation');
      }
      json(res, out);
    }).catch((e) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); });
  }

  _postValue(req, res, pathname) {
    return readBody(req).then((body) => {
      let value;
      try { const parsed = JSON.parse(body); value = parsed && typeof parsed === 'object' && 'VALUE' in parsed ? (Array.isArray(parsed.VALUE) ? parsed.VALUE[0] : parsed.VALUE) : (parsed && 'value' in parsed ? parsed.value : parsed); } catch (_) { value = body.trim(); }
      const r = this.daemon.set(pathname, value, 'http');
      res.writeHead(r.accepted ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    });
  }

  hostInfo(req) {
    const oscCfg = this.daemon.config.daemon.osc || {};
    const hostHeader = req && req.headers && req.headers.host ? req.headers.host.split(':')[0] : primaryIp();
    return {
      NAME: this.daemon.config.daemon.name,
      EXTENSIONS: { ACCESS: true, VALUE: true, RANGE: true, DESCRIPTION: true, TAGS: true, EXTENDED_TYPE: true, UNIT: true, CRITICAL: false, CLIPMODE: true, LISTEN: true, PATH_CHANGED: false, PATH_RENAMED: false, PATH_ADDED: false, PATH_REMOVED: false, HTML: true, ECHO: false },
      OSC_IP: hostHeader,
      OSC_PORT: this.daemon.oscServer ? this.daemon.oscServer.port : (oscCfg.port || null),
      OSC_TRANSPORT: 'UDP',
      WS_PORT: this.port,
      DAEMON: { version: require('../../package.json').version, devices: [...this.daemon.devices.keys()] },
    };
  }

  /** Build the OSCQuery JSON node for a path (container or parameter). */
  buildTree(prefix = '/') {
    prefix = prefix === '' ? '/' : prefix;
    const node = this.shadow.get(prefix);
    if (node) return this.paramNode(node);
    const nodes = this.shadow.list(prefix);
    if (nodes.length === 0 && prefix !== '/') return null;
    const root = { FULL_PATH: prefix, ACCESS: 0, CONTENTS: {} };
    if (prefix === '/') root.DESCRIPTION = `${this.daemon.config.daemon.name}: ${[...this.daemon.devices.values()].map((d) => `${d.id}=${d.profile.name}`).join(', ')}`;
    const base = prefix === '/' ? '' : prefix;
    for (const n of nodes) {
      const rel = n.path.slice(base.length).split('/').filter(Boolean);
      let cur = root;
      let full = base;
      for (let i = 0; i < rel.length; i++) {
        full += '/' + rel[i];
        const last = i === rel.length - 1;
        if (last) cur.CONTENTS[rel[i]] = this.paramNode(n);
        else {
          if (!cur.CONTENTS[rel[i]]) {
            cur.CONTENTS[rel[i]] = { FULL_PATH: full, ACCESS: 0, CONTENTS: {} };
            if (i === 0 && base === '') { const dev = this.daemon.devices.get(rel[0]); if (dev) cur.CONTENTS[rel[i]].DESCRIPTION = `${dev.name} (${dev.profile.name} @ ${dev.host})`; }
          }
          cur = cur.CONTENTS[rel[i]];
        }
      }
    }
    return root;
  }

  paramNode(n) {
    const d = n.def;
    const out = {
      FULL_PATH: n.path,
      TYPE: oscTypeTag(d, n.value),
      ACCESS: ACCESS[d.access] || 3,
      DESCRIPTION: d.description || `${d.template} (${d.type}${d.unit ? ', ' + d.unit : ''})`,
      VALUE: [n.value],
      TAGS: [d.deviceId, ...(d.role ? [d.role] : [])],
    };
    if (d.unit) out.UNIT = [d.unit];
    if (d.range) out.RANGE = [{ MIN: d.range[0], MAX: d.range[1] }];
    if (d.scale && d.scale.values) out.RANGE = [{ VALS: d.scale.values }];
    if (d.type === 'color') out.EXTENDED_TYPE = ['color'];
    if (d.role) out.EXTENDED_TYPE = out.EXTENDED_TYPE || [d.role];
    if (d.range) out.CLIPMODE = ['both'];
    if (n.stale) out.STALE = true;
    out.DEVICE = { raw: n.raw, scale: d.scaleDef.type, address: typeof d.device === 'string' ? d.device : JSON.stringify(d.device), updated: n.ts, source: n.source };
    return out;
  }

  // ---------------------------------------------------------------- WebSocket
  _onUpgrade(req, socket, head) {
    const u = url.parse(req.url, true);
    if (!this.daemon.auth.isAuthed(req, u.query)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"error":"PIN required"}');
      socket.destroy();
      this.log.debug(`websocket refused (no PIN session) from ${socket.remoteAddress}`);
      return;
    }
    const conn = ws.handleUpgrade(req, socket, head);
    if (!conn) return;
    const id = `ws:${this._nextId++}`;
    const client = { id, conn, listens: [], patterns: [], format: 'osc', all: false, remote: socket.remoteAddress };
    this.clients.set(id, client);
    this.log.info(`client ${id} connected from ${client.remote} (${this.clients.size} clients)`);
    conn.on('message', (data, isBinary) => this._onWsMessage(client, data, isBinary));
    conn.on('close', () => { this.clients.delete(id); this.log.info(`client ${id} disconnected (${this.clients.size} clients)`); });
    conn.on('error', () => {});
    conn.send(JSON.stringify({ COMMAND: 'HELLO', DATA: { id, name: this.daemon.config.daemon.name, devices: this.daemon.status().devices } }));
  }

  _onWsMessage(client, data, isBinary) {
    if (isBinary) {
      // Raw OSC over WebSocket: message with args = set, without args = query.
      let pkt;
      try { pkt = osc.decodePacket(data); } catch (e) { return client.conn.send(JSON.stringify({ COMMAND: 'ERROR', DATA: e.message })); }
      return this._handleOscPacket(client, pkt);
    }
    let msg;
    try { msg = JSON.parse(data); } catch (_) { return client.conn.send(JSON.stringify({ COMMAND: 'ERROR', DATA: 'invalid JSON' })); }
    const cmd = String(msg.COMMAND || msg.command || msg.type || '').toUpperCase();
    const D = msg.DATA !== undefined ? msg.DATA : msg.data;
    switch (cmd) {
      case 'LISTEN': this._listen(client, D, true); break;
      case 'IGNORE': this._listen(client, D, false); break;
      case 'LISTEN_ALL': client.all = true; break;
      case 'IGNORE_ALL': client.all = false; client.listens = []; client.patterns = []; break;
      case 'FORMAT': client.format = D === 'json' ? 'json' : 'osc'; client.conn.send(JSON.stringify({ COMMAND: 'FORMAT', DATA: client.format })); break;
      case 'SNAPSHOT': {
        const prefix = typeof D === 'string' ? D : '/';
        client.conn.send(JSON.stringify({ COMMAND: 'SNAPSHOT', DATA: this.shadow.snapshot(prefix) }));
        break;
      }
      case 'SET': {
        const items = Array.isArray(D) ? D : [D];
        const results = items.map((it) => ({ path: it.path, ...this.daemon.set(it.path, it.value, client.id) }));
        client.conn.send(JSON.stringify({ COMMAND: 'ACK', DATA: results, ID: msg.ID }));
        break;
      }
      case 'GET': {
        const paths = Array.isArray(D) ? D : [D];
        client.conn.send(JSON.stringify({ COMMAND: 'VALUES', DATA: paths.map((p) => { const n = this.shadow.get(p); return n ? { path: p, value: n.value, ts: n.ts, stale: n.stale, source: n.source } : { path: p, error: 'unknown path' }; }) }));
        break;
      }
      case 'TREE': client.conn.send(JSON.stringify({ COMMAND: 'TREE', DATA: this.buildTree(typeof D === 'string' ? D : '/') })); break;
      case 'STATUS': client.conn.send(JSON.stringify({ COMMAND: 'STATUS', DATA: this.daemon.status() })); break;
      case 'RULES': client.conn.send(JSON.stringify({ COMMAND: 'RULES', DATA: this.daemon.rules.list() })); break;
      case 'RESYNC': for (const d of this.daemon.devices.values()) if (!D || D === d.id) d.resync(); break;
      case 'PING': client.conn.send(JSON.stringify({ COMMAND: 'PONG', DATA: Date.now() })); break;
      default: client.conn.send(JSON.stringify({ COMMAND: 'ERROR', DATA: `unknown command "${cmd}"` }));
    }
  }

  _handleOscPacket(client, pkt) {
    if (pkt.elements) { for (const el of pkt.elements) this._handleOscPacket(client, el); return; }
    if (pkt.args.length === 0) {
      const re = osc.patternToRegExp(pkt.address);
      for (const n of this.shadow.nodes.values()) if (re.test(n.path)) client.conn.send(encodeValue(n.path, n.value, n.def));
      return;
    }
    const value = pkt.args[0].value;
    const re = /[*?[{]/.test(pkt.address) ? osc.patternToRegExp(pkt.address) : null;
    if (re) { for (const n of this.shadow.nodes.values()) if (re.test(n.path)) this.daemon.set(n.path, value, client.id); }
    else {
      const r = this.daemon.set(pkt.address, value, client.id);
      if (!r.accepted) client.conn.send(JSON.stringify({ COMMAND: 'ERROR', DATA: `${pkt.address}: ${r.reason}` }));
    }
  }

  _listen(client, pathOrPattern, on) {
    const list = Array.isArray(pathOrPattern) ? pathOrPattern : [pathOrPattern];
    for (const p of list) {
      if (typeof p !== 'string') continue;
      const isPattern = /[*?[{]/.test(p) || p.endsWith('/');
      if (on) {
        let pat = null;
        if (isPattern) {
          pat = client.patterns.find((x) => x.src === p);
          if (!pat) { pat = { src: p, re: osc.patternToRegExp(p.endsWith('/') ? p + '*' : p), prefix: p.endsWith('/') ? p : null }; client.patterns.push(pat); }
        } else if (!client.listens.includes(p)) client.listens.push(p);
        // Immediately deliver current value(s) so a reconnecting client syncs from cache.
        const initial = [];
        for (const n of this.shadow.nodes.values()) {
          const hit = pat ? (pat.prefix ? n.path.startsWith(pat.prefix) : pat.re.test(n.path)) : n.path === p;
          if (hit) initial.push({ path: n.path, value: n.value, ts: n.ts, source: n.source, deviceId: n.deviceId, stale: n.stale });
        }
        if (initial.length) this._sendChanges(client, initial, true);
      } else {
        client.listens = client.listens.filter((x) => x !== p);
        client.patterns = client.patterns.filter((x) => x.src !== p);
      }
    }
  }

  _wants(client, p) {
    if (client.all) return true;
    if (client.listens.includes(p)) return true;
    for (const pat of client.patterns) if (pat.prefix ? p.startsWith(pat.prefix) : pat.re.test(p)) return true;
    return false;
  }

  _broadcast(changes) {
    for (const client of this.clients.values()) {
      const mine = changes.filter((c) => c.source !== client.id && this._wants(client, c.path));
      if (mine.length) this._sendChanges(client, mine, false);
    }
  }

  _sendChanges(client, changes, initial) {
    if (client.format === 'json') {
      client.conn.send(JSON.stringify({ COMMAND: initial ? 'SNAPSHOT_VALUES' : 'VALUES', DATA: changes }));
    } else {
      for (const c of changes) {
        const n = this.shadow.get(c.path);
        if (n) client.conn.send(encodeValue(c.path, c.value, n.def));
      }
    }
  }

  _broadcastJson(obj) {
    const s = JSON.stringify(obj);
    for (const c of this.clients.values()) c.conn.send(s);
  }
}

function oscTypeTag(def, value) {
  switch (def.type) {
    case 'float': return 'f';
    case 'int': return 'i';
    case 'bool': return value ? 'T' : 'F';
    default: return 's';
  }
}

function encodeValue(path, value, def) {
  let arg;
  switch (def.type) {
    case 'float': arg = { type: 'f', value: value === null ? 0 : value }; break;
    case 'int': arg = { type: 'i', value: value === null ? 0 : value }; break;
    case 'bool': arg = { type: value ? 'T' : 'F', value: !!value }; break;
    default: arg = { type: 's', value: value === null || value === undefined ? '' : String(value) };
  }
  return osc.encodeMessage(path, [arg]);
}

function json(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 1e6) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function primaryIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) for (const i of ifaces || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return '127.0.0.1';
}

module.exports = { OscQueryServer, encodeValue, oscTypeTag, primaryIp };
