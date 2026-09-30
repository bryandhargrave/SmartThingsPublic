'use strict';
// Line-oriented TCP driver (Yamaha SCP "Remote Control Protocol" on 49280, and any
// text protocol with request/response + unsolicited notifications).
//
// transport:
//   type: tcp-line
//   port: 49280
//   delimiter: "\n"
//   reconnectMs: 2000
//   keepalive: { command: "devstatus runmode", intervalMs: 5000 }
//   timeoutMs: 15000
//   queryRateLimit: 50
//   dialect:
//     get: "get {device}"
//     set: "set {device} {raw}"
//     quoteStrings: true
//     response: '^(?:OK|OKm|NOTIFY)\s+(?:get|set|sscurrent_ex|sscurrent)\s+(?<key>\S+\s+\d+\s+\d+)\s+(?<raw>.*)$'
//     error: '^ERROR\b'
//     resync: '^NOTIFY\s+sscurrent'     # optional: any line matching this triggers a full re-sync

const net = require('net');
const { BaseDriver } = require('./base');

class TcpLineDriver extends BaseDriver {
  constructor(opts) {
    super(opts);
    const d = this.transport.dialect || {};
    this.responseRe = new RegExp(d.response || '^(?<key>\\S+)\\s+(?<raw>.*)$');
    this.errorRe = d.error ? new RegExp(d.error) : null;
    this.resyncRe = d.resync ? new RegExp(d.resync) : null;
    this.delimiter = this.transport.delimiter || '\n';
    this._buf = '';
  }

  _open() {
    if (this.closed) return;
    const t = this.transport;
    this.sock = net.createConnection({ host: this.host, port: this.port });
    this.sock.setNoDelay(true);
    this.sock.setEncoding('utf8');
    this.sock.on('connect', () => {
      this.emit('log', 'info', `${this.deviceId}: TCP connected to ${this.host}:${this.port}`);
      this._lastRx = Date.now();
      this.stats.reconnects++;
      this._setConnected(true);
      if (t.onConnect) for (const c of t.onConnect) this._writeLine(c);
      if (t.keepalive) this._writeLine(t.keepalive.command);
      if (t.queryOnConnect !== false) this.queryAll();
      this._timer = setInterval(() => this._tick(), 1000);
      if (this._timer.unref) this._timer.unref();
    });
    this.sock.on('data', (chunk) => this._onData(chunk));
    this.sock.on('error', (e) => this.emit('log', 'warn', `${this.deviceId}: socket error ${e.code || e.message}`));
    this.sock.on('close', () => {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
      this._setConnected(false, 'closed');
      if (!this.closed) {
        const ms = t.reconnectMs || 2000;
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
      this._writeLine(t.keepalive.command);
    }
    if (t.timeoutMs && now - this._lastRx > t.timeoutMs) {
      this.emit('log', 'warn', `${this.deviceId}: no data for ${t.timeoutMs}ms, reconnecting`);
      if (this.sock) this.sock.destroy();
    }
  }

  _onData(chunk) {
    this._lastRx = Date.now();
    this._buf += chunk;
    let idx;
    while ((idx = this._buf.indexOf(this.delimiter)) >= 0) {
      const line = this._buf.slice(0, idx).replace(/\r$/, '');
      this._buf = this._buf.slice(idx + this.delimiter.length);
      if (line.trim()) this._onLine(line);
    }
    if (this._buf.length > 65536) this._buf = '';
  }

  _onLine(line) {
    this.emit('line', line);
    if (this.resyncRe && this.resyncRe.test(line)) {
      this.emit('log', 'info', `${this.deviceId}: resync trigger: ${line}`);
      this.queryAll();
      return;
    }
    if (this.errorRe && this.errorRe.test(line)) { this.emit('log', 'warn', `${this.deviceId}: ${line}`); return; }
    const m = this.responseRe.exec(line);
    if (!m || !m.groups) return;
    const key = normalizeSpaces(m.groups.key);
    this._rx(key, parseRaw(m.groups.raw));
  }

  _send(def, raw) {
    const d = this.transport.dialect || {};
    let r = raw;
    if (typeof raw === 'string' && d.quoteStrings !== false) r = JSON.stringify(raw);
    else if (typeof raw === 'number') r = Number.isInteger(raw) ? String(raw) : raw.toFixed(d.floatDigits === undefined ? 3 : d.floatDigits);
    this._writeLine((d.set || 'set {device} {raw}').replace('{device}', def.device).replace('{raw}', String(r)));
  }

  _sendQuery(def) {
    const d = this.transport.dialect || {};
    this._writeLine((d.get || 'get {device}').replace('{device}', def.device));
  }

  _writeLine(s) {
    if (!this.sock || this.sock.destroyed) return;
    this.sock.write(s + this.delimiter);
  }
}

function normalizeSpaces(s) { return String(s).trim().replace(/\s+/g, ' '); }

function parseRaw(s) {
  if (s === undefined || s === null) return null;
  s = String(s).trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) { try { return JSON.parse(s); } catch (_) { return s.slice(1, -1); } }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

module.exports = { TcpLineDriver, parseRaw };
