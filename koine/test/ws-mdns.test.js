'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ws = require('../src/northbound/ws');
const mdns = require('../src/northbound/mdns');
const { MidiParser } = require('../src/drivers/midi-tcp');
const { parseRaw } = require('../src/drivers/tcp-line');

test('websocket frames round-trip including masking and large payloads', () => {
  for (const len of [0, 5, 125, 126, 300, 65535, 65536, 100000]) {
    const payload = Buffer.alloc(len, 0xab);
    const f = ws.parseFrame(ws.clientFrame(0x2, payload));
    assert.ok(f, `len ${len}`);
    assert.equal(f.opcode, 0x2);
    assert.equal(f.fin, true);
    assert.equal(f.payload.length, len);
    assert.ok(f.payload.equals(payload));
    const s = ws.parseFrame(ws.frame(0x1, payload));
    assert.ok(s.payload.equals(payload));
  }
  assert.equal(ws.parseFrame(Buffer.from([0x81])), null);
  assert.equal(ws.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('mDNS name/record encoding parses back', () => {
  const recs = [{ name: '_oscjson._tcp.local', type: mdns.TYPE.PTR, ttl: 120, data: mdns.encodeName('koine._oscjson._tcp.local') }];
  const pkt = mdns.buildResponse(recs, []);
  assert.equal(pkt.readUInt16BE(2), 0x8400);
  assert.equal(pkt.readUInt16BE(6), 1);
  const n = mdns.readName(pkt, 12);
  assert.equal(n.name, '_oscjson._tcp.local');
  // build a query with a compression pointer and parse it
  const q = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0]), mdns.encodeName('_oscjson._tcp.local'), Buffer.from([0, 12, 0x80, 1]), Buffer.from([0xc0, 12]), Buffer.from([0, 33, 0, 1])]);
  const msg = mdns.parseMessage(q);
  assert.equal(msg.qr, false);
  assert.equal(msg.questions.length, 2);
  assert.equal(msg.questions[0].name, '_oscjson._tcp.local');
  assert.equal(msg.questions[0].unicast, true);
  assert.equal(msg.questions[1].name, '_oscjson._tcp.local');
  assert.equal(msg.questions[1].type, 33);
});

test('MIDI parser assembles NRPN, notes and sysex across chunk boundaries', () => {
  const p = new MidiParser();
  const stream = Buffer.from([0xb0, 0x63, 0x05, 0xb0, 0x62, 0x17, 0xb0, 0x06, 0x6d, 0xb0, 0x26, 0x33, 0x90, 0x05, 0x7f, 0x90, 0x05, 0x00, 0xf0, 0x00, 0x00, 0x1a, 0x50, 0x11, 0x01, 0x00, 0x00, 0x02, 0x05, 0x4b, 0x69, 0x63, 0x6b, 0xf7, 0xfe]);
  const events = [];
  for (let i = 0; i < stream.length; i += 3) events.push(...p.push(stream.subarray(i, i + 3)));
  const nrpn = events.find((e) => e.type === 'nrpn');
  assert.deepEqual(nrpn, { type: 'nrpn', channel: 0, msb: 5, lsb: 0x17, value: (0x6d << 7) | 0x33 });
  assert.ok(events.some((e) => e.type === 'noteon' && e.note === 5 && e.velocity === 0x7f));
  const sx = events.find((e) => e.type === 'sysex');
  assert.equal(sx.data.subarray(10).toString('ascii'), 'Kick');
});

test('tcp-line raw parsing', () => {
  assert.equal(parseRaw('-1000'), -1000);
  assert.equal(parseRaw('"Lead Vox"'), 'Lead Vox');
  assert.equal(parseRaw('3.5'), 3.5);
  assert.equal(parseRaw('Blue'), 'Blue');
});
