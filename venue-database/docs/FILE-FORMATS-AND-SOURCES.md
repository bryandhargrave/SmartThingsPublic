# Audio design file formats & data sources

A reference for the Venue Database project: what design/prediction files the
major loudspeaker brands use, what is *actually* free to download, and the
licensing reality that shapes how this project handles files.

> **Verification note.** The tables below were compiled from research across the
> major brands. Several official vendor domains were unreachable during
> compilation, so file extensions marked *(unverified)* and **all license
> terms** should be confirmed against the vendor's current EULA / download page
> before relying on them. Treat this as a starting map, not legal advice.

---

## The bottom line (why we don't rehost brand files)

Across **every** major brand, the same picture holds:

- **Venue / room project files are proprietary and gated.** The venue libraries
  inside ArrayCalc, Soundvision, MAPP 3D, DISPLAY 3, Blueprint AV, NS-1, etc.
  are consumed *inside* the vendor's software (often behind a login). None are
  published as a free, redistributable dataset. **Re-hosting them would almost
  certainly infringe copyright and violate the software EULA.**
- **What the brands give away free** is (a) the **prediction software** itself
  and (b) **GLL loudspeaker data** (box data for AFMG EASE / EASE Focus). GLL is
  *not* a venue file — it describes a loudspeaker, not a room — and GLL files are
  AFMG-encrypted and signed "for use within AFMG software," with per-manufacturer
  redistribution terms that are typically *not* a grant to re-host.
- **A crowd-sourced venue corpus therefore has to be built, not scraped.** It
  grows from techs contributing designs **they own the rights to**, plus
  vendor-neutral geometry (DXF / SketchUp) and separately-licensed box data.

**Precedent:** NEXO already runs a public *NS-1 Venue File Submission* program
and a downloadable NS-1 venue library — direct evidence that a community venue
library is viable when the platform owner curates it.

### How this project handles files

1. **Uploads** — techs upload files **they have the right to share** (their own
   designs, or resources whose license permits redistribution). The upload form
   states this explicitly.
2. **External references** — official free resources are catalogued as **links
   with attribution and a license note** (the `reference` file type), never as
   rehosted binaries. The app redirects to the official source.
3. **Facts are free** — venue records (name, location, capacity, acoustic notes)
   are factual and are seeded/shared openly.

---

## Per-brand reference

Extensions marked *(unverified)* need confirmation against the vendor. "Free
downloads" lists what the vendor publishes without purchase (a login/registration
may still apply). "Redistribute?" is **verify** everywhere — none were confirmed
as re-hostable.

### Line-array / prediction ecosystems

| Brand | Prediction software (free) | Project / venue file ext. | Free downloads published | Redistribute? |
|---|---|---|---|---|
| **d&b audiotechnik** | ArrayCalc (+ R1, NoizCalc) | `.dbpr` project; `.dbacv` venue *(unverified)* | GLL/simulation data for EASE, spec sheets, CAD; ArrayCalc exports DXF/EASE | verify (EULA-gated) |
| **L-Acoustics** | Soundvision (+ Soundvision Connect) | `.svs` room/venue; `.xmlp` project *(unverified)* | Soundvision app (registration); GLL via EASE workflow | verify |
| **Meyer Sound** | MAPP 3D (was MAPP XT / Online) | native ext *(unverified)*; imports **DXF**, **SKP** | MAPP 3D app; GLL EASE data via AFMG signup | verify |
| **Martin Audio** | **DISPLAY 3** (+ VU-NET) | `.d3p` *(unverified)*; VU-NET `.vun` | DISPLAY 3 app; GLL for EASE/EASE Focus/CLF | verify |
| **Adamson** | Blueprint AV | project ext *(unverified)* | Blueprint AV installer; per-product GLL | verify |
| **NEXO** | NS-1 | `.nexo` / `.nexo3` project; `.nxv` venue | NS-1 app; **public venue-file submission + library**; GLL via EASE 5 | verify |
| **JBL / Harman** | Line Array Calculator III, Performance Manager, Venue Synthesis | `.LAC3` (legacy `.lac2`) | LAC app; EASE GLL data + EASE ADDRESS w/ JBL data | verify |
| **EAW** | Resolution / Resolution 2 | `.eawresolution` | Resolution app; EASE/GLL data (incl. ADAPTive) | verify |

### Acoustic modelling & others

| Brand / tool | Software | Project file ext. | Free downloads | Redistribute? |
|---|---|---|---|---|
| **AFMG EASE** | EASE Focus 3 (free), EASE 5 (paid) | `.fc3` (opens `.fc2`, `.efo`) | EASE Focus 3 + consolidated GLL database (~1.8 GB) | verify (GLLs AFMG-signed) |
| **Bose Professional** | Modeler (+ Auditioner) | `.pjt` *(moderate confidence)* | Modeler app (registration) | verify |
| **RCF / TT+ Audio** | RDNet, RDShape / Easy Shape Designer | — | RDNet (registered); GLL "v_25" per product page | verify |
| **Electro-Voice** | LAPS / LAPS II (Excel), PREVIEW | — | LAPS/PREVIEW; EV GLL data library | verify |
| **Danley Sound Labs** | Danley Direct | native ext *(unverified)*; imports DXF/AutoCAD, legacy DDT | Danley Direct app (SketchUp-based) | verify |

### About GLL (Generic Loudspeaker Library)

GLL is AFMG's loudspeaker box-data format (mechanical/electronic/acoustic
response, 20 Hz–20 kHz), **encrypted and AFMG-signed** for use inside EASE /
EASE Focus / EASE Address. A manufacturer pays AFMG to license its box types;
files are free to the end user but their **redistribution rights are reserved to
the manufacturer/AFMG**. GLLs are loudspeaker data, not venue files, so they are
outside this project's core scope — link to the official source rather than
re-host.

---

## Practical vendor-neutral interchange

When a design needs to be *shared* across ecosystems, the portable pieces are:

- **Room / stage geometry:** DXF (2D/3D) and SketchUp `.skp` — imported by most
  prediction tools (MAPP 3D, DISPLAY 3, Danley Direct, etc.).
- **Loudspeaker data:** GLL (within AFMG tools), where the vendor's terms permit.
- **Documentation:** PDF plots, coverage maps, spec sheets — safe to share when
  self-authored.

Uploaders should prefer contributing **their own** project files and geometry,
and **link** (not copy) to any vendor resource whose license they have not
confirmed as redistributable.
