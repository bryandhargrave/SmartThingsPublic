'use strict';
// In-memory shadow state engine.
//
// Every normalized parameter lives here as a node keyed by its full northbound path
// ("/<deviceId>/ch/01/fader"). Device drivers push observed values; clients push desired
// values. The engine:
//   * keeps the latest value + metadata so reconnecting clients sync from cache instantly
//   * suppresses echoes (a device confirming a value we just sent is not re-broadcast as a change)
//   * prevents loops (device-originated changes are never written back to the device,
//     and client writes that match current state are no-ops)
//   * coalesces high-frequency updates into a per-tick batch for subscribers

const { EventEmitter } = require('events');

const FLOAT_EPS = 1e-4;

function valuesEqual(a, b, type) {
  if (type === 'float' || (typeof a === 'number' && typeof b === 'number')) return Math.abs(Number(a) - Number(b)) <= FLOAT_EPS;
  return a === b;
}

class ShadowState extends EventEmitter {
  constructor({ echoWindowMs = 1500, batchMs = 8 } = {}) {
    super();
    this.setMaxListeners(0);
    this.nodes = new Map(); // path -> node
    this.pending = new Map(); // path -> { value, ts, origin }
    this.echoWindowMs = echoWindowMs;
    this.batchMs = batchMs;
    this._batch = new Map();
    this._timer = null;
    this.stats = { deviceUpdates: 0, clientWrites: 0, echoesSuppressed: 0, noopWrites: 0 };
  }

  /** Register a parameter node (idempotent). */
  register(def, deviceId) {
    const path = def.fullPath || `/${deviceId}${def.path}`;
    if (this.nodes.has(path)) return this.nodes.get(path);
    const node = {
      path,
      deviceId,
      def,
      value: null,
      raw: null,
      ts: 0,
      source: null,
      stale: true, // true until the device has reported a value
    };
    this.nodes.set(path, node);
    this.emit('node', node);
    return node;
  }

  /** Remove every node belonging to a device. */
  unregister(deviceId) {
    let n = 0;
    for (const [p, node] of this.nodes) if (node.deviceId === deviceId) { this.nodes.delete(p); this.pending.delete(p); this._batch.delete(p); n++; }
    this.emit('unregister', { deviceId, count: n });
    return n;
  }

  get(path) { return this.nodes.get(path); }

  has(path) { return this.nodes.has(path); }

