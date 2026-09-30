'use strict';
const http = require('http');
const crypto = require('crypto');
const { parseFrame, clientFrame } = require('../src/northbound/ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(base, p) {
  return new Promise((resolve, reject) => {
    http.get(base + p, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d ? safeJson(d) : null, raw: d }));
    }).on('error', reject);
  });
}

function httpPost(base, p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d ? safeJson(d) : null }));
    });
    req.on('error', reject);
    req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

function safeJson(s) { try { return JSON.parse(s); } catch (_) { return s; } }

/** Tiny WebSocket test client built on the same frame codec. */
function wsConnect(base) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({ host: u.hostname, port: u.port, path: '/', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' } });
    req.on('upgrade', (res, socket, head) => {
      const client = { socket, messages: [], waiters: [] };
      let buf = Buffer.alloc(0);
      const onData = (d) => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          const f = parseFrame(buf);
          if (!f) break;
          buf = buf.subarray(f.total);
          if (f.opcode === 0x1) push({ text: f.payload.toString(), json: safeJson(f.payload.toString()) });
          else if (f.opcode === 0x2) push({ binary: f.payload });
          else if (f.opcode === 0x9) socket.write(clientFrame(0xA, f.payload));
        }
      };
      socket.on('data', onData);
      const push = (m) => { client.messages.push(m); const w = client.waiters.shift(); if (w) w(m); };
      client.sendJson = (obj) => socket.write(clientFrame(0x1, Buffer.from(JSON.stringify(obj))));
      client.sendBinary = (b) => socket.write(clientFrame(0x2, b));
      client.next = (pred = () => true, timeout = 2000) => new Promise((res, rej) => {
        const existing = client.messages.findIndex(pred);
        if (existing >= 0) return res(client.messages.splice(existing, 1)[0]);
        const t = setTimeout(() => rej(new Error('ws timeout waiting for message')), timeout);
        const w = (m) => { if (pred(m)) { clearTimeout(t); client.messages.splice(client.messages.indexOf(m), 1); res(m); } else client.waiters.push(w); };
        client.waiters.push(w);
      });
      client.close = () => socket.destroy();
      if (head && head.length) onData(head);
      resolve(client);
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { sleep, httpGet, httpPost, wsConnect };
