# VenueBridge — vision & the conversion engine

**The problem.** A tech picks up a gig at a room they've never worked. They open
their prediction software (ArrayCalc, Soundvision, MAPP 3D, DISPLAY 3, …) and
there's no venue file for it. Building the room geometry from scratch — audience
planes, trims, structures, rigging — eats hours before any design work starts.

**VenueBridge** is the bridge across that gap: a public place to find a venue,
grab its geometry, and get it into *whatever tool you use*.

## Why "bridge" and not "file locker"

The obvious idea — host everyone's native project files and let people download
the one for their gig — runs straight into a wall we verified brand by brand
(see [FILE-FORMATS-AND-SOURCES.md](FILE-FORMATS-AND-SOURCES.md)):

- Native venue files (`.dbpr`/`.dbacv`, `.svs`, MAPP, DISPLAY 3, NS-1 `.nxv`, …)
  are **proprietary, undocumented, often encrypted**, and live inside licensed
  software. Rehosting them, or reverse-engineering a transcoder between them, is
  not legal and not maintainable.
- So a straight "ArrayCalc file → Soundvision file" converter is a dead end.

The insight: **the reusable, convertible asset is the room geometry, not the
vendor file.** Every major prediction tool *imports* neutral CAD/3D geometry
(DXF, and 3D formats). If VenueBridge stores each venue as an **open, neutral
geometry model** and converts *that* to the format a tech needs, they import it
and finish the design in their own software — no proprietary format ever touched.

```
                      ┌─────────────────────────┐
  contributed  ─────► │  Open neutral geometry  │ ─────► DXF  ─► ArrayCalc / Soundvision /
  geometry           │  model (JSON, metres)    │       OBJ  ─►  MAPP 3D / DISPLAY 3 /
  (draw / DXF / SKP) └─────────────────────────┘       JSON ─►  Danley Direct / SketchUp …
                          the "bridge"                  (more formats over time)
```

## What ships today (v0.1 of the engine)

- **Neutral model** — a plain-JSON room description in metres: `surfaces`
  (typed polygons: audience / stage / wall / structure / …) and named `points`
  (FOH, rigging, stage centre), with an optional geo `origin`.
- **Converters** (`src/geometry.js`, zero-dependency, pure functions):
  - **DXF** (R12 ASCII, metre units) — the universal interchange; imported by
    ArrayCalc, Soundvision, MAPP 3D, DISPLAY 3, Danley Direct, **SketchUp Pro**,
    AutoCAD, and more.
  - **OBJ** — universal 3D geometry.
  - **JSON** — the neutral model itself.
- **API**
  - `PUT /api/venues/:id/geometry` — store/replace the model (validated).
  - `GET /api/venues/:id/model` — the neutral model.
  - `GET /api/venues/:id/export?format=dxf|obj|json` — converted download.
- **UI** — venues with a model show a **"Get a venue file"** panel with one-click
  format downloads.

## On SketchUp (`.skp`)

`.skp` is a proprietary binary format with no open writer, so we don't emit it
directly. **SketchUp Pro imports DXF/DWG** (and COLLADA), so the DXF export is
the supported path into SketchUp today. A native **COLLADA `.dae`** exporter
(SketchUp-native import, also NS-1) is the next format on the roadmap.

## Roadmap for the engine

- [ ] **COLLADA `.dae`** and **glTF** exporters (SketchUp-native import, web 3D).
- [ ] **Ingest** DXF / SketchUp / `.skp`-exported geometry into the neutral model
      (so contributors can upload a drawing instead of hand-authoring JSON).
- [ ] In-browser geometry editor / 3D preview of the model.
- [ ] Rigging points, trims, delay positions and audience-plane rake as
      first-class typed elements (not just polygons).
- [ ] Per-format unit and axis-convention options (Z-up vs Y-up, mm vs m).
- [ ] Provenance on each model: surveyed vs schematic, who verified it, when.

## Honest limits

- Seeded geometry is **schematic**, not surveyed — a labelled starting point to
  refine, never a substitute for measuring the room.
- Neutral geometry carries the *room*, not a *design*: speaker positions, presets
  and predictions stay in the tech's own software (and their licensed box data).
- DXF/OBJ correctness is covered by tests, but real-world importer quirks vary —
  field feedback (via the review system) is how each venue's model earns trust.
