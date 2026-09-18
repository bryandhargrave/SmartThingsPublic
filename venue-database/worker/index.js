// VenueBridge on Cloudflare Workers: one fetch handler that serves the JSON API
// (D1 + R2) and, as a fallback, the static SPA via the ASSETS binding. The API
// surface, status codes and JSON shapes match the Node reference app in ../src.
import { HttpError } from '../src/errors.js';
import { str, num } from '../src/validate.js';
import { KNOWN_APPLICATIONS, VENUE_TYPES } from '../src/catalog.js';
import { normalizeModel, EXPORT_FORMATS } from '../src/geometry.js';
import { VENUES, REFERENCES } from '../src/seed-data.js';
import { DEMO_FILES, GEOMETRY } from '../src/seed-fixtures.js';
import { makeRepo } from './repo.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

function slug(s) {
  return String(s || 'venue').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'venue';
}

function maxUpload(env) {
  return Number(env.MAX_UPLOAD_BYTES || 100 * 1024 * 1024);
}

// Constant-time compare (Workers have no crypto.timingSafeEqual).
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Throws 503 when no token is configured (admin disabled), 401 on mismatch.
function requireAdmin(env, request) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) throw new HttpError(503, 'Admin is not configured on this server');
  const provided = request.headers.get('x-admin-token') || '';
  if (!safeEqual(provided, expected)) throw new HttpError(401, 'Admin authentication required');
}

function tryAdmin(env, request) {
  try { requireAdmin(env, request); return true; } catch { return false; }
}

// Read a JSON body: empty → {}, oversized → 413, invalid → 400 (mirrors util.readJsonBody).
async function readJson(request, limit = 1_000_000) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared && declared > limit) throw new HttpError(413, 'Request body too large');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'Request body too large');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON body'); }
}

// ---- handlers --------------------------------------------------------------

async function getMeta({ env, repo }) {
  return json({ applications: KNOWN_APPLICATIONS, venueTypes: VENUE_TYPES, maxUploadBytes: maxUpload(env), stats: await repo.stats() });
}

async function listVenues({ url, repo }) {
  return json(await repo.listVenues({
    q: url.searchParams.get('q') || undefined,
    country: url.searchParams.get('country') || undefined,
    type: url.searchParams.get('type') || undefined,
    limit: Math.min(Number(url.searchParams.get('limit')) || 50, 200),
    offset: Math.max(Number(url.searchParams.get('offset')) || 0, 0),
  }));
}

async function findSimilar({ url, repo }) {
  const name = url.searchParams.get('name') || '';
  if (!name) return json({ duplicates: [] });
  const duplicates = await repo.findSimilarVenues({
    name,
    city: url.searchParams.get('city') || undefined,
    country: url.searchParams.get('country') || undefined,
  });
  return json({ duplicates });
}

async function createVenue({ request, repo }) {
  const body = await readJson(request);
  const name = str(body.name, { field: 'name', required: true, min: 2, max: 200 });
  const city = str(body.city, { field: 'city', max: 120 });
  const country = str(body.country, { field: 'country', max: 120 });

  if (!body.confirm_duplicate) {
    const duplicates = await repo.findSimilarVenues({ name, city, country });
    if (duplicates.length) throw new HttpError(409, 'This looks like it may already exist. Confirm to add anyway.', { duplicates });
  }

  const venue = await repo.createVenue({
    name, city, country,
    type: str(body.type, { field: 'type', max: 60 }),
    address: str(body.address, { field: 'address', max: 300 }),
    region: str(body.region, { field: 'region', max: 120 }),
    latitude: num(body.latitude, { field: 'latitude', min: -90, max: 90 }),
    longitude: num(body.longitude, { field: 'longitude', min: -180, max: 180 }),
    capacity: num(body.capacity, { field: 'capacity', min: 0, max: 5_000_000, integer: true }),
    website: str(body.website, { field: 'website', max: 300 }),
    description: str(body.description, { field: 'description', max: 5000 }),
    submitted_by: str(body.submitted_by, { field: 'submitted_by', max: 120 }),
    geometry: body.geometry != null ? JSON.stringify(normalizeModel(body.geometry)) : null,
  });
  return json(venue, 201);
}

