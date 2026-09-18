// Data-access layer. All SQL lives here; the rest of the app talks to venues,
// files and reviews through these functions.
import { getDb } from './db.js';
import { newId, HttpError } from './util.js';

// ---- venues ----------------------------------------------------------------

export function createVenue(input) {
  const db = getDb();
  const id = newId('ven');
  db.prepare(`
    INSERT INTO venues (id, name, type, address, city, region, country,
                        latitude, longitude, capacity, website, description, submitted_by, geometry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.name, input.type, input.address, input.city, input.region, input.country,
    input.latitude, input.longitude, input.capacity, input.website, input.description,
    input.submitted_by, input.geometry ?? null,
  );
  return getVenue(id);
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

export function listVenues({ q, country, type, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (q) {
    where.push('(v.name LIKE ? OR v.city LIKE ? OR v.country LIKE ? OR v.description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (country) { where.push('v.country = ?'); params.push(country); }
  if (type) { where.push('v.type = ?'); params.push(type); }
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
    INSERT INTO files (id, venue_id, filename, application, app_version, description, uploader_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, venueId, input.filename, input.application, input.app_version, input.description, input.uploader_name);
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
  const venues = db.prepare('SELECT COUNT(*) AS n FROM venues').get().n;
  const files = db.prepare("SELECT COUNT(*) AS n FROM files WHERE status IN ('ready','reference')").get().n;
  const reviews = db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
  const countries = db.prepare("SELECT COUNT(DISTINCT country) AS n FROM venues WHERE country IS NOT NULL AND country <> ''").get().n;
  const models = db.prepare("SELECT COUNT(*) AS n FROM venues WHERE geometry IS NOT NULL AND geometry <> ''").get().n;
  return { venues, files, reviews, countries, models };
}
