// Database bootstrap + schema. Uses the built-in node:sqlite module
// (Node >= 22.5, run with --experimental-sqlite) so the project has no
// external runtime dependencies.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { DB_PATH, DATA_DIR, UPLOAD_DIR } from './config.js';

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS venues (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      -- Canonical key for duplicate detection (see naming.js).
      name_key     TEXT,
      -- 'published' | 'hidden' | 'flagged' (admin-controlled visibility).
      status       TEXT NOT NULL DEFAULT 'published',
      type         TEXT,
      address      TEXT,
      city         TEXT,
      region       TEXT,
      country      TEXT,
      latitude     REAL,
      longitude    REAL,
      capacity     INTEGER,
      website      TEXT,
      description  TEXT,
      submitted_by TEXT,
      -- Vendor-neutral geometry model (JSON) used by the conversion engine.
      geometry     TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id            TEXT PRIMARY KEY,
      venue_id      TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      filename      TEXT NOT NULL,
      application   TEXT,
      app_version   TEXT,
      description   TEXT,
      uploader_name TEXT,
      -- Contributor affirmed they have the right to share this file (tick box).
      consent       INTEGER NOT NULL DEFAULT 0,
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      content_type  TEXT,
      sha256        TEXT,
      storage_path  TEXT,
      -- For catalogued external resources (official free downloads) we store a
      -- link instead of rehosting the bytes. NULL for normal uploads.
      source_url    TEXT,
      license_note  TEXT,
      -- 'pending' -> awaiting bytes, 'ready' -> uploaded, 'reference' -> external link.
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id            TEXT PRIMARY KEY,
      file_id       TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment       TEXT,
      reviewer_name TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS venue_aliases (
      id         TEXT PRIMARY KEY,
      venue_id   TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      alias      TEXT NOT NULL,
      alias_key  TEXT,
      kind       TEXT NOT NULL DEFAULT 'aka', -- 'former' | 'aka' | 'merged'
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fix_requests (
      id               TEXT PRIMARY KEY,
      venue_id         TEXT REFERENCES venues(id) ON DELETE SET NULL,
      file_id          TEXT REFERENCES files(id) ON DELETE SET NULL,
      type             TEXT NOT NULL DEFAULT 'correction', -- correction|duplicate|name_change|other
      message          TEXT NOT NULL,
      suggestion       TEXT,   -- optional JSON of proposed field values
      reporter_name    TEXT,
      reporter_contact TEXT,
      status           TEXT NOT NULL DEFAULT 'open', -- open|resolved|dismissed
      admin_note       TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_files_venue    ON files(venue_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_file   ON reviews(file_id);
    CREATE INDEX IF NOT EXISTS idx_venues_country ON venues(country);
    CREATE INDEX IF NOT EXISTS idx_venues_name    ON venues(name);
    CREATE INDEX IF NOT EXISTS idx_venues_namekey ON venues(name_key);
    CREATE INDEX IF NOT EXISTS idx_aliases_venue  ON venue_aliases(venue_id);
    CREATE INDEX IF NOT EXISTS idx_aliases_key    ON venue_aliases(alias_key);
    CREATE INDEX IF NOT EXISTS idx_fixreq_status  ON fix_requests(status);
  `);

  // Additive migrations for databases created before these columns existed.
  const fileCols = new Set(database.prepare('PRAGMA table_info(files)').all().map((c) => c.name));
  if (!fileCols.has('source_url')) database.exec('ALTER TABLE files ADD COLUMN source_url TEXT');
  if (!fileCols.has('license_note')) database.exec('ALTER TABLE files ADD COLUMN license_note TEXT');

  const venueCols = new Set(database.prepare('PRAGMA table_info(venues)').all().map((c) => c.name));
  if (!venueCols.has('geometry')) database.exec('ALTER TABLE venues ADD COLUMN geometry TEXT');
  if (!venueCols.has('name_key')) database.exec('ALTER TABLE venues ADD COLUMN name_key TEXT');
  if (!venueCols.has('status')) database.exec("ALTER TABLE venues ADD COLUMN status TEXT NOT NULL DEFAULT 'published'");
  if (!fileCols.has('consent')) database.exec('ALTER TABLE files ADD COLUMN consent INTEGER NOT NULL DEFAULT 0');
}
