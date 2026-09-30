'use strict';
// MIDI-over-TCP driver (Allen & Heath SQ / dLive / Avantis style control).
//
// transport:
//   type: midi-tcp
//   port: 51325
//   midiChannel: 0                 # base MIDI channel (0-15) configured on the console
//   poll: { intervalMs: 5000 }     # periodic re-query of pollable parameters (query polling)
//   keepalive: { intervalMs: 5000 }  # optional: sends MIDI Active Sensing (0xFE)
//   sysexHeader: [0x00, 0x00, 0x1A, 0x50, 0x11, 0x01, 0x00]
//
// device address forms (parameter.device):
//   { kind: nrpn, msb: <n>, lsb: <n>, channelOffset?: 0 }     14-bit value (VA<<7 | VB)
//   { kind: note, note: <n>, on: 0x7F, off: 0x3F, channelOffset?: 0 }   Note On velocity encodes state
//   { kind: sysex, get: <id>, set: <id>, response: <id>, index: <n>, encoding: ascii|byte, maxLength?: 8 }

const net = require('net');
const { BaseDriver } = require('./base');

class MidiTcpDriver extends BaseDriver {
  constructor(opts) {
    super(opts);
    this._parser = new MidiParser();
    this.rate = this.transport.queryRateLimit || 40;
    this.header = Buffer.from(this.transport.sysexHeader || [0x00, 0x00, 0x1a, 0x50, 0x11, 0x01, 0x00]);
    this.midiChannel = this.transport.midiChannel || 0;
    // Index lookups
    this.nrpnMap = new Map(); // "ch:msb:lsb" -> def
    this.noteMap = new Map(); // "ch:note" -> def
    this.sysexMap = new Map(); // "responseId:index" -> def
    for (const d of this.defs) {
      const a = d.device;
      if (!a || typeof a !== 'object') continue;
      const ch = (this.midiChannel + (a.channelOffset || 0)) & 15;
      if (a.kind === 'nrpn') this.nrpnMap.set(`${ch}:${a.msb}:${a.lsb}`, d);
      else if (a.kind === 'note') this.noteMap.set(`${ch}:${a.note}`, d);
      else if (a.kind === 'sysex') this.sysexMap.set(`${a.response}:${a.index}`, d);
    }
  }

  _open() {
    if (this.closed) return;
    const t = this.transport;
    this.sock = net.createConnection({ host: this.host, port: this.port });
    this.sock.setNoDelay(true);
    this.sock.on('connect', () => {
      this.emit('log', 'info', `${this.deviceId}: MIDI/TCP connected to ${this.host}:${this.port}`);
      this.stats.reconnects++;
      this._resetBackoff();
      this._setConnected(true);
      if (t.queryOnConnect !== false) this.queryAll();
      this._timer = setInterval(() => this._tick(), 1000);
      if (this._timer.unref) this._timer.unref();
    });
    this.sock.on('data', (buf) => this._onData(buf));
    this.sock.on('error', (e) => this.emit('log', 'warn', `${this.deviceId}: socket error ${e.code || e.message}`));
    this.sock.on('close', () => {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
      this._setConnected(false, 'closed');
      if (!this.closed) {
        const ms = this._nextBackoff();
        this._reconnect = setTimeout(() => this._open(), ms);
        if (this._reconnect.unref) this._reconnect.unref();
      }
    });
  }

