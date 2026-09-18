// HTTP API handlers. Each returns JSON (or streams a file). Routing metadata is
// exported at the bottom as `routes` and consumed by server.js.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import { UPLOAD_DIR, MAX_UPLOAD_BYTES, KNOWN_APPLICATIONS, VENUE_TYPES } from './config.js';
import { HttpError, readJsonBody, sendJson, str, num } from './util.js';
import * as repo from './repo.js';

// ---- meta ------------------------------------------------------------------

async function getMeta(req, res) {
  sendJson(res, 200, {
    applications: KNOWN_APPLICATIONS,
    venueTypes: VENUE_TYPES,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    stats: repo.stats(),
  });
}

// ---- venues ----------------------------------------------------------------

async function listVenues(req, res, params, url) {
  const q = url.searchParams.get('q') || undefined;
  const country = url.searchParams.get('country') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  sendJson(res, 200, repo.listVenues({ q, country, type, limit, offset }));
}

async function createVenue(req, res) {
  const body = await readJsonBody(req);
  const venue = repo.createVenue({
    name: str(body.name, { field: 'name', required: true, min: 2, max: 200 }),
    type: str(body.type, { field: 'type', max: 60 }),
    address: str(body.address, { field: 'address', max: 300 }),
    city: str(body.city, { field: 'city', max: 120 }),
    region: str(body.region, { field: 'region', max: 120 }),
    country: str(body.country, { field: 'country', max: 120 }),
    latitude: num(body.latitude, { field: 'latitude', min: -90, max: 90 }),
    longitude: num(body.longitude, { field: 'longitude', min: -180, max: 180 }),
    capacity: num(body.capacity, { field: 'capacity', min: 0, max: 5_000_000, integer: true }),
    website: str(body.website, { field: 'website', max: 300 }),
    description: str(body.description, { field: 'description', max: 5000 }),
    submitted_by: str(body.submitted_by, { field: 'submitted_by', max: 120 }),
  });
  sendJson(res, 201, venue);
}

async function getVenue(req, res, params) {
  const venue = repo.getVenue(params.id);
  if (!venue) throw new HttpError(404, 'Venue not found');
  venue.files = repo.listFilesForVenue(venue.id);
  sendJson(res, 200, venue);
}

// ---- files -----------------------------------------------------------------

async function createFile(req, res, params) {
  const body = await readJsonBody(req);
  const file = repo.createFile(params.id, {
    filename: str(body.filename, { field: 'filename', required: true, min: 1, max: 260 }),
    application: str(body.application, { field: 'application', max: 80 }),
    app_version: str(body.app_version, { field: 'app_version', max: 60 }),
    description: str(body.description, { field: 'description', max: 3000 }),
    uploader_name: str(body.uploader_name, { field: 'uploader_name', max: 120 }),
  });
  // The client now POSTs the raw bytes to uploadUrl to complete the upload.
  sendJson(res, 201, { ...file, uploadUrl: `/api/files/${file.id}/content` });
}

async function uploadFileContent(req, res, params) {
  const file = repo.getFile(params.id);
  if (!file) throw new HttpError(404, 'File not found');

  const declared = Number(req.headers['content-length'] || 0);
  if (declared && declared > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, `File exceeds maximum of ${MAX_UPLOAD_BYTES} bytes`);
  }

  const tmpPath = path.join(UPLOAD_DIR, `.tmp_${file.id}`);
  const finalPath = path.join(UPLOAD_DIR, file.id);
  const hash = crypto.createHash('sha256');
  let size = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    size += chunk.length;
    hash.update(chunk);
    if (size > MAX_UPLOAD_BYTES && !aborted) {
      aborted = true;
      req.destroy(new HttpError(413, `File exceeds maximum of ${MAX_UPLOAD_BYTES} bytes`));
    }
  });

  try {
    await pipeline(req, fs.createWriteStream(tmpPath));
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    if (aborted || err instanceof HttpError) throw new HttpError(413, `File exceeds maximum of ${MAX_UPLOAD_BYTES} bytes`);
    throw err;
  }

  if (size === 0) {
    fs.rmSync(tmpPath, { force: true });
    throw new HttpError(422, 'Empty upload');
  }

  fs.renameSync(tmpPath, finalPath);
  const updated = repo.markFileReady(file.id, {
    size_bytes: size,
    content_type: req.headers['content-type'] || 'application/octet-stream',
    sha256: hash.digest('hex'),
    storage_path: finalPath,
  });
  sendJson(res, 200, updated);
}

async function getFile(req, res, params) {
  const file = repo.getFile(params.id);
  if (!file) throw new HttpError(404, 'File not found');
  file.reviews = repo.listReviews(file.id);
  sendJson(res, 200, file);
}

async function downloadFile(req, res, params) {
  const file = repo.getFile(params.id);
  if (!file || file.status !== 'ready' || !file.storage_path || !fs.existsSync(file.storage_path)) {
    throw new HttpError(404, 'File content not available');
  }
  // Guard against a stored path that escaped the upload directory.
  const resolved = path.resolve(file.storage_path);
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new HttpError(404, 'File content not available');

  const safeName = file.filename.replace(/[^\w.\-]+/g, '_');
  res.writeHead(200, {
    'Content-Type': file.content_type || 'application/octet-stream',
    'Content-Length': file.size_bytes,
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'X-Content-SHA256': file.sha256 || '',
  });
  await pipeline(fs.createReadStream(resolved), res);
}

// ---- reviews ---------------------------------------------------------------

async function listReviews(req, res, params) {
  if (!repo.getFile(params.id)) throw new HttpError(404, 'File not found');
  sendJson(res, 200, { reviews: repo.listReviews(params.id) });
}

async function createReview(req, res, params) {
  const body = await readJsonBody(req);
  const review = repo.createReview(params.id, {
    rating: num(body.rating, { field: 'rating', required: true, min: 1, max: 5, integer: true }),
    comment: str(body.comment, { field: 'comment', max: 4000 }),
    reviewer_name: str(body.reviewer_name, { field: 'reviewer_name', max: 120 }),
  });
  sendJson(res, 201, review);
}

// ---- route table -----------------------------------------------------------
// pattern uses named capture groups that become `params`.

export const routes = [
  { method: 'GET', pattern: /^\/api\/meta$/, handler: getMeta },
  { method: 'GET', pattern: /^\/api\/venues$/, handler: listVenues },
  { method: 'POST', pattern: /^\/api\/venues$/, handler: createVenue },
  { method: 'GET', pattern: /^\/api\/venues\/(?<id>[^/]+)$/, handler: getVenue },
  { method: 'POST', pattern: /^\/api\/venues\/(?<id>[^/]+)\/files$/, handler: createFile },
  { method: 'POST', pattern: /^\/api\/files\/(?<id>[^/]+)\/content$/, handler: uploadFileContent },
  { method: 'GET', pattern: /^\/api\/files\/(?<id>[^/]+)\/content$/, handler: downloadFile },
  { method: 'GET', pattern: /^\/api\/files\/(?<id>[^/]+)\/reviews$/, handler: listReviews },
  { method: 'POST', pattern: /^\/api\/files\/(?<id>[^/]+)\/reviews$/, handler: createReview },
  { method: 'GET', pattern: /^\/api\/files\/(?<id>[^/]+)$/, handler: getFile },
];
