// The repo is public, so the seeded words stay generic: run with node --test m/*.test.mjs. The numbers are the items of
// design §11.3. Structural only: this file names no words to avoid and holds no hashes of them (that check runs at
// verification, outside the repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, TEMPLATES, CTO_TYPES, DOMAINS, PLACES, CORE, TRL_HINT } from './card.js';
import { projects, tasks } from './data.js';

// The keys that hold words a person reads.
const TEXT_KEYS = new Set(['name', 'hint', 'label', 'exit', 'what', 'forWhom', 'success', 'stopRule', 'title', 'notes', 'text', 'why', 'value']);

// Every string under a text key, the values of `hints`, and a stage definition's field labels (written as plain strings
// in `fields`). Other strings (ids, keys, colors, dates) are left out, and so are the values that are ids under a text
// key: a project's marks ('unknown' | 'classified') and a choice fact's value (one of its option ids).
function texts(x, out = [], key = null) {
  if (typeof x === 'string') {
    if (TEXT_KEYS.has(key)) out.push(x);
  } else if (Array.isArray(x)) {
    for (const v of x) {
      if (key === 'fields' && typeof v === 'string') out.push(v);
      else texts(v, out, TEXT_KEYS.has(key) ? key : null);
    }
  } else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (k === 'marks' || (k === 'value' && x.kind === 'choice')) continue;
      if (k === 'hints' && v && typeof v === 'object') Object.values(v).forEach((s) => typeof s === 'string' && out.push(s));
      else texts(v, out, k);
    }
  }
  return out;
}

const SAMPLES = ['p6', 'p7', 'p8'];
const sampleProjects = projects.filter((p) => SAMPLES.includes(p.id));
const sampleTasks = tasks.filter((t) => SAMPLES.includes(t.project));

// The Latin words the seeded text may use.
const ALLOWED = new Set(['TRL', 'G2G', 'MVP', 'Claude', 'AI']);
// One exception, older than the types: CORE's stop-rule hint, which moved here unchanged from m/views/projects.js. Its
// X and Y stand for "a date" and "a thing" (אם עד תאריך X לא קרה Y). Anywhere else they are stray words.
const STOP_HINT = CORE.find((c) => c.key === 'stopRule').hint;
const latin = (s) => (s === STOP_HINT ? s.replace(/\b[XY]\b/g, '') : s).match(/[A-Za-z][A-Za-z0-9]*/g) || [];

test('30 public text: every Latin word in the seeded types, places, domains and samples is an allowed one', () => {
  assert.equal(sampleProjects.length, 3);
  const all = [
    ...texts(STAGES),
    ...texts(TEMPLATES),
    ...texts(CTO_TYPES),
    ...texts(DOMAINS),
    ...texts(PLACES),
    ...texts(CORE),
    TRL_HINT,
    ...texts(sampleProjects),
    ...texts(sampleTasks),
  ];
  // The walk reaches what it should: the inline stages, the facts and their options, the hints, and the samples' fields.
  assert.ok(all.length > 150, `only ${all.length} strings collected`);
  assert.ok(CTO_TYPES.every((t) => all.includes(t.name) && all.includes(t.why)));
  assert.ok(CTO_TYPES.flatMap((t) => t.facts).flatMap((f) => f.options || []).every((o) => all.includes(o.label)));
  assert.ok(sampleTasks.length && sampleTasks.every((t) => all.includes(t.title)));
  assert.ok(all.includes(STOP_HINT));
  const stray = [...new Set(all.flatMap(latin))].filter((w) => !ALLOWED.has(w));
  assert.deepEqual(stray, []);
});

test('31 public text: the sample projects say they are samples', () => {
  for (const id of SAMPLES) {
    const p = projects.find((x) => x.id === id);
    assert.ok(p, id);
    assert.ok(p.name.includes('לדוגמה'), id);
  }
});
