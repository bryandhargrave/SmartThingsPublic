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
import * as repo from './repo.js';
import { getDb } from './db.js';

// A few demo files attached by venue name, so reviews/ratings are visible on a
// fresh install. Contents are labelled placeholders, not real project files.
const DEMO_FILES = {
  'Red Rocks Amphitheatre': [
    {
      filename: 'RedRocks_MainPA_example.dbpr', application: 'ArrayCalc', app_version: '11.x',
      description: 'DEMO placeholder — replace with a real ArrayCalc project you own. Illustrates a main + out-fill hang with ground-stacked subs.',
      uploader_name: 'seed',
      reviews: [
        { rating: 5, comment: 'Great starting geometry for the bowl — trims were close to what we flew.', reviewer_name: 'SE Marcus' },
        { rating: 4, comment: 'Solid. Dropped the mains ~30cm for the front rows on our rig.', reviewer_name: 'Tommy K' },
      ],
    },
  ],
  'Royal Albert Hall': [
    {
      filename: 'RAH_delayrings_example.svs', application: 'Soundvision', app_version: '4.x',
      description: 'DEMO placeholder — replace with a real Soundvision file you own. Shows a delay-ring approach for the round geometry.',
      uploader_name: 'seed',
      reviews: [
        { rating: 5, comment: 'The delay-ring layout is the right idea for this room — even coverage into the boxes.', reviewer_name: 'A2 Chen' },
      ],
    },
  ],
};

// A deliberately simple, SCHEMATIC room model (metres): a raked-ish audience
// plane, a stage, and a front-of-house point. Illustrative, not surveyed.
function schematicRoom({ width, depth, stageDepth = 12, stageHeight = 1.4 }) {
  const w = width / 2;
  return {
    units: 'meters',
    origin: { note: 'SCHEMATIC placeholder geometry — origin at stage front centre. Verify against the real room.' },
    surfaces: [
      { name: 'Stage', type: 'stage', vertices: [[-w, 0, stageHeight], [w, 0, stageHeight], [w, stageDepth, stageHeight], [-w, stageDepth, stageHeight]] },
      { name: 'Audience floor', type: 'audience', vertices: [[-w, stageDepth, 0], [w, stageDepth, 0], [w, depth, 0], [-w, depth, 0]] },
    ],
    points: [
      { label: 'FOH', x: 0, y: depth * 0.68, z: 1.5 },
      { label: 'Stage centre', x: 0, y: 0, z: stageHeight },
    ],
  };
}

const GEOMETRY = {
  'Red Rocks Amphitheatre': schematicRoom({ width: 60, depth: 90, stageDepth: 14, stageHeight: 1.4 }),
  'Ziggo Dome': schematicRoom({ width: 70, depth: 100, stageDepth: 16, stageHeight: 1.6 }),
};

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
