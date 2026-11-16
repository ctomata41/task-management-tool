// The בלמ״ס guard. Classified information never enters the tool, so before anything is saved its text is checked,
// in the browser, against the team's sensitive-word list. The list itself is stored only as SHA-256 fingerprints,
// so the words cannot be read back from the database, and the checked text is never sent anywhere for the check.

const SALT = 'cto-blms:';
const PREFIXES = 'והבכלמש';

// Lower-case, no niqqud, no quote marks (צה"ל = צהל), words separated by single spaces.
export function normalize(text) {
  return (text || '').toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'`׳״]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const cache = new Map();
async function sha(s) {
  if (cache.has(s)) return cache.get(s);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + s));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  cache.set(s, hex);
  return hex;
}

export async function fingerprint(word) {
  const w = normalize(word);
  return w ? sha(w) : null;
}

// A Hebrew word can carry up to two prefix letters (ו, ה, ב, כ, ל, מ, ש), so "ובמבצע" is checked as "במבצע" and "מבצע" too.
function variants(w) {
  const out = [w];
  if (w.length > 2 && PREFIXES.includes(w[0])) out.push(w.slice(1));
  if (w.length > 3 && PREFIXES.includes(w[0]) && PREFIXES.includes(w[1])) out.push(w.slice(2));
  return out;
}

function candidates(text) {
  const words = normalize(text).split(' ').filter(Boolean);
  const out = new Set();
  words.forEach((w, i) => {
    const vs = variants(w);
    vs.forEach((v) => out.add(v));
    // Terms of two or three words: only the first word can carry a prefix.
    if (words[i + 1]) vs.forEach((v) => out.add(v + ' ' + words[i + 1]));
    if (words[i + 2]) vs.forEach((v) => out.add(v + ' ' + words[i + 1] + ' ' + words[i + 2]));
  });
  return [...out];
}

// Collect every string in a value: plain fields, and the labels inside a decision's options or a project's milestones.
export function textsIn(value, acc = []) {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => textsIn(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => textsIn(v, acc));
  return acc;
}

// How many listed words or terms appear in the text (0 = clean).
export async function sensitiveHits(text, hashes) {
  if (!hashes || !hashes.length || !text || !text.trim()) return 0;
  if (!(typeof crypto !== 'undefined' && crypto.subtle)) return 0;
  const set = new Set(hashes);
  const found = new Set();
  for (const c of candidates(text)) {
    const h = await sha(c);
    if (set.has(h)) found.add(h);
  }
  return found.size;
}
