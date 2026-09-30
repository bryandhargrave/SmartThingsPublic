'use strict';
// End-to-end: mock consoles <-> daemon <-> OSCQuery HTTP / WebSocket / OSC-UDP clients.
const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('dgram');
const { Daemon } = require('../src/core/daemon');
const { MockX32 } = require('../tools/mock-x32');
const { MockScp } = require('../tools/mock-scp');
const { MockSq } = require('../tools/mock-sq');
const osc = require('../src/osc/codec');
const { sleep, httpGet, httpPost, wsConnect } = require('./helpers');

let x32, scp, sq, daemon, base;

test.before(async () => {
  x32 = new MockX32(); scp = new MockScp(); sq = new MockSq();
  await Promise.all([x32.start(), scp.start(), sq.start()]);
  daemon = new Daemon({
    daemon: { name: 'test', http: { port: 0, host: '127.0.0.1' }, osc: { port: 0, host: '127.0.0.1' }, mdns: false, logLevel: 'silent', echoWindowMs: 500 },
    devices: [
      { id: 'x32', name: 'FOH', profile: 'behringer-x32', host: '127.0.0.1', port: x32.port, transport: { ping: { address: '/xinfo', intervalMs: 300 }, keepalive: { address: '/xremote', intervalMs: 1000 }, timeoutMs: 1500, queryRateLimit: 5000, confirmDelayMs: 50 } },
      { id: 'cl5', name: 'MON', profile: 'yamaha-scp', host: '127.0.0.1', port: scp.port, include: ['/ch/*', '/main/*', '/scene/*'], transport: { queryRateLimit: 5000 } },
      { id: 'pa', name: 'PA', profile: 'allen-heath-sq', host: '127.0.0.1', port: sq.port, include: ['/main/*', '/ch/0[1-4]/*'], transport: { queryRateLimit: 5000, poll: { intervalMs: 500 }, confirmDelayMs: 50 } },
    ],
    ui: { pins: [{ path: '/x32/ch/10/fader', label: 'Lead Vox' }] },
  });
  await daemon.start();
  base = `http://127.0.0.1:${daemon.http.port}`;
  // wait for initial sync of all three devices
  const synced = ['/cl5/ch/01/name', '/cl5/main/st/fader', '/cl5/scene/current', '/pa/ch/01/name', '/pa/main/lr/fader', '/x32/ch/10/name', '/x32/scene/current'];
  for (let i = 0; i < 200; i++) {
    const st = daemon.status();
    if (st.devices.every((d) => d.connected) && synced.every((p) => daemon.shadow.get(p).value !== null)) break;
    await sleep(50);
  }
});

test.after(async () => {
  await daemon.stop();
  await Promise.all([x32.stop(), scp.stop(), sq.stop()]);
});

test('all devices connect and shadow state is populated from cache-able sync', async () => {
  const st = daemon.status();
  assert.ok(st.devices.every((d) => d.connected), JSON.stringify(st.devices));
  assert.equal(daemon.shadow.get('/x32/ch/10/name').value, 'Lead Vox');
  assert.equal(daemon.shadow.get('/x32/ch/10/fader').value, 0);
  assert.equal(daemon.shadow.get('/x32/ch/10/color').value, '#0a84ff');
  assert.equal(daemon.shadow.get('/cl5/ch/11/name').value, 'Lead');
  assert.equal(daemon.shadow.get('/cl5/ch/01/fader').value, -10);
  assert.equal(daemon.shadow.get('/cl5/main/st/fader').value, -3);
  assert.equal(daemon.shadow.get('/pa/ch/01/name').value, 'Ip 1');
  assert.equal(daemon.shadow.get('/pa/ch/01/fader').value, 0);
});

