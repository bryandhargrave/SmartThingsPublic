'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ShadowState } = require('../src/shadow/state');
const { compile } = require('../src/profile/scaling');

function mk() {
  const s = new ShadowState({ echoWindowMs: 200, batchMs: 1 });
  const def = (p, type, extra = {}) => ({ path: p, fullPath: `/dev${p}`, type, access: 'rw', scale: compile({ type: 'identity' }), ...extra });
  s.register(def('/ch/01/fader', 'float', { range: [-90, 10] }), 'dev');
  s.register(def('/ch/01/mute', 'bool'), 'dev');
  s.register(def('/ch/01/name', 'string'), 'dev');
  s.register(def('/scene', 'int', { access: 'r' }), 'dev');
  return s;
}

const changesOf = (s) => new Promise((r) => s.once('changes', r));

test('device updates populate the cache and clear staleness', async () => {
  const s = mk();
  assert.equal(s.get('/dev/ch/01/fader').stale, true);
  const p = changesOf(s);
  const r = s.updateFromDevice('/dev/ch/01/fader', -10, 0.5);
  assert.deepEqual(r, { changed: true, echo: false });
  const n = s.get('/dev/ch/01/fader');
  assert.equal(n.value, -10);
  assert.equal(n.raw, 0.5);
  assert.equal(n.stale, false);
  const ch = await p;
  assert.equal(ch[0].path, '/dev/ch/01/fader');
  assert.equal(ch[0].source, 'device');
});

test('echo suppression: device confirming a client write is not re-broadcast', async () => {
  const s = mk();
  s.updateFromDevice('/dev/ch/01/fader', -10, 0.5);
  await changesOf(s);
  const res = s.setFromClient('/dev/ch/01/fader', -20, 'ws:1');
  assert.equal(res.accepted, true);
  assert.equal(res.noop, false);
  const ch = await changesOf(s);
  assert.equal(ch[0].source, 'ws:1');
  assert.equal(s.pending.size, 1);
  let extra = null;
  s.once('changes', (c) => { extra = c; });
  const r = s.updateFromDevice('/dev/ch/01/fader', -20.00001, 0.25);
  assert.equal(r.echo, true);
  assert.equal(r.changed, false);
  assert.equal(s.pending.size, 0);
  assert.equal(s.stats.echoesSuppressed, 1);
  await new Promise((r2) => setTimeout(r2, 10));
  assert.equal(extra, null);
});

test('device disagreement within echo window wins and is broadcast', async () => {
  const s = mk();
  s.updateFromDevice('/dev/ch/01/fader', -10, 0.5);
  await changesOf(s);
  s.setFromClient('/dev/ch/01/fader', 5, 'ws:1');
  await changesOf(s);
  const p = changesOf(s);
  s.updateFromDevice('/dev/ch/01/fader', 0, 0.75); // console clamped it
  const ch = await p;
  assert.equal(ch[0].value, 0);
  assert.equal(s.get('/dev/ch/01/fader').value, 0);
  assert.equal(s.pending.size, 0);
});

test('loop prevention: identical client writes are no-ops', async () => {
  const s = mk();
  s.updateFromDevice('/dev/ch/01/mute', true, 0);
  await changesOf(s);
  const r = s.setFromClient('/dev/ch/01/mute', true, 'ws:2');
  assert.equal(r.noop, true);
  assert.equal(s.stats.noopWrites, 1);
});

test('coercion, clamping and read-only enforcement', () => {
  const s = mk();
  assert.equal(s.setFromClient('/dev/ch/01/fader', '250').value, 10);
  assert.equal(s.setFromClient('/dev/ch/01/fader', -Infinity).value, -90);
  assert.equal(s.setFromClient('/dev/ch/01/fader', 'abc').accepted, false);
  assert.equal(s.setFromClient('/dev/ch/01/mute', 'on').value, true);
  assert.equal(s.setFromClient('/dev/ch/01/mute', 0).value, false);
  assert.equal(s.setFromClient('/dev/ch/01/name', 42).value, '42');
  assert.equal(s.setFromClient('/dev/scene', 3).reason, 'read-only');
  assert.equal(s.setFromClient('/dev/nope', 3).reason, 'unknown path');
});

test('batches coalesce rapid updates to the last value per path', async () => {
  const s = new ShadowState({ batchMs: 5 });
  s.register({ path: '/f', fullPath: '/d/f', type: 'float', access: 'rw' }, 'd');
  const p = changesOf(s);
  for (let i = 0; i < 100; i++) s.updateFromDevice('/d/f', i, i);
  const ch = await p;
  assert.equal(ch.length, 1);
  assert.equal(ch[0].value, 99);
});

test('markStale flags a whole device and pending sweeps expire', () => {
  const s = mk();
  s.updateFromDevice('/dev/ch/01/fader', -10, 0.5);
  s.markStale('dev', true);
  assert.equal(s.get('/dev/ch/01/fader').stale, true);
  s.setFromClient('/dev/ch/01/fader', 0, 'x');
  assert.equal(s.pending.size, 1);
  s.sweepPending(Date.now() + 1000);
  assert.equal(s.pending.size, 0);
});
