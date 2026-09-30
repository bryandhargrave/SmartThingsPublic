'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/profile/scaling');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('X32 fader law (piecewise)', () => {
  const s = compile({ type: 'piecewise', points: [[0, -90], [0.0625, -60], [0.25, -30], [0.5, -10], [1, 10]] });
  close(s.toValue(0.75), 0);
  close(s.toValue(1), 10);
  close(s.toValue(0.5), -10);
  close(s.toValue(0.25), -30);
  close(s.toValue(0), -90);
  close(s.toRaw(0), 0.75);
  close(s.toRaw(-10), 0.5);
  close(s.toRaw(-60), 0.0625);
  close(s.toRaw(-Infinity), 0);
  close(s.toRaw(100), 1);
  // round trip across the whole range
  for (let r = 0; r <= 1.0001; r += 0.01) close(s.toRaw(s.toValue(r)), r, 1e-9);
});

test('Yamaha centi-dB linear with -inf sentinel', () => {
  const s = compile({ type: 'linear', raw: [-13800, 1000], value: [-138, 10], rawMinSentinel: -32768 }, { deviceType: 'i' });
  assert.equal(s.toValue(-32768), -138);
  assert.equal(s.toValue(-1000), -10);
  assert.equal(s.toValue(1000), 10);
  assert.equal(s.toRaw(-6.5), -650);
  assert.equal(s.toRaw(-138), -32768);
  assert.equal(s.toRaw(-Infinity), -32768);
  assert.equal(s.toRaw(50), 1000);
});

test('log scale for frequencies', () => {
  const s = compile({ type: 'log', raw: [0, 1], value: [20, 20000] });
  close(s.toValue(0), 20);
  close(s.toValue(1), 20000);
  close(s.toValue(0.5), Math.sqrt(20 * 20000), 1e-6);
  close(s.toRaw(1000), Math.log(1000 / 20) / Math.log(1000), 1e-9);
});

test('bool with inversion (mix/on -> mute)', () => {
  const s = compile({ type: 'bool', invert: true });
  assert.equal(s.toValue(1), false);
  assert.equal(s.toValue(0), true);
  assert.equal(s.toRaw(true), 0);
  assert.equal(s.toRaw(false), 1);
});

test('enum maps both directions and dedupes values', () => {
  const s = compile({ type: 'enum', map: { 0: '#000000', 1: '#ff0000', 8: '#000000', Blue: '#0000ff' } });
  assert.equal(s.toValue(1), '#ff0000');
  assert.equal(s.toValue('Blue'), '#0000ff');
  assert.equal(s.toRaw('#FF0000'), 1);
  assert.equal(s.toRaw('#0000ff'), 'Blue');
  assert.deepEqual(s.values, ['#000000', '#ff0000', '#0000ff']);
  assert.throws(() => s.toRaw('#123456'));
});

test('A&H 14-bit fader curve is monotonic and rounds', () => {
  const s = compile({ type: 'piecewise', round: true, points: [[0, -90], [420, -80], [1500, -60], [4483, -40], [14003, 0], [16383, 10]] });
  assert.equal(s.toRaw(0), 14003);
  assert.equal(s.toRaw(-10), 11623);
  assert.equal(s.toRaw(10), 16383);
  let last = -Infinity;
  for (let r = 0; r <= 16383; r += 97) { const v = s.toValue(r); assert.ok(v >= last); last = v; }
});