test('OSCQuery namespace, attributes and HOST_INFO', async () => {
  const root = await httpGet(base, '/');
  assert.equal(root.status, 200);
  assert.deepEqual(Object.keys(root.body.CONTENTS).sort(), ['cl5', 'pa', 'x32']);
  const fader = await httpGet(base, '/x32/ch/10/fader');
  assert.equal(fader.body.TYPE, 'f');
  assert.equal(fader.body.ACCESS, 3);
  assert.deepEqual(fader.body.VALUE, [0]);
  assert.deepEqual(fader.body.RANGE, [{ MIN: -90, MAX: 10 }]);
  assert.deepEqual(fader.body.UNIT, ['dB']);
  assert.equal(fader.body.DEVICE.address, '/ch/10/mix/fader');
  const mute = await httpGet(base, '/x32/ch/10/mute?VALUE');
  assert.deepEqual(mute.body, { VALUE: [false] });
  const color = await httpGet(base, '/cl5/ch/01/color');
  assert.deepEqual(color.body.EXTENDED_TYPE, ['color']);
  assert.ok(color.body.RANGE[0].VALS.includes('#0a84ff'));
  const sub = await httpGet(base, '/cl5/ch/01');
  assert.ok(sub.body.CONTENTS.fader && sub.body.CONTENTS.mute && sub.body.CONTENTS.name);
  const scene = await httpGet(base, '/cl5/scene/current');
  assert.equal(scene.body.ACCESS, 1);
  assert.deepEqual(scene.body.VALUE, [12]);
  assert.equal((await httpGet(base, '/nope')).status, 404);
  assert.equal((await httpGet(base, '/x32/ch/10?VALUE')).status, 204);
  const hi = await httpGet(base, '/?HOST_INFO');
  assert.equal(hi.body.NAME, 'test');
  assert.equal(hi.body.OSC_PORT, daemon.oscServer.port);
  assert.equal(hi.body.EXTENSIONS.LISTEN, true);
  const ui = await httpGet(base, '/ui');
  assert.equal(ui.status, 200);
  assert.match(ui.raw, /<title>paad walk-around<\/title>/);
  assert.equal((await httpGet(base, '/api/ui')).body.pins[0].label, 'Lead Vox');
});

test('REST set reaches every vendor with correct scaling and is confirmed by echo', async () => {
  const r = await httpPost(base, '/api/set', [
    { path: '/x32/ch/10/fader', value: -20 },
    { path: '/x32/ch/10/mute', value: true },
    { path: '/cl5/ch/01/fader', value: -6.5 },
    { path: '/cl5/ch/01/name', value: 'Kick In' },
    { path: '/cl5/ch/02/mute', value: true },
    { path: '/pa/main/lr/fader', value: -10 },
    { path: '/pa/main/lr/mute', value: true },
    { path: '/pa/ch/01/name', value: 'Sub L' },
  ]);
  assert.ok(r.body.every((x) => x.accepted), JSON.stringify(r.body));
  await sleep(300);
  assert.equal(x32.state.get('/ch/10/mix/fader').value, 0.375);
  assert.equal(x32.state.get('/ch/10/mix/on').value, 0);
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/Level 0 0'), -650);
  assert.equal(scp.state.get('MIXER:Current/InCh/Label/Name 0 0'), 'Kick In');
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/On 1 0'), 0);
  assert.equal(sq.levels.get('68:23'), 11623);
  assert.equal(sq.mutes.get(0x44), true);
  assert.equal(sq.names.get(0), 'Sub L');
  // Echoes (Yamaha "OK set") and confirmation queries (X32 / SQ NRPN + SysEx) clear pending writes.
  // The SQ mute (Note On) has no query form and the console never echoes to the sender, so it
  // simply ages out of the echo window.
  assert.deepEqual([...daemon.shadow.pending.keys()], ['/pa/main/lr/mute']);
  assert.ok(daemon.shadow.stats.echoesSuppressed >= 7, `echoes ${daemon.shadow.stats.echoesSuppressed}`);
  daemon.shadow.sweepPending(Date.now() + 1000);
  assert.equal(daemon.shadow.pending.size, 0);
  // Value posted directly to the OSCQuery node also works.
  const p = await httpPost(base, '/x32/ch/11/fader', { VALUE: [-30] });
  assert.equal(p.body.accepted, true);
  await sleep(50);
  assert.equal(x32.state.get('/ch/11/mix/fader').value, 0.25);
  // Rejections are reported.
  const bad = await httpPost(base, '/api/set', { path: '/cl5/scene/current', value: 4 });
  assert.equal(bad.body.accepted, false);
  assert.equal(bad.body.reason, 'read-only');
});

