'use strict';
// Rules engine: "when this happens on one device, do that on another".
//
// rules:
//   - name: talkback-unmutes-return            # optional, used in logs and loop guards
//     when: /m32/talkback/a == true            # <path> <op> <literal>   ops: == != < <= > >= changed
//     and: ["/m32/main/st/mute == false"]      # optional extra conditions on current state
//     do: set /dm3/ch/16/mute false            # one action or a list
//     every: false                              # comparisons fire on the false->true edge unless every: true
//     onSync: false                             # ignore the values that arrive while a device is (re)syncing
//     throttleMs: 0                             # minimum interval between fires (per matched path)
//     debounceMs: 0                             # wait for quiet before firing, last value wins
//     enabled: true
//
// `when` paths may contain OSC wildcards; each wildcard becomes a capture usable in actions:
//   when: /m32/ch/*/mute changed        do: set /dm3/ch/{1}/mute {value}
//
// Actions (string or object form):
//   set <path> <value>                  {set: path, value: "{value}", scale: {type: linear, raw: [-90,10], value: [-18,42]}}
//   osc <host:port> <address> [args]    {osc: "10.0.0.5:53000", address: "/cue/{1}/start", args: [1]}
//   http <url>                          {http: url, method: POST, body: {...}}
//   log <message>
//   wait <ms>
//   resync <deviceId>
//
// Templates: {value} {raw} {path} {device} {1}..{n} (wildcard captures) {state:/other/path}
// After substitution, pure arithmetic ("{value} + 6", "({value} - 10) * 2") is evaluated,
// "!true" / "!false" negate, and true/false/numbers are typed accordingly.

const dgram = require('dgram');
const http = require('http');
const { EventEmitter } = require('events');
const osc = require('../osc/codec');
const scaling = require('../profile/scaling');

const OPS = {
  '==': (a, b) => eq(a, b),
  '!=': (a, b) => !eq(a, b),
  '<': (a, b) => Number(a) < Number(b),
  '<=': (a, b) => Number(a) <= Number(b),
  '>': (a, b) => Number(a) > Number(b),
  '>=': (a, b) => Number(a) >= Number(b),
};
const MAX_DEPTH = 8;

function eq(a, b) {
  if (typeof a === 'number' || typeof b === 'number') return Math.abs(Number(a) - Number(b)) < 1e-4;
  if (typeof a === 'boolean' || typeof b === 'boolean') return toBool(a) === toBool(b);
  return String(a) === String(b);
}
function toBool(v) { return typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : /^(true|1|on|yes)$/i.test(String(v)); }

function parseLiteral(s) {
  if (s === undefined || s === null) return null;
  s = String(s).trim();
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (s === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function parseCondition(c) {
  if (c && typeof c === 'object') return { path: c.path, op: c.op || (c.value === undefined ? 'changed' : '=='), value: c.value };
  const s = String(c).trim();
  let m = /^(\S+)\s+(changed|changes)$/.exec(s);
  if (m) return { path: m[1], op: 'changed' };
  m = /^(\S+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/.exec(s);
  if (m) return { path: m[1], op: m[2], value: parseLiteral(m[3]) };
  if (/^\S+$/.test(s)) return { path: s, op: 'changed' };
  throw new Error(`cannot parse condition "${c}"`);
}

function parseAction(a) {
  if (a && typeof a === 'object') {
    if (a.set !== undefined) return { type: 'set', path: a.set, value: a.value === undefined ? '{value}' : a.value, scale: a.scale ? scaling.compile(a.scale) : null };
    if (a.osc !== undefined) return { type: 'osc', target: a.osc, address: a.address, args: a.args || [] };
    if (a.http !== undefined) return { type: 'http', url: a.http, method: a.method || 'GET', body: a.body };
    if (a.log !== undefined) return { type: 'log', message: a.log };
    if (a.wait !== undefined) return { type: 'wait', ms: Number(a.wait) };
    if (a.resync !== undefined) return { type: 'resync', device: a.resync };
    throw new Error(`unknown action ${JSON.stringify(a)}`);
  }
  const s = String(a).trim();
  const tokens = tokenize(s);
  const kind = tokens[0];
  switch (kind) {
    case 'set': if (tokens.length < 3) throw new Error(`set needs <path> <value>: "${s}"`); return { type: 'set', path: tokens[1], value: tokens.slice(2).join(' '), scale: null };
    case 'osc': if (tokens.length < 3) throw new Error(`osc needs <host:port> <address> [args]: "${s}"`); return { type: 'osc', target: tokens[1], address: tokens[2], args: tokens.slice(3) };
    case 'http': return { type: 'http', url: tokens[1], method: 'GET' };
    case 'log': return { type: 'log', message: tokens.slice(1).join(' ') };
    case 'wait': return { type: 'wait', ms: Number(tokens[1]) };
    case 'resync': return { type: 'resync', device: tokens[1] };
    default: throw new Error(`unknown action "${kind}" in "${s}"`);
  }
}

/** Split on whitespace but keep quoted strings together. */
function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] !== undefined ? `"${m[1]}"` : m[2] !== undefined ? `"${m[2]}"` : m[3]);
  return out;
}

