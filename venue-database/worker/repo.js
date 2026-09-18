// Data-access layer for the Cloudflare Worker: the same queries as src/repo.js,
// rewritten for D1 (async prepare/bind/first/all/run, batch() for transactions).
// A factory closes over the D1 binding so the handlers read like the Node repo.
import { HttpError } from '../src/errors.js';
import { nameKey, duplicateScore, DUPLICATE_THRESHOLD } from '../src/naming.js';

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

// Replace the raw geometry blob with a lightweight boolean flag on API objects.
function withGeometryFlag(venue) {
  venue.has_geometry = !!(venue.geometry && venue.geometry.length);
  delete venue.geometry;
  return venue;
}

const VENUE_ROLLUPS = `
  (SELECT COUNT(*) FROM files f WHERE f.venue_id = v.id AND f.status IN ('ready','reference')) AS file_count,
  (SELECT COUNT(*) FROM reviews r JOIN files f ON r.file_id = f.id WHERE f.venue_id = v.id) AS review_count,
  (SELECT ROUND(AVG(r.rating), 2) FROM reviews r JOIN files f ON r.file_id = f.id WHERE f.venue_id = v.id) AS avg_rating`;

const FILE_ROLLUPS = `
  (SELECT COUNT(*) FROM reviews r WHERE r.file_id = f.id) AS review_count,
  (SELECT ROUND(AVG(r.rating), 2) FROM reviews r WHERE r.file_id = f.id) AS avg_rating`;

const EDITABLE_VENUE_FIELDS = [
  'name', 'type', 'address', 'city', 'region', 'country',
  'latitude', 'longitude', 'capacity', 'website', 'description',
];