test('WebSocket LISTEN delivers cached value immediately, then live changes as OSC; JSON mode batches', async () => {
  const c = await wsConnect(base);
  const hello = await c.next((m) => m.json && m.json.COMMAND === 'HELLO');
  assert.ok(hello.json.DATA.id.startsWith('ws:'));
  c.sendJson({ COMMAND: 'LISTEN', DATA: '/x32/ch/02/fader' });
  const initial = await c.next((m) => m.binary);
  const msg = osc.decodePacket(initial.binary);
  assert.equal(msg.address, '/x32/ch/02/fader');
  assert.equal(msg.args[0].type, 'f');
  // surface move on the console -> pushed to client, scaled to dB
  x32.surfaceChange('/ch/02/mix/fader', 0.5);
  const upd = osc.decodePacket((await c.next((m) => m.binary)).binary);
  assert.equal(upd.args[0].value, -10);
  // binary OSC from the client sets the console
  c.sendBinary(osc.encodeMessage('/x32/ch/02/fader', [{ type: 'f', value: -30 }]));
  await sleep(100);
  assert.equal(x32.state.get('/ch/02/mix/fader').value, 0.25);
  // The originating client does not get its own write echoed back.
  assert.equal(c.messages.filter((m) => m.binary).length, 0);
  // JSON mode with pattern listen across vendors
  const j = await wsConnect(base);
  await j.next((m) => m.json && m.json.COMMAND === 'HELLO');
  j.sendJson({ COMMAND: 'FORMAT', DATA: 'json' });
  j.sendJson({ COMMAND: 'LISTEN', DATA: '/cl5/ch/*/mute' });
  const snap = await j.next((m) => m.json && m.json.COMMAND === 'SNAPSHOT_VALUES');
  assert.equal(snap.json.DATA.length, 48);
  scp.surfaceChange('MIXER:Current/InCh/Fader/On 4 0', 0);
  const v = await j.next((m) => m.json && m.json.COMMAND === 'VALUES');
  assert.deepEqual(v.json.DATA.map((d) => [d.path, d.value]), [['/cl5/ch/05/mute', true]]);
  // SET via JSON gets an ACK and reaches the other client as a change
  j.sendJson({ COMMAND: 'SET', DATA: { path: '/x32/ch/02/fader', value: 0 }, ID: 7 });
  const ack = await j.next((m) => m.json && m.json.COMMAND === 'ACK');
  assert.equal(ack.json.ID, 7);
  assert.equal(ack.json.DATA[0].accepted, true);
  const other = osc.decodePacket((await c.next((m) => m.binary)).binary);
  assert.equal(other.args[0].value, 0);
  j.sendJson({ COMMAND: 'GET', DATA: ['/pa/ch/01/fader', '/nope'] });
  const g = await j.next((m) => m.json && m.json.COMMAND === 'VALUES' && m.json.DATA.some((d) => d.path === '/nope'));
  assert.equal(g.json.DATA[1].error, 'unknown path');
  c.close(); j.close();
  await sleep(50);
});

test('device disconnect marks nodes stale and reconnect resyncs from console', async () => {
  const c = await wsConnect(base);
  await c.next((m) => m.json && m.json.COMMAND === 'HELLO');
  const oldPort = scp.port;
  await scp.stop();
  const status = await c.next((m) => m.json && m.json.COMMAND === 'DEVICE_STATUS' && m.json.DATA.id === 'cl5' && !m.json.DATA.connected, 5000);
  assert.equal(status.json.DATA.connected, false);
  assert.equal(daemon.shadow.get('/cl5/ch/01/fader').stale, true);
  // cache still serves the last known value to (re)connecting clients
  assert.equal((await httpGet(base, '/cl5/ch/01/fader')).body.VALUE[0], -6.5);
  assert.equal((await httpGet(base, '/cl5/ch/01/fader')).body.STALE, true);
  // console comes back with a different state
  scp = new MockScp({ port: oldPort });
  scp.state.set('MIXER:Current/InCh/Fader/Level 0 0', -2000);
  await scp.start();
  await c.next((m) => m.json && m.json.COMMAND === 'DEVICE_STATUS' && m.json.DATA.id === 'cl5' && m.json.DATA.connected, 6000);
  for (let i = 0; i < 60 && daemon.shadow.get('/cl5/ch/01/fader').value !== -20; i++) await sleep(50);
  assert.equal(daemon.shadow.get('/cl5/ch/01/fader').value, -20);
  assert.equal(daemon.shadow.get('/cl5/ch/01/fader').stale, false);
  c.close();
});

