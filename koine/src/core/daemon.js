'use strict';
const path = require('path');
const { EventEmitter } = require('events');
const { ShadowState } = require('../shadow/state');
const { loadProfileDir, loadProfileFile } = require('../profile/loader');
const { Device } = require('./device');
const { createLogger } = require('../util/log');
const { OscQueryServer } = require('../northbound/oscquery');
const { OscUdpServer } = require('../northbound/osc-server');
const { MdnsAdvertiser } = require('../northbound/mdns');
const { RulesEngine } = require('../rules/engine');
const { Store, newId } = require('./store');
const fs = require('fs');
const yaml = require('../util/yaml');

const DEFAULTS = {
  daemon: { name: 'koine', http: { port: 8010, host: '0.0.0.0' }, osc: { port: 9000 }, mdns: true, logLevel: 'info', echoWindowMs: 1500, batchMs: 8 },
  devices: [],
  rules: [],
  ui: { pins: [] },
};

class Daemon extends EventEmitter {
  constructor(config = {}, { profilesDir, extraProfiles = [], log, storePath } = {}) {
    super();
    this.config = mergeConfig(DEFAULTS, config);
    this.log = log || createLogger(this.config.daemon.logLevel);
    this.profilesDir = profilesDir || path.join(__dirname, '..', '..', 'profiles');
    this.profiles = loadProfileDir(this.profilesDir);
    for (const f of extraProfiles) { const p = loadProfileFile(f); this.profiles.set(p.id, p); }
    if (this.config.profilesDir) for (const [k, v] of loadProfileDir(this.config.profilesDir)) this.profiles.set(k, v);
    this.shadow = new ShadowState({ echoWindowMs: this.config.daemon.echoWindowMs, batchMs: this.config.daemon.batchMs });
    this.devices = new Map();
    this.startedAt = null;
    // Editable state (rules, pins, devices added from the UI) lives in the store and is merged on top of the config.
    this.store = new Store(storePath || this.config.storePath || null);
    for (const dc of this.config.devices) this.addDevice({ ...dc, source: 'config' });
    for (const dc of this.store.data.devices) {
      try { this.addDevice({ ...dc, source: 'store' }); } catch (e) { this.log.warn(`store device "${dc.id}" skipped: ${e.message}`); }
    }
    const rules = (this.config.rules || []).map((r) => ({ ...r, source: 'config' }));
    for (const f of this.config.rulesFiles || []) {
      const doc = f.endsWith('.json') ? JSON.parse(fs.readFileSync(f, 'utf8')) : yaml.parse(fs.readFileSync(f, 'utf8'));
      rules.push(...(Array.isArray(doc) ? doc : (doc && doc.rules) || []).map((r) => ({ ...r, source: 'file' })));
    }
    rules.forEach((r, i) => { if (!r.id) r.id = `c_${i + 1}`; });
    const hidden = new Set(this.store.data.hidden || []);
    const visible = rules.filter((r) => !hidden.has(r.id));
    for (const r of this.store.data.rules) visible.push({ ...r, source: 'store' });
    rules.length = 0; rules.push(...visible);
    if (this.store.data.ui && this.store.data.ui.pins) this.config.ui = { ...this.config.ui, ...this.store.data.ui };
    this.rules = new RulesEngine(this, rules, { log: this.log });
    this.rules.on('fired', (ev) => this.emit('ruleFired', ev));
    this._sweep = setInterval(() => this.shadow.sweepPending(), 1000);
    if (this._sweep.unref) this._sweep.unref();
  }

  addDevice(dc) {
    const profile = this.profiles.get(dc.profile);
    if (!profile) throw new Error(`device "${dc.id}": unknown profile "${dc.profile}" (available: ${[...this.profiles.keys()].join(', ')})`);
    if (this.devices.has(dc.id)) throw new Error(`duplicate device id "${dc.id}"`);
    const dev = new Device({
      id: dc.id, name: dc.name, host: dc.host, port: dc.port, profile, shadow: this.shadow, log: this.log,
      include: dc.include, exclude: dc.exclude, transportOverrides: dc.transport,
    });
    dev.on('status', () => this.emit('deviceStatus', dev.status()));
    dev.source = dc.source || 'config';
    dev.configEntry = { id: dc.id, name: dc.name, profile: dc.profile, host: dc.host, port: dc.port, include: dc.include, exclude: dc.exclude, transport: dc.transport };
    this.devices.set(dc.id, dev);
    return dev;
  }

  // ---------------------------------------------------------------- live editing (persisted to the store)
  /** Add a device at runtime, start it and persist it. */
  addDeviceLive(dc) {
    if (!dc || !dc.id || !dc.profile || !dc.host) throw new Error('device needs id, profile and host');
    const dev = this.addDevice({ ...dc, source: 'store' });
    if (this.startedAt) dev.start();
    this.store.data.devices = this.store.data.devices.filter((d) => d.id !== dc.id).concat([dev.configEntry]);
    this._persist('device');
    return dev.status();
  }

  removeDeviceLive(id) {
    const dev = this.devices.get(id);
    if (!dev) throw new Error(`unknown device "${id}"`);
    if (dev.source !== 'store') throw new Error(`device "${id}" comes from the config file; remove it there`);
    dev.stop();
    this.devices.delete(id);
    this.shadow.unregister(id);
    this.store.data.devices = this.store.data.devices.filter((d) => d.id !== id);
    this._persist('device');
    this.emit('deviceStatus', { ...dev.status(), removed: true });
    return true;
  }

  addRuleLive(r) {
    const id = newId('r');
    const compiled = this.rules.add({ ...r, id, source: 'store' });
    this.store.data.rules.push({ ...cleanRule(r), id });
    this._persist('rules');
    return this.rules.list().find((x) => x.id === compiled.id);
  }

