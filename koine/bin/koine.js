#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const yaml = require('../src/util/yaml');
const { Daemon } = require('../src/core/daemon');
const { loadProfileFile, loadProfileDir, expandParameters } = require('../src/profile/loader');

const ROOT = path.join(__dirname, '..');

function usage() {
  console.log(`koine - headless pro audio translation daemon

Usage:
  koine start [-c config.yaml] [--store file.json]   Start the daemon (UI edits persist to the store)
  koine demo  [--port 8010]            Start with mock X32 + Yamaha + SQ + ULX-D and example rules (all local)
  koine validate <profile.yaml|dir>    Validate profile(s) and print parameter counts
  koine tree <profile.yaml> [pattern]  Print the expanded normalized namespace of a profile
  koine get  <path> [--url http://host:8010]
  koine set  <path> <value> [--url http://host:8010]
  koine watch [pattern] [--url ...]    Stream value changes over WebSocket
  koine status [--url ...]
  koine rules  [--url ...]            List rules with fire counts

Environment: KOINE_CONFIG (config path), KOINE_URL (daemon URL for get/set/watch)`);
}

function arg(flag, def) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : def; }

function loadConfig(file) {
  if (!file) return {};
  const text = fs.readFileSync(file, 'utf8');
  return file.endsWith('.json') ? JSON.parse(text) : yaml.parse(text);
}

async function start() {
  const file = arg('-c', process.env.KOINE_CONFIG || (fs.existsSync(path.join(ROOT, 'config', 'daemon.yaml')) ? path.join(ROOT, 'config', 'daemon.yaml') : null));
  if (!file) { console.error('no config found; pass -c config.yaml (see config/daemon.example.yaml)'); process.exit(2); }
  const cfg = loadConfig(file);
  const storePath = arg('--store', cfg.storePath || file.replace(/\.(ya?ml|json)$/, '') + '.store.json');
  const daemon = new Daemon(cfg, { storePath });
  await daemon.start();
  daemon.log.info(`config: ${file}; store: ${storePath}; devices: ${[...daemon.devices.keys()].join(', ') || '(none)'}; rules: ${daemon.rules.rules.length}; shadow nodes: ${daemon.shadow.nodes.size}`);
  hookSignals(daemon);
}

