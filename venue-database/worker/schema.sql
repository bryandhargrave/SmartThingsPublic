-- VenueBridge D1 schema. Mirrors src/db.js (minus the runtime migrations, since
-- D1 starts fresh). D1 enforces foreign keys, so the ON DELETE CASCADE / SET NULL
-- rules drive venue delete + merge cleanup.

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT,
  status TEXT NOT NULL DEFAULT 'published', type TEXT, address TEXT,
  city TEXT, region TEXT, country TEXT, latitude REAL, longitude REAL,
  capacity INTEGER, website TEXT, description TEXT, submitted_by TEXT,
  geometry TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, application TEXT, app_version TEXT, description TEXT,
  uploader_name TEXT, consent INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0, content_type TEXT, sha256 TEXT,
  storage_path TEXT, source_url TEXT, license_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT, reviewer_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS venue_aliases (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  alias TEXT NOT NULL, alias_key TEXT, kind TEXT NOT NULL DEFAULT 'aka',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS fix_requests (
  id TEXT PRIMARY KEY,
  venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'correction', message TEXT NOT NULL,
  suggestion TEXT, reporter_name TEXT, reporter_contact TEXT,
  status TEXT NOT NULL DEFAULT 'open', admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_files_venue    ON files(venue_id);
CREATE INDEX IF NOT EXISTS idx_reviews_file   ON reviews(file_id);
CREATE INDEX IF NOT EXISTS idx_venues_country ON venues(country);
CREATE INDEX IF NOT EXISTS idx_venues_name    ON venues(name);
CREATE INDEX IF NOT EXISTS idx_venues_namekey ON venues(name_key);
CREATE INDEX IF NOT EXISTS idx_venues_status  ON venues(status);
CREATE INDEX IF NOT EXISTS idx_aliases_venue  ON venue_aliases(venue_id);
CREATE INDEX IF NOT EXISTS idx_aliases_key    ON venue_aliases(alias_key);
CREATE INDEX IF NOT EXISTS idx_fixreq_status  ON fix_requests(status);