test('Yamaha scene recall triggers a full resync', async () => {
  scp.state.set('MIXER:Current/InCh/Label/Name 3 0', 'Tom Hi');
  scp.recallScene(7);
  for (let i = 0; i < 60 && daemon.shadow.get('/cl5/ch/04/name').value !== 'Tom Hi'; i++) await sleep(50);
  assert.equal(daemon.shadow.get('/cl5/ch/04/name').value, 'Tom Hi');
});

test('A&H polling picks up state and note-on mutes flow both ways', async () => {
  sq.surfaceMute(1, true);
  sq.surfaceLevel(1, 4483);
  for (let i = 0; i < 40 && daemon.shadow.get('/pa/ch/02/fader').value !== -40; i++) await sleep(50);
  assert.equal(daemon.shadow.get('/pa/ch/02/mute').value, true);
  assert.equal(daemon.shadow.get('/pa/ch/02/fader').value, -40);
  // silent change (no unsolicited MIDI) is caught by the poll cycle
  sq.levels.set('2:23', 14003 + 2380);
  for (let i = 0; i < 40 && daemon.shadow.get('/pa/ch/03/fader').value !== 10; i++) await sleep(50);
  assert.equal(daemon.shadow.get('/pa/ch/03/fader').value, 10);
});

test('northbound OSC/UDP: query, set, pattern, subscription', async () => {
  const sock = dgram.createSocket('udp4');
  const inbox = [];
  sock.on('message', (b) => inbox.push(osc.decodePacket(b)));
  await new Promise((r) => sock.bind(0, '127.0.0.1', r));
  const send = (buf) => sock.send(buf, daemon.oscServer.port, '127.0.0.1');
  const waitFor = async (pred) => { for (let i = 0; i < 40; i++) { const f = inbox.find(pred); if (f) return f; await sleep(25); } throw new Error('udp timeout'); };
  send(osc.encodeMessage('/x32/ch/10/name', []));
  const nm = await waitFor((m) => m.address === '/x32/ch/10/name');
  assert.equal(nm.args[0].value, 'Lead Vox');
  send(osc.encodeMessage('/paad/listen', ['/x32/ch/*/fader']));
  await sleep(30);
  x32.surfaceChange('/ch/05/mix/fader', 1);
  const upd = await waitFor((m) => m.address === '/x32/ch/05/fader');
  assert.equal(upd.args[0].value, 10);
  send(osc.encodeMessage('/cl5/ch/03/fader', [{ type: 'f', value: -12 }]));
  await sleep(100);
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/Level 2 0'), -1200);
  send(osc.encodeMessage('/cl5/ch/0[1-3]/mute', [true]));
  await sleep(100);
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/On 0 0'), 0);
  assert.equal(scp.state.get('MIXER:Current/InCh/Fader/On 2 0'), 0);
  inbox.length = 0;
  send(osc.encodeMessage('/paad/snapshot', ['/pa']));
  const bundle = await waitFor((m) => m.elements);
  assert.ok(bundle.elements.some((e) => e.address === '/pa/main/lr/fader'));
  sock.close();
});

test('X32 heartbeat loss is detected and recovers', async () => {
  const oldPort = x32.port;
  await x32.stop();
  for (let i = 0; i < 80 && daemon.devices.get('x32').connected; i++) await sleep(50);
  assert.equal(daemon.devices.get('x32').connected, false);
  assert.equal(daemon.shadow.get('/x32/ch/01/fader').stale, true);
  x32 = new MockX32({ port: oldPort });
  x32.state.get('/ch/01/config/name').value = 'Kick In';
  await x32.start();
  for (let i = 0; i < 100 && daemon.shadow.get('/x32/ch/01/name').value !== 'Kick In'; i++) await sleep(50);
  assert.equal(daemon.devices.get('x32').connected, true);
  assert.equal(daemon.shadow.get('/x32/ch/01/name').value, 'Kick In');
});
