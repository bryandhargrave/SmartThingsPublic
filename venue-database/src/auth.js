// Minimal admin authentication for the maintenance interface.
//
// Set ADMIN_TOKEN in the environment for a stable token (required in
// production). If unset, a random token is generated at startup and logged once
// so the owner can use the admin panel in local dev — it changes each restart.
import crypto from 'node:crypto';
import { HttpError } from './util.js';

let token = process.env.ADMIN_TOKEN || null;
let wasGenerated = false;

export function adminToken() {
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    wasGenerated = true;
  }
  return token;
}

export function adminTokenWasGenerated() {
  return wasGenerated;
}

// Throws 401 unless the request carries the correct admin token. Uses a
// constant-time comparison to avoid leaking the token via timing.
export function requireAdmin(req) {
  const provided = String(req.headers['x-admin-token'] || '');
  const expected = adminToken();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, 'Admin authentication required');
  }
}
