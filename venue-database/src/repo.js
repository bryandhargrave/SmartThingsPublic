// Data-access layer. All SQL lives here; the rest of the app talks to venues,
// files and reviews through these functions.
import { getDb } from './db.js';
import { newId, HttpError } from './util.js';
import { nameKey, duplicateScore, DUPLICATE_THRESHOLD } from './naming.js';

// ---- venues ----------------------------------------------------------------

export function createVenue(input) {
  const db = getDb();
  const id = newId('ven');
  db.prepare(`
    INSERT INTO venues (id, name, name_key, type, address, city, region, country,
                        latitude, longitude, capacity, website, description, submitted_by, geometry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.name, nameKey(input.name), input.type, input.address, input.city, input.region, input.country,
    input.latitude, input.longitude, input.capacity, input.website, input.description,
    input.submitted_by, input.geometry ?? null,
  );
  return getVenue(id);
}

// Find venues that are likely the same as the given candidate, ranked by score.
// Used to warn on submission and to power admin de-duplication.
export function findSimilarVenues({ name, city, country, excludeId, limit = 6 } = {}) {
  const db = getDb();
  const candidate = { name, name_key: nameKey(name), city, country };
  const rows = db.prepare('SELECT id, name, name_key, city, region, country, status FROM venues').all();
  const scored = [];
  for (const v of rows) {
    if (excludeId && v.id === excludeId) continue;
    const score = duplicateScore(candidate, v);
    if (score >= DUPLICATE_THRESHOLD) scored.push({ ...v, score: Number(score.toFixed(3)) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// Store the vendor-neutral geometry model (already-validated JSON string).
export function setGeometry(id, jsonString) {
  const db = getDb();
  if (!getVenue(id)) throw new HttpError(404, 'Venue not found');
  db.prepare("UPDATE venues SET geometry = ?, updated_at = datetime('now') WHERE id = ?").run(jsonString, id);
  return getVenue(id);
}

export function getGeometry(id) {
  const db = getDb();
  const row = db.prepare('SELECT geometry FROM venues WHERE id = ?').get(id);
  if (!row) return undefined; // venue missing
  return row.geometry ? JSON.parse(row.geometry) : null; // null = no geometry yet
}

export function getVenue(id) {
  const db = getDb();
  const venue = db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM files f WHERE f.venue_id = v.id AND f.status IN ('ready','reference')) AS file_count,
      (SELECT COUNT(*) FROM reviews r JOIN files f ON r.file_id = f.id WHERE f.venue_id = v.id) AS review_count,
      (SELECT ROUND(AVG(r.rating), 2) FROM reviews r JOIN files f ON r.file_id = f.id WHERE f.venue_id = v.id) AS avg_rating
    FROM venues v WHERE v.id = ?
  `).get(id);
  if (!venue) return null;
  return withGeometryFlag(venue);
}

// Replace the raw geometry blob with a lightweight boolean flag on API objects.
function withGeometryFlag(venue) {
  venue.has_geometry = !!(venue.geometry && venue.geometry.length);
  delete venue.geometry;
  return venue;
}

export function listVenues({ q, country, type, status = 'published', limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q) {
    // Match name/city/country/description, and any alias (former/aka names).
    where.push(`(v.name LIKE ? OR v.city LIKE ? OR v.country LIKE ? OR v.description LIKE ?
      OR v.id IN (SELECT venue_id FROM venue_aliases WHERE alias LIKE ?))`);
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (country) { where.push('v.country = ?'); params.push(country); }
  if (type) { where.push('v.type = ?'); params.push(type); }
  if (status !== 'all') { where.push('v.status = ?'); params.push(status); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM files f WHERE f.venue_id = v.id AND f.status IN ('ready','reference')) AS file_count,
      (SELECT COUNT(*) FROM reviews r JOIN files f ON r.file_id = f.id WHERE f.venue_id = v.id) AS review_count,
      (SELECT ROUND(AVG(r.rating), 2) FROM reviews r JOIN files f ON r.file_id = f.id WHERE f.venue_id = v.id) AS avg_rating
    FROM venues v
    ${whereSql}
    ORDER BY v.name COLLATE NOCASE ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM venues v ${whereSql}`).get(...params).n;
  return { venues: rows.map(withGeometryFlag), total, limit, offset };
}

// ---- files -----------------------------------------------------------------

export function createFile(venueId, input) {
  const db = getDb();
  if (!getVenue(venueId)) throw new HttpError(404, 'Venue not found');
  const id = newId('file');
  db.prepare(`
    INSERT INTO files (id, venue_id, filename, application, app_version, description, uploader_name, consent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, venueId, input.filename, input.application, input.app_version, input.description,
    input.uploader_name, input.consent ? 1 : 0);
  return getFile(id);
}

// Catalog an official external resource (a free manufacturer download, a public
// dataset) as a link with attribution instead of rehosting the bytes.
export function createReference(venueId, input) {
  const db = getDb();
  if (!getVenue(venueId)) throw new HttpError(404, 'Venue not found');
  const id = newId('file');
  db.prepare(`
    INSERT INTO files (id, venue_id, filename, application, app_version, description,
                       uploader_name, source_url, license_note, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reference')
  `).run(
    id, venueId, input.filename, input.application, input.app_version, input.description,
    input.uploader_name, input.source_url, input.license_note,
  );
  return getFile(id);
}

export function getFile(id) {
  const db = getDb();
  const file = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM reviews r WHERE r.file_id = f.id) AS review_count,
      (SELECT ROUND(AVG(r.rating), 2) FROM reviews r WHERE r.file_id = f.id) AS avg_rating
    FROM files f WHERE f.id = ?
  `).get(id);
  return file || null;
}

export function listFilesForVenue(venueId) {
  const db = getDb();
  return db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM reviews r WHERE r.file_id = f.id) AS review_count,
      (SELECT ROUND(AVG(r.rating), 2) FROM reviews r WHERE r.file_id = f.id) AS avg_rating
    FROM files f
    WHERE f.venue_id = ? AND f.status IN ('ready','reference')
    ORDER BY f.created_at DESC
  `).all(venueId);
}

