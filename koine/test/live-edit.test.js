'use strict';
// Live editing from the UI: rules, pins and devices via REST, persisted to the store, broadcast to clients.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Daemon } = require('../src/core/daemon');
const { MockX32 } = require('../tools/mock-x32');
const { MockScp } = require('../tools/mock-scp');
const { sleep, httpGet, httpPost, wsConnect } = require('./helpers');
const http = require('http');

function req(base, method, p, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(base + p, { method, headers: { 'Content-Type': 'application/json' } }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null })); });
    r.on('error', reject); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

let x32, scp, daemon, base, storeFile;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'koine-store-'));

test.before(async () => {
  x32 = new MockX32(); scp = new MockScp();
  await Promise.all([x32.start(), scp.start()]);
  storeFile = path.join(tmp, 'koine.store.json');
  daemon = new Daemon({
    daemon: { name: 'edit', http: { port: 0, host: '127.0.0.1' }, osc: false, mdns: false, logLevel: 'silent' },
    devices: [{ id: 'x32', profile: 'behringer-x32', host: '127.0.0.1', port: x32.port, include: ['/ch/0[1-4]/*', '/talkback/*'], transport: { ping: { address: '/xinfo', intervalMs: 300 }, keepalive: { address: '/xremote', intervalMs: 1000 }, queryRateLimit: 5000 } }],
    rules: [{ name: 'from-config', when: '/x32/ch/01/mute changed', do: 'log ch1 mute {value}' }],
    ui: { title: 'Test', pins: [{ path: '/x32/ch/01/fader', label: 'One' }] },
  }, { storePath: storeFile });
  await daemon.start();
  base = `http://127.0.0.1:${daemon.http.port}`;
  for (let i = 0; i < 60 && daemon.shadow.get('/x32/talkback/a').value === null; i++) await sleep(50);
});

test.after(async () => { await daemon.stop(); await Promise.all([x32.stop(), scp.stop()]); fs.rmSync(tmp, { recursive: true, force: true }); });

