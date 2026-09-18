// Seeds example venues (and a couple of clearly-labelled demo files/reviews so
// the UI has something to show). Safe to run repeatedly: no-ops if data exists.
//
// It deliberately does NOT download or rehost any manufacturer venue/box files.
// Those are proprietary and gated behind vendor software/logins — see
// docs/FILE-FORMATS-AND-SOURCES.md. The database grows through techs uploading
// work they own, and through curated links to officially-free resources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { UPLOAD_DIR } from './config.js';
import { VENUES, REFERENCES } from './seed-data.js';
import { DEMO_FILES, GEOMETRY } from './seed-fixtures.js';
import * as repo from './repo.js';
import { getDb } from './db.js';

function seed() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS n FROM venues').get().n;
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} venue(s) already present.`);
    return;
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const byName = {};
  for (const v of VENUES) {
    const geo = GEOMETRY[v.name];
    const venue = repo.createVenue({
      address: null, submitted_by: 'seed', ...v,
      geometry: geo ? JSON.stringify(geo) : null,
    });
    byName[v.name] = venue.id;

    for (const f of DEMO_FILES[v.name] || []) {
      const { reviews = [], ...fileInput } = f;
      const file = repo.createFile(venue.id, { ...fileInput, consent: true });
      const content = Buffer.from(
        `PLACEHOLDER demo file for ${venue.name}\n` +
        `Application: ${fileInput.application}\n` +
        `This is seed data, not a real project file. Replace it with your own.\n`,
      );
      const storagePath = path.join(UPLOAD_DIR, file.id);
      fs.writeFileSync(storagePath, content);
      repo.markFileReady(file.id, {
        size_bytes: content.length,
        content_type: 'application/octet-stream',
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        storage_path: storagePath,
      });
      for (const r of reviews) repo.createReview(file.id, r);
    }
  }

  // Curated links to officially-free resources (never rehosted binaries).
  for (const ref of REFERENCES) {
    const venueId = byName[ref.venue];
    if (!venueId) continue;
    repo.createReference(venueId, ref);
  }

  console.log(`Seeded ${VENUES.length} venues (${Object.keys(GEOMETRY).length} with geometry), ${Object.keys(DEMO_FILES).length} demo file set(s), ${REFERENCES.length} reference(s).`);
}

seed();
