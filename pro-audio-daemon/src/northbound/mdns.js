'use strict';
// Minimal multicast DNS responder advertising the daemon as
//   <name>._oscjson._tcp.local  (OSCQuery, RFC-style service type used by OSCQuery clients)
//   <name>._osc._udp.local      (plain OSC endpoint)
// Zero dependencies. Answers PTR/SRV/TXT/A queries and announces on start; sends goodbye on stop.
const dgram = require('dgram');
const os = require('os');

const MDNS_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const TYPE = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 };
const CLASS_IN = 1;
const CACHE_FLUSH = 0x8000;

class MdnsAdvertiser {
  constructor({ name, httpPort, oscPort, hostname, log }) {
    this.instance = sanitize(name || 'paad');
    this.hostname = hostname || `${sanitize(os.hostname().split('.')[0] || 'paad')}.local`;
    this.httpPort = httpPort;
    this.oscPort = oscPort;
    this.log = log || (() => {});
    this.services = [{ type: '_oscjson._tcp.local', port: httpPort, txt: ['txtvers=1', 'ws=1', 'html=1'] }];
    if (oscPort) this.services.push({ type: '_osc._udp.local', port: oscPort, txt: ['txtvers=1'] });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.sock.once('error', reject);
      this.sock.on('message', (buf, rinfo) => this._onQuery(buf, rinfo));
      this.sock.bind(MDNS_PORT, () => {
        try { this.sock.addMembership(MDNS_ADDR); } catch (e) { this.log.warn(`mDNS: addMembership failed: ${e.message}`); }
        try { this.sock.setMulticastTTL(255); this.sock.setMulticastLoopback(true); } catch (_) { /* ignore */ }
        this.sock.on('error', (e) => this.log.warn(`mDNS socket error: ${e.message}`));
        this._announce(0);
        this._timer = setInterval(() => this._announce(), 60000);
        if (this._timer.unref) this._timer.unref();
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this._timer) clearInterval(this._timer);
      if (!this.sock) return resolve();
      try { this._send(this._records(0)); } catch (_) { /* ignore */ }
      const s = this.sock; this.sock = null;
      setTimeout(() => s.close(() => resolve()), 50);
    });
  }

  _announce(round = 0) {
    this._send(this._records());
    if (round < 2) setTimeout(() => this._announce(round + 1), 1000).unref();
  }

  _records(ttl = 120) {
    const recs = [];
    const ips = localIps();
    for (const svc of this.services) {
      const inst = `${this.instance}.${svc.type}`;
      recs.push({ name: '_services._dns-sd._udp.local', type: TYPE.PTR, ttl: ttl ? 4500 : 0, data: encodeName(svc.type) });
      recs.push({ name: svc.type, type: TYPE.PTR, ttl: ttl ? 4500 : 0, data: encodeName(inst) });
      recs.push({ name: inst, type: TYPE.SRV, ttl, flush: true, data: Buffer.concat([u16(0), u16(0), u16(svc.port), encodeName(this.hostname)]) });
      recs.push({ name: inst, type: TYPE.TXT, ttl: ttl ? 4500 : 0, flush: true, data: Buffer.concat(svc.txt.map((t) => Buffer.concat([Buffer.from([Buffer.byteLength(t)]), Buffer.from(t)]))) });
    }
    for (const ip of ips) recs.push({ name: this.hostname, type: TYPE.A, ttl, flush: true, data: Buffer.from(ip.split('.').map(Number)) });
    return recs;
  }

  _onQuery(buf, rinfo) {
    let msg;
    try { msg = parseMessage(buf); } catch (_) { return; }
    if (msg.qr) return; // a response, not a query
    const all = this._records();
    const answers = [];
    for (const q of msg.questions) {
      const qn = q.name.toLowerCase();
      for (const r of all) {
        if (r.name.toLowerCase() !== qn) continue;
        if (q.type !== TYPE.ANY && q.type !== r.type) continue;
        if (!answers.includes(r)) answers.push(r);
      }
    }
    if (!answers.length) return;
    // Add SRV/TXT/A additionals when a PTR was asked.
    const additionals = [];
    for (const a of answers) if (a.type === TYPE.PTR) for (const r of all) if (r.type !== TYPE.PTR && !answers.includes(r) && !additionals.includes(r)) additionals.push(r);
    const unicast = msg.questions.some((q) => q.unicast) || rinfo.port !== MDNS_PORT;
    const pkt = buildResponse(answers, additionals);
    if (unicast) this.sock.send(pkt, 0, pkt.length, rinfo.port, rinfo.address);
    else this.sock.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_ADDR);
  }

  _send(records) {
    if (!this.sock) return;
    const pkt = buildResponse(records, []);
    this.sock.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_ADDR, (e) => { if (e) this.log.debug(`mDNS send: ${e.message}`); });
  }
}

function sanitize(s) { return String(s).replace(/[.\s]+/g, '-').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || 'paad'; }

function localIps() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) for (const i of ifaces || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out.length ? out : ['127.0.0.1'];
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }

function encodeName(name) {
  const parts = name.replace(/\.$/, '').split('.');
  return Buffer.concat([...parts.map((p) => Buffer.concat([Buffer.from([Buffer.byteLength(p)]), Buffer.from(p)])), Buffer.from([0])]);
}

function encodeRecord(r) {
  const cls = CLASS_IN | (r.flush ? CACHE_FLUSH : 0);
  return Buffer.concat([encodeName(r.name), u16(r.type), u16(cls), u32(r.ttl), u16(r.data.length), r.data]);
}

function buildResponse(answers, additionals) {
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0, 0); // id
  head.writeUInt16BE(0x8400, 2); // QR=1, AA=1
  head.writeUInt16BE(0, 4);
  head.writeUInt16BE(answers.length, 6);
  head.writeUInt16BE(0, 8);
  head.writeUInt16BE(additionals.length, 10);
  return Buffer.concat([head, ...answers.map(encodeRecord), ...additionals.map(encodeRecord)]);
}

function readName(buf, off, depth = 0) {
  const labels = [];
  let jumped = false;
  let end = off;
  for (;;) {
    if (off >= buf.length) throw new Error('name overrun');
    const len = buf[off];
    if (len === 0) { off++; if (!jumped) end = off; break; }
    if ((len & 0xc0) === 0xc0) {
      if (depth > 8) throw new Error('pointer loop');
      const ptr = ((len & 0x3f) << 8) | buf[off + 1];
      if (!jumped) end = off + 2;
      jumped = true;
      const r = readName(buf, ptr, depth + 1);
      labels.push(...r.labels);
      break;
    }
    labels.push(buf.toString('utf8', off + 1, off + 1 + len));
    off += 1 + len;
  }
  return { labels, name: labels.join('.'), next: end };
}

function parseMessage(buf) {
  if (buf.length < 12) throw new Error('short');
  const flags = buf.readUInt16BE(2);
  const qd = buf.readUInt16BE(4);
  const questions = [];
  let off = 12;
  for (let i = 0; i < qd; i++) {
    const n = readName(buf, off);
    off = n.next;
    const type = buf.readUInt16BE(off); const cls = buf.readUInt16BE(off + 2); off += 4;
    questions.push({ name: n.name, type, unicast: !!(cls & 0x8000) });
  }
  return { qr: !!(flags & 0x8000), questions };
}

module.exports = { MdnsAdvertiser, encodeName, readName, parseMessage, buildResponse, TYPE };
