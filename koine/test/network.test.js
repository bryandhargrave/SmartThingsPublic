'use strict';
// Network safety: write coalescing, per-device rate cap, reconnect backoff.
const test = require('node:test');
const assert = require('node:assert/strict');
const { BaseDriver } = require('../src/drivers/base');
const { sleep } = require('./helpers');

class FakeDriver extends BaseDriver {
  constructor(transport) { super({ deviceId: 'd', host: 'x', transport: { type: 'fake', ...transport }, defs: [] }); this.sent = []; this.connected = true; }
  _open() {} _close() {}
  _send(def, raw) { this.sent.push({ def: def.path, raw, t: Date.now() }); }
  _sendQuery() {}
}
const A = { path: '/a' }, B = { path: '/b' };

test('rapid writes to one parameter are coalesced: leading edge now, trailing value later, nothing lost', async () => {
  const d = new FakeDriver({ writeCoalesceMs: 30 });
  for (let i = 0; i < 50; i++) d.write(A, i);
  assert.equal(d.sent.length, 1);
  assert.equal(d.sent[0].raw, 0);
  await sleep(60);
  assert.equal(d.sent.length, 2);
  assert.equal(d.sent[1].raw, 49, 'last value wins');
  assert.equal(d.stats.coalesced, 49);
  d.write(B, 'x');
  assert.equal(d.sent.length, 3, 'a different parameter is not held back');
});

test('a 120 Hz fader stream reaches the device at the coalesce rate', async () => {
  const d = new FakeDriver({ writeCoalesceMs: 25 });
  const t0 = Date.now();
  let v = 0;
  const iv = setInterval(() => d.write(A, v++), 8);
  await sleep(260);
  clearInterval(iv);
  await sleep(60);
  const n = d.sent.length;
  assert.ok(n >= 8 && n <= 13, `sent ${n} of ${v} writes`);
  assert.equal(d.sent[n - 1].raw, v - 1, 'final position delivered');
  for (let i = 1; i < n; i++) assert.ok(d.sent[i].t - d.sent[i - 1].t >= 20, 'never faster than coalesce window');
  void t0;
});

test('device-wide cap holds writes instead of dropping them', async () => {
  const d = new FakeDriver({ writeCoalesceMs: 0, maxTxPerSec: 50 });
  const defs = Array.from({ length: 80 }, (_, i) => ({ path: `/p${i}` }));
  for (const def of defs) d.write(def, 1);
  assert.ok(d.sent.length <= 51, `burst limited to ${d.sent.length}`);
  assert.ok(d.stats.throttled > 0);
  await sleep(700);
  assert.ok(d.sent.length > 51 && d.sent.length <= 80, `held writes drain as budget returns (${d.sent.length})`);
});

test('reconnect backoff doubles to a cap and resets on success', () => {
  const d = new FakeDriver({ reconnectMs: 2000, reconnectMaxMs: 30000 });
  const seq = [d._nextBackoff(), d._nextBackoff(), d._nextBackoff(), d._nextBackoff(), d._nextBackoff(), d._nextBackoff()];
  assert.deepEqual(seq, [2000, 4000, 8000, 16000, 30000, 30000]);
  d._resetBackoff();
  assert.equal(d._nextBackoff(), 2000);
});

test('disconnect discards held writes rather than replaying stale moves later', async () => {
  const d = new FakeDriver({ writeCoalesceMs: 50 });
  d.write(A, 1); d.write(A, 2);
  d._setConnected(false, 'test');
  await sleep(80);
  assert.equal(d.sent.length, 1);
});
