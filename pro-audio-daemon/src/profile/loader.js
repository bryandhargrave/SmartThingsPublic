'use strict';
// Loads declarative driver profiles (YAML or JSON) and expands {placeholders}
// into concrete parameter definitions.
//
// Profile format (see profiles/*.yaml):
//   id, name, vendor, models[], transport{...}, ranges{ name: {from,to,pad?,offset?,labels?} },
//   parameters[ { path, device, type, unit?, range?, scale?, access?, role?, description?, deviceType?, step? } ]
//
// Placeholders: {ch} -> padded 1-based index, {ch0} -> zero-based unpadded, {ch1} -> 1-based unpadded,
//               {ch:hex} -> hex, {ch:label} -> label from ranges.<name>.labels

const fs = require('fs');
const path = require('path');
const yaml = require('../util/yaml');
const scaling = require('./scaling');

const VALID_TYPES = new Set(['float', 'int', 'bool', 'string', 'color', 'enum']);
const OSC_TYPE_FOR = { float: 'f', int: 'i', bool: 'T', string: 's', color: 's', enum: 's' };

function loadProfileFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const doc = file.endsWith('.json') ? JSON.parse(text) : yaml.parse(text);
  return normalizeProfile(doc, file);
}

function loadProfileDir(dir) {
  const out = new Map();
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.(ya?ml|json)$/.test(f)) continue;
    const p = loadProfileFile(path.join(dir, f));
    if (out.has(p.id)) throw new Error(`duplicate profile id "${p.id}" (${f})`);
    out.set(p.id, p);
  }
  return out;
}

function normalizeProfile(doc, source = '<inline>') {
  const errors = [];
  if (!doc || typeof doc !== 'object') throw new Error(`${source}: profile must be a mapping`);
  if (!doc.id || !/^[a-z0-9][a-z0-9-]*$/.test(doc.id)) errors.push('id is required and must be kebab-case');
  if (!doc.transport || !doc.transport.type) errors.push('transport.type is required');
  if (!Array.isArray(doc.parameters) || doc.parameters.length === 0) errors.push('parameters must be a non-empty list');
  const ranges = doc.ranges || {};
  for (const [name, r] of Object.entries(ranges)) {
    if (!r || typeof r.from !== 'number' || typeof r.to !== 'number') errors.push(`ranges.${name} needs numeric from/to`);
  }
  (doc.parameters || []).forEach((p, i) => {
    const where = `parameters[${i}]${p && p.path ? ` (${p.path})` : ''}`;
    if (!p || typeof p.path !== 'string' || !p.path.startsWith('/')) errors.push(`${where}: path must start with /`);
    if (p && p.device === undefined) errors.push(`${where}: device (vendor address) is required`);
    if (p && !VALID_TYPES.has(p.type)) errors.push(`${where}: type must be one of ${[...VALID_TYPES].join(', ')}`);
    if (p && p.access && !/^(r|w|rw)$/.test(p.access)) errors.push(`${where}: access must be r, w or rw`);
    if (p && p.range && (!Array.isArray(p.range) || p.range.length !== 2)) errors.push(`${where}: range must be [min, max]`);
    for (const m of String(p && p.path || '').matchAll(/\{([a-zA-Z_]+)[^}]*\}/g)) {
      if (!ranges[m[1]]) errors.push(`${where}: placeholder {${m[1]}} has no entry in ranges`);
    }
    try { scaling.compile(p && p.scale, p || {}); } catch (e) { errors.push(`${where}: ${e.message}`); }
  });
  if (errors.length) throw new Error(`${source}: invalid profile:\n  - ${errors.join('\n  - ')}`);
  return {
    id: doc.id,
    name: doc.name || doc.id,
    vendor: doc.vendor || '',
    models: doc.models || [],
    verified: doc.verified !== false,
    notes: doc.notes || '',
    transport: doc.transport,
    ranges,
    parameters: doc.parameters,
    source,
  };
}

function placeholderNames(str) {
  const names = new Set();
  for (const m of String(str).matchAll(/\{([a-zA-Z_]+)(?::[a-z]+|0|1)?\}/g)) names.add(m[1]);
  return [...names];
}

function renderPlaceholders(str, ranges, indices) {
  if (typeof str !== 'string') {
    if (Array.isArray(str)) return str.map((x) => renderPlaceholders(x, ranges, indices));
    if (str && typeof str === 'object') { const o = {}; for (const [k, v] of Object.entries(str)) o[k] = renderPlaceholders(v, ranges, indices); return o; }
    return str;
  }
  const out = str.replace(/\{([a-zA-Z_]+)(0|1|:[a-z]+)?\}/g, (m, name, mod) => {
    if (!(name in indices)) return m;
    const r = ranges[name];
    const n = indices[name];
    const offset = r.offset || 0;
    if (mod === '0') return String(n - 1 + offset);
    if (mod === '1') return String(n + offset);
    if (mod === ':hex') return (n - 1 + offset).toString(16);
    if (mod === ':label') return (r.labels && r.labels[n - 1]) || String(n);
    const pad = r.pad || 0;
    return String(n + offset).padStart(pad, '0');
  });
  // A whole-string numeric template like "{ch0}" becomes a number so MIDI/int addresses stay numeric.
  if (/^\{[a-zA-Z_]+(0|1)\}$/.test(str) && /^-?\d+$/.test(out)) return Number(out);
  return out;
}

/**
 * Expand a profile into concrete parameter definitions.
 * Returns array of { path, device, type, oscType, deviceType, unit, range, access, role, description, scale (compiled), scaleDef, indices, template }
 */
function expandParameters(profile) {
  const defs = [];
  for (const p of profile.parameters) {
    const names = placeholderNames(p.path);
    const combos = cartesian(names.map((n) => {
      const r = profile.ranges[n];
      const arr = [];
      for (let i = r.from; i <= r.to; i++) arr.push(i);
      return arr;
    }));
    for (const combo of combos) {
      const indices = {};
      names.forEach((n, i) => { indices[n] = combo[i]; });
      const def = {
        path: renderPlaceholders(p.path, profile.ranges, indices),
        device: renderPlaceholders(p.device, profile.ranges, indices),
        type: p.type,
        oscType: p.type === 'int' ? 'i' : p.type === 'float' ? 'f' : p.type === 'bool' ? 'T' : 's',
        deviceType: p.deviceType || defaultDeviceType(p),
        unit: p.unit || null,
        range: p.range || null,
        step: p.step || null,
        access: p.access || 'rw',
        role: p.role || null,
        description: p.description ? renderPlaceholders(p.description, profile.ranges, indices) : '',
        scaleDef: p.scale || { type: 'identity' },
        scale: scaling.compile(p.scale, p),
        indices,
        template: p.path,
        poll: p.poll === undefined ? true : !!p.poll,
        extra: p.extra || null,
      };
      defs.push(def);
    }
  }
  return defs;
}

function defaultDeviceType(p) {
  if (p.scale && p.scale.type === 'bool') return 'i';
  if (p.scale && p.scale.type === 'enum') return 'i';
  return OSC_TYPE_FOR[p.type] || 's';
}

function cartesian(lists) {
  if (lists.length === 0) return [[]];
  return lists.reduce((acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])), [[]]);
}

module.exports = { loadProfileFile, loadProfileDir, normalizeProfile, expandParameters, renderPlaceholders, placeholderNames };