async function setGeometry({ request, env, params, repo }) {
  const body = await readJson(request, 5_000_000);
  const isAdmin = tryAdmin(env, request);
  if (!isAdmin && body.consent !== true) {
    throw new HttpError(422, 'You must confirm you have the right to contribute this geometry.');
  }
  const raw = body && body.geometry !== undefined ? body.geometry : body;
  const model = normalizeModel(raw);
  return json(await repo.setGeometry(params.id, JSON.stringify(model)));
}

async function getModel({ params, repo }) {
  const model = await repo.getGeometry(params.id);
  if (model === undefined) throw new HttpError(404, 'Venue not found');
  if (model === null) throw new HttpError(404, 'This venue has no geometry model yet');
  return json(model);
}

async function exportGeometry({ url, params, repo }) {
  const venue = await repo.getVenue(params.id);
  if (!venue) throw new HttpError(404, 'Venue not found');
  const model = await repo.getGeometry(params.id);
  if (!model) throw new HttpError(404, 'This venue has no geometry model to convert yet');

  const fmt = (url.searchParams.get('format') || 'dxf').toLowerCase();
  const spec = EXPORT_FORMATS[fmt];
  if (!spec) throw new HttpError(400, `Unsupported format. Use one of: ${Object.keys(EXPORT_FORMATS).join(', ')}`);

  const bytes = spec.convert(model);
  const filename = `${slug(venue.name)}.${spec.ext}`;
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': spec.contentType, 'Content-Disposition': `attachment; filename="${filename}"`, ...CORS },
  });
}

async function getVenue({ params, repo }) {
  const venue = await repo.getVenue(params.id);
  if (!venue) throw new HttpError(404, 'Venue not found');
  venue.files = await repo.listFilesForVenue(venue.id);
  venue.aliases = await repo.listAliases(venue.id);
  return json(venue);
}

async function createFile({ request, params, repo }) {
  const body = await readJson(request);
  if (body.consent !== true) {
    throw new HttpError(422, 'You must confirm you have the right to share this file before uploading.');
  }
  const file = await repo.createFile(params.id, {
    filename: str(body.filename, { field: 'filename', required: true, min: 1, max: 260 }),
    application: str(body.application, { field: 'application', max: 80 }),
    app_version: str(body.app_version, { field: 'app_version', max: 60 }),
    description: str(body.description, { field: 'description', max: 3000 }),
    uploader_name: str(body.uploader_name, { field: 'uploader_name', max: 120 }),
    consent: true,
  });
  return json({ ...file, uploadUrl: `/api/files/${file.id}/content` }, 201);
}

async function createReference({ request, params, repo }) {
  const body = await readJson(request);
  const ref = await repo.createReference(params.id, {
    filename: str(body.filename, { field: 'filename', required: true, min: 1, max: 260 }),
    application: str(body.application, { field: 'application', max: 80 }),
    app_version: str(body.app_version, { field: 'app_version', max: 60 }),
    description: str(body.description, { field: 'description', max: 3000 }),
    uploader_name: str(body.uploader_name, { field: 'uploader_name', max: 120 }),
    source_url: str(body.source_url, { field: 'source_url', required: true, max: 1000 }),
    license_note: str(body.license_note, { field: 'license_note', max: 500 }),
  });
  return json(ref, 201);
}

