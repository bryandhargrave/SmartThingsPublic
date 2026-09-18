// Venue-name normalization and fuzzy matching, used to stop typos and spelling
// variants from creating duplicate venues. Pure functions — unit tested.

// A canonical key for a venue name: lowercased, accent-stripped, punctuation
// removed, common spelling variants unified. Deliberately conservative — it
// unifies spelling (theatre/theater) but does NOT drop type nouns like "arena"
// or "theater", so "X Arena" and "X Theatre" in the same city stay distinct.
export function nameKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/&/g, ' and ')
    .replace(/\btheatre\b/g, 'theater')
    .replace(/\bcentre\b/g, 'center')
    .replace(/\bamphitheatre\b/g, 'amphitheater')
    .replace(/\bhonour\b/g, 'honor')
    .replace(/[^a-z0-9]+/g, ' ')       // punctuation -> space
    .replace(/^\s*the\s+/, '')          // leading "the"
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein edit distance.
export function levenshtein(a, b) {
  a = a || ''; b = b || '';
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

// 0..1 similarity between two name keys (1 = identical).
export function similarity(aKey, bKey) {
  if (!aKey && !bKey) return 1;
  if (!aKey || !bKey) return 0;
  if (aKey === bKey) return 1;
  const max = Math.max(aKey.length, bKey.length);
  const ratio = 1 - levenshtein(aKey, bKey) / max;
  // Boost when one key fully contains the other (e.g. added/removed suffix).
  const contains = aKey.includes(bKey) || bKey.includes(aKey);
  return contains ? Math.max(ratio, 0.9) : ratio;
}

// Decide whether two venues are likely the same. Returns a score 0..1.
// Same-country + high name similarity is the strong signal; a matching city
// nudges it up, a conflicting city nudges it down.
export function duplicateScore(a, b) {
  const nameSim = similarity(a.name_key ?? nameKey(a.name), b.name_key ?? nameKey(b.name));
  let score = nameSim;
  const ca = (a.country || '').trim().toLowerCase();
  const cb = (b.country || '').trim().toLowerCase();
  if (ca && cb) score += ca === cb ? 0.02 : -0.15;
  const cia = (a.city || '').trim().toLowerCase();
  const cib = (b.city || '').trim().toLowerCase();
  if (cia && cib) score += cia === cib ? 0.05 : -0.08;
  return Math.max(0, Math.min(1, score));
}

export const DUPLICATE_THRESHOLD = 0.86;
