'use strict';
// OSC over UDP driver (Behringer X32/M32, X Air/MR, Midas, and any OSC-speaking DSP).
//
// transport:
//   type: osc-udp
//   port: 10023
//   localPort: 0                         # bind port (0 = ephemeral). X32 replies to the sender port.
//   keepalive: { address: /xremote, intervalMs: 8000 }   # re-arm remote-change subscription
//   ping: { address: /xinfo, intervalMs: 3000 }          # any reply = alive
//   timeoutMs: 10000                                     # no packets for this long = disconnected
//   onConnect: [ "/xremote" ]                            # extra addresses sent on (re)connect
//   queryRateLimit: 150
//   confirmWrites: true                                  # re-query after writes settle (X32 does not echo to sender)
//   confirmDelayMs: 250
//   argIndex: 0                                          # which argument carries the value

const dgram = require('dgram');
const osc = require('../osc/codec');
const { BaseDriver } = require('./base');

class OscUdpDriver extends BaseDriver {
  _open() {
    const t = this.transport;
    this.sock = dgram.createSocket('udp4');
    this.sock.on('error', (e) => this.emit('error', e));
    this.sock.on('message', (buf, rinfo) => this._onPacket(buf, rinfo));
    this.sock.bind(t.localPort || 0, () => {
      this.emit('log', 'info', `${this.deviceId}: UDP socket bound on ${this.sock.address().port}, target ${this.host}:${this.port}`);
      this._lastRx = 0;
      this._tick();
      this._timer = setInterval(() => this._tick(), Math.min(t.ping?.intervalMs || 3000, t.keepalive?.intervalMs || 8000, 5000));
      if (this._timer.unref) this._timer.unref();
    });
  }

  _close() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this.sock) { try { this.sock.close(); } catch (_) { /* ignore */ } }
    this.sock = null;
  }

  _tick() {
    const t = this.transport;
    const now = Date.now();
    const timeout = t.timeoutMs || 10000;
    if (this.connected && now - this._lastRx > timeout) {
      this.emit('log', 'warn', `${this.deviceId}: no packets for ${timeout}ms, marking disconnected`);
      this._setConnected(false, 'timeout');
    }
    const ping = t.ping || { address: '/xinfo', intervalMs: 3000 };
    if (!this._lastPing || now - this._lastPing >= (this.connected ? ping.intervalMs : Math.min(ping.intervalMs, 2000))) {
      this._lastPing = now;
      this._sendRaw(osc.encodeMessage(ping.address, []));
    }
    if (this.connected && t.keepalive && (!this._lastKeepalive || now - this._lastKeepalive >= t.keepalive.intervalMs)) {
      this._lastKeepalive = now;
      this._sendRaw(osc.encodeMessage(t.keepalive.address, t.keepalive.args || []));
    }
  }

  _onPacket(buf, rinfo) {
    this._lastRx = Date.now();
    if (!this.connected) {
      this._setConnected(true);
      this.stats.reconnects++;
      this.emit('log', 'info', `${this.deviceId}: reply from ${rinfo.address}:${rinfo.port}, connected`);
      this._onConnected();
    }
    let pkt;
    try { pkt = osc.decodePacket(buf); } catch (e) { this.emit('log', 'warn', `${this.deviceId}: bad OSC packet: ${e.message}`); return; }
    this._dispatch(pkt);
  }

  _dispatch(pkt) {
    if (pkt.elements) { for (const el of pkt.elements) this._dispatch(el); return; }
    const t = this.transport;
    const idx = t.argIndex || 0;
    if (t.ping && pkt.address === t.ping.address) { this.emit('info', osc.argValues(pkt)); return; }
    if (pkt.address === '/xinfo' || pkt.address === '/info' || pkt.address === '/status') { this.emit('info', osc.argValues(pkt)); return; }
    if (!pkt.args.length) return;
    const a = pkt.args[idx] || pkt.args[0];
    this._rx(pkt.address, a.value, { args: pkt.args });
  }

  _onConnected() {
    const t = this.transport;
    for (const addr of t.onConnect || []) this._sendRaw(osc.encodeMessage(addr, []));
    if (t.keepalive) { this._lastKeepalive = Date.now(); this._sendRaw(osc.encodeMessage(t.keepalive.address, t.keepalive.args || [])); }
    if (t.queryOnConnect !== false) this.queryAll();
  }

  _send(def, raw) {
    const type = def.deviceType === 'int' ? 'i' : def.deviceType === 'float' ? 'f' : def.deviceType === 'string' ? 's' : def.deviceType;
    this._sendRaw(osc.encodeMessage(def.device, [{ type, value: raw }]));
  }

  _sendQuery(def) { this._sendRaw(osc.encodeMessage(def.device, [])); }

  _sendRaw(buf) {
    if (!this.sock) return;
    this.sock.send(buf, 0, buf.length, this.port, this.host, (err) => { if (err) this.emit('error', err); });
  }
}

module.exports = { OscUdpDriver };