export function makeRepo(db) {
  // ---- venues --------------------------------------------------------------

  async function createVenue(input) {
    const id = newId('ven');
    await db.prepare(`
      INSERT INTO venues (id, name, name_key, type, address, city, region, country,
                          latitude, longitude, capacity, website, description, submitted_by, geometry)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, input.name, nameKey(input.name), input.type ?? null, input.address ?? null, input.city ?? null,
      input.region ?? null, input.country ?? null, input.latitude ?? null, input.longitude ?? null,
      input.capacity ?? null, input.website ?? null, input.description ?? null, input.submitted_by ?? null,
      input.geometry ?? null,
    ).run();
    return getVenue(id);
  }

  async function findSimilarVenues({ name, city, country, excludeId, limit = 6 } = {}) {
    const candidate = { name, name_key: nameKey(name), city, country };
    const { results } = await db.prepare('SELECT id, name, name_key, city, region, country, status FROM venues').all();
    const scored = [];
    for (const v of results) {
      if (excludeId && v.id === excludeId) continue;
      const score = duplicateScore(candidate, v);
      if (score >= DUPLICATE_THRESHOLD) scored.push({ ...v, score: Number(score.toFixed(3)) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async function setGeometry(id, jsonString) {
    if (!(await getVenue(id))) throw new HttpError(404, 'Venue not found');
    await db.prepare("UPDATE venues SET geometry = ?, updated_at = datetime('now') WHERE id = ?").bind(jsonString, id).run();
    return getVenue(id);
  }

  async function getGeometry(id) {
    const row = await db.prepare('SELECT geometry FROM venues WHERE id = ?').bind(id).first();
    if (!row) return undefined;                                  // venue missing
    return row.geometry ? JSON.parse(row.geometry) : null;       // null = no geometry yet
  }

  async function getVenue(id) {
    const venue = await db.prepare(`SELECT v.*, ${VENUE_ROLLUPS} FROM venues v WHERE v.id = ?`).bind(id).first();
    if (!venue) return null;
    return withGeometryFlag(venue);
  }

  async function listVenues({ q, country, type, status = 'published', limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (q) {
      where.push(`(v.name LIKE ? OR v.city LIKE ? OR v.country LIKE ? OR v.description LIKE ?
        OR v.id IN (SELECT venue_id FROM venue_aliases WHERE alias LIKE ?))`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (country) { where.push('v.country = ?'); params.push(country); }
    if (type) { where.push('v.type = ?'); params.push(type); }
    if (status !== 'all') { where.push('v.status = ?'); params.push(status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { results } = await db.prepare(`
      SELECT v.*, ${VENUE_ROLLUPS}
      FROM venues v
      ${whereSql}
      ORDER BY v.name COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const totalRow = await db.prepare(`SELECT COUNT(*) AS n FROM venues v ${whereSql}`).bind(...params).first();
    return { venues: results.map(withGeometryFlag), total: totalRow.n, limit, offset };
  }

  // ---- files ---------------------------------------------------------------

  async function createFile(venueId, input) {
    if (!(await getVenue(venueId))) throw new HttpError(404, 'Venue not found');
    const id = newId('file');
    await db.prepare(`
      INSERT INTO files (id, venue_id, filename, application, app_version, description, uploader_name, consent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, venueId, input.filename, input.application ?? null, input.app_version ?? null,
      input.description ?? null, input.uploader_name ?? null, input.consent ? 1 : 0).run();
    return getFile(id);
  }

  async function createReference(venueId, input) {
    if (!(await getVenue(venueId))) throw new HttpError(404, 'Venue not found');
    const id = newId('file');
    await db.prepare(`
      INSERT INTO files (id, venue_id, filename, application, app_version, description,
                         uploader_name, source_url, license_note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reference')
    `).bind(id, venueId, input.filename, input.application ?? null, input.app_version ?? null,
      input.description ?? null, input.uploader_name ?? null, input.source_url, input.license_note ?? null).run();
    return getFile(id);
  }

  async function getFile(id) {
    return (await db.prepare(`SELECT f.*, ${FILE_ROLLUPS} FROM files f WHERE f.id = ?`).bind(id).first()) || null;
  }

  async function listFilesForVenue(venueId) {
    const { results } = await db.prepare(`
      SELECT f.*, ${FILE_ROLLUPS}
      FROM files f
      WHERE f.venue_id = ? AND f.status IN ('ready','reference')
      ORDER BY f.created_at DESC
    `).bind(venueId).all();
    return results;
  }

  async function markFileReady(id, { size_bytes, content_type, sha256, storage_path }) {
    await db.prepare(`
      UPDATE files SET size_bytes = ?, content_type = ?, sha256 = ?, storage_path = ?, status = 'ready'
      WHERE id = ?
    `).bind(size_bytes, content_type ?? null, sha256 ?? null, storage_path ?? null, id).run();
    return getFile(id);
  }

  // ---- reviews -------------------------------------------------------------

  async function createReview(fileId, input) {
    const file = await getFile(fileId);
    if (!file || (file.status !== 'ready' && file.status !== 'reference')) throw new HttpError(404, 'File not found');
    const id = newId('rev');
    await db.prepare(`
      INSERT INTO reviews (id, file_id, rating, comment, reviewer_name) VALUES (?, ?, ?, ?, ?)
    `).bind(id, fileId, input.rating, input.comment ?? null, input.reviewer_name ?? null).run();
    return getReview(id);
  }

  async function getReview(id) {
    return (await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first()) || null;
  }

  async function listReviews(fileId) {
    const { results } = await db.prepare('SELECT * FROM reviews WHERE file_id = ? ORDER BY created_at DESC').bind(fileId).all();
    return results;
  }

  // ---- stats ---------------------------------------------------------------

  async function stats() {
    const one = async (sql) => (await db.prepare(sql).first()).n;
    return {
      venues: await one("SELECT COUNT(*) AS n FROM venues WHERE status = 'published'"),
      files: await one("SELECT COUNT(*) AS n FROM files WHERE status IN ('ready','reference')"),
      reviews: await one('SELECT COUNT(*) AS n FROM reviews'),
      countries: await one("SELECT COUNT(DISTINCT country) AS n FROM venues WHERE status = 'published' AND country IS NOT NULL AND country <> ''"),
      models: await one("SELECT COUNT(*) AS n FROM venues WHERE status = 'published' AND geometry IS NOT NULL AND geometry <> ''"),
    };
  }

  // ---- aliases -------------------------------------------------------------

  async function listAliases(venueId) {
    const { results } = await db.prepare('SELECT * FROM venue_aliases WHERE venue_id = ? ORDER BY created_at ASC').bind(venueId).all();
    return results;
  }

  async function addAlias(venueId, alias, kind = 'aka') {
    if (!(await getVenue(venueId))) throw new HttpError(404, 'Venue not found');
    const trimmed = String(alias || '').trim();
    if (!trimmed) throw new HttpError(422, 'alias is required');
    const exists = await db.prepare('SELECT 1 FROM venue_aliases WHERE venue_id = ? AND alias_key = ?').bind(venueId, nameKey(trimmed)).first();
    if (exists) return listAliases(venueId);
    await db.prepare('INSERT INTO venue_aliases (id, venue_id, alias, alias_key, kind) VALUES (?, ?, ?, ?, ?)')
      .bind(newId('alias'), venueId, trimmed, nameKey(trimmed), kind).run();
    return listAliases(venueId);
  }

  // ---- admin: edit / status / delete / merge -------------------------------

  async function updateVenue(id, fields) {
    if (!(await getVenue(id))) throw new HttpError(404, 'Venue not found');
    const sets = [];
    const params = [];
    for (const key of EDITABLE_VENUE_FIELDS) {
      if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
    }
    if (fields.name !== undefined) { sets.push('name_key = ?'); params.push(nameKey(fields.name)); }
    if (!sets.length) return getVenue(id);
    sets.push("updated_at = datetime('now')");
    await db.prepare(`UPDATE venues SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
    return getVenue(id);
  }

  async function setVenueStatus(id, status) {
    if (!['published', 'hidden', 'flagged'].includes(status)) throw new HttpError(422, 'invalid status');
    if (!(await getVenue(id))) throw new HttpError(404, 'Venue not found');
    await db.prepare("UPDATE venues SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    return getVenue(id);
  }

  // R2 keys (= file ids) of stored bytes for a venue, so the caller can clean up
  // R2 before/after the cascading DB delete.
  async function readyFileIds(venueId) {
    const { results } = await db.prepare("SELECT id FROM files WHERE venue_id = ? AND status = 'ready'").bind(venueId).all();
    return results.map((r) => r.id);
  }

  async function deleteVenue(id) {
    if (!(await getVenue(id))) throw new HttpError(404, 'Venue not found');
    await db.prepare('DELETE FROM venues WHERE id = ?').bind(id).run(); // cascades files/reviews/aliases
    return { deleted: id };
  }

  // Fold source into target: move files/fix-requests/aliases, copy geometry only
  // if target has none, record the former name as an alias, delete source — all in
  // one atomic D1 batch (D1 has no interactive BEGIN/COMMIT).
  async function mergeVenues(sourceId, targetId) {
    if (sourceId === targetId) throw new HttpError(422, 'Cannot merge a venue into itself');
    const source = await db.prepare('SELECT * FROM venues WHERE id = ?').bind(sourceId).first();
    const target = await db.prepare('SELECT * FROM venues WHERE id = ?').bind(targetId).first();
    if (!source) throw new HttpError(404, 'Source venue not found');
    if (!target) throw new HttpError(404, 'Target venue not found');

    const stmts = [
      db.prepare('UPDATE files SET venue_id = ? WHERE venue_id = ?').bind(targetId, sourceId),
      db.prepare('UPDATE fix_requests SET venue_id = ? WHERE venue_id = ?').bind(targetId, sourceId),
      db.prepare('UPDATE venue_aliases SET venue_id = ? WHERE venue_id = ?').bind(targetId, sourceId),
    ];
    if ((!target.geometry || !target.geometry.length) && source.geometry) {
      stmts.push(db.prepare("UPDATE venues SET geometry = ?, updated_at = datetime('now') WHERE id = ?").bind(source.geometry, targetId));
    }
    stmts.push(db.prepare("INSERT INTO venue_aliases (id, venue_id, alias, alias_key, kind) VALUES (?, ?, ?, ?, 'former')")
      .bind(newId('alias'), targetId, source.name, nameKey(source.name)));
    stmts.push(db.prepare('DELETE FROM venues WHERE id = ?').bind(sourceId));

    await db.batch(stmts);
    return getVenue(targetId);
  }

  // ---- fix requests --------------------------------------------------------

  async function createFixRequest(input) {
    if (input.venue_id && !(await getVenue(input.venue_id))) throw new HttpError(404, 'Venue not found');
    const id = newId('fix');
    await db.prepare(`
      INSERT INTO fix_requests (id, venue_id, file_id, type, message, suggestion, reporter_name, reporter_contact)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, input.venue_id ?? null, input.file_id ?? null, input.type, input.message,
      input.suggestion ?? null, input.reporter_name ?? null, input.reporter_contact ?? null).run();
    return getFixRequest(id);
  }

  async function getFixRequest(id) {
    return (await db.prepare('SELECT * FROM fix_requests WHERE id = ?').bind(id).first()) || null;
  }

  async function listFixRequests({ status = 'open', limit = 100 } = {}) {
    const { results } = status === 'all'
      ? await db.prepare('SELECT * FROM fix_requests ORDER BY created_at DESC LIMIT ?').bind(limit).all()
      : await db.prepare('SELECT * FROM fix_requests WHERE status = ? ORDER BY created_at DESC LIMIT ?').bind(status, limit).all();
    const out = [];
    for (const r of results) {
      const v = r.venue_id ? await db.prepare('SELECT name FROM venues WHERE id = ?').bind(r.venue_id).first() : null;
      out.push({ ...r, venue_name: v ? v.name : null });
    }
    return out;
  }

  async function resolveFixRequest(id, { status, admin_note } = {}) {
    if (!['resolved', 'dismissed', 'open'].includes(status)) throw new HttpError(422, 'invalid status');
    if (!(await getFixRequest(id))) throw new HttpError(404, 'Fix request not found');
    const resolvedAt = status === 'open' ? 'NULL' : "datetime('now')";
    await db.prepare(`UPDATE fix_requests SET status = ?, admin_note = ?, resolved_at = ${resolvedAt} WHERE id = ?`)
      .bind(status, admin_note ?? null, id).run();
    return getFixRequest(id);
  }

  async function adminStats() {
    const one = async (sql) => (await db.prepare(sql).first()).n;
    return {
      venues_total: await one('SELECT COUNT(*) AS n FROM venues'),
      venues_hidden: await one("SELECT COUNT(*) AS n FROM venues WHERE status <> 'published'"),
      fix_open: await one("SELECT COUNT(*) AS n FROM fix_requests WHERE status = 'open'"),
      files: await one("SELECT COUNT(*) AS n FROM files WHERE status IN ('ready','reference')"),
    };
  }

  async function venueCount() {
    return (await db.prepare('SELECT COUNT(*) AS n FROM venues').first()).n;
  }

  return {
    createVenue, findSimilarVenues, setGeometry, getGeometry, getVenue, listVenues,
    createFile, createReference, getFile, listFilesForVenue, markFileReady,
    createReview, getReview, listReviews, stats,
    listAliases, addAlias,
    updateVenue, setVenueStatus, readyFileIds, deleteVenue, mergeVenues,
    createFixRequest, getFixRequest, listFixRequests, resolveFixRequest, adminStats,
    venueCount,
  };
}
