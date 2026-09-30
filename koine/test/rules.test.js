'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('dgram');
const { EventEmitter } = require('events');
const { ShadowState } = require('../src/shadow/state');
const { RulesEngine, parseCondition, parseAction, evaluate } = require('../src/rules/engine');
const osc = require('../src/osc/codec');
const { sleep } = require('./helpers');

/** A fake daemon: shadow state + set() that behaves like a device echoing immediately. */
function fakeDaemon(paths) {
  const d = new EventEmitter();
  d.shadow = new ShadowState({ batchMs: 1 });
  d.log = Object.assign(() => {}, { info() {}, warn() {}, debug() {}, error() {} });
  d.devices = new Map();
  d.sets = [];
  for (const [p, type, extra] of paths) d.shadow.register({ path: p.replace(/^\/[^/]+/, ''), fullPath: p, type, access: 'rw', ...extra }, p.split('/')[1]);
  d.set = (path, value, origin) => {
    const r = d.shadow.setFromClient(path, value, origin);
    if (r.accepted && !r.noop) d.sets.push({ path, value: r.value, origin });
    return r;
  };
  d.device = (path, value) => d.shadow.updateFromDevice(path, value, value);
  return d;
}
const PATHS = [
  ['/m32/talkback/a', 'bool'], ['/m32/ch/01/mute', 'bool'], ['/m32/ch/02/mute', 'bool'], ['/m32/ch/32/fader', 'float', { range: [-90, 10] }],
  ['/m32/ch/32/name', 'string'], ['/m32/ch/32/color', 'string'],
  ['/dm3/ch/16/mute', 'bool'], ['/dm3/ch/01/mute', 'bool'], ['/dm3/ch/02/mute', 'bool'],
  ['/rf/rx/1/gain', 'int', { range: [-18, 42] }], ['/rf/rx/1/battery/bars', 'int'],
  ['/a/x', 'int'], ['/b/x', 'int'],
];
async function settle() { await sleep(15); }

test('condition and action parsing', () => {
  assert.deepEqual(parseCondition('/m32/talkback/a == true'), { path: '/m32/talkback/a', op: '==', value: true });
  assert.deepEqual(parseCondition('/rf/rx/1/battery/bars <= 1'), { path: '/rf/rx/1/battery/bars', op: '<=', value: 1 });
  assert.deepEqual(parseCondition('/m32/ch/*/mute changed'), { path: '/m32/ch/*/mute', op: 'changed' });
  assert.deepEqual(parseCondition('/x/name != "Kick"'), { path: '/x/name', op: '!=', value: 'Kick' });
  assert.equal(parseAction('set /dm3/ch/16/mute false').type, 'set');
  assert.deepEqual(parseAction('set /m32/ch/32/name "RX1 bat {value}"'), { type: 'set', path: '/m32/ch/32/name', value: '"RX1 bat {value}"', scale: null });
  assert.deepEqual(parseAction('osc 10.0.0.5:53000 /cue/{1}/start 1'), { type: 'osc', target: '10.0.0.5:53000', address: '/cue/{1}/start', args: ['1'] });
  assert.throws(() => parseAction('explode now'), /unknown action/);
  assert.throws(() => parseCondition('/a/b ~ 3'), /cannot parse/);
  assert.equal(evaluate('true'), true);
  assert.equal(evaluate('!true'), false);
  assert.equal(evaluate('-12.5'), -12.5);
  assert.equal(evaluate('(-10 + 4) * 2'), -12);
  assert.equal(evaluate('RX1 bat 3'), 'RX1 bat 3');
});

test('edge-triggered comparison fires once, "every" fires each time, changed fires on every change', async () => {
  const d = fakeDaemon(PATHS);
  const e = new RulesEngine(d, [
    { name: 'tb', when: '/m32/talkback/a == true', do: 'set /dm3/ch/16/mute false' },
    { name: 'tb-off', when: '/m32/talkback/a == false', do: 'set /dm3/ch/16/mute true' },
    { name: 'every', when: '/a/x > 5', every: true, do: 'set /b/x {value}' },
  ]);
  d.device('/m32/talkback/a', false); await settle(); // initial sync value: no fire
  d.device('/dm3/ch/16/mute', true); await settle();
  assert.equal(d.sets.length, 0);
  d.device('/m32/talkback/a', true); await settle();
  assert.deepEqual(d.sets.map((s) => [s.path, s.value]), [['/dm3/ch/16/mute', false]]);
  d.device('/m32/talkback/a', true); await settle(); // same value: shadow reports no change, nothing fires
  assert.equal(d.sets.length, 1);
  d.device('/m32/talkback/a', false); await settle();
  assert.deepEqual(d.sets[1], { path: '/dm3/ch/16/mute', value: true, origin: 'rule:tb-off#1' });
  d.device('/a/x', 1); await settle();
  d.device('/a/x', 7); await settle(); d.device('/a/x', 8); await settle(); d.device('/a/x', 3); await settle();
  assert.deepEqual(d.sets.slice(2).map((s) => s.value), [7, 8]);
  e.close();
});

test('wildcard captures mirror a whole bank with one rule; initial sync is ignored', async () => {
  const d = fakeDaemon(PATHS);
  const e = new RulesEngine(d, [{ name: 'mirror', when: '/m32/ch/*/mute changed', do: 'set /dm3/ch/{1}/mute {value}' }]);
  d.device('/m32/ch/01/mute', true); d.device('/m32/ch/02/mute', false); await settle(); // sync population
  assert.equal(d.sets.length, 0);
  d.device('/m32/ch/02/mute', true); await settle();
  assert.deepEqual(d.sets, [{ path: '/dm3/ch/02/mute', value: true, origin: 'rule:mirror#1' }]);
  assert.equal(d.shadow.get('/dm3/ch/02/mute').value, true);
  e.close();
});