  updateRuleLive(id, r) {
    const existing = this.rules.rules.find((x) => x.id === id);
    if (!existing) throw new Error(`unknown rule "${id}"`);
    if (existing.source !== 'store') {
      // Editing a config-file rule from the UI: the edited copy is stored and shadows the original.
      this.rules.remove(id);
      const nid = newId('r');
      this.rules.add({ ...r, id: nid, source: 'store' });
      this.store.data.rules.push({ ...cleanRule(r), id: nid, shadows: id });
      this.store.data.hidden = [...new Set([...(this.store.data.hidden || []), id])];
      this._persist('rules');
      return this.rules.list().find((x) => x.id === nid);
    }
    this.rules.update(id, r);
    this.store.data.rules = this.store.data.rules.map((x) => (x.id === id ? { ...cleanRule(r), id } : x));
    this._persist('rules');
    return this.rules.list().find((x) => x.id === id);
  }

  removeRuleLive(id) {
    const existing = this.rules.rules.find((x) => x.id === id);
    if (!existing) throw new Error(`unknown rule "${id}"`);
    this.rules.remove(id);
    if (existing.source === 'store') this.store.data.rules = this.store.data.rules.filter((x) => x.id !== id);
    else this.store.data.hidden = [...new Set([...(this.store.data.hidden || []), id])];
    this._persist('rules');
    return true;
  }

  setUiLive(ui) {
    const pins = Array.isArray(ui.pins) ? ui.pins.filter((p) => p && typeof p.path === 'string').map((p) => ({ path: p.path, label: p.label || '' })) : this.config.ui.pins;
    this.config.ui = { ...this.config.ui, ...(ui.title !== undefined ? { title: ui.title } : {}), pins };
    this.store.data.ui = { title: this.config.ui.title, pins };
    this._persist('ui');
    return this.config.ui;
  }

  _persist(what) {
    try { this.store.save(); } catch (e) { this.log.error(`store save failed: ${e.message}`); }
    this.emit('configChanged', { what });
  }

  async start() {
    this.startedAt = Date.now();
    for (const d of this.devices.values()) d.start();
    const http = this.config.daemon.http;
    if (http && http.port !== false) {
      this.http = new OscQueryServer(this);
      await this.http.listen(http.port, http.host);
      this.log.info(`OSCQuery/HTTP/WebSocket listening on http://${http.host}:${this.http.port}/  (UI at /ui)`);
    }
    const oscCfg = this.config.daemon.osc;
    if (oscCfg && oscCfg.port !== false) {
      this.oscServer = new OscUdpServer(this);
      await this.oscServer.listen(oscCfg.port, oscCfg.host || '0.0.0.0');
      this.log.info(`Northbound OSC/UDP listening on ${oscCfg.port}`);
    }
    if (this.config.daemon.mdns && this.http) {
      try {
        this.mdns = new MdnsAdvertiser({ name: this.config.daemon.name, httpPort: this.http.port, oscPort: this.oscServer ? this.oscServer.port : null, log: this.log });
        await this.mdns.start();
        this.log.info(`mDNS advertising ${this.config.daemon.name}._oscjson._tcp.local`);
      } catch (e) { this.log.warn(`mDNS disabled: ${e.message}`); }
    }
    this.emit('started');
    return this;
  }

  async stop() {
    clearInterval(this._sweep);
    this.rules.close();
    for (const d of this.devices.values()) d.stop();
    if (this.mdns) await this.mdns.stop();
    if (this.oscServer) await this.oscServer.close();
    if (this.http) await this.http.close();
    this.shadow.flush();
    this.emit('stopped');
  }

  /** Route a normalized set to the owning device. */
  set(fullPath, value, origin = 'client') {
    const id = fullPath.split('/')[1];
    const dev = this.devices.get(id);
    if (!dev) return { accepted: false, reason: `unknown device "${id}"` };
    const res = dev.set(fullPath, value, origin);
    if (res.accepted && !res.noop) this.log.debug(`set ${fullPath} = ${JSON.stringify(res.value)} (${origin})`);
    return res;
  }

  refresh(fullPath) { const dev = this.devices.get(fullPath.split('/')[1]); if (dev) dev.refresh(fullPath); }

  status() {
    return {
      name: this.config.daemon.name,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      devices: [...this.devices.values()].map((d) => d.status()),
      shadow: { nodes: this.shadow.nodes.size, pending: this.shadow.pending.size, ...this.shadow.stats },
      rules: { count: this.rules.rules.length, ...this.rules.stats },
      clients: this.http ? this.http.clientCount() : 0,
    };
  }
}

/** Keep only the user-editable rule fields when persisting. */
function cleanRule(r) {
  const out = {};
  for (const k of ['name', 'when', 'and', 'do', 'every', 'onSync', 'throttleMs', 'debounceMs', 'enabled']) if (r[k] !== undefined && r[k] !== '' && r[k] !== null) out[k] = r[k];
  return out;
}

function mergeConfig(defaults, cfg) {
  const out = { ...defaults, ...cfg, daemon: { ...defaults.daemon, ...(cfg.daemon || {}) }, ui: { ...defaults.ui, ...(cfg.ui || {}) } };
  if (cfg.daemon && cfg.daemon.http) out.daemon.http = { ...defaults.daemon.http, ...cfg.daemon.http };
  if (cfg.daemon && cfg.daemon.osc) out.daemon.osc = { ...defaults.daemon.osc, ...cfg.daemon.osc };
  out.devices = cfg.devices || [];
  out.rules = cfg.rules || [];
  return out;
}

module.exports = { Daemon, DEFAULTS };
