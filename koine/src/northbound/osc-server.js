'use strict';
// Northbound plain OSC over UDP, speaking the normalized namespace.
// Lets TouchOSC / QLab / Companion talk to any console through one dialect:
//   /x32/ch/01/fader -10.0        -> set
//   /x32/ch/01/fader              -> reply with current value to the sender
//   /x32/ch/*/mute                -> reply with all matching values
//   /koine/listen [pattern]        -> subscribe the sender for 60 s (re-send to keep alive, like /xremote)
//   /koine/ignore                  -> unsubscribe
//   /koine/snapshot [prefix]       -> dump all values as a bundle
//   /koine/resync [deviceId]       -> force a device re-sync
const dgram = require('dgram');
const osc = require('../osc/codec');
const { encodeValue } = require('./oscquery');

const SUBSCRIBE_TTL_MS = 60000;

class OscUdpServer {
  constructor(daemon) {
    this.daemon = daemon;
    this.shadow = daemon.shadow;
    this.log = daemon.log;
    this.subs = new Map(); // "ip:port" -> { address, port, until, patterns:[re] }
    this.shadow.on('changes', (changes) => this._broadcast(changes));
  }

  listen(port, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      this.sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.sock.once('error', reject);
      this.sock.on('message', (buf, rinfo) => this._onMessage(buf, rinfo));
      this.sock.bind(port, host, () => { this.port = this.sock.address().port; resolve(this.port); });
    });
  }

  close() { return new Promise((resolve) => { if (!this.sock) return resolve(); this.sock.close(() => resolve()); this.sock = null; }); }

  _onMessage(buf, rinfo) {
    let pkt;
    try { pkt = osc.decodePacket(buf); } catch (e) { this.log.debug(`osc-server: bad packet from ${rinfo.address}: ${e.message}`); return; }
    this._handle(pkt, rinfo);
  }

  _handle(pkt, rinfo) {
    if (pkt.elements) { for (const el of pkt.elements) this._handle(el, rinfo); return; }
    const key = `${rinfo.address}:${rinfo.port}`;
    const vals = osc.argValues(pkt);
    if (pkt.address === '/koine/listen' || pkt.address === '/xremote') {
      const patterns = vals.filter((v) => typeof v === 'string').map((p) => osc.patternToRegExp(p.endsWith('/') ? p + '*' : p));
      this.subs.set(key, { address: rinfo.address, port: rinfo.port, until: Date.now() + SUBSCRIBE_TTL_MS, patterns });
      return;
    }
    if (pkt.address === '/koine/ignore') { this.subs.delete(key); return; }
    if (pkt.address === '/koine/snapshot') {
      const prefix = typeof vals[0] === 'string' ? vals[0] : '/';
      const msgs = this.shadow.list(prefix).map((n) => encodeValue(n.path, n.value, n.def));
      for (let i = 0; i < msgs.length; i += 40) this._send(osc.encodeBundle(msgs.slice(i, i + 40)), rinfo);
      return;
    }
    if (pkt.address === '/koine/resync') { for (const d of this.daemon.devices.values()) if (!vals[0] || vals[0] === d.id) d.resync(); return; }
    if (pkt.address === '/koine/status' || pkt.address === '/info') {
      const st = this.daemon.status();
      this._send(osc.encodeMessage('/koine/status', [st.name, st.devices.filter((d) => d.connected).length, st.devices.length, st.shadow.nodes]), rinfo);
      return;
    }
    const isPattern = /[*?[{]/.test(pkt.address);
    if (pkt.args.length === 0) {
      const re = isPattern ? osc.patternToRegExp(pkt.address) : null;
      const nodes = re ? [...this.shadow.nodes.values()].filter((n) => re.test(n.path)) : [this.shadow.get(pkt.address)].filter(Boolean);
      for (const n of nodes) this._send(encodeValue(n.path, n.value, n.def), rinfo);
      return;
    }
    if (!this._mayWrite(rinfo)) { this.log.debug(`osc-server: write from ${key} refused (PIN set and sender not in daemon.osc.allow)`); return; }
    const value = pkt.args[0].value;
    if (isPattern) {
      const re = osc.patternToRegExp(pkt.address);
      for (const n of this.shadow.nodes.values()) if (re.test(n.path)) this.daemon.set(n.path, value, `udp:${key}`);
    } else {
      const r = this.daemon.set(pkt.address, value, `udp:${key}`);
      if (!r.accepted) this.log.debug(`osc-server: ${pkt.address} rejected: ${r.reason}`);
    }
  }

  /** OSC has no login. When a PIN is configured, UDP senders may only write if listed in daemon.osc.allow. */
  _mayWrite(rinfo) {
    if (!this.daemon.auth || !this.daemon.auth.enabled()) return true;
    const allow = (this.daemon.config.daemon.osc && this.daemon.config.daemon.osc.allow) || [];
    return allow.some((a) => a === rinfo.address || (a.endsWith('.*') && rinfo.address.startsWith(a.slice(0, -1))) || a === '*');
  }

  _broadcast(changes) {
    if (this.subs.size === 0) return;
    const now = Date.now();
    for (const [key, sub] of this.subs) {
      if (sub.until < now) { this.subs.delete(key); continue; }
      const msgs = [];
      for (const c of changes) {
        if (c.source === `udp:${key}`) continue;
        if (sub.patterns.length && !sub.patterns.some((re) => re.test(c.path))) continue;
        const n = this.shadow.get(c.path);
        if (n) msgs.push(encodeValue(c.path, c.value, n.def));
      }
      if (msgs.length === 1) this._send(msgs[0], sub);
      else if (msgs.length > 1) for (let i = 0; i < msgs.length; i += 40) this._send(osc.encodeBundle(msgs.slice(i, i + 40)), sub);
    }
  }

  _send(buf, to) { if (this.sock) this.sock.send(buf, 0, buf.length, to.port, to.address); }
}

module.exports = { OscUdpServer };