test('templates, arithmetic, scale, quoted strings and state lookups', async () => {
  const d = fakeDaemon(PATHS);
  const e = new RulesEngine(d, [
    { name: 'gain', when: '/m32/ch/32/fader changed', do: { set: '/rf/rx/1/gain', scale: { type: 'linear', raw: [-90, 10], value: [-18, 42] } } },
    { name: 'strip', when: '/rf/rx/1/battery/bars changed', do: 'set /m32/ch/32/name "RX1 bat {value}"' },
    { name: 'red', when: '/rf/rx/1/battery/bars <= 1', do: ['set /m32/ch/32/color "#ff3b30"', 'log low battery {value} on {path}'] },
    { name: 'math', when: '/a/x changed', and: ['/m32/ch/32/color == "#ff3b30"'], do: 'set /b/x {value} * 2 + 1' },
  ]);
  for (const p of ['/m32/ch/32/fader', '/rf/rx/1/battery/bars', '/a/x', '/m32/ch/32/color']) d.device(p, 0); await settle();
  d.device('/m32/ch/32/fader', 10); await settle();
  assert.deepEqual(d.sets.pop(), { path: '/rf/rx/1/gain', value: 42, origin: 'rule:gain#1' });
  d.device('/m32/ch/32/fader', -40); await settle();
  assert.equal(d.sets.pop().value, 12);
  d.device('/rf/rx/1/battery/bars', 3); await settle();
  assert.deepEqual(d.sets.pop(), { path: '/m32/ch/32/name', value: 'RX1 bat 3', origin: 'rule:strip#1' });
  d.device('/a/x', 5); await settle();
  assert.equal(d.sets.length, 0, 'and-condition not met yet');
  d.device('/rf/rx/1/battery/bars', 1); await settle();
  assert.deepEqual(d.sets.map((s) => [s.path, s.value]).sort(), [['/m32/ch/32/color', '#ff3b30'], ['/m32/ch/32/name', 'RX1 bat 1']]);
  d.sets.length = 0;
  d.device('/a/x', 6); await settle();
  assert.deepEqual(d.sets, [{ path: '/b/x', value: 13, origin: 'rule:math#1' }]);
  const fired = [];
  e.on('fired', (ev) => fired.push(ev));
  d.device('/rf/rx/1/battery/bars', 0); await settle(); // still <= 1: edge already taken, no re-fire of "red"
  assert.ok(fired.every((f) => f.rule !== 'red'));
  assert.equal(e.list().find((r) => r.name === 'red').fires, 1);
  e.close();
});

test('rules never re-trigger themselves and cascades are depth-limited', async () => {
  const d = fakeDaemon(PATHS);
  const e = new RulesEngine(d, [
    { name: 'ab', when: '/a/x changed', do: 'set /b/x {value} + 1' },
    { name: 'ba', when: '/b/x changed', do: 'set /a/x {value} + 1' },
  ]);
  d.device('/a/x', 0); d.device('/b/x', 0); await settle();
  d.device('/a/x', 1);
  await sleep(200);
  assert.ok(d.sets.length >= 7 && d.sets.length <= 9, `cascade stopped after ${d.sets.length} sets`);
  assert.ok(d.sets.every((s) => /^rule:(ab|ba)#\d$/.test(s.origin)));
  e.close();
});

test('throttle and debounce', async () => {
  const d = fakeDaemon(PATHS);
  const e = new RulesEngine(d, [
    { name: 'thr', when: '/a/x changed', throttleMs: 500, do: 'set /b/x {value}' },
    { name: 'deb', when: '/m32/ch/32/fader changed', debounceMs: 60, do: 'set /rf/rx/1/gain {value}' },
  ]);
  d.device('/a/x', 0); d.device('/m32/ch/32/fader', 0); await settle();
  for (let i = 1; i <= 5; i++) { d.device('/a/x', i); await settle(); }
  assert.deepEqual(d.sets.map((s) => s.value), [1]);
  for (let i = 1; i <= 5; i++) { d.device('/m32/ch/32/fader', -i); await sleep(5); }
  await sleep(120);
  assert.deepEqual(d.sets.slice(1).map((s) => s.value), [-5]);
  e.close();
});

test('osc action sends a typed OSC message to an arbitrary target', async () => {
  const d = fakeDaemon(PATHS);
  const sock = dgram.createSocket('udp4');
  const got = [];
  sock.on('message', (b) => got.push(osc.decodePacket(b)));
  await new Promise((r) => sock.bind(0, '127.0.0.1', r));
  const e = new RulesEngine(d, [{ name: 'cue', when: '/rf/rx/1/battery/bars <= 1', do: { osc: `127.0.0.1:${sock.address().port}`, address: '/cue/{value}/start', args: ['{value}', 'rx1', true, 0.5] } }]);
  d.device('/rf/rx/1/battery/bars', 4); await settle();
  d.device('/rf/rx/1/battery/bars', 1); await sleep(50);
  assert.equal(got.length, 1);
  assert.equal(got[0].address, '/cue/1/start');
  assert.deepEqual(got[0].args.map((a) => [a.type, a.value]), [['i', 1], ['s', 'rx1'], ['T', true], ['f', 0.5]]);
  e.close(); sock.close();
});

test('invalid rules are rejected at load time', () => {
  const d = fakeDaemon(PATHS);
  assert.throws(() => new RulesEngine(d, [{ do: 'set /a/x 1' }]), /"when" is required/);
  assert.throws(() => new RulesEngine(d, [{ when: '/a/x changed' }]), /"do" is required/);
  assert.throws(() => new RulesEngine(d, [{ when: '/a/x changed', do: 'set /a/x' }]), /set needs/);
});
