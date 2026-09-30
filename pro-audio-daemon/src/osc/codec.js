'use strict';
// Open Sound Control 1.0/1.1 packet codec (messages + bundles). Zero dependencies.
// Supported type tags: i f s b T F N I d h t c r m S

const IMMEDIATE = { seconds: 0, fraction: 1 };

function pad4(n) { return (4 - (n % 4)) % 4; }

function writeString(str) {
  const b = Buffer.from(String(str), 'utf8');
  return Buffer.concat([b, Buffer.alloc(1 + pad4(b.length + 1))]);
}

function writeBlob(buf) {
  const len = Buffer.alloc(4);
  len.writeInt32BE(buf.length);
  return Buffer.concat([len, buf, Buffer.alloc(pad4(buf.length))]);
}

function readString(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  if (end >= buf.length) throw new Error('OSC: unterminated string');
  const s = buf.toString('utf8', off, end);
  end += 1; // terminating NUL
  end += pad4(end); // every OSC field starts 4-byte aligned, so pad the absolute offset
  return { value: s, next: end };
}

function inferTypeTag(v) {
  if (v === null || v === undefined) return 'N';
  if (v === true) return 'T';
  if (v === false) return 'F';
  if (Buffer.isBuffer(v)) return 'b';
  if (typeof v === 'string') return 's';
  if (typeof v === 'bigint') return 'h';
  if (typeof v === 'number') return Number.isInteger(v) ? 'i' : 'f';
  if (typeof v === 'object' && v && typeof v.type === 'string') return v.type;
  throw new Error(`OSC: cannot infer type tag for ${typeof v}`);
}

/**
 * Encode an OSC message.
 * @param {string} address
 * @param {Array} args Values or {type, value} objects.
 */
function encodeMessage(address, args = []) {
  if (typeof address !== 'string' || !address.startsWith('/')) throw new Error(`OSC: invalid address "${address}"`);
  let tags = ',';
  const parts = [];
  for (const a of args) {
    const isTyped = a !== null && typeof a === 'object' && !Buffer.isBuffer(a) && typeof a.type === 'string';
    const type = isTyped ? a.type : inferTypeTag(a);
    const value = isTyped ? a.value : a;
    tags += type;
    switch (type) {
      case 'i': { const b = Buffer.alloc(4); b.writeInt32BE(Math.trunc(value) | 0); parts.push(b); break; }
      case 'f': { const b = Buffer.alloc(4); b.writeFloatBE(Number(value)); parts.push(b); break; }
      case 'd': { const b = Buffer.alloc(8); b.writeDoubleBE(Number(value)); parts.push(b); break; }
      case 'h': { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(value)); parts.push(b); break; }
      case 's': case 'S': parts.push(writeString(value)); break;
      case 'b': parts.push(writeBlob(Buffer.isBuffer(value) ? value : Buffer.from(value))); break;
      case 'c': { const b = Buffer.alloc(4); b.writeUInt32BE(typeof value === 'string' ? value.charCodeAt(0) : value); parts.push(b); break; }
      case 'r': { const b = Buffer.alloc(4); b.writeUInt32BE(colorToUint(value)); parts.push(b); break; }
      case 'm': parts.push(Buffer.from(value.slice(0, 4))); break;
      case 't': { const b = Buffer.alloc(8); const tt = value || IMMEDIATE; b.writeUInt32BE(tt.seconds >>> 0); b.writeUInt32BE(tt.fraction >>> 0, 4); parts.push(b); break; }
      case 'T': case 'F': case 'N': case 'I': break;
      default: throw new Error(`OSC: unsupported type tag "${type}"`);
    }
  }
  return Buffer.concat([writeString(address), writeString(tags), ...parts]);
}

function colorToUint(v) {
  if (typeof v === 'number') return v >>> 0;
  if (typeof v === 'string') {
    const hex = v.replace('#', '');
    const n = parseInt(hex.padEnd(8, hex.length <= 6 ? 'ff' : '0'), 16);
    return n >>> 0;
  }
  const { r = 0, g = 0, b = 0, a = 255 } = v;
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

function encodeBundle(elements, timetag = IMMEDIATE) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(timetag.seconds >>> 0);
  head.writeUInt32BE(timetag.fraction >>> 0, 4);
  const parts = [writeString('#bundle'), head];
  for (const el of elements) {
    const buf = Buffer.isBuffer(el) ? el : (el.elements ? encodeBundle(el.elements, el.timetag) : encodeMessage(el.address, el.args));
    const len = Buffer.alloc(4);
    len.writeInt32BE(buf.length);
    parts.push(len, buf);
  }
  return Buffer.concat(parts);
}

