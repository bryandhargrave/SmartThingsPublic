'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadProfileDir, normalizeProfile, expandParameters, renderPlaceholders } = require('../src/profile/loader');

const PROFILES = path.join(__dirname, '..', 'profiles');

test('all shipped profiles load and expand', () => {
  const m = loadProfileDir(PROFILES);
  assert.ok(m.size >= 4);
  for (const p of m.values()) {
    const defs = expandParameters(p);
    assert.ok(defs.length > 0, p.id);
    const paths = new Set();
    for (const d of defs) { assert.ok(!paths.has(d.path), `${p.id}: duplicate path ${d.path}`); paths.add(d.path); }
    assert.ok(defs.some((d) => d.role === 'fader'), `${p.id} has faders`);
  }
});

test('placeholders render padded, zero-based and hex forms', () => {
  const ranges = { ch: { from: 1, to: 32, pad: 2 } };
  assert.equal(renderPlaceholders('/ch/{ch}/mix/fader', ranges, { ch: 7 }), '/ch/07/mix/fader');
  assert.equal(renderPlaceholders('MIXER:Current/InCh/Fader/Level {ch0} 0', ranges, { ch: 7 }), 'MIXER:Current/InCh/Fader/Level 6 0');
  assert.equal(renderPlaceholders('{ch1}', ranges, { ch: 7 }), 7);
  assert.equal(renderPlaceholders('{ch0}', ranges, { ch: 7 }), 6);
  assert.equal(renderPlaceholders('{ch:hex}', ranges, { ch: 17 }), '10');
  assert.deepEqual(renderPlaceholders({ kind: 'nrpn', msb: '{ch0}', lsb: 0x17 }, ranges, { ch: 3 }), { kind: 'nrpn', msb: 2, lsb: 23 });
});

test('X32 profile maps channel fader and mute correctly', () => {
  const m = loadProfileDir(PROFILES);
  const defs = expandParameters(m.get('behringer-x32'));
  const fader = defs.find((d) => d.path === '/ch/10/fader');
  assert.equal(fader.device, '/ch/10/mix/fader');
  assert.equal(fader.deviceType, 'f');
  assert.equal(fader.scale.toValue(0.75), 0);
  const mute = defs.find((d) => d.path === '/ch/10/mute');
  assert.equal(mute.device, '/ch/10/mix/on');
  assert.equal(mute.scale.toValue(1), false);
  assert.equal(mute.scale.toRaw(true), 0);
  const send = defs.find((d) => d.path === '/ch/03/send/12/level');
  assert.equal(send.device, '/ch/03/mix/12/level');
});

test('validation catches broken profiles', () => {
  assert.throws(() => normalizeProfile({ id: 'Bad Id', transport: { type: 'osc-udp' }, parameters: [{ path: '/x', device: '/y', type: 'float' }] }), /kebab-case/);
  assert.throws(() => normalizeProfile({ id: 'ok', transport: { type: 'osc-udp' }, parameters: [{ path: '/ch/{ch}/x', device: '/y', type: 'float' }] }), /placeholder \{ch\}/);
  assert.throws(() => normalizeProfile({ id: 'ok', transport: { type: 'osc-udp' }, parameters: [{ path: '/x', device: '/y', type: 'wat' }] }), /type must be/);
  assert.throws(() => normalizeProfile({ id: 'ok', parameters: [{ path: '/x', device: '/y', type: 'float' }] }), /transport.type/);
  assert.throws(() => normalizeProfile({ id: 'ok', transport: { type: 'osc-udp' }, parameters: [{ path: '/x', device: '/y', type: 'float', scale: { type: 'piecewise', points: [[0, 0]] } }] }), /piecewise/);
});
