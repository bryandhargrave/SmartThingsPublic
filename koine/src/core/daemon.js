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
const fs = require('fs');
const yaml = require('../util/yaml');

const DEFAULTS = {
  daemon: { name: 'koine', http: { port: 8010, host: '0.0.0.0' }, osc: { port: 9000 }, mdns: true, logLevel: 'info', echoWindowMs: 1500, batchMs: 8 },
  devices: [],
  rules: [],
  ui: { pins: [] },
};

class Daemon extends EventEmitter {
  constructor(config = {}, { profilesDir, extraProfiles = [], log } = {}) {
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
    for (const dc of this.config.devices) this.addDevice(dc);
    const rules = [...(this.config.rules || [])];
    for (const f of this.config.rulesFiles || []) {
      const doc = f.endsWith('.json') ? JSON.parse(fs.readFileSync(f, 'utf8')) : yaml.parse(fs.readFileSync(f, 'utf8'));
      rules.push(...(Array.isArray(doc) ? doc : (doc && doc.rules) || []));
    }
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
    this.devices.set(dc.id, dev);
    return dev;
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

function mergeConfig(defaults, cfg) {
  const out = { ...defaults, ...cfg, daemon: { ...defaults.daemon, ...(cfg.daemon || {}) }, ui: { ...defaults.ui, ...(cfg.ui || {}) } };
  if (cfg.daemon && cfg.daemon.http) out.daemon.http = { ...defaults.daemon.http, ...cfg.daemon.http };
  if (cfg.daemon && cfg.daemon.osc) out.daemon.osc = { ...defaults.daemon.osc, ...cfg.daemon.osc };
  out.devices = cfg.devices || [];
  out.rules = cfg.rules || [];
  return out;
}

module.exports = { Daemon, DEFAULTS };