export function markFileReady(id, { size_bytes, content_type, sha256, storage_path }) {
  const db = getDb();
  db.prepare(`
    UPDATE files SET size_bytes = ?, content_type = ?, sha256 = ?, storage_path = ?, status = 'ready'
    WHERE id = ?
  `).run(size_bytes, content_type, sha256, storage_path, id);
  return getFile(id);
}

// ---- reviews ---------------------------------------------------------------

export function createReview(fileId, input) {
  const db = getDb();
  const file = getFile(fileId);
  if (!file || (file.status !== 'ready' && file.status !== 'reference')) throw new HttpError(404, 'File not found');
  const id = newId('rev');
  db.prepare(`
    INSERT INTO reviews (id, file_id, rating, comment, reviewer_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, fileId, input.rating, input.comment, input.reviewer_name);
  return getReview(id);
}

export function getReview(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) || null;
}

export function listReviews(fileId) {
  const db = getDb();
  return db.prepare('SELECT * FROM reviews WHERE file_id = ? ORDER BY created_at DESC').all(fileId);
}

// ---- stats -----------------------------------------------------------------

export function stats() {
  const db = getDb();
  const venues = db.prepare("SELECT COUNT(*) AS n FROM venues WHERE status = 'published'").get().n;
  const files = db.prepare("SELECT COUNT(*) AS n FROM files WHERE status IN ('ready','reference')").get().n;
  const reviews = db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
  const countries = db.prepare("SELECT COUNT(DISTINCT country) AS n FROM venues WHERE status = 'published' AND country IS NOT NULL AND country <> ''").get().n;
  const models = db.prepare("SELECT COUNT(*) AS n FROM venues WHERE status = 'published' AND geometry IS NOT NULL AND geometry <> ''").get().n;
  return { venues, files, reviews, countries, models };
}

// ---- aliases ---------------------------------------------------------------

export function listAliases(venueId) {
  const db = getDb();
  return db.prepare('SELECT * FROM venue_aliases WHERE venue_id = ? ORDER BY created_at ASC').all(venueId);
}

export function addAlias(venueId, alias, kind = 'aka') {
  const db = getDb();
  if (!getVenue(venueId)) throw new HttpError(404, 'Venue not found');
  const trimmed = String(alias || '').trim();
  if (!trimmed) throw new HttpError(422, 'alias is required');
  // Skip duplicates (case-insensitive) for the same venue.
  const exists = db.prepare('SELECT 1 FROM venue_aliases WHERE venue_id = ? AND alias_key = ?').get(venueId, nameKey(trimmed));
  if (exists) return listAliases(venueId);
  db.prepare(`
    INSERT INTO venue_aliases (id, venue_id, alias, alias_key, kind) VALUES (?, ?, ?, ?, ?)
  `).run(newId('alias'), venueId, trimmed, nameKey(trimmed), kind);
  return listAliases(venueId);
}

// ---- admin: edit / status / delete / merge ---------------------------------

const EDITABLE_VENUE_FIELDS = [
  'name', 'type', 'address', 'city', 'region', 'country',
  'latitude', 'longitude', 'capacity', 'website', 'description',
];

export function updateVenue(id, fields) {
  const db = getDb();
  if (!getVenue(id)) throw new HttpError(404, 'Venue not found');
  const sets = [];
  const params = [];
  for (const key of EDITABLE_VENUE_FIELDS) {
    if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
  }
  if (fields.name !== undefined) { sets.push('name_key = ?'); params.push(nameKey(fields.name)); }
  if (!sets.length) return getVenue(id);
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE venues SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  return getVenue(id);
}

export function setVenueStatus(id, status) {
  const db = getDb();
  if (!['published', 'hidden', 'flagged'].includes(status)) throw new HttpError(422, 'invalid status');
  if (!getVenue(id)) throw new HttpError(404, 'Venue not found');
  db.prepare("UPDATE venues SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  return getVenue(id);
}

export function deleteVenue(id) {
  const db = getDb();
  if (!getVenue(id)) throw new HttpError(404, 'Venue not found');
  db.prepare('DELETE FROM venues WHERE id = ?').run(id); // cascades files/reviews/aliases
  return { deleted: id };
}

// Fold `sourceId` into `targetId`: move files, geometry (if target has none),
// aliases and open fix requests, record the source name as a former-name alias,
// then delete the source venue.
export function mergeVenues(sourceId, targetId) {
  const db = getDb();
  if (sourceId === targetId) throw new HttpError(422, 'Cannot merge a venue into itself');
  const source = db.prepare('SELECT * FROM venues WHERE id = ?').get(sourceId);
  const target = db.prepare('SELECT * FROM venues WHERE id = ?').get(targetId);
  if (!source) throw new HttpError(404, 'Source venue not found');
  if (!target) throw new HttpError(404, 'Target venue not found');

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE files SET venue_id = ? WHERE venue_id = ?').run(targetId, sourceId);
    db.prepare('UPDATE fix_requests SET venue_id = ? WHERE venue_id = ?').run(targetId, sourceId);
    if ((!target.geometry || !target.geometry.length) && source.geometry) {
      db.prepare("UPDATE venues SET geometry = ?, updated_at = datetime('now') WHERE id = ?").run(source.geometry, targetId);
    }
    // Move source's aliases to target.
    db.prepare('UPDATE venue_aliases SET venue_id = ? WHERE venue_id = ?').run(targetId, sourceId);
    // Record the source name as a former-name alias of the target.
    db.prepare(`INSERT INTO venue_aliases (id, venue_id, alias, alias_key, kind) VALUES (?, ?, ?, ?, 'former')`)
      .run(newId('alias'), targetId, source.name, nameKey(source.name));
    db.prepare('DELETE FROM venues WHERE id = ?').run(sourceId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return getVenue(targetId);
}

// ---- fix requests ----------------------------------------------------------

export function createFixRequest(input) {
  const db = getDb();
  if (input.venue_id && !getVenue(input.venue_id)) throw new HttpError(404, 'Venue not found');
  const id = newId('fix');
  db.prepare(`
    INSERT INTO fix_requests (id, venue_id, file_id, type, message, suggestion, reporter_name, reporter_contact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.venue_id ?? null, input.file_id ?? null, input.type, input.message,
    input.suggestion ?? null, input.reporter_name ?? null, input.reporter_contact ?? null);
  return getFixRequest(id);
}

export function getFixRequest(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM fix_requests WHERE id = ?').get(id) || null;
}

export function listFixRequests({ status = 'open', limit = 100 } = {}) {
  const db = getDb();
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM fix_requests ORDER BY created_at DESC LIMIT ?').all(limit)
    : db.prepare('SELECT * FROM fix_requests WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit);
  // Attach the current venue name for context.
  return rows.map((r) => {
    const v = r.venue_id ? db.prepare('SELECT name FROM venues WHERE id = ?').get(r.venue_id) : null;
    return { ...r, venue_name: v ? v.name : null };
  });
}

export function resolveFixRequest(id, { status, admin_note } = {}) {
  const db = getDb();
  if (!['resolved', 'dismissed', 'open'].includes(status)) throw new HttpError(422, 'invalid status');
  if (!getFixRequest(id)) throw new HttpError(404, 'Fix request not found');
  const resolvedAt = status === 'open' ? null : "datetime('now')";
  db.prepare(`UPDATE fix_requests SET status = ?, admin_note = ?, resolved_at = ${resolvedAt === null ? 'NULL' : resolvedAt} WHERE id = ?`)
    .run(status, admin_note ?? null, id);
  return getFixRequest(id);
}

export function adminStats() {
  const db = getDb();
  return {
    venues_total: db.prepare('SELECT COUNT(*) AS n FROM venues').get().n,
    venues_hidden: db.prepare("SELECT COUNT(*) AS n FROM venues WHERE status <> 'published'").get().n,
    fix_open: db.prepare("SELECT COUNT(*) AS n FROM fix_requests WHERE status = 'open'").get().n,
    files: db.prepare("SELECT COUNT(*) AS n FROM files WHERE status IN ('ready','reference')").get().n,
  };
}