async function demo() {
  const { MockX32 } = require('../tools/mock-x32');
  const { MockScp } = require('../tools/mock-scp');
  const { MockSq } = require('../tools/mock-sq');
  const { MockUlxd } = require('../tools/mock-ulxd');
  const x32 = new MockX32({ autoMoveMs: Number(arg('--auto', 1500)) });
  const scp = new MockScp();
  const sq = new MockSq();
  const rf = new MockUlxd();
  await Promise.all([x32.start(), scp.start(), sq.start(), rf.start()]);
  const port = Number(arg('--port', 8010));
  const daemon = new Daemon({
    daemon: { name: 'koine demo', http: { port, host: '0.0.0.0' }, osc: { port: Number(arg('--osc', 9000)) }, mdns: arg('--mdns', 'true') !== 'false', logLevel: arg('--log', 'info') },
    devices: [
      { id: 'x32', name: 'FOH X32 (mock)', profile: 'behringer-x32', host: '127.0.0.1', port: x32.port, transport: { ping: { address: '/xinfo', intervalMs: 1000 } } },
      { id: 'cl5', name: 'Monitor CL5 (mock)', profile: 'yamaha-scp', host: '127.0.0.1', port: scp.port, include: ['/ch/*', '/main/*', '/dca/*', '/scene/*'] },
      { id: 'pa', name: 'PA drive SQ (mock)', profile: 'allen-heath-sq', host: '127.0.0.1', port: sq.port, include: ['/main/*', '/ch/0[1-8]/*'] },
      { id: 'rf', name: 'ULX-D rack (mock)', profile: 'shure-ulxd', host: '127.0.0.1', port: rf.port, include: ['/rx/[12]/*'] },
    ],
    rules: [
      { name: 'talkback unmutes monitor return', when: '/x32/talkback/a == true', do: 'set /cl5/ch/16/mute false' },
      { name: 'talkback release re-mutes it', when: '/x32/talkback/a == false', do: 'set /cl5/ch/16/mute true' },
      { name: 'mirror FOH input mutes to monitors', when: '/x32/ch/*/mute changed', do: 'set /cl5/ch/{1}/mute {value}' },
      { name: 'FOH ch32 fader drives RX1 gain', when: '/x32/ch/32/fader changed', do: { set: '/rf/rx/1/gain', scale: { type: 'linear', raw: [-90, 10], value: [-18, 42] } } },
      { name: 'RX1 battery on FOH scribble strip', when: '/rf/rx/1/battery/bars changed', do: 'set /x32/ch/32/name "RX1 bat {value}"' },
      { name: 'RX1 low battery goes red', when: '/rf/rx/1/battery/bars <= 1', do: ['set /x32/ch/32/color "#ff3b30"', 'log RX1 battery critical ({value} bars)'] },
      { name: 'RX1 battery ok goes green', when: '/rf/rx/1/battery/bars >= 2', do: 'set /x32/ch/32/color "#34c759"' },
      { name: 'PA main mute follows FOH main mute', when: '/x32/main/st/mute changed', do: 'set /pa/main/lr/mute {value}' },
    ],
    ui: {
      title: 'Walk-around (demo)',
      pins: [
        { path: '/x32/ch/10/fader', label: 'Lead Vox' },
        { path: '/x32/ch/10/mute', label: 'Lead Vox Mute' },
        { path: '/x32/talkback/a', label: 'FOH Talkback' },
        { path: '/x32/main/st/mute', label: 'PA Main Mute' },
        { path: '/pa/main/lr/fader', label: 'Sub Level' },
        { path: '/x32/out/09/delay/ms', label: 'Front Fill Delay' },
        { path: '/cl5/ch/01/fader', label: 'Mon Kick' },
        { path: '/cl5/ch/11/mute', label: 'Mon Lead Mute' },
        { path: '/rf/rx/1/gain', label: 'RX1 Gain' },
        { path: '/rf/rx/1/battery/bars', label: 'RX1 Battery' },
        { path: '/x32/ch/32/name', label: 'FOH Ch32 strip' },
      ],
    },
  }, { storePath: arg('--store', path.join(ROOT, 'config', 'demo.store.json')) });
  await daemon.start();
  daemon.log.info(`demo edits are saved to ${daemon.store.file}`);
  daemon.log.info(`demo: mock X32 udp/${x32.port}, mock Yamaha tcp/${scp.port}, mock SQ tcp/${sq.port}, mock ULX-D tcp/${rf.port}; open http://localhost:${port}/ui`);
  // Simulate surface activity and RF telemetry so the rules have something to react to.
  let tick = 0;
  const t = setInterval(() => {
    tick++;
    if (tick % 3 === 0) scp.surfaceChange(`MIXER:Current/InCh/Fader/Level ${Math.floor(Math.random() * 4)} 0`, -Math.floor(Math.random() * 3000));
    if (tick % 3 === 1) sq.surfaceLevel(Math.floor(Math.random() * 4), Math.floor(Math.random() * 16383));
    if (tick % 3 === 2) x32.surfaceChange(`/ch/${String(1 + Math.floor(Math.random() * 4)).padStart(2, '0')}/mix/on`, Math.random() < 0.5 ? 0 : 1);
    if (tick % 4 === 0) rf.telemetry(1, 'BATT_BARS', [3, 2, 1, 0, 5, 4][Math.floor(tick / 4) % 6]);
    if (tick % 7 === 0) x32.surfaceChange('/-stat/talk/A', tick % 14 === 0 ? 0 : 1);
  }, 3000);
  t.unref();
  hookSignals(daemon, async () => { clearInterval(t); await Promise.all([x32.stop(), scp.stop(), sq.stop(), rf.stop()]); });
}

