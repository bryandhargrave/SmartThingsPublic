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

    CREATE INDEX IF NOT EXISTS idx_files_venue    ON files(venue_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_file   ON reviews(file_id);
    CREATE INDEX IF NOT EXISTS idx_venues_country ON venues(country);
    CREATE INDEX IF NOT EXISTS idx_venues_name    ON venues(name);
  `);

  // Additive migrations for databases created before these columns existed.
  const fileCols = new Set(database.prepare('PRAGMA table_info(files)').all().map((c) => c.name));
  if (!fileCols.has('source_url')) database.exec('ALTER TABLE files ADD COLUMN source_url TEXT');
  if (!fileCols.has('license_note')) database.exec('ALTER TABLE files ADD COLUMN license_note TEXT');
}