async function uploadFileContent({ request, env, params, repo }) {
  const file = await repo.getFile(params.id);
  if (!file) throw new HttpError(404, 'File not found');

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared && declared > maxUpload(env)) {
    throw new HttpError(413, `File exceeds maximum of ${maxUpload(env)} bytes`);
  }

  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  // Stream straight to R2 — do not buffer the body (Workers have ~128 MB memory).
  const obj = await env.BUCKET.put(file.id, request.body, { httpMetadata: { contentType } });

  if (!obj || obj.size === 0) {
    await env.BUCKET.delete(file.id);
    throw new HttpError(422, 'Empty upload');
  }
  if (obj.size > maxUpload(env)) {
    await env.BUCKET.delete(file.id);
    throw new HttpError(413, `File exceeds maximum of ${maxUpload(env)} bytes`);
  }

  // sha256 is intentionally omitted on Cloudflare (Web Crypto has no streaming
  // digest and we don't buffer the body) — see worker/README.md.
  const updated = await repo.markFileReady(file.id, {
    size_bytes: obj.size, content_type: contentType, sha256: null, storage_path: file.id,
  });
  return json(updated, 200);
}

async function getFile({ params, repo }) {
  const file = await repo.getFile(params.id);
  if (!file) throw new HttpError(404, 'File not found');
  file.reviews = await repo.listReviews(file.id);
  return json(file);
}

async function downloadFile({ env, params, repo }) {
  const file = await repo.getFile(params.id);
  if (!file) throw new HttpError(404, 'File content not available');
  if (file.status === 'reference' && file.source_url) {
    return new Response(null, { status: 302, headers: { Location: file.source_url, ...CORS } });
  }
  if (file.status !== 'ready') throw new HttpError(404, 'File content not available');
  const obj = await env.BUCKET.get(file.storage_path || file.id);
  if (!obj) throw new HttpError(404, 'File content not available');

  const safeName = file.filename.replace(/[^\w.\-]+/g, '_');
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': file.content_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      ...CORS,
    },
  });
}

async function listReviews({ params, repo }) {
  if (!(await repo.getFile(params.id))) throw new HttpError(404, 'File not found');
  return json({ reviews: await repo.listReviews(params.id) });
}

async function createReview({ request, params, repo }) {
  const body = await readJson(request);
  const review = await repo.createReview(params.id, {
    rating: num(body.rating, { field: 'rating', required: true, min: 1, max: 5, integer: true }),
    comment: str(body.comment, { field: 'comment', max: 4000 }),
    reviewer_name: str(body.reviewer_name, { field: 'reviewer_name', max: 120 }),
  });
  return json(review, 201);
}

async function createFixRequest({ request, params, repo }) {
  const body = await readJson(request);
  const type = str(body.type, { field: 'type', max: 30 }) || 'correction';
  if (!['correction', 'duplicate', 'name_change', 'other'].includes(type)) throw new HttpError(422, 'invalid type');
  const fix = await repo.createFixRequest({
    venue_id: params.id,
    file_id: str(body.file_id, { field: 'file_id', max: 60 }),
    type,
    message: str(body.message, { field: 'message', required: true, min: 3, max: 4000 }),
    suggestion: body.suggestion != null ? JSON.stringify(body.suggestion).slice(0, 8000) : null,
    reporter_name: str(body.reporter_name, { field: 'reporter_name', max: 120 }),
    reporter_contact: str(body.reporter_contact, { field: 'reporter_contact', max: 200 }),
  });
  return json({ id: fix.id, status: fix.status, message: 'Thanks — your report was submitted for review.' }, 201);
}

// ---- admin -----------------------------------------------------------------

async function adminOverview({ request, env, repo }) {
  requireAdmin(env, request);
  return json(await repo.adminStats());
}

async function adminListVenues({ request, env, url, repo }) {
  requireAdmin(env, request);
  return json(await repo.listVenues({
    q: url.searchParams.get('q') || undefined,
    status: url.searchParams.get('status') || 'all',
    limit: Math.min(Number(url.searchParams.get('limit')) || 50, 200),
  }));
}

async function adminUpdateVenue({ request, env, params, repo }) {
  requireAdmin(env, request);
  const body = await readJson(request);
  const fields = {};
  if (body.name !== undefined) fields.name = str(body.name, { field: 'name', min: 2, max: 200 });
  for (const f of ['type', 'address', 'city', 'region', 'country', 'website']) {
    if (body[f] !== undefined) fields[f] = str(body[f], { field: f, max: 300 });
  }
  if (body.description !== undefined) fields.description = str(body.description, { field: 'description', max: 5000 });
  if (body.latitude !== undefined) fields.latitude = num(body.latitude, { field: 'latitude', min: -90, max: 90 });
  if (body.longitude !== undefined) fields.longitude = num(body.longitude, { field: 'longitude', min: -180, max: 180 });
  if (body.capacity !== undefined) fields.capacity = num(body.capacity, { field: 'capacity', min: 0, max: 5_000_000, integer: true });
  return json(await repo.updateVenue(params.id, fields));
}

