'use strict';
// PIN authentication: HTTP, WebSocket, OSC/UDP allowlist, rate limiting, persistence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const { Daemon } = require('../src/core/daemon');
const { MockX32 } = require('../tools/mock-x32');
const osc = require('../src/osc/codec');
const { sleep, httpGet } = require('./helpers');

function req(base, method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d ? JSON.parse(d) : null })); });
    r.on('error', reject); r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
function upgradeStatus(base, extraPath = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const r = http.request({ host: u.hostname, port: u.port, path: '/' + extraPath, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'Sec-WebSocket-Version': '13', ...headers } });
    r.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    r.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', reject); r.end();
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'koine-auth-'));
let x32, daemon, base, storeFile;

test.before(async () => {
  x32 = new MockX32(); await x32.start();
  storeFile = path.join(tmp, 'store.json');
  daemon = new Daemon({
    daemon: { name: 'auth', http: { port: 0, host: '127.0.0.1' }, osc: { port: 0, host: '127.0.0.1', allow: ['10.1.1.1'] }, mdns: false, logLevel: 'silent', auth: { pin: '2468' } },
    devices: [{ id: 'x32', profile: 'behringer-x32', host: '127.0.0.1', port: x32.port, include: ['/ch/0[1-2]/*'], transport: { ping: { address: '/xinfo', intervalMs: 300 }, queryRateLimit: 5000 } }],
  }, { storePath: storeFile });
  await daemon.start();
  base = `http://127.0.0.1:${daemon.http.port}`;
  for (let i = 0; i < 40 && daemon.shadow.get('/x32/ch/01/fader').value === null; i++) await sleep(50);
});
test.after(async () => { await daemon.stop(); await x32.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('without a PIN session: page and HOST_INFO open, everything else 401, WebSocket refused', async () => {
  assert.equal((await httpGet(base, '/ui')).status, 200);
  assert.equal((await httpGet(base, '/?HOST_INFO')).status, 200);
  assert.equal((await httpGet(base, '/')).status, 401);
  assert.equal((await httpGet(base, '/x32/ch/01/fader')).status, 401);
  assert.equal((await httpGet(base, '/api/status')).status, 401);
  assert.equal((await req(base, 'POST', '/api/set', { path: '/x32/ch/01/fader', value: -20 })).status, 401);
  assert.equal(await upgradeStatus(base), 401);
  const st = await httpGet(base, '/api/auth');
  assert.deepEqual([st.body.required, st.body.authenticated], [true, false]);
});

test('wrong PIN is rejected and rate limited; right PIN gives a cookie and a bearer token', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await req(base, 'POST', '/api/login', { pin: '0000' })).status, 401);
  const fifth = await req(base, 'POST', '/api/login', { pin: '0000' });
  assert.equal(fifth.status, 401);
  const locked = await req(base, 'POST', '/api/login', { pin: '2468' });
  assert.equal(locked.status, 429, 'even the right PIN waits after five failures');
  assert.ok(Number(locked.headers['retry-after']) >= 1);
  daemon.auth.attempts.clear(); // simulate the minute passing
  const ok = await req(base, 'POST', '/api/login', { pin: '2468', label: 'test iPad' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.match(ok.headers['set-cookie'][0], /^koine_token=.*HttpOnly/);
  const cookie = ok.headers['set-cookie'][0].split(';')[0];
  // cookie works
  assert.equal((await req(base, 'GET', '/x32/ch/01/fader', undefined, { Cookie: cookie })).status, 200);
  // bearer works
  const s = await req(base, 'POST', '/api/set', { path: '/x32/ch/01/fader', value: -20 }, { Authorization: `Bearer ${ok.body.token}` });
  assert.equal(s.status, 200); assert.equal(s.body.accepted, true);
  // query token works for WebSocket clients that cannot set headers
  assert.equal(await upgradeStatus(base, `?token=${encodeURIComponent(ok.body.token)}`), 101);
  assert.equal(await upgradeStatus(base, '', { Cookie: cookie }), 101);
  // garbage token does not
  assert.equal((await req(base, 'GET', '/api/status', undefined, { Authorization: 'Bearer nope' })).status, 401);
  // tokens are stored hashed
  const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.equal(store.auth.tokens.length, 1);
  assert.notEqual(store.auth.tokens[0].hash, ok.body.token);
  assert.equal(store.auth.tokens[0].label, 'test iPad');
  // logout kills it
  assert.equal((await req(base, 'POST', '/api/logout', undefined, { Authorization: `Bearer ${ok.body.token}` })).status, 200);
  assert.equal((await req(base, 'GET', '/api/status', undefined, { Authorization: `Bearer ${ok.body.token}` })).status, 401);
});

test('OSC/UDP: reads and subscriptions always work, writes only from allowlisted senders while a PIN is set', async () => {
  const sock = dgram.createSocket('udp4');
  const inbox = [];
  sock.on('message', (b) => inbox.push(osc.decodePacket(b)));
  await new Promise((r) => sock.bind(0, '127.0.0.1', r));
  const send = (buf) => sock.send(buf, daemon.oscServer.port, '127.0.0.1');
  const before = x32.state.get('/ch/02/mix/fader').value;
  send(osc.encodeMessage('/x32/ch/02/fader', [{ type: 'f', value: -30 }]));
  await sleep(150);
  assert.equal(x32.state.get('/ch/02/mix/fader').value, before, 'write from 127.0.0.1 refused (not in allow list)');
  send(osc.encodeMessage('/x32/ch/02/fader', []));
  for (let i = 0; i < 20 && !inbox.length; i++) await sleep(25);
  assert.equal(inbox[0].address, '/x32/ch/02/fader', 'reads still answered');
  daemon.config.daemon.osc.allow.push('127.0.0.1');
  send(osc.encodeMessage('/x32/ch/02/fader', [{ type: 'f', value: -30 }]));
  for (let i = 0; i < 20 && x32.state.get('/ch/02/mix/fader').value !== 0.25; i++) await sleep(25);
  assert.equal(x32.state.get('/ch/02/mix/fader').value, 0.25, 'allowlisted sender may write');
  sock.close();
});

test('changing the PIN from the UI is stored hashed, logs everyone out, and survives a restart', async () => {
  const login = await req(base, 'POST', '/api/login', { pin: '2468' });
  const tok = login.body.token;
  const denied = await req(base, 'POST', '/api/auth', { current: '2468', pin: '1357' });
  assert.equal(denied.status, 401, 'PIN change needs a session');
  const bad = await req(base, 'POST', '/api/auth', { current: '9999', pin: '1357' }, { Authorization: `Bearer ${tok}` });
  assert.equal(bad.status, 400); assert.match(bad.body.error, /current PIN/);
  const short = await req(base, 'POST', '/api/auth', { current: '2468', pin: '12' }, { Authorization: `Bearer ${tok}` });
  assert.match(short.body.error, /4 to 12 digits/);
  const ch = await req(base, 'POST', '/api/auth', { current: '2468', pin: '1357' }, { Authorization: `Bearer ${tok}` });
  assert.equal(ch.status, 200);
  assert.equal((await req(base, 'GET', '/api/status', undefined, { Authorization: `Bearer ${tok}` })).status, 401, 'old sessions are out');
  assert.equal((await req(base, 'POST', '/api/login', { pin: '2468' })).status, 401, 'YAML PIN no longer valid');
  assert.equal((await req(base, 'POST', '/api/login', { pin: '1357' })).status, 200);
  const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.ok(store.auth.pinHash && store.auth.salt);
  assert.ok(!JSON.stringify(store).includes('1357'), 'PIN never stored in clear');
  // restart with the same store: the changed PIN is what counts
  const d2 = new Daemon({ daemon: { http: { port: 0, host: '127.0.0.1' }, osc: false, mdns: false, logLevel: 'silent', auth: { pin: '2468' } }, devices: [] }, { storePath: storeFile });
  assert.equal(d2.auth.verifyPin('2468'), false);
  assert.equal(d2.auth.verifyPin('1357'), true);
  assert.equal(d2.auth.validToken(tok), false);
  d2.rules.close();
});

test('readPublic lets OSCQuery browsers read without a PIN but never write', async () => {
  const d = new Daemon({ daemon: { http: { port: 0, host: '127.0.0.1' }, osc: false, mdns: false, logLevel: 'silent', auth: { pin: '1111', readPublic: true } }, devices: [{ id: 'x32', profile: 'behringer-x32', host: '127.0.0.1', port: x32.port, include: ['/ch/01/*'] }] }, { storePath: path.join(tmp, 'store2.json') });
  await d.start();
  const b = `http://127.0.0.1:${d.http.port}`;
  assert.equal((await httpGet(b, '/x32/ch/01/fader')).status, 200);
  assert.equal((await httpGet(b, '/api/status')).status, 401);
  assert.equal((await req(b, 'POST', '/x32/ch/01/fader', { VALUE: [-5] })).status, 401);
  assert.equal(await upgradeStatus(b), 401);
  await d.stop();
});

test('with no PIN configured everything is open and the UI is told so', async () => {
  const d = new Daemon({ daemon: { http: { port: 0, host: '127.0.0.1' }, osc: false, mdns: false, logLevel: 'silent' }, devices: [] }, { storePath: path.join(tmp, 'store3.json') });
  await d.start();
  const b = `http://127.0.0.1:${d.http.port}`;
  assert.deepEqual((await httpGet(b, '/api/auth')).body.required, false);
  assert.equal((await httpGet(b, '/api/status')).status, 200);
  // first PIN can be set without a session
  const set = await req(b, 'POST', '/api/auth', { pin: '4321' });
  assert.equal(set.status, 200); assert.ok(set.body.token);
  assert.equal((await httpGet(b, '/api/status')).status, 401);
  await d.stop();
});
