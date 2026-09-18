// VenueBridge conversion engine.
//
// A venue's geometry is stored in an open, vendor-neutral model (plain JSON,
// metres). From that single source we convert to the interchange formats a tech
// actually imports into their prediction software:
//   - DXF  : universal CAD interchange; imported by ArrayCalc, Soundvision,
//            MAPP 3D, DISPLAY 3, Danley Direct, SketchUp (Pro), AutoCAD, ...
//   - OBJ  : universal 3D geometry.
//   - JSON : the neutral model itself.
//
// We deliberately do NOT transcode proprietary native project files
// (.dbpr/.svs/...) — those are undocumented/encrypted and rehosting or
// reverse-engineering them is not legal. Neutral geometry is the bridge: the
// tech imports it and builds the design in their own tool.
//
// Neutral model shape:
// {
//   "units": "meters",
//   "origin": { "lat": <num?>, "lng": <num?>, "note": "<string?>" },
//   "points":   [ { "label": "FOH", "x": 0, "y": 30, "z": 1.5 }, ... ],
//   "surfaces": [ { "name": "Main floor", "type": "audience",
//                   "vertices": [ [x,y,z], [x,y,z], [x,y,z], ... ] }, ... ]
// }
import { HttpError } from './errors.js';

const SURFACE_TYPES = new Set(['audience', 'stage', 'wall', 'ceiling', 'floor', 'structure', 'other']);

// Validate and normalise a raw geometry object. Throws HttpError(422) on bad input.
export function normalizeModel(raw) {
  if (!raw || typeof raw !== 'object') throw new HttpError(422, 'geometry must be an object');
  const surfaces = Array.isArray(raw.surfaces) ? raw.surfaces : [];
  const points = Array.isArray(raw.points) ? raw.points : [];
  if (surfaces.length === 0 && points.length === 0) {
    throw new HttpError(422, 'geometry must contain at least one surface or point');
  }

  const model = {
    units: 'meters',
    origin: {},
    points: [],
    surfaces: [],
  };

  if (raw.origin && typeof raw.origin === 'object') {
    const o = raw.origin;
    if (o.lat != null) model.origin.lat = assertNum(o.lat, 'origin.lat');
    if (o.lng != null) model.origin.lng = assertNum(o.lng, 'origin.lng');
    if (o.note != null) model.origin.note = String(o.note).slice(0, 500);
  }

  points.forEach((p, i) => {
    model.points.push({
      label: p.label != null ? String(p.label).slice(0, 120) : `P${i + 1}`,
      x: assertNum(p.x, `points[${i}].x`),
      y: assertNum(p.y, `points[${i}].y`),
      z: p.z != null ? assertNum(p.z, `points[${i}].z`) : 0,
    });
  });

  surfaces.forEach((s, i) => {
    const verts = Array.isArray(s.vertices) ? s.vertices : [];
    if (verts.length < 3) throw new HttpError(422, `surfaces[${i}] needs at least 3 vertices`);
    const vertices = verts.map((v, j) => {
      if (!Array.isArray(v) || v.length < 2) throw new HttpError(422, `surfaces[${i}].vertices[${j}] must be [x,y,z]`);
      return [
        assertNum(v[0], `surfaces[${i}].vertices[${j}][0]`),
        assertNum(v[1], `surfaces[${i}].vertices[${j}][1]`),
        v[2] != null ? assertNum(v[2], `surfaces[${i}].vertices[${j}][2]`) : 0,
      ];
    });
    const type = s.type && SURFACE_TYPES.has(String(s.type)) ? String(s.type) : 'other';
    model.surfaces.push({
      name: s.name != null ? String(s.name).slice(0, 120) : `Surface ${i + 1}`,
      type,
      vertices,
    });
  });

  return model;
}

function assertNum(v, field) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(422, `${field} must be a finite number`);
  return n;
}

// Trim trailing zeros for compact, stable numeric output.
function fmt(n) {
  return Number(n.toFixed(6)).toString();
}

// Fan-triangulate a polygon [v0, v1, ..., vn] -> [[v0,v1,v2],[v0,v2,v3],...].
function triangulate(vertices) {
  const tris = [];
  for (let i = 1; i < vertices.length - 1; i++) tris.push([vertices[0], vertices[i], vertices[i + 1]]);
  return tris;
}

// ---- DXF (R12 ASCII) -------------------------------------------------------

export function toDXF(model) {
  const out = [];
  const g = (code, value) => { out.push(String(code)); out.push(String(value)); };

  // Minimal HEADER: R12 + metre units, for broad importer compatibility.
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, 6); // 6 = metres
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'ENTITIES');

  for (const s of model.surfaces) {
    const layer = dxfLayer(`${s.type}_${s.name}`);
    for (const tri of triangulate(s.vertices)) {
      // 3DFACE: 4 corners; a triangle repeats the 3rd corner as the 4th.
      const [a, b, c] = tri;
      g(0, '3DFACE'); g(8, layer);
      g(10, fmt(a[0])); g(20, fmt(a[1])); g(30, fmt(a[2]));
      g(11, fmt(b[0])); g(21, fmt(b[1])); g(31, fmt(b[2]));
      g(12, fmt(c[0])); g(22, fmt(c[1])); g(32, fmt(c[2]));
      g(13, fmt(c[0])); g(23, fmt(c[1])); g(33, fmt(c[2]));
    }
  }

  for (const p of model.points) {
    g(0, 'POINT'); g(8, 'points');
    g(10, fmt(p.x)); g(20, fmt(p.y)); g(30, fmt(p.z));
    if (p.label) {
      g(0, 'TEXT'); g(8, 'labels');
      g(10, fmt(p.x)); g(20, fmt(p.y)); g(30, fmt(p.z));
      g(40, '0.5'); g(1, p.label);
    }
  }

  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}

function dxfLayer(name) {
  // DXF layer names must avoid a set of reserved characters.
  return (name || 'geometry').replace(/[<>/\\":;?*|=`,]/g, '_').slice(0, 255) || 'geometry';
}

// ---- Wavefront OBJ ---------------------------------------------------------

export function toOBJ(model) {
  const lines = ['# VenueBridge export', '# units: meters'];
  let vbase = 0;
  model.surfaces.forEach((s, i) => {
    lines.push(`o ${s.name.replace(/\s+/g, '_')}_${s.type}_${i + 1}`);
    for (const v of s.vertices) lines.push(`v ${fmt(v[0])} ${fmt(v[1])} ${fmt(v[2])}`);
    const idx = s.vertices.map((_, j) => vbase + j + 1);
    lines.push(`f ${idx.join(' ')}`);
    vbase += s.vertices.length;
  });
  if (model.points.length) {
    lines.push('o reference_points');
    for (const p of model.points) lines.push(`v ${fmt(p.x)} ${fmt(p.y)} ${fmt(p.z)}`);
  }
  return lines.join('\n') + '\n';
}

// ---- format registry -------------------------------------------------------

export const EXPORT_FORMATS = {
  dxf: { ext: 'dxf', contentType: 'application/dxf', convert: toDXF },
  obj: { ext: 'obj', contentType: 'text/plain; charset=utf-8', convert: toOBJ },
  json: { ext: 'json', contentType: 'application/json; charset=utf-8', convert: (m) => JSON.stringify(m, null, 2) + '\n' },
};