class RulesEngine extends EventEmitter {
  constructor(daemon, rules = [], { log } = {}) {
    super();
    this.daemon = daemon;
    this.shadow = daemon.shadow;
    this.log = log || daemon.log;
    this.rules = [];
    this.stats = { evaluated: 0, fired: 0, errors: 0 };
    this._lastState = new Map(); // `${ruleIdx}|${path}` -> boolean (for edge detection)
    this._lastFire = new Map(); // throttle
    this._debounce = new Map();
    this._udp = null;
    rules.forEach((r, i) => this.add(r, i));
    this._onChanges = (changes) => { for (const c of changes) this.evaluate(c); };
    this.shadow.on('changes', this._onChanges);
  }

  /** Validate and compile without installing (used by the UI's dry run). */
  static compile(r, i = 0) {
    if (!r || !r.when) throw new Error(`rule ${i}: "when" is required`);
    if (!r.do) throw new Error(`rule ${i}: "do" is required`);
    const cond = parseCondition(r.when);
    const doList = typeof r.do === 'string' && r.do.includes('\n') ? r.do.split('\n').map((x) => x.trim()).filter(Boolean) : r.do;
    return {
      id: r.id || null,
      name: r.name || `rule-${i + 1}`,
      source: r.source || 'config',
      when: cond,
      whenRe: osc.patternToRegExp(cond.path, { capture: true }),
      and: (Array.isArray(r.and) ? r.and : r.and ? String(r.and).split('\n').map((x) => x.trim()).filter(Boolean) : []).map(parseCondition),
      actions: (Array.isArray(doList) ? doList : [doList]).map(parseAction),
      every: !!r.every || cond.op === 'changed',
      onSync: !!r.onSync,
      throttleMs: Number(r.throttleMs || 0),
      debounceMs: Number(r.debounceMs || 0),
      enabled: r.enabled !== false,
      fires: 0,
      lastFired: 0,
      lastError: null,
      raw: r,
    };
  }

  add(r, i = this.rules.length) {
    const compiled = RulesEngine.compile(r, i);
    this.rules.push(compiled);
    return compiled;
  }

  remove(id) {
    const idx = this.rules.findIndex((r) => r.id === id || r.name === id);
    if (idx < 0) return false;
    this.rules.splice(idx, 1);
    for (const k of [...this._lastState.keys()]) if (k.startsWith(`${idx}|`)) this._lastState.delete(k);
    return true;
  }

  update(id, r) {
    const idx = this.rules.findIndex((x) => x.id === id || x.name === id);
    if (idx < 0) return null;
    const old = this.rules[idx];
    const compiled = RulesEngine.compile({ ...r, id: old.id, source: old.source }, idx);
    compiled.fires = old.fires; compiled.lastFired = old.lastFired;
    this.rules[idx] = compiled;
    for (const k of [...this._lastState.keys()]) if (k.startsWith(`${idx}|`)) this._lastState.delete(k);
    return compiled;
  }