async function adminSetStatus({ request, env, params, repo }) {
  requireAdmin(env, request);
  const body = await readJson(request);
  return json(await repo.setVenueStatus(params.id, str(body.status, { field: 'status', required: true, max: 20 })));
}

async function adminDeleteVenue({ request, env, params, repo }) {
  requireAdmin(env, request);
  const keys = await repo.readyFileIds(params.id); // R2 objects to clean up
  const result = await repo.deleteVenue(params.id);
  for (const key of keys) { try { await env.BUCKET.delete(key); } catch { /* best effort */ } }
  return json(result);
}

async function adminAddAlias({ request, env, params, repo }) {
  requireAdmin(env, request);
  const body = await readJson(request);
  const alias = str(body.alias, { field: 'alias', required: true, min: 1, max: 200 });
  const kind = ['former', 'aka', 'merged'].includes(body.kind) ? body.kind : 'aka';
  return json({ aliases: await repo.addAlias(params.id, alias, kind) });
}

async function adminMerge({ request, env, repo }) {
  requireAdmin(env, request);
  const body = await readJson(request);
  const sourceId = str(body.source_id, { field: 'source_id', required: true, max: 60 });
  const targetId = str(body.target_id, { field: 'target_id', required: true, max: 60 });
  return json(await repo.mergeVenues(sourceId, targetId));
}

async function adminListFix({ request, env, url, repo }) {
  requireAdmin(env, request);
  return json({ fix_requests: await repo.listFixRequests({ status: url.searchParams.get('status') || 'open' }) });
}

async function adminResolveFix({ request, env, params, repo }) {
  requireAdmin(env, request);
  const body = await readJson(request);
  return json(await repo.resolveFixRequest(params.id, {
    status: str(body.status, { field: 'status', required: true, max: 20 }),
    admin_note: str(body.admin_note, { field: 'admin_note', max: 2000 }),
  }));
}

// One-shot seed (self-guarding): inserts venues + geometry, writes demo file
// bytes to R2, and their reviews. No-op once venues exist. Admin-only.
async function adminSeed({ request, env, repo }) {
  requireAdmin(env, request);
  if ((await repo.venueCount()) > 0) {
    return json({ seeded: false, message: 'Already seeded', venues: await repo.venueCount() });
  }
  const byName = {};
  let files = 0;
  let reviews = 0;
  for (const v of VENUES) {
    const geo = GEOMETRY[v.name];
    const venue = await repo.createVenue({ address: null, submitted_by: 'seed', ...v, geometry: geo ? JSON.stringify(geo) : null });
    byName[v.name] = venue.id;

    for (const f of DEMO_FILES[v.name] || []) {
      const { reviews: fileReviews = [], ...fileInput } = f;
      const file = await repo.createFile(venue.id, { ...fileInput, consent: true });
      const content =
        `PLACEHOLDER demo file for ${venue.name}\n` +
        `Application: ${fileInput.application}\n` +
        'This is seed data, not a real project file. Replace it with your own.\n';
      const obj = await env.BUCKET.put(file.id, content, { httpMetadata: { contentType: 'application/octet-stream' } });
      await repo.markFileReady(file.id, { size_bytes: obj.size, content_type: 'application/octet-stream', sha256: null, storage_path: file.id });
      files++;
      for (const r of fileReviews) { await repo.createReview(file.id, r); reviews++; }
    }
  }
  for (const ref of REFERENCES) {
    const venueId = byName[ref.venue];
    if (venueId) await repo.createReference(venueId, ref);
  }
  return json({ seeded: true, venues: VENUES.length, files, reviews });
}

