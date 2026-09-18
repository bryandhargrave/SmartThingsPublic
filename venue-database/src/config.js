// Central configuration. Everything is overridable through environment
// variables so the same code runs unchanged in local dev and in a container.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = process.env.VDB_DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = process.env.VDB_DB_PATH || path.join(DATA_DIR, 'venuedb.sqlite');

export const PORT = Number(process.env.PORT || 4000);
export const HOST = process.env.HOST || '0.0.0.0';

// 250 MB default cap. Real ArrayCalc / Soundvision project files are usually a
// few MB, but exported measurement sets and GLL data can get large.
export const MAX_UPLOAD_BYTES = Number(process.env.VDB_MAX_UPLOAD_BYTES || 250 * 1024 * 1024);

// Known design / measurement applications. Free text is also accepted so the
// list never blocks a submission for an app we have not enumerated yet.
export const KNOWN_APPLICATIONS = [
  'ArrayCalc',              // d&b audiotechnik
  'Soundvision',            // L-Acoustics
  'MAPP 3D',                // Meyer Sound
  'EASE',                   // AFMG
  'Modeler',                // Bose
  'Smaart',                 // Rational Acoustics
  'GLL / Loudspeaker data', // AFMG GLL
  'Other',
];

export const VENUE_TYPES = [
  'Arena',
  'Stadium',
  'Amphitheater',
  'Theater',
  'Concert Hall',
  'Club / Live Music',
  'Ballroom',
  'Convention Center',
  'House of Worship',
  'Outdoor Festival Site',
  'Corporate / AV',
  'Other',
];