function hookSignals(daemon, extra) {
  const stop = async () => { daemon.log.info('shutting down'); try { await daemon.stop(); if (extra) await extra(); } finally { process.exit(0); } };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function validate() {
  const target = process.argv[3] || path.join(ROOT, 'profiles');
  const files = fs.statSync(target).isDirectory() ? fs.readdirSync(target).filter((f) => /\.(ya?ml|json)$/.test(f)).map((f) => path.join(target, f)) : [target];
  let failed = 0;
  for (const f of files) {
    try {
      const p = loadProfileFile(f);
      const defs = expandParameters(p);
      const roles = {};
      for (const d of defs) if (d.role) roles[d.role] = (roles[d.role] || 0) + 1;
      console.log(`OK   ${path.basename(f)}  id=${p.id}  transport=${p.transport.type}  params=${defs.length}  roles=${JSON.stringify(roles)}${p.verified ? '' : '  [unverified]'}`);
    } catch (e) { failed++; console.log(`FAIL ${path.basename(f)}\n     ${e.message.replace(/\n/g, '\n     ')}`); }
  }
  process.exit(failed ? 1 : 0);
}

function tree() {
  const p = loadProfileFile(process.argv[3]);
  const re = process.argv[4] ? require('../src/osc/codec').patternToRegExp(process.argv[4]) : null;
  for (const d of expandParameters(p)) {
    if (re && !re.test(d.path)) continue;
    console.log(`${d.path.padEnd(28)} ${d.type.padEnd(6)} ${(d.unit || '').padEnd(4)} ${(d.range ? `[${d.range[0]}, ${d.range[1]}]` : '').padEnd(14)} ${d.access.padEnd(2)} <- ${typeof d.device === 'string' ? d.device : JSON.stringify(d.device)}`);
  }
}

function baseUrl() { return (arg('--url', process.env.KOINE_URL || 'http://127.0.0.1:8010')).replace(/\/$/, ''); }

function request(method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl() + p);
    const req = http.request(u, { method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); } catch (_) { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

async function get() {
  const p = process.argv[3];
  if (!p) return usage();
  const r = await request('GET', encodeURI(p));
  console.log(JSON.stringify(r.body, null, 2));
}

async function set() {
  const [p, v] = [process.argv[3], process.argv[4]];
  if (!p || v === undefined) return usage();
  let value = v;
  if (/^-?\d+(\.\d+)?$/.test(v)) value = Number(v);
  else if (/^(true|false)$/i.test(v)) value = v.toLowerCase() === 'true';
  const r = await request('POST', '/api/set', { path: p, value });
  console.log(JSON.stringify(r.body));
}

async function status() {
  const r = await request('GET', '/api/status');
  console.log(JSON.stringify(r.body, null, 2));
}

async function rules() {
  const r = await request('GET', '/api/rules');
  for (const x of r.body) console.log(`${x.enabled ? ' ' : '-'} ${x.name.padEnd(40)} fires=${String(x.fires).padStart(4)}  ${x.lastFired ? new Date(x.lastFired).toISOString().slice(11, 19) : '        '}  when ${typeof x.when === 'string' ? x.when : JSON.stringify(x.when)}${x.lastError ? `  ERROR: ${x.lastError}` : ''}`);
}

function watch() {
  const pattern = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '/';
  const u = new URL(baseUrl());
  const crypto = require('crypto');
  const { parseFrame, clientFrame } = require('../src/northbound/ws');
  const key = crypto.randomBytes(16).toString('base64');
  const req = http.request({ host: u.hostname, port: u.port, path: '/', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' } });
  req.on('upgrade', (res, socket, head) => {
    socket.write(clientFrame(0x1, Buffer.from(JSON.stringify({ COMMAND: 'FORMAT', DATA: 'json' }))));
    socket.write(clientFrame(0x1, Buffer.from(JSON.stringify({ COMMAND: 'LISTEN', DATA: pattern }))));
    let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const f = parseFrame(buf);
        if (!f) break;
        buf = buf.subarray(f.total);
        if (f.opcode === 0x1) {
          const msg = JSON.parse(f.payload.toString());
          if (msg.COMMAND === 'VALUES' || msg.COMMAND === 'SNAPSHOT_VALUES') for (const c of msg.DATA) console.log(`${new Date(c.ts || Date.now()).toISOString().slice(11, 23)} ${c.path.padEnd(30)} ${JSON.stringify(c.value)}${c.stale ? ' (stale)' : ''} ${c.source || ''}`);
          else if (msg.COMMAND === 'RULE_FIRED') console.log(`${new Date(msg.DATA.ts).toISOString().slice(11, 23)} RULE ${msg.DATA.rule}: ${msg.DATA.trigger}=${JSON.stringify(msg.DATA.value)} -> ${JSON.stringify(msg.DATA.actions)}${msg.DATA.error ? ' ERROR ' + msg.DATA.error : ''}`);
          else if (msg.COMMAND !== 'HELLO') console.log(JSON.stringify(msg));
        } else if (f.opcode === 0x9) socket.write(clientFrame(0xA, f.payload));
      }
    });
  });
  req.on('error', (e) => { console.error(e.message); process.exit(1); });
  req.end();
}

const cmd = process.argv[2];
const commands = { start, demo, validate, tree, get, set, status, watch, rules };
if (!cmd || cmd === '-h' || cmd === '--help' || !commands[cmd]) { usage(); process.exit(cmd ? 2 : 0); }
Promise.resolve(commands[cmd]()).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
