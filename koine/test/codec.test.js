'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const osc = require('../src/osc/codec');

test('message round-trip with explicit and inferred types', () => {
  const buf = osc.encodeMessage('/ch/01/mix/fader', [{ type: 'f', value: 0.5 }, 7, 'name', true, false, null, { type: 'b', value: Buffer.from([1, 2, 3]) }, { type: 'd', value: 1.25 }, { type: 'h', value: 5n }]);
  assert.equal(buf.length % 4, 0);
  const m = osc.decodePacket(buf);
  assert.equal(m.address, '/ch/01/mix/fader');
  assert.deepEqual(m.args.map((a) => a.type), ['f', 'i', 's', 'T', 'F', 'N', 'b', 'd', 'h']);
  assert.equal(m.args[0].value, 0.5);
  assert.equal(m.args[1].value, 7);
  assert.equal(m.args[2].value, 'name');
  assert.equal(m.args[3].value, true);
  assert.deepEqual([...m.args[6].value], [1, 2, 3]);
  assert.equal(m.args[7].value, 1.25);
  assert.equal(m.args[8].value, 5n);
});

test('string padding covers all lengths', () => {
  for (let i = 0; i < 9; i++) {
    const s = 'x'.repeat(i);
    const m = osc.decodePacket(osc.encodeMessage('/a', [s, 1]));
    assert.equal(m.args[0].value, s);
    assert.equal(m.args[1].value, 1);
  }
});

test('message without arguments (X32-style query)', () => {
  const buf = osc.encodeMessage('/ch/01/mix/fader', []);
  const m = osc.decodePacket(buf);
  assert.equal(m.address, '/ch/01/mix/fader');
  assert.deepEqual(m.args, []);
});

test('bundles nest and preserve timetag', () => {
  const b = osc.encodeBundle([{ address: '/a', args: [1] }, { address: '/b', args: ['x'] }], { seconds: 10, fraction: 20 });
  const d = osc.decodePacket(b);
  assert.deepEqual(d.timetag, { seconds: 10, fraction: 20 });
  assert.equal(d.elements.length, 2);
  assert.equal(d.elements[1].args[0].value, 'x');
  const nested = osc.decodePacket(osc.encodeBundle([b]));
  assert.equal(nested.elements[0].elements[0].address, '/a');
});

test('rejects malformed packets', () => {
  assert.throws(() => osc.decodePacket(Buffer.from('ab')));
  assert.throws(() => osc.decodePacket(Buffer.from('xyz\0,i\0\0\0\0\0\x01')));
  assert.throws(() => osc.encodeMessage('nope', []));
});

test('address pattern matching', () => {
  assert.ok(osc.patternToRegExp('/x32/ch/*/fader').test('/x32/ch/01/fader'));
  assert.ok(!osc.patternToRegExp('/x32/ch/*/fader').test('/x32/ch/01/mute'));
  assert.ok(osc.patternToRegExp('/ch/0[1-4]/*').test('/ch/03/mute'));
  assert.ok(!osc.patternToRegExp('/ch/0[1-4]/*').test('/ch/05/mute'));
  assert.ok(osc.patternToRegExp('/{x32,cl5}/main/st/mute').test('/cl5/main/st/mute'));
  assert.ok(osc.patternToRegExp('/ch/??/fader').test('/ch/12/fader'));
});
