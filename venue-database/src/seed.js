// Seeds a handful of example venues, files and reviews so a fresh install has
// something to look at. Safe to run repeatedly: it no-ops if data already exists.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { UPLOAD_DIR } from './config.js';
import * as repo from './repo.js';
import { getDb } from './db.js';

const SAMPLE_VENUES = [
  {
    name: 'Red Rocks Amphitheatre', type: 'Amphitheater', city: 'Morrison',
    region: 'Colorado', country: 'United States', latitude: 39.6655, longitude: -105.2056,
    capacity: 9525, website: 'https://www.redrocksonline.com',
    description: 'Open-air amphitheatre carved into red sandstone. Notorious for wind and reflective rock faces behind the stage.',
    submitted_by: 'seed',
    files: [
      { filename: 'RedRocks_MainPA_v2.dbpro', application: 'ArrayCalc', app_version: '11.2', description: 'Main + out-fill design for a J-Series hang. Includes ground-stack subs.', uploader_name: 'FOH Dana', reviews: [
        { rating: 5, comment: 'Prediction matched measured within ~1.5 dB across the bowl. Great starting point.', reviewer_name: 'SE Marcus' },
        { rating: 4, comment: 'Solid. Trim was a touch high for the front rows on our rig — dropped 30cm.', reviewer_name: 'Tommy K' },
      ] },
    ],
  },
  {
    name: 'Royal Albert Hall', type: 'Concert Hall', city: 'London', region: 'England',
    country: 'United Kingdom', latitude: 51.5010, longitude: -0.1774, capacity: 5272,
    website: 'https://www.royalalberthall.com',
    description: 'Victorian round hall. Long reverb tail and the famous dome — mushroom diffusers help but delays need care.',
    submitted_by: 'seed',
    files: [
      { filename: 'RAH_Kara_Soundvision.svml', application: 'Soundvision', app_version: '4.2', description: 'Kara II mains with delay rings for the round geometry.', uploader_name: 'Priya S', reviews: [
        { rating: 5, comment: 'The delay-ring layout saved us hours. Coverage into the boxes is even.', reviewer_name: 'A2 Chen' },
      ] },
    ],
  },
  {
    name: 'Sydney Opera House — Concert Hall', type: 'Concert Hall', city: 'Sydney',
    region: 'New South Wales', country: 'Australia', latitude: -33.8568, longitude: 151.2153,
    capacity: 2679, website: 'https://www.sydneyoperahouse.com',
    description: 'Recently renovated concert hall with new acoustic reflectors. Rigging points are limited — check the plot.',
    submitted_by: 'seed', files: [],
  },
  {
    name: 'Ziggo Dome', type: 'Arena', city: 'Amsterdam', region: 'North Holland',
    country: 'Netherlands', latitude: 52.3140, longitude: 4.9370, capacity: 17000,
    website: 'https://www.ziggodome.nl',
    description: 'Indoor arena with a variable acoustic curtain system. Good behaved room for a modern line array.',
    submitted_by: 'seed', files: [],
  },
];

function seed() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS n FROM venues').get().n;
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} venue(s) already present.`);
    return;
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  for (const v of SAMPLE_VENUES) {
    const { files = [], ...venueInput } = v;
    const venue = repo.createVenue({
      address: null, ...venueInput,
    });
    for (const f of files) {
      const { reviews = [], ...fileInput } = f;
      const file = repo.createFile(venue.id, fileInput);
      // Write a small placeholder so the download endpoint has real bytes.
      const content = Buffer.from(
        `Placeholder for ${fileInput.filename}\n` +
        `Application: ${fileInput.application}\n` +
        `Venue: ${venue.name}\n` +
        `This is seed data — replace with a real project file.\n`,
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
  console.log(`Seeded ${SAMPLE_VENUES.length} venues.`);
}

seed();
