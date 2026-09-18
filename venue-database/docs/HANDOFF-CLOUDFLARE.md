# Handoff: port VenueBridge to Cloudflare (Workers + D1 + R2), free tier

**Audience:** a session with `wrangler` installed and a Cloudflare account.
**Goal:** run VenueBridge on Cloudflare's free tiers with persistent data and no
server to manage. Keep the existing Node app as the runnable reference — don't
delete it.

**Why this stack:** Workers (100k req/day free) serve the API + static frontend;
D1 (SQLite-compatible, 5 GB free) holds the data; R2 (10 GB free, no egress
fees) holds uploaded file bytes. All free, persistent, zero card-charge risk.

---

## 0. Current state (what you're porting)

A zero-dependency Node app in `venue-database/`:

- `src/server.js` — `node:http` server: routing table, CORS, static file serving
  with SPA fallback, error handling (flattens `HttpError.details` into the JSON body).
- `src/api.js` — all route handlers + the `routes` array (method/regex/handler).
- `src/repo.js` — **all SQL**, using `node:sqlite` (synchronous).
- `src/db.js` — schema + additive migrations (`node:sqlite`).
- `src/geometry.js` — neutral geometry model + DXF/OBJ/JSON converters. **Pure.**
- `src/naming.js` — name-key + fuzzy duplicate matching. **Pure.**
- `src/errors.js` — `HttpError` (no platform deps). **Pure.**
- `src/util.js` — `readJsonBody`, `sendJson`, `str`, `num`, `newId` (uses `node:crypto`).
- `src/auth.js` — admin token (`node:crypto` timingSafeEqual).
- `src/config.js` — env config, `KNOWN_APPLICATIONS`, `VENUE_TYPES`, `MAX_UPLOAD_BYTES`.
- `src/seed-data.js` — `VENUES` (facts) + `REFERENCES`. `src/seed.js` — seeding,
  plus `schematicRoom()`, `GEOMETRY`, `DEMO_FILES`.
- `public/` — vanilla-JS SPA (`index.html`, `app.js`, `styles.css`). Uses **relative
  `/api` paths**, so it works unchanged when the Worker serves both API and assets.
- `test/api.test.js` — 12 passing end-to-end tests (the behavioral spec).

