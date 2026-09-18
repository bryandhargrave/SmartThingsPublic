# VenueBridge on Cloudflare (Workers + D1 + R2)

A single Worker serves the JSON API **and** the static SPA in `../public`.
Data lives in **D1** (SQLite); uploaded file bytes live in **R2**. All on free
tiers, persistent across deploys, no server to manage.

The Node app in `../src` stays the runnable reference (`npm test`). The pure
logic (`geometry.js`, `naming.js`, `errors.js`) and the shared data/validators
(`catalog.js`, `validate.js`, `seed-data.js`, `seed-fixtures.js`) are imported
from `../src` — not forked — so both runtimes stay in lockstep.

## Layout

- `index.js` — the `fetch` handler: routing, CORS, admin auth, R2 upload/download,
  error flattening, the SPA fallback (`env.ASSETS.fetch`), and `POST /api/admin/seed`.
- `repo.js` — all SQL, ported to async D1 (`prepare/bind/first/all/run`, `batch()`
  for the transactional merge).
- `schema.sql` — D1 schema (mirrors `../src/db.js`).
- `wrangler.toml` — bindings: `ASSETS`, `DB` (D1), `BUCKET` (R2), `MAX_UPLOAD_BYTES`.

## Deploy (one time)

```bash
cd venue-database/worker
npm install                                   # installs wrangler locally (or use npx)

npx wrangler login                            # once per machine
npx wrangler d1 create venuebridge            # copy the printed database_id into wrangler.toml
npx wrangler r2 bucket create venuebridge-uploads
npx wrangler d1 execute venuebridge --remote --file schema.sql
npx wrangler secret put ADMIN_TOKEN           # paste a long random string

npx wrangler deploy                           # prints the https://venuebridge.<subdomain>.workers.dev URL
```

Then seed once (self-guarding — safe to call again, it no-ops):

```bash
curl -X POST https://<your-worker>.workers.dev/api/admin/seed -H "X-Admin-Token: <token>"
```

## Redeploy

```bash
npx wrangler deploy
```

D1 + R2 data persist across redeploys — that's the point.

## Backups (free)

```bash
npx wrangler d1 export venuebridge --remote --output backup-$(date +%F).sql
```

R2 objects can be mirrored to another bucket with `rclone` if desired.

## Intentional differences from the Node app

- **`sha256` is omitted for uploaded files.** Web Crypto has no streaming digest
  and we stream the body straight to R2 without buffering (Workers have ~128 MB
  memory), so `files.sha256` is `null` on Cloudflare. The Node app still computes it.
- **Admin token is never auto-generated.** `ADMIN_TOKEN` is a Wrangler secret; if
  it is unset, all admin endpoints return **503** (admin disabled). The Node dev
  server, by contrast, generates a throwaway token when unset.
- **`MAX_UPLOAD_BYTES` defaults to 100 MB** (vs 250 MB in Node) to respect Worker
  limits. Override via the `[vars]` entry in `wrangler.toml`.

Everything else — API paths, methods, status codes, JSON shapes, validation, the
consent gate, dedup (409 + `confirm_duplicate`), aliases/merge, fix requests,
hidden-venue filtering, and DXF/OBJ/JSON export — matches `../src` and the
behavioral spec in `../test/api.test.js`.