  _close() {
    if (this._reconnect) clearTimeout(this._reconnect);
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this.sock) { this.sock.destroy(); this.sock = null; }
  }

  _tick() {
    const t = this.transport;
    const now = Date.now();
    if (t.keepalive && (!this._lastKeepalive || now - this._lastKeepalive >= t.keepalive.intervalMs)) {
      this._lastKeepalive = now;
      this._raw(Buffer.from([0xfe]));
    }
    if (t.poll && (!this._lastPoll || now - this._lastPoll >= t.poll.intervalMs) && this._queue.length === 0) {
      this._lastPoll = now;
      this.queryAll();
    }
  }

  _onData(buf) {
    for (const ev of this._parser.push(buf)) this._onEvent(ev);
  }

  _onEvent(ev) {
    this.emit('midi', ev);
    if (ev.type === 'nrpn') {
      const def = this.nrpnMap.get(`${ev.channel}:${ev.msb}:${ev.lsb}`);
      if (def) this._rx(def.device, ev.value);
      else { this.stats.unknown++; this.emit('unknown', { key: `nrpn ${ev.channel}:${ev.msb}:${ev.lsb}`, raw: ev.value }); }
    } else if (ev.type === 'noteon') {
      const def = this.noteMap.get(`${ev.channel}:${ev.note}`);
      if (def && ev.velocity > 0) this._rx(def.device, ev.velocity >= (def.device.on || 0x7f) ? 1 : 0);
    } else if (ev.type === 'sysex') {
      const d = ev.data;
      if (d.length < this.header.length + 3 || !d.subarray(0, this.header.length).equals(this.header)) return;
      // header, midi channel, message id, index, payload...
      const id = d[this.header.length + 1];
      const index = d[this.header.length + 2];
      const payload = d.subarray(this.header.length + 3);
      const def = this.sysexMap.get(`${id}:${index}`);
      if (!def) { this.stats.unknown++; this.emit('unknown', { key: `sysex ${id}:${index}`, raw: payload }); return; }
      const enc = def.device.encoding || 'ascii';
      this._rx(def.device, enc === 'ascii' ? payload.toString('ascii').replace(/\0+$/, '').trim() : payload[0]);
    }
  }

  _send(def, raw) {
    const a = def.device;
    const ch = (this.midiChannel + (a.channelOffset || 0)) & 15;
    if (a.kind === 'nrpn') {
      const v = Math.max(0, Math.min(16383, Math.round(Number(raw))));
      this._raw(Buffer.from([0xb0 | ch, 0x63, a.msb & 127, 0xb0 | ch, 0x62, a.lsb & 127, 0xb0 | ch, 0x06, (v >> 7) & 127, 0xb0 | ch, 0x26, v & 127]));
    } else if (a.kind === 'note') {
      const vel = Number(raw) ? (a.on === undefined ? 0x7f : a.on) : (a.off === undefined ? 0x3f : a.off);
      this._raw(Buffer.from([0x90 | ch, a.note & 127, vel & 127, 0x90 | ch, a.note & 127, 0x00]));
    } else if (a.kind === 'sysex') {
      const enc = a.encoding || 'ascii';
      let payload;
      if (enc === 'ascii') payload = Buffer.from(String(raw).slice(0, a.maxLength || 8), 'ascii').map((b) => b & 127);
      else payload = Buffer.from([Number(raw) & 127]);
      this._raw(Buffer.concat([Buffer.from([0xf0]), this.header, Buffer.from([ch, a.set & 127, a.index & 127]), payload, Buffer.from([0xf7])]));
    }
  }

  _sendQuery(def) {
    const a = def.device;
    const ch = (this.midiChannel + (a.channelOffset || 0)) & 15;
    if (a.kind === 'nrpn') {
      // Data Increment with 0x7F is the "get" request in the A&H NRPN dialect.
      this._raw(Buffer.from([0xb0 | ch, 0x63, a.msb & 127, 0xb0 | ch, 0x62, a.lsb & 127, 0xb0 | ch, 0x60, 0x7f]));
    } else if (a.kind === 'sysex' && a.get !== undefined) {
      this._raw(Buffer.concat([Buffer.from([0xf0]), this.header, Buffer.from([ch, a.get & 127, a.index & 127, 0xf7])]));
    } else if (a.kind === 'note' && a.query) {
      this._raw(Buffer.from([0xb0 | ch, 0x63, a.query.msb & 127, 0xb0 | ch, 0x62, a.query.lsb & 127, 0xb0 | ch, 0x60, 0x7f]));
    }
  }

  _raw(buf) { if (this.sock && !this.sock.destroyed) this.sock.write(buf); }
}

/** Incremental MIDI byte-stream parser with NRPN assembly. */
class MidiParser {
  constructor() { this.status = 0; this.data = []; this.sysex = null; this.nrpn = new Map(); }
  push(buf) {
    const out = [];
    for (const b of buf) {
      if (this.sysex) {
        if (b === 0xf7) { out.push({ type: 'sysex', data: Buffer.from(this.sysex) }); this.sysex = null; }
        else if (b < 0x80) this.sysex.push(b);
        else if (b >= 0xf8) { /* realtime inside sysex, ignore */ }
        else { this.sysex = null; this._status(b); }
        continue;
      }
      if (b === 0xf0) { this.sysex = []; continue; }
      if (b >= 0xf8) continue; // realtime
      if (b >= 0x80) { this._status(b); continue; }
      this.data.push(b);
      const need = this._needed(this.status);
      if (need && this.data.length >= need) {
        const ev = this._emit();
        if (ev) out.push(ev);
        this.data = [];
      }
    }
    return out;
  }
  _status(b) { this.status = b; this.data = []; }
  _needed(st) {
    const hi = st & 0xf0;
    if (hi === 0xc0 || hi === 0xd0) return 1;
    if (hi >= 0x80 && hi <= 0xe0) return 2;
    return 0;
  }
  _emit() {
    const hi = this.status & 0xf0, ch = this.status & 0x0f;
    const [d1, d2] = this.data;
    if (hi === 0x90) return { type: 'noteon', channel: ch, note: d1, velocity: d2 };
    if (hi === 0x80) return { type: 'noteoff', channel: ch, note: d1, velocity: d2 };
    if (hi === 0xb0) {
      const st = this.nrpn.get(ch) || { msb: null, lsb: null, va: null };
      if (d1 === 0x63) { st.msb = d2; st.va = null; }
      else if (d1 === 0x62) { st.lsb = d2; st.va = null; }
      else if (d1 === 0x06) { st.va = d2; }
      else if (d1 === 0x26 && st.msb !== null && st.lsb !== null && st.va !== null) {
        this.nrpn.set(ch, st);
        return { type: 'nrpn', channel: ch, msb: st.msb, lsb: st.lsb, value: (st.va << 7) | d2 };
      }
      this.nrpn.set(ch, st);
      return { type: 'cc', channel: ch, controller: d1, value: d2 };
    }
    return { type: 'other', status: this.status, data: [...this.data] };
  }
}

module.exports = { MidiTcpDriver, MidiParser };