**Reuse verbatim in the Worker** (they're pure ESM, no `node:` deps):
`src/geometry.js`, `src/naming.js`, `src/errors.js`, and the constants in
`src/config.js` (`KNOWN_APPLICATIONS`, `VENUE_TYPES`). Also reuse `VENUES` from
`src/seed-data.js` and lift `schematicRoom`/`GEOMETRY`/`DEMO_FILES` from
`src/seed.js` for seeding.

**Rewrite for the Worker runtime:** `server.js` + `api.js` → one `fetch` handler;
`repo.js` + `db.js` → async D1; file storage → R2; `auth.js` timing-safe compare →
Web Crypto; `util.js` HTTP helpers → Response helpers.

Suggested layout: a new `venue-database/worker/` directory (`index.js`,
`repo.js`, `wrangler.toml`, `schema.sql`), importing the shared pure modules from
`../src/`.

---

## 1. Preserve this exact API surface

The SPA and tests depend on these. Same paths, methods, status codes, and JSON
shapes as the Node app (read `src/api.js` for the precise validation/messages).

Public:
- `GET  /api/meta` → `{ applications, venueTypes, maxUploadBytes, stats }`
- `GET  /api/venues?q=&country=&type=&limit=&offset=` → `{ venues, total, limit, offset }` (published only; search matches aliases)
- `GET  /api/venues/similar?name=&city=&country=` → `{ duplicates: [...] }`
- `POST /api/venues` → 201 venue, **or 409 `{ error, duplicates }`** unless `confirm_duplicate:true`
- `GET  /api/venues/:id` → venue + `files` + `aliases` (+ `has_geometry`)
- `GET  /api/venues/:id/model` → neutral geometry JSON (404 if none)
- `GET  /api/venues/:id/export?format=dxf|obj|json` → converted download (attachment)
- `POST|PUT /api/venues/:id/geometry` → requires `consent:true` (unless admin); validates via `normalizeModel`
- `POST /api/venues/:id/files` → **requires `consent:true`**; returns `{ ...file, uploadUrl }`
- `POST /api/venues/:id/references` → 201 reference (link, no bytes)
- `POST /api/venues/:id/fix-requests` → 201 `{ id, status, message }`
- `POST /api/files/:id/content` → stream bytes to R2, mark file `ready`
- `GET  /api/files/:id/content` → download (R2 stream); **reference** files 302 to `source_url`
- `GET  /api/files/:id` → file + `reviews`
- `GET  /api/files/:id/reviews` → `{ reviews }`
- `POST /api/files/:id/reviews` → 201 review (rating 1–5)

Admin (require `X-Admin-Token`, constant-time compare):
- `GET  /api/admin/overview`
- `GET  /api/admin/venues?q=&status=all`
- `PUT  /api/admin/venues/:id`
- `POST /api/admin/venues/:id/status` (`published|hidden|flagged`)
- `POST /api/admin/venues/:id/aliases`
- `DELETE /api/admin/venues/:id`
- `POST /api/admin/merge` (`{ source_id, target_id }`, transactional)
- `GET  /api/admin/fix-requests?status=open`
- `POST /api/admin/fix-requests/:id/resolve` (`{ status, admin_note }`)

CORS: `Access-Control-Allow-Origin: *`, methods `GET, POST, PUT, DELETE, OPTIONS`,
headers `Content-Type, X-Admin-Token`; answer `OPTIONS` with 204.

Error body shape: `{ error: "...", ...details }` (flatten `HttpError.details` so a
409 exposes `duplicates` at the top level — the SPA reads `err.body.duplicates`).

---

## 2. D1 schema (`worker/schema.sql`)

Same as `src/db.js`, minus the runtime migrations (start fresh). D1 is SQLite, so
this is a straight copy:

```sql
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
```

**Enable `PRAGMA foreign_keys=ON`** semantics: D1 enforces FKs; the `ON DELETE
CASCADE`/`SET NULL` above drive venue delete + merge cleanup, so keep them.

---

## 3. `wrangler.toml` (template)

```toml
name = "venuebridge"
main = "index.js"
compatibility_date = "2025-01-01"

# Serve the SPA in ../public and fall back to index.html for client routes.
[assets]
directory = "../public"
binding = "ASSETS"
not_found_handling = "single-page-application"

[[d1_databases]]
binding = "DB"
database_name = "venuebridge"
database_id = "<from: wrangler d1 create venuebridge>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "venuebridge-uploads"

[vars]
MAX_UPLOAD_BYTES = "104857600"   # 100 MB (see upload note in §4)
# ADMIN_TOKEN is a secret, not a var — set with `wrangler secret put ADMIN_TOKEN`
```

Static assets are served automatically; the Worker's `fetch` runs for non-asset
paths (i.e. `/api/*`). Handle `/api/*` yourself and, as a fallback, return
`env.ASSETS.fetch(request)`.

---

## 4. Runtime differences to handle (the gotchas)

- **Async everywhere.** D1 is async: `await env.DB.prepare(sql).bind(...).first()` /
  `.all()` (→ `{ results }`) / `.run()`. Port every `repo.js` function to `async`.
  So `api.js` handlers and their callers become `async`/`await`.
- **Transactions = `env.DB.batch([...])`.** D1 has no interactive `BEGIN/COMMIT`.
  Reimplement `mergeVenues` as a single `env.DB.batch([...])` of prepared
  statements (move files, move fix_requests, move aliases, conditionally copy
  geometry, insert the former-name alias, delete source). Compute the
  "copy geometry only if target has none" decision with reads first, then batch
  the writes.
- **IDs:** replace `newId(prefix)` with `` `${prefix}_${crypto.randomUUID().replace(/-/g,'')}` `` (Web Crypto `randomUUID` is available in Workers).
- **Admin auth:** no `crypto.timingSafeEqual`. Use a constant-time string compare:
  ```js
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }
  ```
  Token from `env.ADMIN_TOKEN`. If it's unset, **disable** admin (respond 503
  "admin not configured") — do NOT auto-generate one in the Worker.
- **Uploads → R2, streamed.** In `POST /api/files/:id/content`:
  `await env.BUCKET.put(fileId, request.body, { httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' } })`.
  The returned R2 object has `.size` — store that as `size_bytes`. Reject when
  `Content-Length` > `MAX_UPLOAD_BYTES` (Workers have ~128 MB memory; **do not
  buffer** the whole body — stream it). **sha256:** Web Crypto has no streaming
  digest, so either drop the `sha256` column for streamed uploads (simplest;
  document it) or use R2 multipart + hash client-side. Recommendation: skip
  server-side sha256 on Cloudflare and note the difference. Set `storage_path` to
  the R2 key (= fileId).
