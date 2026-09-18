# 🎚️ Venue Database

An **open, free, ungated** database of concert venues and entertainment
facilities worldwide — crowd-sourced by audio system techs.

Think of the venue library inside **d&b ArrayCalc**, but public: anyone can
browse it, download from it, and contribute to it without an account or a
paywall. Techs upload the artifacts they actually work with — **ArrayCalc**,
**L-Acoustics Soundvision**, **Meyer MAPP 3D**, **EASE**, **GLL** data,
measurement exports — attached to a venue, and every file can be reviewed with
**star ratings and comments** so the community can tell a battle-tested design
from a first guess.

This repository contains a **working reference implementation** (a small
full-stack web app) plus the product/data model it's built on. It runs with
**zero external dependencies** — just Node.js.

> Status: MVP / v0.1. Runnable and tested, meant as a solid foundation to grow
> from. See [Roadmap](#roadmap).

---

## Why

Every touring and install engineer rebuilds the same venue geometry, rigging
points, trims and coverage designs over and over. Manufacturers ship venue
libraries, but they're tied to one ecosystem and one vendor. There's no neutral,
public place to answer: *"Has anyone got a good starting design for this room,
and did it actually work?"*

This project is that place — vendor-neutral, free, and community-governed.

## Features

- **Venues** with location (incl. GPS), type, capacity, website and free-form
  notes on acoustics/rigging quirks.
- **File uploads** attached to a venue, tagged with the source application and
  version. Binary-safe — any project format is stored byte-for-byte, with a
  SHA-256 recorded for integrity.
- **External references** — catalog an officially-free resource as a link (with
  attribution + license note) instead of rehosting a proprietary binary.
- **Star ratings + comments** on every file, with rolled-up averages shown per
  file and per venue.
- **Search & filter** by name, city, country and venue type.
- **Open JSON API** with permissive CORS, so other tools can build on the data.
- **No accounts, no gate** — read and contribute freely. (Attribution name is
  optional and self-reported.)

## Quick start

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`; no `npm install`
needed).

```bash
cd venue-database
npm run seed     # optional: load a few example venues
npm start        # serves http://localhost:4000
```

Then open <http://localhost:4000>.

Run the tests:

```bash
npm test
```

### Configuration (environment variables)

| Variable              | Default            | Purpose                          |
| --------------------- | ------------------ | -------------------------------- |
| `PORT`                | `4000`             | HTTP port                        |
| `HOST`                | `0.0.0.0`          | Bind address                     |
| `VDB_DATA_DIR`        | `./data`           | Where the SQLite DB + uploads go |
| `VDB_DB_PATH`         | `<data>/venuedb.sqlite` | SQLite file path            |
| `VDB_MAX_UPLOAD_BYTES`| `262144000` (250MB)| Per-file upload limit            |

## API

All responses are JSON. Base path `/api`.

| Method & path                         | Description                                   |
| ------------------------------------- | --------------------------------------------- |
| `GET  /api/meta`                      | App config (app list, venue types) + stats    |
| `GET  /api/venues?q=&country=&type=`  | Search / list venues (with rollup counts)     |
| `POST /api/venues`                    | Create a venue                                |
| `GET  /api/venues/:id`                | Venue detail incl. its files                  |
| `POST /api/venues/:id/files`          | Create file metadata → returns `uploadUrl`    |
| `POST /api/venues/:id/references`     | Catalog an external resource by link          |
| `POST /api/files/:id/content`         | Upload the raw file bytes (any content-type)  |
| `GET  /api/files/:id`                 | File metadata incl. its reviews               |
| `GET  /api/files/:id/content`         | Download the file                             |
| `GET  /api/files/:id/reviews`         | List reviews for a file                       |
| `POST /api/files/:id/reviews`         | Add a review `{ rating 1-5, comment, name }`  |

**Uploading is two steps** (keeps it binary-safe and dependency-free): create
the file record with JSON metadata, then POST the raw bytes to the `uploadUrl`
it returns.

```bash
# 1. create metadata
FID=$(curl -s -X POST localhost:4000/api/venues/VEN_ID/files \
  -H 'Content-Type: application/json' \
  -d '{"filename":"main_pa.dbpro","application":"ArrayCalc","app_version":"11.2"}' \
  | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)

# 2. upload the bytes
curl -s -X POST "localhost:4000/api/files/$FID/content" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @main_pa.dbpro
```

## Architecture

```
venue-database/
├── src/
│   ├── config.js   # env-driven config, known apps & venue types
│   ├── db.js       # node:sqlite bootstrap + schema/migrations
│   ├── repo.js     # data-access layer (all SQL lives here)
│   ├── api.js      # JSON handlers + upload/download streaming, route table
│   ├── server.js   # http server, static serving, SPA fallback, CORS
│   └── seed.js     # sample data
├── public/         # vanilla-JS single-page frontend (no build step)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── test/api.test.js
└── data/           # generated at runtime (git-ignored): DB + uploaded files
```

**Design choices**

- **No dependencies.** Built entirely on Node's standard library (`node:http`,
  `node:sqlite`, `node:crypto`, `node:stream`). Nothing to `npm install`,
  nothing to audit, trivial to self-host.
- **Files on disk, metadata in SQLite.** Uploads stream straight to disk under
  `data/uploads/<file-id>` so large project files never sit in memory; the DB
  holds metadata, SHA-256 and review data.
- **Data layer is isolated** (`repo.js`) so moving to Postgres/S3 for a
  production deployment is a contained change.

## Openness & licensing

The project is deliberately built to *stay* open:

- **Source code** — [MIT](LICENSE). Use it, host it, fork it.
- **Contributed venue data & files** — intended to be shared under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), so the
  commons stays a commons: anyone can reuse it, derivatives stay open, and
  contributors are credited.

> **Considering stronger copyleft?** If you run this as a public service and
> want to guarantee downstream hosts also share their improvements, relicensing
> the code under **AGPL-3.0** is a good option. MIT is the default here to keep
> adoption frictionless.

**Contributor responsibility:** only upload files you have the right to share.
Manufacturer venue libraries and client-confidential designs may be restricted —
when in doubt, upload your *own* work.

## Seeding & where files come from

`npm run seed` loads ~30 real, notable venues worldwide (factual public data:
name, location, capacity, acoustic notes) plus a couple of clearly-labelled
*demo* files so the ratings/reviews UI has something to show.

It deliberately does **not** pre-stock the database with manufacturer venue
files. Research across every major brand (d&b, L-Acoustics, Meyer, Martin Audio,
Adamson, NEXO, JBL/Harman, EAW, Bose, RCF, EV, Danley…) confirmed that **no brand
publishes a freely-redistributable venue/room project corpus** — those libraries
live inside proprietary software behind logins, and rehosting them would infringe.
What the brands publish free is the *prediction software* and *GLL loudspeaker
box data* (AFMG-signed, "for use within AFMG software"), neither of which is a
redistributable venue file.

So the catalog grows the way NEXO's own *NS-1 Venue File Submission* program does:
techs contribute designs **they own**, plus curated **links** to official free
resources. See **[docs/FILE-FORMATS-AND-SOURCES.md](docs/FILE-FORMATS-AND-SOURCES.md)**
for the per-brand breakdown of software, file extensions, free downloads and
licensing — a map for what can and can't be shared.

## Moderation & abuse

The MVP is intentionally open. Before a public launch you'll want:

- Basic rate limiting on writes (uploads/reviews).
- A lightweight report/flag flow and a moderation queue (the `files.status`
  column already anticipates a `flagged` state).
- Optional lightweight identity (email or OAuth) to deter spam *without*
  gating reads or downloads.
- Virus scanning of uploads and content-type/extension allow-listing.

These are called out rather than hidden — see the roadmap.

## Roadmap

- [x] External-reference entries (link to official free resources, don't rehost).
- [x] Seed dataset of ~30 real venues + per-brand file-format/source reference.
- [ ] Map view of venues (Leaflet + the stored lat/lng).
- [ ] Venue edit history / versioning and file versions.
- [ ] Report/flag + moderation queue and rate limiting.
- [ ] Optional accounts (contributions stay ungated for reading).
- [ ] Richer venue metadata: rigging points, power, stage dimensions, house PA.
- [ ] Thumbnails/preview for supported formats.
- [ ] Bulk export of the open dataset (CC BY-SA data dump).
- [ ] Full-text search (SQLite FTS5) as the catalog grows.

## Contributing

This is an early foundation — issues and PRs welcome. Keep the core dependency-free
where practical, and keep reads/downloads ungated.