/** Decode a packet into {address, args:[{type,value}]} or {timetag, elements:[...]}. */
function decodePacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) throw new Error('OSC: packet too short');
  if (buf[0] === 0x23 /* # */) {
    const head = readString(buf, 0);
    if (head.value !== '#bundle') throw new Error('OSC: bad bundle header');
    const timetag = { seconds: buf.readUInt32BE(8), fraction: buf.readUInt32BE(12) };
    let off = 16;
    const elements = [];
    while (off + 4 <= buf.length) {
      const len = buf.readInt32BE(off); off += 4;
      if (len < 0 || off + len > buf.length) throw new Error('OSC: bundle element overruns packet');
      elements.push(decodePacket(buf.subarray(off, off + len)));
      off += len;
    }
    return { timetag, elements };
  }
  const addr = readString(buf, 0);
  if (!addr.value.startsWith('/')) throw new Error(`OSC: invalid address "${addr.value}"`);
  let off = addr.next;
  const args = [];
  if (off >= buf.length) return { address: addr.value, args };
  const tagsRead = readString(buf, off);
  off = tagsRead.next;
  const tags = tagsRead.value.startsWith(',') ? tagsRead.value.slice(1) : tagsRead.value;
  const stack = [args];
  for (const t of tags) {
    const cur = stack[stack.length - 1];
    switch (t) {
      case 'i': cur.push({ type: 'i', value: buf.readInt32BE(off) }); off += 4; break;
      case 'f': cur.push({ type: 'f', value: buf.readFloatBE(off) }); off += 4; break;
      case 'd': cur.push({ type: 'd', value: buf.readDoubleBE(off) }); off += 8; break;
      case 'h': cur.push({ type: 'h', value: buf.readBigInt64BE(off) }); off += 8; break;
      case 's': case 'S': { const r = readString(buf, off); cur.push({ type: t, value: r.value }); off = r.next; break; }
      case 'b': { const len = buf.readInt32BE(off); off += 4; cur.push({ type: 'b', value: Buffer.from(buf.subarray(off, off + len)) }); off += len + pad4(len); break; }
      case 'c': cur.push({ type: 'c', value: String.fromCodePoint(buf.readUInt32BE(off)) }); off += 4; break;
      case 'r': { const n = buf.readUInt32BE(off); cur.push({ type: 'r', value: { r: n >>> 24, g: (n >>> 16) & 255, b: (n >>> 8) & 255, a: n & 255 } }); off += 4; break; }
      case 'm': cur.push({ type: 'm', value: Buffer.from(buf.subarray(off, off + 4)) }); off += 4; break;
      case 't': cur.push({ type: 't', value: { seconds: buf.readUInt32BE(off), fraction: buf.readUInt32BE(off + 4) } }); off += 8; break;
      case 'T': cur.push({ type: 'T', value: true }); break;
      case 'F': cur.push({ type: 'F', value: false }); break;
      case 'N': cur.push({ type: 'N', value: null }); break;
      case 'I': cur.push({ type: 'I', value: Infinity }); break;
      case '[': { const arr = []; cur.push({ type: '[', value: arr }); stack.push(arr); break; }
      case ']': stack.pop(); break;
      default: throw new Error(`OSC: unsupported type tag "${t}" in "${tagsRead.value}"`);
    }
  }
  return { address: addr.value, args };
}

/** Convenience: plain JS values from decoded args. */
function argValues(msg) { return (msg.args || []).map((a) => a.value); }

/** Match an OSC address pattern (with * ? [] {} wildcards) against a concrete address. */
function patternToRegExp(pattern) {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') { const end = pattern.indexOf(']', i); const body = pattern.slice(i + 1, end).replace(/^!/, '^'); re += `[${body}]`; i = end; }
    else if (c === '{') { const end = pattern.indexOf('}', i); re += `(?:${pattern.slice(i + 1, end).split(',').map(escapeRe).join('|')})`; i = end; }
    else if (c === '/' && pattern[i + 1] === '/') { re += '(?:/.*)?/'; i++; }
    else re += escapeRe(c);
  }
  return new RegExp(re + '$');
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { encodeMessage, encodeBundle, decodePacket, argValues, patternToRegExp, IMMEDIATE };
