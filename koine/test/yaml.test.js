'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const yaml = require('../src/util/yaml');

test('parses nested mappings, sequences and scalars', () => {
  const doc = yaml.parse(`
# comment
id: behringer-x32
name: "Behringer X32 / Midas M32"
verified: true
count: 0x17
neg: -12.5
empty:
list:
  - a
  - 2
  - key: v
    other: [1, 2, "three"]
  - { inline: yes, n: 3 }
nested:
  deep:
    deeper: 'it''s'
multi: >-
  hello
  world
block: |
  line1
  line2
`);
  assert.equal(doc.id, 'behringer-x32');
  assert.equal(doc.name, 'Behringer X32 / Midas M32');
  assert.equal(doc.verified, true);
  assert.equal(doc.count, 23);
  assert.equal(doc.neg, -12.5);
  assert.equal(doc.empty, null);
  assert.deepEqual(doc.list[0], 'a');
  assert.deepEqual(doc.list[1], 2);
  assert.deepEqual(doc.list[2], { key: 'v', other: [1, 2, 'three'] });
  assert.deepEqual(doc.list[3], { inline: true, n: 3 });
  assert.equal(doc.nested.deep.deeper, "it's");
  assert.equal(doc.multi, 'hello world');
  assert.equal(doc.block, 'line1\nline2\n');
});

test('multi-line flow mappings and regex-ish quoted strings', () => {
  const doc = yaml.parse(`
scale:
  type: enum
  map: { 0: "#000000", 1: "#ff0000",
         2: "#00ff00" }
response: '^(?:OK|NOTIFY)\\s+(?<key>\\S+)\\s+(?<raw>.*)$'
device: "MIXER:Current/InCh/Fader/Level {ch0} 0"
delimiter: "\\n"
`);
  assert.deepEqual(doc.scale.map, { 0: '#000000', 1: '#ff0000', 2: '#00ff00' });
  assert.equal(doc.response, '^(?:OK|NOTIFY)\\s+(?<key>\\S+)\\s+(?<raw>.*)$');
  assert.equal(doc.device, 'MIXER:Current/InCh/Fader/Level {ch0} 0');
  assert.equal(doc.delimiter, '\n');
});

test('reports line numbers on errors', () => {
  assert.throws(() => yaml.parse('a: 1\nb: { x: }}\n'), /line 2/);
});