  close() {
    this.shadow.off('changes', this._onChanges);
    for (const t of this._debounce.values()) clearTimeout(t);
    if (this._udp) { this._udp.close(); this._udp = null; }
  }

  /** Evaluate one shadow change against every rule. */
  evaluate(change) {
    const origin = String(change.source || '');
    let depth = 0;
    let originRule = null;
    const m = /^rule:(.*)#(\d+)$/.exec(origin);
    if (m) { originRule = m[1]; depth = Number(m[2]); }
    if (depth >= MAX_DEPTH) { this.log.warn(`rules: cascade depth ${depth} reached at ${change.path}, stopping`); return; }
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      if (!rule.enabled) continue;
      if (originRule === rule.name) continue; // a rule never re-triggers itself
      if (change.initial && !rule.onSync) continue;
      const mm = rule.whenRe.exec(change.path);
      if (!mm) continue;
      this.stats.evaluated++;
      const key = `${i}|${change.path}`;
      let ok;
      if (rule.when.op === 'changed') ok = true;
      else {
        const now = OPS[rule.when.op](change.value, rule.when.value);
        const prev = this._lastState.get(key) || false;
        this._lastState.set(key, now);
        ok = now && (rule.every || !prev);
      }
      if (!ok) continue;
      if (!rule.and.every((c) => this._checkState(c))) continue;
      const ctx = { value: change.value, path: change.path, device: change.deviceId, captures: mm.slice(1), raw: (this.shadow.get(change.path) || {}).raw, depth };
      if (rule.throttleMs) {
        const last = this._lastFire.get(key) || 0;
        if (Date.now() - last < rule.throttleMs) continue;
        this._lastFire.set(key, Date.now());
      }
      if (rule.debounceMs) {
        clearTimeout(this._debounce.get(key));
        this._debounce.set(key, setTimeout(() => { this._debounce.delete(key); this.fire(rule, ctx); }, rule.debounceMs));
        continue;
      }
      this.fire(rule, ctx);
    }
  }

  _checkState(c) {
    const n = this.shadow.get(c.path);
    if (!n) return false;
    if (c.op === 'changed') return !n.stale;
    return OPS[c.op](n.value, c.value);
  }

  async fire(rule, ctx) {
    rule.fires++;
    rule.lastFired = Date.now();
    this.stats.fired++;
    const results = [];
    try {
      for (const a of rule.actions) results.push(await this._run(rule, a, ctx));
      rule.lastError = null;
    } catch (e) {
      rule.lastError = e.message;
      this.stats.errors++;
      this.log.warn(`rule "${rule.name}": ${e.message}`);
    }
    const ev = { rule: rule.name, trigger: ctx.path, value: ctx.value, ts: rule.lastFired, actions: results, error: rule.lastError };
    this.log.info(`rule "${rule.name}" fired (${ctx.path} = ${JSON.stringify(ctx.value)}) -> ${results.map(describe).join('; ')}`);
    this.emit('fired', ev);
  }

  async _run(rule, a, ctx) {
    switch (a.type) {
      case 'set': {
        const path = this.render(a.path, ctx, { asString: true });
        let value = this.render(a.value, ctx);
        if (a.scale) value = a.scale.toValue(Number(value));
        const r = this.daemon.set(path, value, `rule:${rule.name}#${ctx.depth + 1}`);
        if (!r.accepted) throw new Error(`set ${path}: ${r.reason}`);
        return { set: path, value: r.value, noop: !!r.noop };
      }
      case 'osc': {
        const target = this.render(a.target, ctx, { asString: true });
        const [host, portStr] = target.split(':');
        const address = this.render(a.address, ctx, { asString: true });
        const args = a.args.map((x) => this.render(x, ctx));
        this._sendOsc(host, Number(portStr), address, args);
        return { osc: target, address, args };
      }
      case 'http': {
        const url = this.render(a.url, ctx, { asString: true });
        await httpRequest(url, a.method, a.body ? this.render(JSON.stringify(a.body), ctx, { asString: true }) : undefined);
        return { http: url };
      }
      case 'log': { const msg = this.render(a.message, ctx, { asString: true }); this.log.info(`rule "${rule.name}": ${msg}`); return { log: msg }; }
      case 'wait': await new Promise((r) => setTimeout(r, a.ms)); return { wait: a.ms };
      case 'resync': { const dev = this.daemon.devices.get(this.render(a.device, ctx, { asString: true })); if (dev) dev.resync(); return { resync: a.device }; }
      default: throw new Error(`unknown action type ${a.type}`);
    }
  }

  /** Substitute {templates}, then type the result. */
  render(template, ctx, { asString = false } = {}) {
    if (typeof template !== 'string') return template;
    let quoted = false;
    let s = template.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) { quoted = true; s = s.slice(1, -1); }
    const out = s.replace(/\{([^}]+)\}/g, (m, key) => {
      key = key.trim();
      if (key === 'value') return fmt(ctx.value);
      if (key === 'raw') return fmt(ctx.raw);
      if (key === 'path') return ctx.path;
      if (key === 'device') return ctx.device;
      if (/^\d+$/.test(key)) return ctx.captures[Number(key) - 1] !== undefined ? ctx.captures[Number(key) - 1] : m;
      if (key.startsWith('state:')) { const n = this.shadow.get(key.slice(6).trim()); return n ? fmt(n.value) : 'null'; }
      return m;
    });
    if (asString || quoted) return out;
    return evaluate(out);
  }

  _sendOsc(host, port, address, args) {
    if (!this._udp) this._udp = dgram.createSocket('udp4');
    const typed = args.map((v) => (typeof v === 'boolean' ? { type: v ? 'T' : 'F', value: v } : typeof v === 'number' ? { type: Number.isInteger(v) && !String(v).includes('.') ? 'i' : 'f', value: v } : { type: 's', value: String(v) }));
    const buf = osc.encodeMessage(address, typed);
    this._udp.send(buf, 0, buf.length, port, host, (e) => { if (e) this.log.warn(`rules: osc send to ${host}:${port} failed: ${e.message}`); });
  }

  list() {
    return this.rules.map((r) => ({ id: r.id, source: r.source, name: r.name, when: typeof r.raw.when === 'string' ? r.raw.when : r.when, and: r.raw.and || [], do: r.raw.do, enabled: r.enabled, fires: r.fires, lastFired: r.lastFired, lastError: r.lastError, every: !!r.raw.every, onSync: r.onSync, throttleMs: r.throttleMs, debounceMs: r.debounceMs }));
  }
}

function fmt(v) { return v === null || v === undefined ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v); }

/** Type a rendered string: booleans, numbers, arithmetic, negation; otherwise the string itself. */
function evaluate(s) {
  const t = s.trim();
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  if (/^!\s*(true|false)$/i.test(t)) return !/true$/i.test(t);
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^[\d\s.+\-*/()%]+$/.test(t) && /\d/.test(t)) {
    try { const v = Function(`"use strict"; return (${t});`)(); if (typeof v === 'number' && Number.isFinite(v)) return v; } catch (_) { /* fall through */ }
  }
  return t;
}

function describe(r) {
  if (!r) return '';
  if (r.set) return `set ${r.set}=${JSON.stringify(r.value)}${r.noop ? ' (noop)' : ''}`;
  if (r.osc) return `osc ${r.osc} ${r.address} ${JSON.stringify(r.args)}`;
  if (r.http) return `http ${r.http}`;
  if (r.log) return `log`;
  if (r.wait) return `wait ${r.wait}ms`;
  if (r.resync) return `resync ${r.resync}`;
  return JSON.stringify(r);
}

function httpRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('http action timed out')));
    req.end(body);
  });
}

module.exports = { RulesEngine, parseCondition, parseAction, evaluate, tokenize };
