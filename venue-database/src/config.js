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

// App list + venue types live in a pure module so the Cloudflare Worker can
// reuse them without importing this node:path-bound file.
export { KNOWN_APPLICATIONS, VENUE_TYPES } from './catalog.js';