test('add a device from the UI: it connects, appears in the tree and is persisted', async () => {
  const c = await wsConnect(base);
  await c.next((m) => m.json && m.json.COMMAND === 'HELLO');
  const r = await req(base, 'POST', '/api/devices', { id: 'mon', name: 'Monitor', profile: 'yamaha-scp', host: '127.0.0.1', port: scp.port, include: ['/ch/1[0-6]/*'] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.id, 'mon');
  const ev = await c.next((m) => m.json && m.json.COMMAND === 'CONFIG_CHANGED' && m.json.DATA.what === 'device');
  assert.ok(ev.json.DATA.devices.some((d) => d.id === 'mon'));
  for (let i = 0; i < 60 && daemon.shadow.get('/mon/ch/16/mute').value === null; i++) await sleep(50);
  assert.equal(daemon.shadow.get('/mon/ch/16/mute').value, false);
  assert.ok((await httpGet(base, '/')).body.CONTENTS.mon);
  const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.equal(store.devices[0].id, 'mon');
  assert.equal(store.devices[0].profile, 'yamaha-scp');
  const bad = await req(base, 'POST', '/api/devices', { id: 'x', profile: 'nope', host: '1.2.3.4' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /unknown profile/);
  c.close();
});

test('add, test, edit, disable and delete rules from the UI', async () => {
  const t = await req(base, 'POST', '/api/rules/test', { when: '/x32/ch/*/mute changed', do: 'set /mon/ch/{1}/mute {value}' });
  assert.equal(t.status, 200);
  assert.equal(t.body.matches.length, 4);
  const badT = await req(base, 'POST', '/api/rules/test', { when: '/x32/ch/*/mute changed', do: 'explode' });
  assert.equal(badT.status, 400);

  const added = await req(base, 'POST', '/api/rules', { name: 'tb', when: '/x32/talkback/a == true', do: 'set /mon/ch/16/mute false' });
  assert.equal(added.status, 200);
  assert.equal(added.body.source, 'store');
  const id = added.body.id;
  assert.ok(id.startsWith('r_'));
  scp.surfaceChange('MIXER:Current/InCh/Fader/On 15 0', 0);
  await sleep(100);
  x32.surfaceChange('/-stat/talk/A', 1);
  for (let i = 0; i < 40 && scp.state.get('MIXER:Current/InCh/Fader/On 15 0') !== 1; i++) await sleep(25);
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/On 15 0'), 1, 'rule added from the UI fired across vendors');

  // edit: now the rule targets channel 15 instead, and the form's multi-line "do" is accepted
  const edited = await req(base, 'PUT', `/api/rules/${id}`, { name: 'tb2', when: '/x32/talkback/a == true', do: 'set /mon/ch/15/mute false\nlog talkback' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, 'tb2');
  assert.equal(edited.body.fires, 1, 'fire count survives an edit');
  scp.surfaceChange('MIXER:Current/InCh/Fader/On 14 0', 0);
  x32.surfaceChange('/-stat/talk/A', 0); await sleep(80);
  x32.surfaceChange('/-stat/talk/A', 1);
  for (let i = 0; i < 40 && scp.state.get('MIXER:Current/InCh/Fader/On 14 0') !== 1; i++) await sleep(25);
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/On 14 0'), 1);

  // disable: nothing fires
  const off = await req(base, 'POST', `/api/rules/${id}/enable`, { enabled: false });
  assert.equal(off.body.enabled, false);
  scp.surfaceChange('MIXER:Current/InCh/Fader/On 14 0', 0);
  x32.surfaceChange('/-stat/talk/A', 0); await sleep(80);
  x32.surfaceChange('/-stat/talk/A', 1); await sleep(200);
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/On 14 0'), 0, 'disabled rule stays quiet');

  // a config-file rule edited from the UI becomes a store rule that shadows the original
  const cfgRule = (await httpGet(base, '/api/rules')).body.find((r) => r.name === 'from-config');
  assert.equal(cfgRule.source, 'config');
  const shadowed = await req(base, 'PUT', `/api/rules/${cfgRule.id}`, { ...cfgRule, name: 'from-config (edited)' });
  assert.equal(shadowed.body.source, 'store');
  let list = (await httpGet(base, '/api/rules')).body;
  assert.ok(!list.some((r) => r.name === 'from-config'));
  assert.ok(list.some((r) => r.name === 'from-config (edited)'));

  const del = await req(base, 'DELETE', `/api/rules/${id}`);
  assert.equal(del.body.removed, true);
  list = (await httpGet(base, '/api/rules')).body;
  assert.ok(!list.some((r) => r.id === id));
  const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.equal(store.rules.length, 1);
  assert.equal(store.rules[0].name, 'from-config (edited)');
  assert.deepEqual(store.hidden, [cfgRule.id]);
});

test('pins are editable and persisted; every client is told', async () => {
  const c = await wsConnect(base);
  await c.next((m) => m.json && m.json.COMMAND === 'HELLO');
  const r = await req(base, 'PUT', '/api/ui', { pins: [{ path: '/x32/ch/02/fader', label: 'Two' }, { path: '/mon/ch/16/mute', label: 'Mon 16' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.pins.length, 2);
  const ev = await c.next((m) => m.json && m.json.COMMAND === 'CONFIG_CHANGED' && m.json.DATA.what === 'ui');
  assert.equal(ev.json.DATA.ui.pins[1].label, 'Mon 16');
  assert.equal((await httpGet(base, '/api/ui')).body.pins[0].path, '/x32/ch/02/fader');
  c.close();
});

test('remove a UI-added device; config-file devices cannot be removed from the UI', async () => {
  const no = await req(base, 'DELETE', '/api/devices/x32');
  assert.equal(no.status, 400);
  assert.match(no.body.error, /config file/);
  const yes = await req(base, 'DELETE', '/api/devices/mon');
  assert.equal(yes.body.removed, true);
  assert.equal(daemon.shadow.list('/mon').length, 0);
  assert.equal((await httpGet(base, '/mon/ch/16/mute')).status, 404);
  assert.equal(JSON.parse(fs.readFileSync(storeFile, 'utf8')).devices.length, 0);
});

test('a restart reloads the store: pins, edited rule and hidden original', async () => {
  const d2 = new Daemon({
    daemon: { name: 'edit2', http: { port: 0, host: '127.0.0.1' }, osc: false, mdns: false, logLevel: 'silent' },
    devices: [{ id: 'x32', profile: 'behringer-x32', host: '127.0.0.1', port: x32.port, include: ['/ch/0[1-4]/*'] }],
    rules: [{ name: 'from-config', when: '/x32/ch/01/mute changed', do: 'log ch1 mute {value}' }],
    ui: { title: 'Test', pins: [{ path: '/x32/ch/01/fader', label: 'One' }] },
  }, { storePath: storeFile });
  assert.equal(d2.config.ui.pins.length, 2);
  assert.equal(d2.config.ui.pins[1].label, 'Mon 16');
  const names = d2.rules.list().map((r) => r.name);
  assert.deepEqual(names, ['from-config (edited)']);
  d2.rules.close();
});
