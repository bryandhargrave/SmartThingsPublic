// Small HTTP + validation helpers for the Node server.
import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export { HttpError };

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// Collect a JSON request body with a hard size limit so a client cannot exhaust
// memory. Returns {} for an empty body.
export function readJsonBody(req, { limit = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// ---- field validators ------------------------------------------------------

export function str(value, { field, required = false, min = 0, max = 2000 } = {}) {
  if (value == null || value === '') {
    if (required) throw new HttpError(422, `"${field}" is required`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(422, `"${field}" must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new HttpError(422, `"${field}" must be at least ${min} characters`);
  if (trimmed.length > max) throw new HttpError(422, `"${field}" must be at most ${max} characters`);
  return trimmed;
}

export function num(value, { field, required = false, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new HttpError(422, `"${field}" is required`);
    return null;
  }
  const n = Number(value);
  if (Number.isNaN(n)) throw new HttpError(422, `"${field}" must be a number`);
  if (integer && !Number.isInteger(n)) throw new HttpError(422, `"${field}" must be a whole number`);
  if (n < min || n > max) throw new HttpError(422, `"${field}" must be between ${min} and ${max}`);
  return n;
}
