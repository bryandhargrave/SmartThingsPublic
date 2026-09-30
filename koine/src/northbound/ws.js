'use strict';
// Minimal RFC 6455 WebSocket server (no dependencies). Handles handshake, masking,
// fragmentation, ping/pong and close. Enough for OSCQuery + JSON control clients.
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WebSocketConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragOpcode = 0;
    this.closed = false;
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => { if (!this.closed) { this.closed = true; this.emit('close'); } });
    socket.on('error', (e) => this.emit('error', e));
    socket.on('end', () => this.close());
  }

  send(data) {
    if (this.closed) return false;
    const isBinary = Buffer.isBuffer(data);
    const payload = isBinary ? data : Buffer.from(String(data), 'utf8');
    return this.socket.write(frame(isBinary ? 0x2 : 0x1, payload));
  }

  ping(payload = Buffer.alloc(0)) { if (!this.closed) this.socket.write(frame(0x9, payload)); }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = true;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    try { this.socket.write(frame(0x8, body)); } catch (_) { /* ignore */ }
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 500).unref();
    this.emit('close');
  }

  _onData(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    for (;;) {
      const f = parseFrame(this.buffer);
      if (!f) break;
      this.buffer = this.buffer.subarray(f.total);
      this._onFrame(f);
    }
    if (this.buffer.length > 16 * 1024 * 1024) this.close(1009, 'message too big');
  }

  _onFrame(f) {
    switch (f.opcode) {
      case 0x0: // continuation
        this.fragments.push(f.payload);
        if (f.fin) { const msg = Buffer.concat(this.fragments); this.fragments = []; this._deliver(this.fragOpcode, msg); }
        break;
      case 0x1: case 0x2:
        if (f.fin) this._deliver(f.opcode, f.payload);
        else { this.fragOpcode = f.opcode; this.fragments = [f.payload]; }
        break;
      case 0x8: { const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005; this.close(code); break; }
      case 0x9: if (!this.closed) this.socket.write(frame(0xA, f.payload)); break;
      case 0xA: this.emit('pong', f.payload); break;
      default: this.close(1002, 'unknown opcode');
    }
  }

  _deliver(opcode, payload) {
    if (opcode === 0x1) this.emit('message', payload.toString('utf8'), false);
    else this.emit('message', payload, true);
  }
}

function frame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

function parseFrame(buf) {
  if (buf.length < 2) return null;
  const fin = !!(buf[0] & 0x80);
  const opcode = buf[0] & 0x0f;
  const masked = !!(buf[1] & 0x80);
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  let mask = null;
  if (masked) { if (buf.length < off + 4) return null; mask = buf.subarray(off, off + 4); off += 4; }
  if (buf.length < off + len) return null;
  let payload = Buffer.from(buf.subarray(off, off + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  return { fin, opcode, payload, total: off + len };
}

/** Client-side frame builder (masked), used by tests and the CLI. */
function clientFrame(opcode, payload) {
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, mask, masked]);
}

function acceptKey(key) { return crypto.createHash('sha1').update(key + GUID).digest('base64'); }

/** Perform the handshake on an http 'upgrade' event and return a connection. */
function handleUpgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key || !/websocket/i.test(req.headers.upgrade || '')) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return null;
  }
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
  ];
  socket.write(headers.join('\r\n') + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = new WebSocketConnection(socket);
  if (head && head.length) conn._onData(head);
  return conn;
}

module.exports = { handleUpgrade, WebSocketConnection, frame, parseFrame, clientFrame, acceptKey };