// ---- route table (same paths/methods as src/api.js) ------------------------

const ROUTES = [
  { method: 'GET', pattern: /^\/api\/meta$/, handler: getMeta },
  { method: 'GET', pattern: /^\/api\/venues$/, handler: listVenues },
  { method: 'POST', pattern: /^\/api\/venues$/, handler: createVenue },
  { method: 'GET', pattern: /^\/api\/venues\/similar$/, handler: findSimilar },
  { method: 'GET', pattern: /^\/api\/venues\/(?<id>[^/]+)$/, handler: getVenue },
  { method: 'GET', pattern: /^\/api\/venues\/(?<id>[^/]+)\/model$/, handler: getModel },
  { method: 'GET', pattern: /^\/api\/venues\/(?<id>[^/]+)\/export$/, handler: exportGeometry },
  { method: 'POST', pattern: /^\/api\/venues\/(?<id>[^/]+)\/geometry$/, handler: setGeometry },
  { method: 'PUT', pattern: /^\/api\/venues\/(?<id>[^/]+)\/geometry$/, handler: setGeometry },
  { method: 'POST', pattern: /^\/api\/venues\/(?<id>[^/]+)\/files$/, handler: createFile },
  { method: 'POST', pattern: /^\/api\/venues\/(?<id>[^/]+)\/references$/, handler: createReference },
  { method: 'POST', pattern: /^\/api\/venues\/(?<id>[^/]+)\/fix-requests$/, handler: createFixRequest },
  { method: 'POST', pattern: /^\/api\/files\/(?<id>[^/]+)\/content$/, handler: uploadFileContent },
  { method: 'GET', pattern: /^\/api\/files\/(?<id>[^/]+)\/content$/, handler: downloadFile },
  { method: 'GET', pattern: /^\/api\/files\/(?<id>[^/]+)\/reviews$/, handler: listReviews },
  { method: 'POST', pattern: /^\/api\/files\/(?<id>[^/]+)\/reviews$/, handler: createReview },
  { method: 'GET', pattern: /^\/api\/files\/(?<id>[^/]+)$/, handler: getFile },

  { method: 'POST', pattern: /^\/api\/admin\/seed$/, handler: adminSeed },
  { method: 'GET', pattern: /^\/api\/admin\/overview$/, handler: adminOverview },
  { method: 'GET', pattern: /^\/api\/admin\/venues$/, handler: adminListVenues },
  { method: 'PUT', pattern: /^\/api\/admin\/venues\/(?<id>[^/]+)$/, handler: adminUpdateVenue },
  { method: 'POST', pattern: /^\/api\/admin\/venues\/(?<id>[^/]+)\/status$/, handler: adminSetStatus },
  { method: 'POST', pattern: /^\/api\/admin\/venues\/(?<id>[^/]+)\/aliases$/, handler: adminAddAlias },
  { method: 'DELETE', pattern: /^\/api\/admin\/venues\/(?<id>[^/]+)$/, handler: adminDeleteVenue },
  { method: 'POST', pattern: /^\/api\/admin\/merge$/, handler: adminMerge },
  { method: 'GET', pattern: /^\/api\/admin\/fix-requests$/, handler: adminListFix },
  { method: 'POST', pattern: /^\/api\/admin\/fix-requests\/(?<id>[^/]+)\/resolve$/, handler: adminResolveFix },
];

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) {
      // Static SPA (assets binding handles single-page-application fallback).
      return env.ASSETS.fetch(request);
    }

    try {
      const repo = makeRepo(env.DB);
      for (const route of ROUTES) {
        if (route.method !== request.method) continue;
        const match = route.pattern.exec(pathname);
        if (!match) continue;
        return await route.handler({ request, env, ctx, params: match.groups || {}, url, repo });
      }
      throw new HttpError(404, `No API route for ${request.method} ${pathname}`);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const details = err instanceof HttpError && err.details && typeof err.details === 'object' ? err.details : {};
      return json({ error: err.message || 'Internal error', ...details }, status);
    }
  },
};
