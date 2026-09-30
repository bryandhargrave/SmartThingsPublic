'use strict';
const { EventEmitter } = require('events');

/**
 * Base class for southbound drivers.
 * Events: connected, disconnected(reason), raw({def, raw}), unknown({key, raw}), error(err), log(level,msg)
 * Subclasses implement _open(), _close(), _send(def, raw) and _sendQuery(def) and call _rx(key, raw).
 */
class BaseDriver extends EventEmitter {
  constructor({ deviceId, host, port, transport, defs, log }) {
    super();
    this.deviceId = deviceId;
    this.host = host;
    this.port = port || transport.port;
    this.transport = transport;
    this.defs = defs;
    this.log = log || (() => {});
    this.connected = false;
    this.closed = false;
    this.byKey = new Map(); // device key -> [def]
    for (const d of defs) {
      const k = this.keyOf(d.device);
      if (!this.byKey.has(k)) this.byKey.set(k, []);
      this.byKey.get(k).push(d);
    }
    this._queue = [];
    this._pump = null;
    this._confirm = new Map();
    this.rate = transport.queryRateLimit || 100; // messages per second
    this.stats = { tx: 0, rx: 0, unknown: 0, reconnects: 0 };
  }

  keyOf(device) { return typeof device === 'string' ? device : JSON.stringify(device); }

  connect() { this.closed = false; this._open(); }

  close() { this.closed = true; this._stopPump(); this._close(); this._setConnected(false, 'closed'); }

  /** Write a raw (device-scaled) value. */
  write(def, raw) {
    if (!this.connected) return false;
    this.stats.tx++;
    this._send(def, raw);
    // Consoles that don't echo writes to the sender (X32) get a debounced confirmation query,
    // so the shadow state reflects clamping/rejection without doubling traffic during fader moves.
    if (this.transport.confirmWrites) {
      const prev = this._confirm.get(def);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => { this._confirm.delete(def); if (this.connected) { this.stats.tx++; this._sendQuery(def); } }, this.transport.confirmDelayMs || 250);
      if (t.unref) t.unref();
      this._confirm.set(def, t);
    }
    return true;
  }

  /** Ask the device for the current value of one parameter. */
  query(def) {
    if (!this.connected || def.poll === false) return;
    this._enqueue(() => { this.stats.tx++; this._sendQuery(def); });
  }

  /** Rate-limited full state sync. */
  queryAll() {
    for (const d of this.defs) if (d.access !== 'w') this.query(d);
    this.emit('log', 'info', `${this.deviceId}: queued full sync of ${this.defs.length} parameters`);
  }

  _enqueue(fn) {
    this._queue.push(fn);
    if (!this._pump) {
      const interval = Math.max(1, Math.floor(1000 / this.rate));
      const perTick = Math.max(1, Math.round(this.rate * interval / 1000));
      this._pump = setInterval(() => {
        for (let i = 0; i < perTick && this._queue.length; i++) {
          try { this._queue.shift()(); } catch (e) { this.emit('error', e); }
        }
        if (this._queue.length === 0) this._stopPump();
      }, interval);
    }
  }

  _stopPump() {
    if (this._pump) { clearInterval(this._pump); this._pump = null; }
    this._queue.length = 0;
    for (const t of this._confirm.values()) clearTimeout(t);
    this._confirm.clear();
  }

  _setConnected(v, reason) {
    if (this.connected === v) return;
    this.connected = v;
    if (v) this.emit('connected'); else { this._stopPump(); this.emit('disconnected', reason); }
  }

  /** Called by subclasses for each observed device value. */
  _rx(key, raw, extra) {
    this.stats.rx++;
    const defs = this.byKey.get(this.keyOf(key));
    if (!defs) { this.stats.unknown++; this.emit('unknown', { key, raw }); return; }
    for (const def of defs) this.emit('raw', { def, raw, extra });
  }

  _open() { throw new Error('not implemented'); }
  _close() {}
  _send() { throw new Error('not implemented'); }
  _sendQuery() { throw new Error('not implemented'); }
}

module.exports = { BaseDriver };
