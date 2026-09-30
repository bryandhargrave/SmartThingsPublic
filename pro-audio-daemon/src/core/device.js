'use strict';
// A Device binds a profile + host to a driver and the shared shadow state.
const { EventEmitter } = require('events');
const { expandParameters } = require('../profile/loader');
const { createDriver } = require('../drivers');
const osc = require('../osc/codec');

class Device extends EventEmitter {
  constructor({ id, name, host, port, profile, shadow, log, include, exclude, transportOverrides }) {
    super();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`device id "${id}" must be alphanumeric/dash/underscore`);
    this.id = id;
    this.name = name || id;
    this.host = host;
    this.profile = profile;
    this.shadow = shadow;
    this.log = log;
    this.connected = false;
    this.lastChange = 0;
    this.info = null;

    let defs = expandParameters(profile);
    if (include && include.length) defs = defs.filter((d) => matchesAny(d.path, include));
    if (exclude && exclude.length) defs = defs.filter((d) => !matchesAny(d.path, exclude));
    for (const d of defs) { d.fullPath = `/${id}${d.path}`; d.deviceId = id; }
    this.defs = defs;
    this.byPath = new Map(defs.map((d) => [d.fullPath, d]));
    for (const d of defs) shadow.register(d, id);

    const transport = { ...profile.transport, ...(transportOverrides || {}) };
    this.driver = createDriver({ deviceId: id, host, port: port || transport.port, transport, defs, log });
    this.driver.on('raw', ({ def, raw }) => this._onRaw(def, raw));
    this.driver.on('connected', () => { this.connected = true; this.log.info(`[${id}] connected (${profile.name} @ ${host})`); this.emit('status'); });
    this.driver.on('disconnected', (reason) => { this.connected = false; this.shadow.markStale(id, true); this.log.warn(`[${id}] disconnected (${reason})`); this.emit('status'); });
    this.driver.on('log', (lvl, msg) => this.log(lvl, msg));
    this.driver.on('error', (e) => this.log.error(`[${id}] ${e.message}`));
    this.driver.on('unknown', ({ key }) => this.log.debug(`[${id}] unmapped device address: ${typeof key === 'string' ? key : JSON.stringify(key)}`));
    this.driver.on('info', (v) => { this.info = v; });
  }

  start() { this.driver.connect(); }
  stop() { this.driver.close(); }

  _onRaw(def, raw) {
    let value;
    try { value = def.scale.toValue(raw); } catch (e) { this.log.warn(`[${this.id}] ${def.path}: cannot scale raw ${JSON.stringify(raw)}: ${e.message}`); return; }
    this.lastChange = Date.now();
    this.shadow.updateFromDevice(def.fullPath, value, raw);
  }

  /** Set a normalized value; returns the shadow result. */
  set(fullPath, value, origin = 'client') {
    const def = this.byPath.get(fullPath);
    if (!def) return { accepted: false, reason: 'unknown path' };
    const res = this.shadow.setFromClient(fullPath, value, origin);
    if (!res.accepted || res.noop) return res;
    let raw;
    try { raw = def.scale.toRaw(res.value); } catch (e) { return { accepted: false, reason: e.message }; }
    if (!this.connected) { res.queued = false; res.warning = 'device offline; shadow updated, not written'; return res; }
    this.driver.write(def, raw);
    return res;
  }

  /** Ask the device to (re)send one parameter. */
  refresh(fullPath) { const def = this.byPath.get(fullPath); if (def) this.driver.query(def); }

  resync() { if (this.connected) this.driver.queryAll(); }

  status() {
    return {
      id: this.id,
      name: this.name,
      profile: this.profile.id,
      profileName: this.profile.name,
      vendor: this.profile.vendor,
      host: this.host,
      port: this.driver.port,
      transport: this.profile.transport.type,
      connected: this.connected,
      parameters: this.defs.length,
      stats: this.driver.stats,
      info: this.info,
      verified: this.profile.verified,
    };
  }
}

/** OSC-pattern match where a pattern also matches every path beneath it ("/ch/*" covers "/ch/01/fader"). */
function matchesAny(path, patterns) {
  const res = patterns.map((p) => osc.patternToRegExp(p.replace(/\/+$/, '')));
  const parts = path.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const prefix = '/' + parts.slice(0, i).join('/');
    if (res.some((r) => r.test(prefix))) return true;
  }
  return false;
}

module.exports = { Device, matchesAny };
