'use strict';
// Declarative value scaling between vendor raw values and normalized values.
//
// scale:
//   { type: identity }
//   { type: linear, raw: [rmin, rmax], value: [vmin, vmax], rawMinSentinel?: n, round?: true }
//   { type: piecewise, points: [[raw, value], ...] }        (monotonic, linear interpolation)
//   { type: log, raw: [0, 1], value: [20, 20000] }           (raw linear <-> value logarithmic)
//   { type: bool, invert?: false, trueRaw?: 1, falseRaw?: 0 }
//   { type: enum, map: { rawKey: value, ... } }               (bidirectional lookup)
//   { type: string, maxLength?: n }
//   { type: int } | { type: float }

const EPS = 1e-9;

function lerp(x, x0, x1, y0, y1) {
  if (Math.abs(x1 - x0) < EPS) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

function clamp(x, a, b) { const lo = Math.min(a, b), hi = Math.max(a, b); return Math.min(hi, Math.max(lo, x)); }

function compile(scale, param = {}) {
  const s = scale || { type: 'identity' };
  switch (s.type || 'identity') {
    case 'identity': return { toValue: (r) => r, toRaw: (v) => v };
    case 'int': return { toValue: (r) => Math.round(Number(r)), toRaw: (v) => Math.round(Number(v)) };
    case 'float': return { toValue: (r) => Number(r), toRaw: (v) => Number(v) };
    case 'string': return {
      toValue: (r) => { const str = r === null || r === undefined ? '' : String(r); return s.trim === false ? str : str.trim(); },
      toRaw: (v) => { let str = v === null || v === undefined ? '' : String(v); if (s.maxLength) str = str.slice(0, s.maxLength); return str; },
    };
    case 'bool': {
      const t = s.trueRaw === undefined ? 1 : s.trueRaw;
      const f = s.falseRaw === undefined ? 0 : s.falseRaw;
      const inv = !!s.invert;
      return {
        toValue: (r) => { let b = typeof r === 'boolean' ? r : (typeof r === 'string' ? /^(1|true|on|yes)$/i.test(r) : Number(r) !== Number(f)); return inv ? !b : b; },
        toRaw: (v) => { let b = typeof v === 'boolean' ? v : (typeof v === 'string' ? /^(1|true|on|yes)$/i.test(v) : Number(v) !== 0); if (inv) b = !b; return b ? t : f; },
      };
    }
    case 'linear': {
      const [r0, r1] = s.raw, [v0, v1] = s.value;
      return {
        toValue: (r) => {
          r = Number(r);
          if (s.rawMinSentinel !== undefined && r <= s.rawMinSentinel) return Math.min(v0, v1);
          return clamp(lerp(r, r0, r1, v0, v1), v0, v1);
        },
        toRaw: (v) => {
          v = Number(v);
          if (!Number.isFinite(v)) v = v < 0 ? Math.min(v0, v1) : Math.max(v0, v1);
          let r = clamp(lerp(v, v0, v1, r0, r1), r0, r1);
          if (s.rawMinSentinel !== undefined && Math.abs(v - Math.min(v0, v1)) < EPS) r = s.rawMinSentinel;
          const wantRound = s.round === true || (s.round !== false && (param.deviceType === 'i' || param.deviceType === 'int'));
          return wantRound ? Math.round(r) : r;
        },
      };
    }
    case 'piecewise': {
      const pts = (s.points || []).map(([r, v]) => [Number(r), Number(v)]).sort((a, b) => a[0] - b[0]);
      if (pts.length < 2) throw new Error('piecewise scale needs >= 2 points');
      const vAsc = pts[pts.length - 1][1] >= pts[0][1];
      return {
        toValue: (r) => {
          r = Number(r);
          if (r <= pts[0][0]) return pts[0][1];
          if (r >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
          for (let i = 1; i < pts.length; i++) if (r <= pts[i][0]) return lerp(r, pts[i - 1][0], pts[i][0], pts[i - 1][1], pts[i][1]);
          return pts[pts.length - 1][1];
        },
        toRaw: (v) => {
          v = Number(v);
          if (!Number.isFinite(v)) v = v < 0 ? Math.min(pts[0][1], pts[pts.length - 1][1]) : Math.max(pts[0][1], pts[pts.length - 1][1]);
          const ordered = vAsc ? pts : [...pts].reverse();
          if (v <= ordered[0][1]) return ordered[0][0];
          if (v >= ordered[ordered.length - 1][1]) return ordered[ordered.length - 1][0];
          for (let i = 1; i < ordered.length; i++) if (v <= ordered[i][1]) { const r = lerp(v, ordered[i - 1][1], ordered[i][1], ordered[i - 1][0], ordered[i][0]); return s.round ? Math.round(r) : r; }
          return ordered[ordered.length - 1][0];
        },
      };
    }
    case 'log': {
      const [r0, r1] = s.raw, [v0, v1] = s.value;
      const l0 = Math.log(v0), l1 = Math.log(v1);
      return {
        toValue: (r) => Math.exp(lerp(clamp(Number(r), r0, r1), r0, r1, l0, l1)),
        toRaw: (v) => clamp(lerp(Math.log(clamp(Number(v), v0, v1)), l0, l1, r0, r1), r0, r1),
      };
    }
    case 'enum': {
      const fwd = new Map(), rev = new Map();
      for (const [k, v] of Object.entries(s.map || {})) {
        const key = /^-?\d+(\.\d+)?$/.test(k) ? Number(k) : k;
        fwd.set(String(key), v);
        if (!rev.has(String(v).toLowerCase())) rev.set(String(v).toLowerCase(), key);
      }
      return {
        toValue: (r) => (fwd.has(String(r)) ? fwd.get(String(r)) : (s.default !== undefined ? s.default : r)),
        toRaw: (v) => {
          const k = String(v).toLowerCase();
          if (rev.has(k)) return rev.get(k);
          if (fwd.has(String(v))) return /^-?\d+$/.test(String(v)) ? Number(v) : v; // already a raw key
          throw new Error(`enum: "${v}" is not a valid value (expected one of ${[...fwd.values()].join(', ')})`);
        },
        values: [...new Set(fwd.values())],
      };
    }
    default:
      throw new Error(`unknown scale type "${s.type}"`);
  }
}

module.exports = { compile, clamp, lerp };
