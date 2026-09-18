// HTTP server: wires the JSON API, static asset serving and an SPA fallback.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { PORT, HOST, PUBLIC_DIR } from './config.js';
import { HttpError, sendJson } from './util.js';
import { routes } from './api.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function serveStatic(req, res, pathname) {
  // Normalize and confine to PUBLIC_DIR.
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(path.resolve(PUBLIC_DIR))) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback: unknown non-API path returns index.html.
      const index = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(index, (e2, buf) => {
        if (e2) { sendJson(res, 404, { error: 'Not found' }); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(buf);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    // Open, embeddable API: permissive CORS.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (pathname.startsWith('/api/')) {
        for (const route of routes) {
          if (route.method !== req.method) continue;
          const match = route.pattern.exec(pathname);
          if (!match) continue;
          await route.handler(req, res, match.groups || {}, url);
          return;
        }
        throw new HttpError(404, `No API route for ${req.method} ${pathname}`);
      }
      if (req.method === 'GET') { serveStatic(req, res, pathname); return; }
      throw new HttpError(405, 'Method not allowed');
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error('[server]', err);
      sendJson(res, status, { error: err.message || 'Internal error', details: err.details });
    }
  });
}

// Start only when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`Venue Database running at http://${HOST}:${PORT}`);
  });
}
