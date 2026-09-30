'use strict';
// Mock Yamaha console speaking SCP over TCP (get/set/NOTIFY, devstatus keepalive).
const net = require('net');

class MockScp {
  constructor({ port = 0, channels = 48, log = () => {} } = {}) {
    this.port = port;
    this.log = log;
    this.state = new Map();
    this.clients = new Set();
    this.received = [];
    const names = ['Kick', 'Snare', 'HiHat', 'Tom 1', 'Tom 2', 'OH', 'Bass', 'Gtr', 'Keys L', 'Keys R', 'Lead', 'BV'];
    const colors = ['Blue', 'Orange', 'Yellow', 'Purple', 'Cyan', 'Magenta', 'Red', 'Green'];
    for (let c = 0; c < channels; c++) {
      this.state.set(`MIXER:Current/InCh/Fader/Level ${c} 0`, -1000);
      this.state.set(`MIXER:Current/InCh/Fader/On ${c} 0`, 1);
      this.state.set(`MIXER:Current/InCh/Label/Name ${c} 0`, names[c] || `Ch${c + 1}`);
      this.state.set(`MIXER:Current/InCh/Label/Color ${c} 0`, colors[c % colors.length]);
      this.state.set(`MIXER:Current/InCh/ToSt/Pan ${c} 0`, 0);
      for (let m = 0; m < 24; m++) this.state.set(`MIXER:Current/InCh/ToMix/Level ${c} ${m}`, -32768);
    }
    for (let m = 0; m < 24; m++) {
      this.state.set(`MIXER:Current/Mix/Fader/Level ${m} 0`, -32768);
      this.state.set(`MIXER:Current/Mix/Fader/On ${m} 0`, 1);
      this.state.set(`MIXER:Current/Mix/Label/Name ${m} 0`, `Mix${m + 1}`);
    }
    for (let m = 0; m < 8; m++) {
      this.state.set(`MIXER:Current/Mtrx/Fader/Level ${m} 0`, -32768);
      this.state.set(`MIXER:Current/Mtrx/Fader/On ${m} 0`, 1);
      this.state.set(`MIXER:Current/Mtrx/Label/Name ${m} 0`, `Mtx${m + 1}`);
    }
    for (let d = 0; d < 16; d++) {
      this.state.set(`MIXER:Current/DCA/Fader/Level ${d} 0`, 0);
      this.state.set(`MIXER:Current/DCA/Fader/On ${d} 0`, 1);
      this.state.set(`MIXER:Current/DCA/Label/Name ${d} 0`, `DCA${d + 1}`);
    }
    this.state.set('MIXER:Current/St/Fader/Level 0 0', -300);
    this.state.set('MIXER:Current/St/Fader/On 0 0', 1);
    this.state.set('MIXER:Current/Mono/Fader/Level 0 0', -32768);
    this.state.set('MIXER:Current/Mono/Fader/On 0 0', 1);
    this.state.set('MIXER:Lib/Scene/Current 0 0', 12);
  }

  start() {
    return new Promise((resolve) => {
      this.server = net.createServer((sock) => this._onClient(sock));
      this.server.listen(this.port, '127.0.0.1', () => { this.port = this.server.address().port; resolve(this.port); });
    });
  }

  stop() { for (const c of this.clients) c.destroy(); return new Promise((r) => this.server.close(() => r())); }

  _onClient(sock) {
    this.clients.add(sock);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this._onLine(sock, line); }
    });
    sock.on('close', () => this.clients.delete(sock));
    sock.on('error', () => {});
  }

  _onLine(sock, line) {
    this.received.push(line);
    const m = /^(get|set)\s+(\S+\s+\d+\s+\d+)(?:\s+(.*))?$/.exec(line);
    if (line.startsWith('devstatus')) return sock.write('OK devstatus runmode "normal"\n');
    if (!m) return sock.write(`ERROR ${line.split(' ')[0]} UnknownCommand\n`);
    const [, cmd, key, rawArg] = m;
    if (!this.state.has(key)) return sock.write(`ERROR ${cmd} InvalidArgument\n`);
    if (cmd === 'get') return sock.write(`OK get ${key} ${fmt(this.state.get(key))}\n`);
    const value = parse(rawArg);
    this.state.set(key, value);
    this.log(`mock-scp set ${key} = ${fmt(value)}`);
    sock.write(`OK set ${key} ${fmt(value)}\n`);
    // Yamaha notifies all other connected clients.
    for (const c of this.clients) if (c !== sock) c.write(`NOTIFY set ${key} ${fmt(value)}\n`);
  }

  surfaceChange(key, value) {
    if (!this.state.has(key)) throw new Error(`unknown ${key}`);
    this.state.set(key, value);
    for (const c of this.clients) c.write(`NOTIFY set ${key} ${fmt(value)}\n`);
  }

  recallScene(n) {
    this.state.set('MIXER:Lib/Scene/Current 0 0', n);
    for (const c of this.clients) c.write(`NOTIFY sscurrent_ex MIXER:Lib/Scene ${n}\n`);
  }
}

function fmt(v) { return typeof v === 'string' ? JSON.stringify(v) : String(v); }
function parse(s) { s = (s || '').trim(); if (s.startsWith('"')) return JSON.parse(s); return Number(s); }

module.exports = { MockScp };

if (require.main === module) {
  const m = new MockScp({ port: Number(process.argv[2] || 49280), log: console.log });
  m.start().then((p) => console.log(`mock Yamaha SCP listening on tcp/${p}`));
}