- **Downloads from R2:** `const obj = await env.BUCKET.get(fileId); return new Response(obj.body, { headers: { 'Content-Type': ..., 'Content-Disposition': 'attachment; filename="..."' } })`. `reference` files still 302 to `source_url` (no R2 fetch). On delete/merge, also delete R2 objects for removed files (`env.BUCKET.delete(key)`).
- **JSON responses:** small helper `json(obj, status=200, extraHeaders)` returning
  `new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } })`.
- **Request bodies:** `await request.json()` (guard for empty/invalid → 400).
- **`getGeometry` "venue missing vs no geometry"** distinction must survive
  (undefined → 404 "Venue not found"; null → 404 "no geometry yet").
- **Stats/visibility:** public listing & stats are `status='published'` only;
  admin listing passes `status=all`.

Everything else (validation rules, dedup threshold, DXF/OBJ output, name keys)
comes from the reused pure modules — don't reimplement it.

---

## 5. Seeding

Reuse `VENUES` from `src/seed-data.js` and `schematicRoom`/`GEOMETRY`/`DEMO_FILES`
from `src/seed.js`. Two options:

- **Preferred:** a one-shot admin endpoint `POST /api/admin/seed` (guarded by
  `X-Admin-Token`, no-op if `venues` already has rows) that inserts venues +
  geometry, writes the demo placeholder files to R2, and inserts their reviews.
  Call it once after deploy, then leave it in place (it self-guards).
- Or generate a `seed.sql` and `wrangler d1 execute venuebridge --file seed.sql`
  (note: demo file *bytes* still need an R2 `put`, so the endpoint is simpler).

Compute `name_key` (via `naming.nameKey`) for every seeded venue.

---

## 6. Deploy + verify (runbook)

```bash
cd venue-database/worker
npm i -D wrangler                       # or use npx

wrangler login
wrangler d1 create venuebridge          # paste database_id into wrangler.toml
wrangler r2 bucket create venuebridge-uploads
wrangler d1 execute venuebridge --remote --file schema.sql
wrangler secret put ADMIN_TOKEN         # paste a long random string

wrangler deploy                         # prints the workers.dev URL
# then seed:
curl -X POST https://<your-worker>.workers.dev/api/admin/seed -H "X-Admin-Token: <token>"
```

Verify against the Node behavioral spec (`test/api.test.js`) — hit the live URL:
- `GET /api/meta` returns stats; `GET /api/venues` lists seeded venues.
- `POST /api/venues` with a near-duplicate name → **409** with `duplicates`; add
  `confirm_duplicate:true` → **201**.
- Upload without `consent:true` → **422**; with it → 201 + `uploadUrl`; POST bytes;
  `GET /api/files/:id/content` returns the same bytes.
- `GET /api/venues/:id/export?format=dxf` returns a DXF (starts with `0\nSECTION`,
  ends `EOF`).
- `GET /api/admin/overview` → **401** without token, **200** with it.
- `POST /api/admin/merge` moves a file and creates a `former` alias; the old name
  is findable via `GET /api/venues?q=...`.
- Redeploy (`wrangler deploy`) and confirm data persists (that's the whole point).

Custom domain (optional, free): add a route to a Cloudflare-managed domain, or use
the `workers.dev` subdomain as-is.

---

## 7. Backups (free)

`wrangler d1 export venuebridge --remote --output backup-$(date +%F).sql` on a
schedule (a local cron, or a scheduled Worker committing to a private GitHub
repo). R2 objects can be mirrored with `rclone` to another free bucket if desired.

---

## 8. Acceptance criteria

- [ ] All routes in §1 work against the deployed Worker with identical
      status codes / JSON shapes to the Node app.
- [ ] Data (D1 + R2) persists across `wrangler deploy` redeploys.
- [ ] `consent` gate, dedup 409, aliases/merge, fix requests, admin token,
      hidden-venue filtering all behave per `test/api.test.js`.
- [ ] SPA loads at the root and client routes (`/#/venues/...`, `/#/admin`) work.
- [ ] `ADMIN_TOKEN` is a Wrangler secret; admin disabled if unset.
- [ ] The Node app under `src/` still runs (`npm start`) and `npm test` is green —
      it stays the reference implementation. Keep the pure modules shared, not forked.
- [ ] A short `worker/README.md` documents the deploy/seed/backup commands.

Notes / intentional differences from Node to record in `worker/README.md`:
server-side `sha256` may be omitted for R2-streamed uploads; admin token is not
auto-generated (disabled if unset); `MAX_UPLOAD_BYTES` defaults lower (100 MB) to
respect Worker limits.
```
