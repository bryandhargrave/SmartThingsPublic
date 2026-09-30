'use strict';
// Mock Behringer X32: answers OSC queries, accepts sets, honours /xremote subscriptions,
// and can generate autonomous "someone moved a fader on the surface" changes.
const dgram = require('dgram');
const osc = require('../src/osc/codec');

class MockX32 {
  constructor({ port = 0, channels = 32, autoMoveMs = 0, log = () => {} } = {}) {
    this.port = port;
    this.state = new Map();
    this.subs = new Map(); // "ip:port" -> expiry
    this.log = log;
    this.autoMoveMs = autoMoveMs;
    this.received = []; // for tests
    const names = ['Kick', 'Snare', 'HH', 'OH L', 'OH R', 'Bass', 'Gtr L', 'Gtr R', 'Keys', 'Lead Vox', 'BV 1', 'BV 2'];
    for (let c = 1; c <= channels; c++) {
      const ch = String(c).padStart(2, '0');
      this.state.set(`/ch/${ch}/mix/fader`, { type: 'f', value: 0.75 });
      this.state.set(`/ch/${ch}/mix/on`, { type: 'i', value: 1 });
      this.state.set(`/ch/${ch}/mix/pan`, { type: 'f', value: 0.5 });
      this.state.set(`/ch/${ch}/config/name`, { type: 's', value: names[c - 1] || `Ch ${c}` });
      this.state.set(`/ch/${ch}/config/color`, { type: 'i', value: (c % 7) + 1 });
      this.state.set(`/ch/${ch}/preamp/hpon`, { type: 'i', value: c <= 12 ? 1 : 0 });
      this.state.set(`/ch/${ch}/preamp/hpf`, { type: 'f', value: 0.3 });
      for (let b = 1; b <= 4; b++) {
        this.state.set(`/ch/${ch}/eq/${b}/f`, { type: 'f', value: b / 5 });
        this.state.set(`/ch/${ch}/eq/${b}/g`, { type: 'f', value: 0.5 });
        this.state.set(`/ch/${ch}/eq/${b}/q`, { type: 'f', value: 0.5 });
      }
      for (let b = 1; b <= 16; b++) this.state.set(`/ch/${ch}/mix/${String(b).padStart(2, '0')}/level`, { type: 'f', value: 0 });
    }
    for (let b = 1; b <= 16; b++) {
      const bus = String(b).padStart(2, '0');
      this.state.set(`/bus/${bus}/mix/fader`, { type: 'f', value: 0.75 });
      this.state.set(`/bus/${bus}/mix/on`, { type: 'i', value: 1 });
      this.state.set(`/bus/${bus}/config/name`, { type: 's', value: b <= 8 ? `Mon ${b}` : `Bus ${b}` });
      this.state.set(`/bus/${bus}/config/color`, { type: 'i', value: 3 });
    }
    for (let d = 1; d <= 8; d++) {
      this.state.set(`/dca/${d}/fader`, { type: 'f', value: 0.75 });
      this.state.set(`/dca/${d}/on`, { type: 'i', value: 1 });
      this.state.set(`/dca/${d}/config/name`, { type: 's', value: ['Drums', 'Band', 'Vox', 'FX', 'Tracks', 'Spare', 'Spare', 'Spare'][d - 1] });
      this.state.set(`/dca/${d}/config/color`, { type: 'i', value: d });
    }
    this.state.set('/main/st/mix/fader', { type: 'f', value: 0.75 });
    this.state.set('/main/st/mix/on', { type: 'i', value: 1 });
    this.state.set('/main/st/config/name', { type: 's', value: 'PA Main' });
    this.state.set('/main/m/mix/fader', { type: 'f', value: 0.6 });
    this.state.set('/main/m/mix/on', { type: 'i', value: 1 });
    for (let o = 1; o <= 16; o++) {
      this.state.set(`/outputs/main/${String(o).padStart(2, '0')}/delay/on`, { type: 'i', value: o === 9 ? 1 : 0 });
      this.state.set(`/outputs/main/${String(o).padStart(2, '0')}/delay/time`, { type: 'f', value: o === 9 ? 0.03 : 0 });
    }
    this.state.set('/-stat/talk/A', { type: 'i', value: 0 });
    this.state.set('/-stat/talk/B', { type: 'i', value: 0 });
    this.state.set('/-show/prepos/current', { type: 'i', value: 3 });
  }

  start() {
    return new Promise((resolve) => {
      this.sock = dgram.createSocket('udp4');
      this.sock.on('message', (buf, rinfo) => this._onMessage(buf, rinfo));
      this.sock.bind(this.port, '127.0.0.1', () => {
        this.port = this.sock.address().port;
        if (this.autoMoveMs) { this._auto = setInterval(() => this.autoMove(), this.autoMoveMs); }
        resolve(this.port);
      });
    });
  }

  stop() { if (this._auto) clearInterval(this._auto); return new Promise((r) => this.sock.close(() => r())); }

  _onMessage(buf, rinfo) {
    let pkt;
    try { pkt = osc.decodePacket(buf); } catch (_) { return; }
    const key = `${rinfo.address}:${rinfo.port}`;
    this.received.push(pkt);
    if (pkt.address === '/xremote') { this.subs.set(key, Date.now() + 10000); return; }
    if (pkt.address === '/xinfo') return this._send(osc.encodeMessage('/xinfo', ['127.0.0.1', 'MockX32', 'X32', '4.06']), rinfo);
    if (pkt.address === '/info') return this._send(osc.encodeMessage('/info', ['V2.07', 'MockX32', 'X32', '4.06']), rinfo);
    const entry = this.state.get(pkt.address);
    if (!entry) return; // real console ignores unknown addresses
    if (pkt.args.length === 0) return this._send(osc.encodeMessage(pkt.address, [{ type: entry.type, value: entry.value }]), rinfo);
    const v = pkt.args[0].value;
    entry.value = entry.type === 'f' ? Math.max(0, Math.min(1, Number(v))) : entry.type === 'i' ? Math.trunc(Number(v)) : String(v);
    this.log(`mock-x32 set ${pkt.address} = ${entry.value}`);
    // Real X32 broadcasts to all *other* /xremote subscribers, not to the sender.
    this._notify(pkt.address, key);
  }

  /** Simulate an operator changing something on the surface. */
  surfaceChange(address, value) {
    const entry = this.state.get(address);
    if (!entry) throw new Error(`unknown ${address}`);
    entry.value = value;
    this._notify(address, null);
  }

  autoMove() {
    const ch = String(1 + Math.floor(Math.random() * 4)).padStart(2, '0');
    this.surfaceChange(`/ch/${ch}/mix/fader`, Math.round(Math.random() * 1000) / 1000);
  }

  _notify(address, exceptKey) {
    const entry = this.state.get(address);
    const now = Date.now();
    for (const [k, until] of this.subs) {
      if (until < now) { this.subs.delete(k); continue; }
      if (k === exceptKey) continue;
      const [address_, port] = k.split(':');
      this._send(osc.encodeMessage(address, [{ type: entry.type, value: entry.value }]), { address: address_, port: Number(port) });
    }
  }

  _send(buf, to) { this.sock.send(buf, 0, buf.length, to.port, to.address); }
}

module.exports = { MockX32 };

if (require.main === module) {
  const port = Number(process.argv[2] || 10023);
  const m = new MockX32({ port, autoMoveMs: Number(process.argv[3] || 0), log: console.log });
  m.start().then((p) => console.log(`mock X32 listening on udp/${p}`));
}
