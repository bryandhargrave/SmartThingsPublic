# Data quality, moderation & maintenance

How VenueBridge keeps the catalog clean and gives the owner easy control.

## Contribution consent (tick box)

Files never enter the database without the contributor affirming they have the
right to share them. The upload form has a required checkbox, and the API
rejects any file (`POST /api/venues/:id/files`) or geometry submission
(`PUT /api/venues/:id/geometry`) that doesn't set `consent: true`. The consent
flag is stored on each file. Admin-made changes are exempt from the geometry
consent gate.

## Duplicate prevention

Typos and spelling variants shouldn't spawn duplicate venues.

- Every venue gets a canonical **name key** (`src/naming.js`): lowercased,
  accent-stripped, punctuation-removed, with spelling variants unified
  (`theatre`→`theater`, `centre`→`center`, …). It's deliberately conservative —
  it does *not* drop type nouns, so "X Arena" and "X Theatre" stay distinct.
- On submit, the API compares the candidate against existing venues with a
  Levenshtein-based similarity, weighted by matching city/country
  (`duplicateScore`, threshold `0.86`). Likely matches return **HTTP 409** with a
  `duplicates` list; the Add-venue form shows them and offers "Add anyway"
  (`confirm_duplicate: true`).
- `GET /api/venues/similar?name=&city=&country=` powers a live warning.

## Aliases & name changes

Venues carry alternate/former names in `venue_aliases`. Search matches aliases,
so a venue found under its old name still surfaces. When a venue is renamed, add
the old name as an alias (kind `former`); when two records are the same place,
**merge** them.

**Merge** (`POST /api/admin/merge`, admin only) folds a *source* venue into a
*target*: it moves the source's files, open fix requests and aliases, copies its
geometry if the target has none, records the source name as a `former` alias, and
deletes the source — all in one transaction.

## Fix requests

Anyone can flag a problem from a venue page (no account needed):
`POST /api/venues/:id/fix-requests` with a `type`
(`correction` | `name_change` | `duplicate` | `other`), a `message`, and optional
reporter name/contact. Requests land in the admin queue as `open`.

## Maintenance / admin

A token-protected panel at **`/admin`** (link in the site footer). Set the token
with the **`ADMIN_TOKEN`** environment variable; if unset, a random dev token is
generated and printed to the server log at startup (it changes each restart —
set `ADMIN_TOKEN` for anything real). Admin requests send it as the
`X-Admin-Token` header, compared in constant time; if `ADMIN_TOKEN` is unset the
panel still works in dev with the generated token.

From the panel the owner can:

- see an overview (venue count, hidden/flagged, open reports, files);
- triage open fix requests — mark **resolved** or **dismissed** with a note;
- search **all** venues (including hidden) and per venue: **edit** core fields,
  **add an alias**, **hide/publish** (hidden venues drop out of public listings
  and stats), or **delete** (cascades files/reviews/aliases);
- **merge** duplicate venues by ID.

### Admin API (all require `X-Admin-Token`)

| Method & path | Purpose |
|---|---|
| `GET  /api/admin/overview` | Dashboard counts |
| `GET  /api/admin/venues?q=&status=` | Search venues incl. hidden |
| `PUT  /api/admin/venues/:id` | Edit venue fields |
| `POST /api/admin/venues/:id/status` | `published` \| `hidden` \| `flagged` |
| `POST /api/admin/venues/:id/aliases` | Add an alias |
| `DELETE /api/admin/venues/:id` | Delete a venue |
| `POST /api/admin/merge` | Merge `source_id` → `target_id` |
| `GET  /api/admin/fix-requests?status=` | List fix requests |
| `POST /api/admin/fix-requests/:id/resolve` | Resolve/dismiss with a note |

## Still open before a public launch

- Rate limiting on writes (uploads/reviews/fix-requests).
- Optional lightweight accounts (reads/downloads stay ungated) to attribute and
  throttle contributions.
- Upload virus scanning / content-type allow-listing.
- Audit log of admin actions.