  /** All nodes whose path starts with prefix. */
  list(prefix = '/') {
    const out = [];
    for (const n of this.nodes.values()) if (n.path === prefix || n.path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')) out.push(n);
    return out;
  }

  /**
   * Record a value observed from the device.
   * Returns { changed, echo }.
   */
  updateFromDevice(path, value, raw, ts = Date.now()) {
    const node = this.nodes.get(path);
    if (!node) return { changed: false, echo: false, unknown: true };
    this.stats.deviceUpdates++;
    const wasStale = node.stale;
    node.stale = false;
    node.raw = raw;
    const pend = this.pending.get(path);
    let echo = false;
    if (pend) {
      if (valuesEqual(pend.value, value, node.def.type)) {
        // Device confirmed what we sent. Not a change from the client's point of view.
        this.pending.delete(path);
        echo = true;
        this.stats.echoesSuppressed++;
      } else if (ts - pend.ts > this.echoWindowMs) {
        this.pending.delete(path);
      } else {
        // The device disagrees within the echo window (e.g. clamped or rejected our write).
        // The device is authoritative: drop the pending write and take its value.
        this.pending.delete(path);
      }
    }
    const changed = wasStale || !valuesEqual(node.value, value, node.def.type);
    if (changed || echo) {
      node.value = value;
      node.ts = ts;
      node.source = 'device';
    }
    if (changed && !echo) this._queue(node, 'device', wasStale);
    else if (echo && wasStale) this._queue(node, 'device', true);
    return { changed, echo };
  }

  /**
   * Record a desired value from a client. Returns { accepted, value, reason }.
   * The caller is responsible for actually writing to the device when accepted.
   */
  setFromClient(path, value, origin = 'client', ts = Date.now()) {
    const node = this.nodes.get(path);
    if (!node) return { accepted: false, reason: 'unknown path' };
    if (node.def.access === 'r') return { accepted: false, reason: 'read-only' };
    const coerced = coerce(node.def, value);
    if (coerced.error) return { accepted: false, reason: coerced.error };
    value = coerced.value;
    this.stats.clientWrites++;
    if (!node.stale && valuesEqual(node.value, value, node.def.type) && !this.pending.has(path)) {
      this.stats.noopWrites++;
      return { accepted: true, value, noop: true };
    }
    // Optimistic update: clients see the new value immediately; device echo confirms it.
    node.value = value;
    node.ts = ts;
    node.source = origin;
    node.stale = false;
    this.pending.set(path, { value, ts, origin });
    this._queue(node, origin, false);
    return { accepted: true, value, noop: false };
  }

  markStale(deviceId, stale = true) {
    for (const n of this.nodes.values()) if (n.deviceId === deviceId) n.stale = stale;
    this.emit('stale', { deviceId, stale });
  }

  /** Expire pending writes that never got an echo (device dropped them or doesn't echo). */
  sweepPending(now = Date.now()) {
    for (const [p, pend] of this.pending) if (now - pend.ts > this.echoWindowMs) this.pending.delete(p);
  }

  _queue(node, origin, initial = false) {
    // `initial` marks the first value after (re)connect sync, so rules can ignore start-up population.
    const prev = this._batch.get(node.path);
    this._batch.set(node.path, { path: node.path, value: node.value, ts: node.ts, source: origin, deviceId: node.deviceId, initial: !!initial && !(prev && !prev.initial) });
    if (!this._timer) this._timer = setTimeout(() => this.flush(), this.batchMs);
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._batch.size === 0) return;
    const changes = [...this._batch.values()];
    this._batch.clear();
    this.emit('changes', changes);
    for (const c of changes) this.emit('change', c);
  }

  snapshot(prefix = '/') {
    return this.list(prefix).map((n) => ({ path: n.path, value: n.value, ts: n.ts, stale: n.stale, source: n.source }));
  }
}

/** Coerce and validate a client-supplied value against the parameter definition. */
function coerce(def, value) {
  switch (def.type) {
    case 'float': {
      const n = typeof value === 'string' ? parseFloat(value) : Number(value);
      if (Number.isNaN(n)) return { error: `expected number, got ${JSON.stringify(value)}` };
      if (def.range && Number.isFinite(n)) return { value: Math.min(def.range[1], Math.max(def.range[0], n)) };
      if (def.range && !Number.isFinite(n)) return { value: n < 0 ? def.range[0] : def.range[1] };
      return { value: n };
    }
    case 'int': {
      const n = Math.round(typeof value === 'string' ? parseFloat(value) : Number(value));
      if (Number.isNaN(n)) return { error: `expected integer, got ${JSON.stringify(value)}` };
      if (def.range) return { value: Math.min(def.range[1], Math.max(def.range[0], n)) };
      return { value: n };
    }
    case 'bool': {
      if (typeof value === 'boolean') return { value };
      if (typeof value === 'number') return { value: value !== 0 };
      if (typeof value === 'string') return { value: /^(1|true|on|yes|mute|muted)$/i.test(value) };
      return { error: `expected boolean, got ${JSON.stringify(value)}` };
    }
    case 'string': {
      return { value: value === null || value === undefined ? '' : String(value) };
    }
    case 'color': case 'enum': {
      if (def.scale && def.scale.values) {
        const allowed = def.scale.values.map((v) => String(v).toLowerCase());
        const idx = allowed.indexOf(String(value).toLowerCase());
        if (idx < 0) {
          // allow raw index too
          if (typeof value === 'number' || /^\d+$/.test(String(value))) return { value: def.scale.toValue(Number(value)) };
          return { error: `"${value}" not in [${def.scale.values.join(', ')}]` };
        }
        return { value: def.scale.values[idx] };
      }
      return { value: String(value) };
    }
    default:
      return { value };
  }
}

module.exports = { ShadowState, valuesEqual, coerce };
