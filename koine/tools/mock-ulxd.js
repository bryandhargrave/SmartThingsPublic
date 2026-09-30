'use strict';
// Mock Shure ULX-D receiver: bracketed command strings over TCP.
const net = require('net');

class MockUlxd {
  constructor({ port = 0, channels = 2, log = () => {} } = {}) {
    this.port = port; this.log = log; this.clients = new Set();
    this.state = new Map();
    for (let c = 1; c <= channels; c++) {
      this.state.set(`${c} AUDIO_GAIN`, 18);
      this.state.set(`${c} CHAN_NAME`, c === 1 ? 'LEAD VOX' : `RX ${c}`);
      this.state.set(`${c} AUDIO_MUTE`, 'OFF');
      this.state.set(`${c} BATT_BARS`, 4);
      this.state.set(`${c} BATT_RUN_TIME`, 312);
      this.state.set(`${c} RX_RF_LVL`, 80);
      this.state.set(`${c} AUDIO_LVL`, 30);
      this.state.set(`${c} FREQUENCY`, 518250 + c * 250);
      this.state.set(`${c} TX_TYPE`, 'ULXD2');
    }
  }
  start() {
    return new Promise((resolve) => {
      this.server = net.createServer((sock) => this._onClient(sock));
      this.server.listen(this.port, '127.0.0.1', () => { this.port = this.server.address().port; resolve(this.port); });
    });
  }
  stop() { for (const c of this.clients) c.destroy(); return new Promise((r) => this.server.close(() => r())); }
  _onClient(sock) {
    this.clients.add(sock); sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (d) => {
      buf += d;
      let m;
      while ((m = /<([^>]*)>/.exec(buf))) { buf = buf.slice(m.index + m[0].length); this._onCommand(sock, m[1].trim()); }
    });
    sock.on('close', () => this.clients.delete(sock));
    sock.on('error', () => {});
  }
  _onCommand(sock, cmd) {
    const m = /^(GET|SET)\s+(\d+)\s+([A-Z_]+)(?:\s+(.*))?$/.exec(cmd);
    if (!m) return sock.write('< REP ERR >');
    const [, verb, ch, key, arg] = m;
    if (verb === 'GET' && ch === '0' && key === 'ALL') { for (const k of this.state.keys()) sock.write(this._rep(k)); return; }
    const k = `${ch} ${key}`;
    if (!this.state.has(k)) return sock.write('< REP ERR >');
    if (verb === 'GET') return sock.write(this._rep(k));
    const value = key === 'CHAN_NAME' ? String(arg || '').replace(/^\{|\}$/g, '') : /^\d+$/.test(arg) ? Number(arg) : arg;
    this.state.set(k, value);
    this.log(`mock-ulxd set ${k} = ${value}`);
    for (const c of this.clients) c.write(this._rep(k)); // Shure echoes to everyone including sender
  }
  _rep(k) {
    const v = this.state.get(k);
    const [, key] = k.split(' ');
    const s = key === 'CHAN_NAME' ? `{${String(v).padEnd(8)}}` : typeof v === 'number' && key !== 'FREQUENCY' && key !== 'BATT_RUN_TIME' ? String(v).padStart(3, '0') : String(v);
    return `< REP ${k} ${s} >`;
  }
  /** Simulate telemetry changing on the receiver. */
  telemetry(ch, key, value) { const k = `${ch} ${key}`; this.state.set(k, value); for (const c of this.clients) c.write(this._rep(k)); }
}

module.exports = { MockUlxd };

if (require.main === module) {
  const m = new MockUlxd({ port: Number(process.argv[2] || 2202), log: console.log });
  m.start().then((p) => console.log(`mock ULX-D listening on tcp/${p}`));
}
