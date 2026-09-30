'use strict';
// Mock Allen & Heath SQ speaking MIDI over TCP: NRPN levels (with 0x60/0x7F "get"),
// Note On mutes, SysEx names/colours.
const net = require('net');
const { MidiParser } = require('../src/drivers/midi-tcp');

const HEADER = [0x00, 0x00, 0x1a, 0x50, 0x11, 0x01, 0x00];

class MockSq {
  constructor({ port = 0, channels = 48, log = () => {} } = {}) {
    this.port = port; this.log = log;
    this.levels = new Map(); // "msb:lsb" -> 14-bit
    this.mutes = new Map(); // note -> bool
    this.names = new Map(); this.colors = new Map();
    this.clients = new Set();
    for (let c = 0; c < channels; c++) { this.levels.set(`${c}:23`, 14003); this.mutes.set(c, false); this.names.set(c, c === 9 ? 'LeadVox' : `Ip ${c + 1}`); this.colors.set(c, (c % 7) + 1); }
    this.levels.set('68:23', 14003); this.mutes.set(0x44, false);
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
    const parser = new MidiParser();
    let pending = null;
    sock.on('data', (buf) => {
      for (const ev of parser.push(buf)) {
        if (ev.type === 'cc') {
          if (ev.controller === 0x63) pending = { msb: ev.value };
          else if (ev.controller === 0x62 && pending) pending.lsb = ev.value;
          else if (ev.controller === 0x60 && pending && ev.value === 0x7f) { // get
            const v = this.levels.get(`${pending.msb}:${pending.lsb}`);
            if (v !== undefined) sock.write(nrpn(ev.channel, pending.msb, pending.lsb, v));
          }
        } else if (ev.type === 'nrpn') {
          this.levels.set(`${ev.msb}:${ev.lsb}`, ev.value);
          this.log(`mock-sq set nrpn ${ev.msb}:${ev.lsb} = ${ev.value}`);
          for (const c of this.clients) if (c !== sock) c.write(nrpn(ev.channel, ev.msb, ev.lsb, ev.value));
        } else if (ev.type === 'noteon' && ev.velocity > 0) {
          this.mutes.set(ev.note, ev.velocity >= 0x7f);
          for (const c of this.clients) if (c !== sock) c.write(Buffer.from([0x90 | ev.channel, ev.note, ev.velocity, 0x90 | ev.channel, ev.note, 0]));
        } else if (ev.type === 'sysex') {
          const d = ev.data;
          if (!d.subarray(0, 7).equals(Buffer.from(HEADER))) continue;
          const ch = d[7], id = d[8], idx = d[9];
          if (id === 0x01) sock.write(sysex(ch, 0x02, idx, Buffer.from(this.names.get(idx) || '', 'ascii')));
          else if (id === 0x04) sock.write(sysex(ch, 0x05, idx, Buffer.from([this.colors.get(idx) || 0])));
          else if (id === 0x03) { this.names.set(idx, d.subarray(10).toString('ascii')); }
          else if (id === 0x06) { this.colors.set(idx, d[10]); }
        }
      }
    });
    sock.on('close', () => this.clients.delete(sock));
    sock.on('error', () => {});
  }
  surfaceLevel(chIndex, value14) {
    this.levels.set(`${chIndex}:23`, value14);
    for (const c of this.clients) c.write(nrpn(0, chIndex, 0x17, value14));
  }
  surfaceMute(note, muted) {
    this.mutes.set(note, muted);
    for (const c of this.clients) c.write(Buffer.from([0x90, note, muted ? 0x7f : 0x3f, 0x90, note, 0]));
  }
}

function nrpn(ch, msb, lsb, v) { return Buffer.from([0xb0 | ch, 0x63, msb, 0xb0 | ch, 0x62, lsb, 0xb0 | ch, 0x06, (v >> 7) & 127, 0xb0 | ch, 0x26, v & 127]); }
function sysex(ch, id, idx, payload) { return Buffer.concat([Buffer.from([0xf0, ...HEADER, ch, id, idx]), payload, Buffer.from([0xf7])]); }

module.exports = { MockSq };

if (require.main === module) {
  const m = new MockSq({ port: Number(process.argv[2] || 51325), log: console.log });
  m.start().then((p) => console.log(`mock A&H SQ listening on tcp/${p}`));
}
