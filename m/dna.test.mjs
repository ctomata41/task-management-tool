// The project types (their DNA), places, who sees what and the path rules, run with: node --test m/*.test.mjs
// The numbers are the items of design §11.1. At the end, the store's rules for them (m/store.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import {
  STAGES, TEMPLATES, CTO_TYPES, EMPTY_LIB, PLACES, LOCKED_LINE_SHOWS_STAGE, library, typeById, openTypes, typeStages,
  stageLibrary, gateCount, classifiedLabels, checkTypePatch, newProjectParts, retypeParts, linkedBdtPreset, suggest, stagesFromType,
  stagesFromTemplate, canMoveStage, canSkipStage, canRemoveStage, canUnskipStage, canSetGate, gateRule, stageRule, stagesAfter, makeStage,
  placeRule, placeOf, levelOf, isRestricted, sees, levelEffects, cardFill, stageDays, schedule, daysBetween, nextLink, briefLine, briefParts,
  inValley, handBack, whoSees, lockedWhere, status, placeRefusal, typeFitWhy, domainTitle, domainName, PYRAMID_ORDER, DOMAINS,
} from './card.js';
import * as data from './data.js';

const R = PLACES.both.level; // the closed level, read from the model (no literal level names in tests)
const clone = (x) => JSON.parse(JSON.stringify(x));
const L0 = library(EMPTY_LIB);
const T = (id, L = L0) => typeById(L, id);

test('1 library: overrides, team types, hidden types, memo, code-only keys, broken overrides', () => {
  const lib = {
    v: 1,
    log: [],
    types: {
      block: { name: 'אבן בניין', stages: ['scope'], id: 'other', places: ['here'], link: 'next', cto: false },
      team1: { team: true, name: 'סוג של הצוות', stages: [{ key: 'k1', name: 'שלב', gate: 'manager', days: 10, fields: ['שדה'] }] },
      study: { hidden: true },
      tool: { stages: [{ key: 'kx', name: 'שבור', gate: 'x', days: 9999, fields: 7 }], trlTarget: 99, domain: 'nowhere', place: 'mars' },
      nameless: { team: true },
    },
  };
  const L = library(lib);
  const block = T('block', L);
  assert.equal(block.name, 'אבן בניין');
  assert.deepEqual(typeStages(block).map((s) => s.key), ['scope']);
  // id, places, link and cto come from the code
  assert.equal(block.id, 'block');
  assert.deepEqual(block.places, ['here', 'both', 'there']);
  assert.equal(block.link, undefined);
  assert.equal(block.cto, true);
  // a team type is added, cleaned; one with no name is dropped
  assert.equal(T('team1', L).team, true);
  assert.deepEqual(T('team1', L).places, ['here', 'both', 'there']);
  assert.equal(T('nameless', L), null);
  // a hidden type is in the library but not offered
  assert.ok(T('study', L));
  assert.ok(!openTypes(L).some((t) => t.id === 'study'));
  // the same lib gives the very same result
  assert.equal(library(lib), L);
  assert.notEqual(library(clone(lib)), L);
  // broken values are cleaned: a gate is one of two, days fall back, fields become a list, bad keys are dropped
  const [s] = typeStages(T('tool', L));
  assert.ok(['manager', 'commander'].includes(s.gate));
  assert.equal(s.days, 14);
  assert.deepEqual(s.fields, []);
  assert.equal(T('tool', L).trlTarget, undefined);
  assert.equal(T('tool', L).domain, undefined);
  assert.equal(T('tool', L).place, undefined);
  for (const bad of [null, 7, 'x', [], { types: 7 }, { types: { block: 7, rnd: { stages: 'x', facts: [7, { label: '' }] } } }]) {
    assert.doesNotThrow(() => library(bad));
    assert.equal(library(bad).types.length, CTO_TYPES.length + TEMPLATES.length);
  }
  // the result is frozen, so nobody writes into a shared answer
  assert.ok(Object.isFrozen(T('block', L).stages));
});

test('2 Option B: editing a stage in one type changes no other type and not STAGES', () => {
  const before = clone(STAGES);
  const tool = typeStages(T('tool')).map((s) => (s.key === 'pilot' ? { ...s, name: 'פיילוט מורחב', gate: 'manager', fields: ['שדה אחר'] } : s));
  const L = library({ v: 1, types: { tool: { stages: tool } }, log: [] });
  assert.equal(typeStages(T('tool', L)).find((s) => s.key === 'pilot').name, 'פיילוט מורחב');
  const pilot = typeStages(T('rnd', L)).find((s) => s.key === 'pilot');
  assert.equal(pilot.name, 'פיילוט');
  assert.equal(pilot.gate, 'commander');
  assert.deepEqual(pilot.fields, STAGES.pilot.fields);
  assert.deepEqual(STAGES, before);
  library({ v: 1, types: { rnd: { stages: [{ key: 'pilot', name: 'אחר', gate: 'manager', fields: [] }] } }, log: [] });
  assert.deepEqual(STAGES, before);
});

test('3 keys: inline keys are new and unique, classic keys exist, option ids are unique', () => {
  const inline = CTO_TYPES.flatMap((t) => t.stages.filter((d) => typeof d === 'object').map((d) => d.key));
  assert.ok(inline.length > 0);
  for (const k of inline) assert.ok(!(k in STAGES), `inline key ${k} reuses a classic key`);
  assert.equal(new Set(inline).size, inline.length);
  for (const t of [...CTO_TYPES, ...TEMPLATES]) for (const d of t.stages) if (typeof d === 'string') assert.ok(d in STAGES, `${t.id}: ${d}`);
  for (const t of CTO_TYPES) for (const f of t.facts || []) if (f.options) assert.equal(new Set(f.options.map((o) => o.id)).size, f.options.length);
  // every type id is unique too
  const ids = [...CTO_TYPES, ...TEMPLATES].map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('4 openTypes: the CTO types in code order, then the team types, then the five general types', () => {
  const L = library({ v: 1, types: { t1: { team: true, name: 'סוג של הצוות' }, t2: { team: true, name: 'עוד סוג', hidden: true } }, log: [] });
  assert.deepEqual(openTypes(L).map((t) => t.id), ['block', 'bdt', 'claude', 'secret', 't1', 'rnd', 'tool', 'study', 'process', 'blank']);
});

test('5 a building block in both places', () => {
  const parts = newProjectParts(L0, 'block', { place: 'both' });
  assert.ok(isRestricted(parts));
  assert.equal(parts.classification, R);
  assert.equal(parts.place, 'both');
  assert.equal(parts.domain, 'blocks');
  assert.equal(parts.stages.length, 8);
  assert.equal(parts.stages[0].state, 'active');
  assert.ok(parts.stages.slice(1).every((s) => s.state === 'todo'));
  assert.deepEqual(parts.stages.flatMap((s) => s.fields.filter((f) => f.classified).map((f) => f.label)), ['הצורך המבצעי', 'תקציב ומימון', 'תוצאה מול התחזית', 'מסמך ההתחייבות']);
  for (const s of parts.stages) s.fields.forEach((f, i) => assert.equal(f.id, `${s.id}f${i}`));
  assert.deepEqual(parts.facts.map((f) => [f.key, f.kind]), [['target', 'choice'], ['commit', 'choice']]);
  for (const f of parts.facts) { assert.ok(f.id); assert.ok(f.options.length >= 2); assert.equal(f.value, ''); assert.ok(!f.classified); }
  assert.equal(parts.trl, null);
  assert.equal(parts.trlTarget, 6);
  assert.ok(!('link' in parts));
  assert.equal(parts.parent, undefined);
  assert.deepEqual(parts.marks, {});
  assert.deepEqual(parts.stages.map((s) => s.days), [21, 21, 30, 30, 180, 365, 60, 21]);
});

test('6 the classified-network type: only "there", and everything there is marked', () => {
  const parts = newProjectParts(L0, 'secret', { place: 'there' });
  assert.ok(parts.stages.every((s) => s.fields.every((f) => f.classified)));
  assert.deepEqual(parts.marks, { forWhom: 'classified', success: 'classified', stopRule: 'classified' });
  assert.equal(newProjectParts(L0, 'secret', {}).place, 'there'); // its own default
  assert.equal(newProjectParts(L0, 'secret', { place: 'here' }), null);
  assert.equal(newProjectParts(L0, 'secret', { place: 'both' }), null);
  // a type with facts, all on the classified network: every fact is marked too
  const bdt = newProjectParts(L0, 'bdt', { place: 'there' });
  assert.ok(bdt.facts.length && bdt.facts.every((f) => f.classified));
  assert.ok(bdt.stages.every((s) => s.fields.every((f) => f.classified)));
});

test('7 the Claude type: בלמ"ס only, with a strict link', () => {
  const c = newProjectParts(L0, 'claude', { place: 'here' });
  assert.ok(!isRestricted(c));
  assert.equal(c.link, null);
  assert.equal(c.trl, undefined);
  assert.equal(newProjectParts(L0, 'claude', { place: 'here', link: '/next/?demo#/project/platform' }).link, '/next/?demo#/project/platform');
  assert.equal(newProjectParts(L0, 'claude', { place: 'here', link: 'javascript:alert(1)' }).link, null);
  assert.equal(newProjectParts(L0, 'claude', { place: 'both' }), null);
  assert.equal(newProjectParts(L0, 'claude', { place: 'there' }), null);
  assert.equal(placeRefusal(T('claude'), 'both'), 'כלי עם Claude נשאר בלמ"ס. לחלק מסווג פותחים פרויקט נפרד');
  assert.equal(gateCount(T('claude')), 2);
});

test('8 a building block that is all here: open, nothing marked', () => {
  const parts = newProjectParts(L0, 'block', { place: 'here' });
  assert.ok(!isRestricted(parts));
  assert.ok(parts.stages.every((s) => s.fields.every((f) => !f.classified)));
  assert.ok(parts.facts.every((f) => !f.classified));
  assert.deepEqual(parts.marks, {});
});

test('9 a general type has no default place; "there" marks everything', () => {
  assert.equal(newProjectParts(L0, 'tool', {}), null);
  assert.equal(newProjectParts(L0, 'tool', { place: 'mars' }), null);
  assert.equal(newProjectParts(L0, 'nope', { place: 'here' }), null);
  const t = newProjectParts(L0, 'tool', { place: 'there' });
  assert.ok(t.stages.length && t.stages.every((s) => s.fields.every((f) => f.classified)));
  assert.equal(t.marks.success, 'classified');
  assert.equal(t.domain, null);
  const rnd = newProjectParts(L0, 'rnd', { place: 'here', trl: 3 });
  assert.equal(rnd.trl, 3);
  assert.equal(rnd.trlTarget, null);
  assert.equal(newProjectParts(L0, 'rnd', { place: 'here', trl: 12 }).trl, null);
  // a chosen domain wins over the type's, and "בלי רובד" is null
  assert.equal(newProjectParts(L0, 'block', { place: 'both', domain: 'infra' }).domain, 'infra');
  assert.equal(newProjectParts(L0, 'block', { place: 'both', domain: null }).domain, null);
});

test('10 presets: a linked בדה"ת is never lower than its block', () => {
  assert.equal(newProjectParts(L0, 'bdt', { place: 'both', minPlace: 'there' }), null);
  const here = { id: 'b1', name: 'אבן לדוגמה', place: 'here', classification: 'open', trl: 4 };
  const pr = linkedBdtPreset(L0, here);
  assert.deepEqual([pr.type, pr.place, pr.minPlace, pr.domain, pr.trl, pr.parent], ['bdt', 'both', 'here', 'demos', 4, 'b1']);
  const there = { id: 'b2', name: 'אבן', place: 'there', classification: R, trl: null };
  const pt = linkedBdtPreset(L0, there);
  assert.deepEqual([pt.place, pt.minPlace, pt.trl, pt.parent], ['there', 'there', null, 'b2']);
  // an old restricted block with no place reads as both
  assert.equal(linkedBdtPreset(L0, { id: 'b3', classification: R }).place, 'both');
  // the parts carry the readiness and the parent in
  const parts = newProjectParts(L0, 'bdt', pr);
  assert.deepEqual([parts.place, parts.trl, parts.trlTarget, parts.parent, parts.domain], ['both', 4, 7, 'b1', 'demos']);
  // what the sheet proposes from the preset, and why
  const sg = suggest(L0, 'bdt', pt);
  assert.equal(sg.place, 'there');
  assert.equal(sg.typeWhy, "הפרויקט נפתח מתוך 'אבן'");
  assert.equal(sg.placeWhy, 'לא נמוך יותר מאבן הבניין: הכול ברשת המסווגת');
  assert.equal(placeRefusal(T('bdt'), 'both', { minPlace: 'there' }), 'לא נמוך יותר מאבן הבניין: הכול ברשת המסווגת');
  const plain = suggest(L0, 'block');
  assert.deepEqual([plain.place, plain.placeWhy, plain.domain, plain.domainWhy, plain.typeWhy], ['both', T('block').why, 'blocks', "זה הרובד הרגיל של 'אבן בניין טכנולוגית'", null]);
  assert.deepEqual([suggest(L0, 'tool').place, suggest(L0, 'tool').placeWhy, suggest(L0, 'tool').domain], [null, null, null]);
});

test('11 stagesFromTemplate: an unknown id has no stages; tool is unchanged', () => {
  assert.deepEqual(stagesFromTemplate('nope'), []);
  assert.deepEqual(stagesFromType(L0, 'nope'), []);
  const tool = stagesFromTemplate('tool');
  assert.deepEqual(tool.map((s) => s.key), TEMPLATES.find((t) => t.id === 'tool').stages);
  assert.equal(tool.find((s) => s.key === 'resources').gate, 'commander');
  assert.equal(tool[0].state, 'active');
  assert.ok(tool.every((s) => s.fields.every((f) => f.id && f.value === '' && !f.classified)));
  assert.deepEqual(stagesFromTemplate('blank'), []);
  // a custom stage, and a classic one by key
  const c = makeStage(null, 'ניסוי שטח');
  assert.deepEqual([c.key, c.name, c.gate, c.days, c.fields.length, c.state], ['custom', 'ניסוי שטח', 'manager', 14, 0, 'todo']);
  assert.equal(makeStage('pilot').days, 42);
});

// A path to try the rules on: one state per stage, and the stages with a commander gate.
const path = (states, commander = []) => ({ id: 'p', stages: states.map((state, i) => ({ id: `s${i}`, key: `k${i}`, name: `שלב ${i}`, state, gate: commander.includes(i) ? 'commander' : 'manager', fields: [] })) });
const C_GATE = 'רק באישור {commander} אפשר לדלג על השלב הזה או להסיר אותו';
const PENDING = 'השלב מחכה לאישור. אפשר לשנות אחרי ההחלטה.';
const noTodoBeforeCurrent = (stages) => {
  const cur = stages.findIndex((s) => s.state === 'active' || s.state === 'pending');
  return cur < 0 || stages.slice(0, cur).every((s) => s.state !== 'todo');
};

test('12 stage rules, for a manager and for the commander', () => {
  // move: only two neighbors that are both still to do
  const p = path(['done', 'active', 'todo', 'todo']);
  assert.equal(canMoveStage(p, 's2', 1), true);
  assert.equal(canMoveStage(p, 's3', -1), true);
  assert.deepEqual(stageRule(p, 's2', 'up'), { ok: false, why: 'אפשר להזיז רק שלבים שעוד לא התחילו' });
  assert.deepEqual(stageRule(p, 's1', 'down'), { ok: false, why: 'אפשר להזיז רק שלבים שעוד לא התחילו' });
  assert.deepEqual(stageRule(p, 's0', 'down'), { ok: false, why: 'אפשר להזיז רק שלבים שעוד לא התחילו' });
  assert.deepEqual(stageRule(p, 's3', 'down'), { ok: false, why: '' }); // no stage below it
  assert.deepEqual(stageRule(p, 's2', 'down'), { ok: true, why: '' });
  // skip: a stage to do, or the current one while a later one is to do
  assert.equal(canSkipStage(p, 's2'), true);
  assert.equal(canSkipStage(p, 's1'), true);
  assert.equal(canSkipStage(p, 's0'), false);
  assert.deepEqual(stageRule(p, 's0', 'skip'), { ok: false, why: '' });
  const last = path(['done', 'active']);
  for (const byC of [false, true]) assert.deepEqual(stageRule(last, 's1', 'skip', byC), { ok: false, why: "זה השלב האחרון. סוגרים אותו ב'סגירת שלב'" });
  assert.equal(canSkipStage(path(['done', 'active', 'todo']), 's2'), true); // a last stage still to do can be skipped
  // a commander gate: only the commander skips or removes it
  const gated = path(['active', 'todo', 'todo'], [2]);
  assert.deepEqual(stageRule(gated, 's2', 'skip', false), { ok: false, why: C_GATE });
  assert.deepEqual(stageRule(gated, 's2', 'remove', false), { ok: false, why: C_GATE });
  assert.deepEqual(stageRule(gated, 's2', 'skip', true), { ok: true, why: '' });
  assert.deepEqual(stageRule(gated, 's2', 'remove', true), { ok: true, why: '' });
  assert.deepEqual(stageRule(path(['active', 'todo'], [0]), 's0', 'skip', false), { ok: false, why: C_GATE });
  assert.equal(canSkipStage(path(['active', 'todo'], [0]), 's0', true), true);
  // a pending stage waits for the decision
  const pend = path(['done', 'pending', 'todo'], [1]);
  for (const byC of [false, true]) assert.deepEqual(stageRule(pend, 's1', 'skip', byC), { ok: false, why: PENDING });
  // remove: only a stage that has not started
  assert.equal(canRemoveStage(p, 's3'), true);
  for (const sid of ['s0', 's1']) assert.deepEqual(stageRule(p, sid, 'remove', true), { ok: false, why: 'אפשר להסיר רק שלב שעוד לא התחיל. על שלב שהתחיל אפשר לדלג' });
  // unskip: after the current stage; with no current stage, it becomes the current one
  const sk = path(['done', 'skipped', 'active', 'skipped']);
  assert.equal(canUnskipStage(sk, 's3'), true);
  assert.equal(canUnskipStage(sk, 's1'), false);
  assert.deepEqual(stageRule(sk, 's1', 'unskip'), { ok: false, why: '' });
  assert.equal(stagesAfter(sk, 'unskip', { sid: 's3' })[3].state, 'todo');
  const allClosed = path(['done', 'skipped']);
  assert.equal(canUnskipStage(allClosed, 's1'), true);
  assert.equal(stagesAfter(allClosed, 'unskip', { sid: 's1' })[1].state, 'active');
  // the gate: up by anyone who manages; down from the commander's only by the commander; frozen while pending
  const todo = { state: 'todo', gate: 'manager' };
  assert.equal(canSetGate(todo, 'commander', false), true);
  assert.equal(canSetGate(todo, 'manager', false), true); // the current choice stays pressable
  const cg = { state: 'active', gate: 'commander' };
  assert.equal(canSetGate(cg, 'manager', false), false);
  assert.equal(canSetGate(cg, 'manager', true), true);
  assert.deepEqual(gateRule(cg, 'manager', false), { ok: false, why: 'להוריד את השער הזה אפשר רק באישור {commander}' });
  for (const g of ['manager', 'commander']) for (const byC of [false, true]) assert.deepEqual(gateRule({ state: 'pending', gate: 'commander' }, g, byC), { ok: false, why: PENDING });
  assert.equal(canSetGate({ state: 'done', gate: 'manager' }, 'commander', true), false);
  assert.equal(canSetGate(todo, 'other', true), false);
  // refusals change nothing
  assert.equal(stagesAfter(p, 'up', { sid: 's2' }), null);
  assert.equal(stagesAfter(gated, 'remove', { sid: 's2' }), null);
  assert.equal(stagesAfter(gated, 'remove', { sid: 's2', byCommander: true }).length, 2);
  // skipping the current stage moves the work to the next one still to do
  const sk2 = stagesAfter(p, 'skip', { sid: 's1' });
  assert.deepEqual(sk2.map((s) => s.state), ['done', 'skipped', 'active', 'todo']);
});

test('12 the invariant: no stage still to do ever sits before the current one', () => {
  // A long walk of random changes, each only when its rule allows it, from every kind of path. A fixed seed keeps it
  // the same walk on every run.
  let a = 7;
  const rnd = (n) => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n); };
  const starts = [path(['active', 'todo', 'todo', 'todo', 'todo'], [2]), path(['done', 'done', 'active', 'todo', 'todo']), path(['done', 'skipped', 'pending', 'todo', 'skipped'], [2]), path(['done', 'skipped'])];
  const applied = {};
  for (const start of starts) {
    let p = clone(start);
    for (let step = 0; step < 1500; step++) {
      const actions = ['up', 'down', 'skip', 'unskip', 'remove', 'add'];
      const action = actions[rnd(actions.length)];
      if (action === 'add' && p.stages.length > 8) continue;
      const sid = p.stages.length ? p.stages[rnd(p.stages.length)].id : null;
      const next = stagesAfter(p, action, { sid, byCommander: !!rnd(2), stage: action === 'add' ? makeStage(null, 'שלב נוסף') : null });
      if (next) { p = { ...p, stages: next }; applied[action] = (applied[action] || 0) + 1; }
      assert.ok(noTodoBeforeCurrent(p.stages), `${action} broke the path: ${p.stages.map((s) => s.state).join(',')}`);
      // closing the current stage now and then, as the gate sheet does, and starting over once all is closed
      if (rnd(12) === 0) {
        const i = p.stages.findIndex((s) => s.state === 'active');
        if (i >= 0) {
          const st = p.stages.map((s) => ({ ...s }));
          st[i].state = 'done';
          const n = st.findIndex((s, k) => k > i && s.state === 'todo');
          if (n >= 0) st[n].state = 'active';
          p = { ...p, stages: st };
          assert.ok(noTodoBeforeCurrent(p.stages));
        }
      }
      if (!p.stages.some((s) => s.state === 'todo' || s.state === 'skipped')) p = clone(start);
    }
  }
  for (const action of ['up', 'down', 'skip', 'unskip', 'remove', 'add']) assert.ok(applied[action] > 10, `${action} ran ${applied[action] || 0} times`);
});

test('13 placeRule: raising is the manager\'s, lowering the commander\'s, and the type has its say', () => {
  const p = { id: 'p', manager: 'm', partners: [], place: 'here', classification: 'open', template: 'block' };
  assert.deepEqual(placeRule(p, 'both', { type: T('block'), manages: true }), { ok: true, why: '' });
  assert.equal(placeRule(p, 'there', { type: T('block'), manages: true }).ok, true);
  const r = { ...p, place: 'both', classification: R };
  const low = placeRule(r, 'here', { type: T('block'), manages: true });
  assert.equal(low.ok, false);
  assert.match(low.why, /\{commander\}/);
  assert.equal(low.why, 'להורדה לבלמ"ס צריך את {commander}');
  assert.equal(placeRule(r, 'here', { type: T('block'), manages: true, byCommander: true }).ok, true);
  assert.equal(placeRule(r, 'there', { type: T('block'), manages: true }).ok, true); // same level, other place
  const claude = { ...p, template: 'claude' };
  assert.deepEqual(placeRule(claude, 'both', { type: T('claude'), manages: true, byCommander: true }), { ok: false, why: 'כלי עם Claude נשאר בלמ"ס. לחלק מסווג פותחים פרויקט נפרד' });
  const secret = { ...p, template: 'secret', place: 'there', classification: R };
  for (const to of ['here', 'both']) assert.deepEqual(placeRule(secret, to, { type: T('secret'), manages: true, byCommander: true }), { ok: false, why: 'בסוג הזה הכול ברשת המסווגת' });
  assert.deepEqual(placeRule({ ...p, personal: 'm' }, 'both', { type: T('block'), manages: true, byCommander: true }), { ok: false, why: 'פרויקט אישי תמיד בלמ"ס' });
  assert.deepEqual(placeRule(p, 'both', { type: T('block'), manages: false }), { ok: false, why: 'רק בניהול הפרויקט אפשר לשנות את זה' });
  assert.deepEqual(placeRule({ ...p, phase: 'done' }, 'both', { type: T('block'), manages: true }), { ok: false, why: 'הפרויקט סגור' });
  assert.equal(placeRule({ ...p, phase: 'stopped' }, 'both', { type: T('block'), manages: true, byCommander: true }).ok, true);
  // a team type that allows fewer places
  const L = library({ v: 1, types: { t1: { team: true, name: 'סוג', places: ['here', 'both'] } }, log: [] });
  assert.deepEqual(placeRule(p, 'there', { type: T('t1', L), manages: true }), { ok: false, why: 'הסוג הזה לא מאפשר את זה' });
  // the type menu on the card: why a type does not fit the project's place
  assert.equal(typeFitWhy(T('claude'), r), 'הסוג הזה לא מתאים לפרויקט שמור / סודי');
  assert.equal(typeFitWhy(T('secret'), r), "קודם מעבירים את הפרויקט ל'הכול ברשת המסווגת'");
  assert.equal(typeFitWhy(T('block'), r), null);
});

test('14 placeOf: the stricter of place and level wins', () => {
  assert.equal(placeOf({ place: 'here', classification: R }), 'both');
  assert.equal(placeOf({ place: 'there', classification: 'open' }), 'there');
  assert.equal(isRestricted({ place: 'there', classification: 'open' }), true);
  assert.equal(placeOf({ classification: 'open' }), 'here');
  assert.equal(placeOf({ classification: R }), 'both');
  assert.equal(placeOf({}), 'here');
  assert.equal(placeOf({ place: 'mars', classification: R }), 'both');
  assert.equal(levelOf({ place: 'both' }), R);
  assert.equal(isRestricted(null), false);
});

// The people of the sees matrix.
const P = {
  cmd: { id: 'c', role: 'commander' },
  dep: { id: 'd', role: 'member', command: true },
  mgr: { id: 'm', role: 'member' },
  partner: { id: 't', role: 'member' },
  other: { id: 'o', role: 'member' },
  extIn: { id: 'x', role: 'external' },
  extOut: { id: 'y', role: 'external' },
};
const at = (place) => ({ id: 'p', manager: 'm', partners: ['t', 'x'], place, classification: PLACES[place].level });

test('15 sees: who sees what, in every place', () => {
  const want = {
    cmd: ['all', 'all', 'all'], dep: ['all', 'all', 'all'], mgr: ['all', 'all', 'all'], partner: ['all', 'all', 'all'],
    extIn: ['all', 'all', 'none'], extOut: ['none', 'none', 'none'], other: ['all', 'line', 'line'],
  };
  for (const [who, row] of Object.entries(want)) assert.deepEqual(['here', 'both', 'there'].map((pl) => sees(at(pl), P[who])), row, who);
  // a personal project is its owner's alone, even from the commander
  const mine = { id: 'q', personal: 'o', manager: 'o', partners: [], classification: 'open' };
  assert.equal(sees(mine, P.other), 'all');
  assert.equal(sees(mine, P.cmd), 'none');
  assert.equal(sees(mine, P.mgr), 'none');
  assert.equal(sees(at('here'), null), 'none');
  assert.equal(sees(null, P.cmd), 'none');
  // an old project with no place: its level decides
  assert.equal(sees({ id: 'p', manager: 'm', partners: [], classification: R }, P.other), 'line');
});

test('16 levelEffects: who loses the detail, whose tasks move, and outside partners', () => {
  const people = Object.values(P);
  const tasks = [
    { id: 't1', project: 'p', owner: 'o', status: 'todo' }, // someone in the team outside the project, with work there
    { id: 't2', project: 'p', owner: 'x', status: 'doing' }, // an outside partner in it
    { id: 't3', project: 'p', owner: 't', status: 'done' },
    { id: 't4', project: 'p', owner: 'm', status: 'todo', ask: true },
    { id: 't5', project: 'other', owner: 'o', status: 'todo' },
  ];
  assert.deepEqual(levelEffects(at('here'), 'both', { people, tasks }), { lose: ['o'], handed: ['o'], outsiders: [], regain: [] });
  assert.deepEqual(levelEffects(at('both'), 'there', { people, tasks }), { lose: [], handed: ['x'], outsiders: ['x'], regain: [] });
  assert.deepEqual(levelEffects(at('there'), 'both', { people, tasks }), { lose: [], handed: [], outsiders: [], regain: ['x'] });
  assert.deepEqual(levelEffects(at('here'), 'there', { people, tasks }), { lose: ['o'], handed: ['o', 'x'], outsiders: ['x'], regain: [] });
  assert.deepEqual(levelEffects(at('both'), 'here', { people, tasks }), { lose: [], handed: [], outsiders: [], regain: [] });
  assert.deepEqual(levelEffects(at('both'), 'mars', { people, tasks }), { lose: [], handed: [], outsiders: [], regain: [] });
  // The same on the sample. p1's people are the whole team (with command), so raising it to 'both' drops no one, and
  // to 'there' its outside partner loses access and hands over the open task there. p4 drops the one member outside it.
  const sample = { people: data.people, tasks: data.tasks };
  const pr = (id) => data.projects.find((p) => p.id === id);
  assert.deepEqual(levelEffects(pr('p1'), 'both', sample), { lose: [], handed: [], outsiders: [], regain: [] });
  assert.deepEqual(levelEffects(pr('p1'), 'there', sample), { lose: [], handed: ['avi'], outsiders: ['avi'], regain: [] });
  assert.deepEqual(levelEffects(pr('p4'), 'both', sample), { lose: ['yahali'], handed: [], outsiders: [], regain: [] });
  assert.deepEqual(levelEffects(pr('p6'), 'there', sample), { lose: [], handed: [], outsiders: ['ronit'], regain: [] });
});

test('17 cardFill: skipped stages do not count; facts and core marks do', () => {
  const f = (value = '', more = {}) => ({ label: 'שדה', value, ...more });
  const p = {
    what: 'משהו ברור', forWhom: '', success: '',
    facts: [{ id: 'f1', label: 'עובדה', kind: 'text', value: '', unknown: true }],
    stages: [
      { state: 'skipped', fields: [f(), f()] },
      { state: 'active', fields: [f(), f()] },
      { state: 'todo', fields: [f('מלא')] },
    ],
  };
  assert.deepEqual(cardFill(p), { done: 2, of: 6 });
  assert.deepEqual(cardFill({ ...p, marks: { forWhom: 'classified', success: 'unknown' } }), { done: 4, of: 6 });
  assert.deepEqual(cardFill({ ...p, facts: undefined }), { done: 1, of: 5 });
});

test('18 stageDays and the Gantt: a 365-day stage spans 365 days', () => {
  assert.equal(stageDays({ key: 'flight', days: 365 }), 365);
  assert.equal(stageDays({ key: 'pilot' }), 42);
  assert.equal(stageDays({ key: 'custom' }), 14);
  const now = new Date(2026, 9, 28, 12).getTime();
  const p = { stages: [{ id: 'a', key: 'flight', days: 365, state: 'active', target: null, fields: [] }, { id: 'b', key: 'pilot', state: 'todo', target: null, fields: [] }] };
  const [a, b] = schedule(p, now);
  assert.equal(daysBetween(a.start, a.end), 365);
  assert.equal(daysBetween(b.start, b.end), 42);
  const block = { stages: newProjectParts(L0, 'block', { place: 'both' }).stages };
  const sch = schedule(block, now);
  assert.deepEqual(sch.map((r) => daysBetween(r.start, r.end)), [21, 21, 30, 30, 180, 365, 60, 21]);
});

test('19 classifiedLabels', () => {
  assert.deepEqual(classifiedLabels(T('block')), ['הצורך המבצעי', 'תקציב ומימון', 'תוצאה מול התחזית', 'מסמך ההתחייבות']);
  assert.equal(classifiedLabels(T('bdt')).length, 8);
  assert.deepEqual(classifiedLabels(T('tool')), []);
});

test('20 gateCount', () => {
  assert.deepEqual(['block', 'bdt', 'claude', 'secret'].map((id) => gateCount(T(id))), [2, 2, 2, 1]);
});

test('21 retypeParts: the type changes, the stages stay', () => {
  const rnd = { id: 'r', template: 'rnd', place: 'here', classification: 'open', domain: null, trl: 3, stages: stagesFromTemplate('rnd'), facts: [] };
  const patch = retypeParts(L0, rnd, 'block');
  assert.equal(patch.template, 'block');
  assert.deepEqual(patch.facts.map((f) => f.key), ['target', 'commit']);
  assert.ok(patch.facts.every((f) => !f.classified));
  assert.equal(patch.domain, 'blocks');
  assert.ok(!('stages' in patch));
  assert.ok(!('trl' in patch)); // it already has readiness rows
  assert.equal(retypeParts(L0, { ...rnd, domain: 'infra' }, 'block').domain, undefined);
  // facts it already has are not added again, by key or by label
  assert.equal(retypeParts(L0, { ...rnd, ...patch }, 'block').facts.length, 2);
  assert.equal(retypeParts(L0, { ...rnd, facts: [{ id: 'f', label: 'היעד', kind: 'text', value: 'x' }] }, 'block').facts.length, 2);
  // a project with no readiness gets the rows; the Claude type gets its link row
  const tool = { ...rnd, template: 'tool', trl: undefined };
  assert.deepEqual([retypeParts(L0, tool, 'block').trl, retypeParts(L0, tool, 'block').trlTarget], [null, 6]);
  assert.equal(retypeParts(L0, tool, 'claude').link, null);
  // in a restricted project the new facts come marked by its place
  const both = { ...rnd, place: 'both', classification: R };
  assert.equal(retypeParts(L0, both, 'claude'), null);
  assert.equal(retypeParts(L0, both, 'secret'), null);
  assert.ok(retypeParts(L0, { ...rnd, place: 'there', classification: R }, 'bdt').facts.every((f) => f.classified));
  assert.equal(retypeParts(L0, rnd, 'nope'), null);
});

test('22 nextLink: only /next/ on this site or the app host, over https', () => {
  const O = 'https://preview.example';
  const ok = {
    '/next/': '/next/', '/next': '/next', '/next/?demo#/project/platform': '/next/?demo#/project/platform',
    'https://cto-tasks.vercel.app/next/#/project/x': 'https://cto-tasks.vercel.app/next/#/project/x',
    'https://preview.example/next/#/p/1': 'https://preview.example/next/#/p/1', '  /next/  ': '/next/',
  };
  for (const [v, want] of Object.entries(ok)) assert.equal(nextLink(v, O), want, v);
  const bad = ['javascript:alert(1)', 'http://cto-tasks.vercel.app/next/', 'https://evil.example/next/', 'https://cto-tasks.vercel.app.evil.example/next/',
    '//evil.example/next/', '/m/', '/next/../m/', '/\\evil.example/next/', '/next/ x', 'https://user:pw@cto-tasks.vercel.app/next/', '/nextx/',
    'https://cto-tasks.vercel.app/m/', '/next/%2e%2e/m/', '', null, undefined, 'next/', 'data:text/html,x'];
  for (const v of bad) assert.equal(nextLink(v, O), null, String(v));
  assert.equal(nextLink('https://preview.example/next/'), null); // another origin only when it is this one
});

test('23 briefLine and the valley', () => {
  const commit = T('block').facts.find((f) => f.key === 'commit');
  const blk = (trl, value, more = {}) => ({ trl, trlTarget: 6, facts: [{ id: 'f', key: 'commit', label: commit.label, kind: 'choice', options: commit.options, value, ...more }] });
  assert.equal(inValley(blk(5, 'none')), true);
  assert.equal(inValley(blk(5, '')), true);
  assert.equal(inValley(blk(6, '', { unknown: true })), true);
  assert.equal(inValley(blk(5, 'intent')), false);
  assert.equal(inValley(blk(5, 'none', { classified: true })), false);
  assert.equal(inValley(blk(4, 'none')), false);
  assert.equal(inValley(blk(null, 'none')), false);
  assert.equal(inValley({ ...blk(5, 'none'), phase: 'done' }), false);
  assert.equal(inValley({ trl: 7, facts: [] }), false); // no commitment to look at
  assert.equal(briefLine(blk(3, 'intent')), 'TRL 3 → 6 · כוונה');
  assert.equal(briefLine({ trl: 3 }), 'TRL 3');
  assert.equal(briefLine({ trl: null, trlTarget: 6 }), 'יעד TRL 6');
  assert.equal(briefLine({}), '');
  assert.equal(briefLine(blk(3, 'intent', { classified: true })), 'TRL 3 → 6');
  // the parts the line is read out from (m/views/overview.js)
  assert.deepEqual(briefParts(blk(3, 'intent')), { trl: 3, target: 6, commit: 'כוונה' });
  assert.deepEqual(briefParts(blk(3, 'intent', { unknown: true })), { trl: 3, target: 6, commit: null });
  assert.deepEqual(briefParts({ trl: 12, trlTarget: null }), { trl: null, target: null, commit: null });
  assert.deepEqual(briefParts(null), { trl: null, target: null, commit: null });
});

test('24 handBack: what a linked בדה"ת brought back', () => {
  const parts = newProjectParts(L0, 'block', { place: 'both' });
  const block = { id: 'b', name: 'אבן', phase: 'active', ...parts, trl: 5 };
  block.stages = block.stages.map((s, i) => ({ ...s, state: i < 5 ? 'done' : i === 5 ? 'active' : 'todo' })); // on its flight stage
  const kid = { id: 'k', name: 'בדה"ת', phase: 'done', ...newProjectParts(L0, 'bdt', { place: 'both', parent: 'b', trl: 5 }), trl: 7 };
  kid.facts = kid.facts.map((f) => (f.key === 'rec' ? { ...f, value: 'go' } : f));
  assert.deepEqual(handBack(block, [kid]), [{ id: 'k', name: 'בדה"ת', ended: 'done', trl: 7, rec: 'להמשיך', take: true }]);
  assert.equal(handBack({ ...block, trl: 7 }, [kid])[0].take, false);
  // away from the flight stage, it shows only while there is a TRL to take
  const early = { ...block, stages: block.stages.map((s, i) => ({ ...s, state: i === 0 ? 'active' : 'todo' })) };
  assert.equal(handBack(early, [kid]).length, 1);
  assert.deepEqual(handBack({ ...early, trl: 7 }, [kid]), []);
  // stopped, with nothing known
  const stopped = { ...kid, phase: 'stopped', trl: null, facts: kid.facts.map((f) => ({ ...f, value: '' })) };
  assert.deepEqual(handBack(block, [stopped]), [{ id: 'k', name: 'בדה"ת', ended: 'stopped', trl: null, rec: null, take: false }]);
  // still running, another block's, or a closed block: nothing
  assert.deepEqual(handBack(block, [{ ...kid, phase: 'active' }]), []);
  assert.deepEqual(handBack(block, [{ ...kid, parent: 'other' }]), []);
  assert.deepEqual(handBack({ ...block, phase: 'done' }, [kid]), []);
});

test('25 whoSees and lockedWhere follow LOCKED_LINE_SHOWS_STAGE', () => {
  const st = { where: 'הבשלה בקרקע', idx: 5, n: 8 };
  for (const shows of [true, false]) {
    assert.equal(lockedWhere(st, shows), shows ? 'הבשלה בקרקע' : 'שלב 5 מתוך 8');
    assert.equal(lockedWhere({ where: 'בלי שלבים', idx: 0, n: 0 }, shows), 'בלי שלבים');
    const both = whoSees('both', shows);
    assert.deepEqual(both, ['הפיקוד וחברי הפרויקט רואים הכול.',
      shows ? 'לשאר הצוות מוצגת שורה אחת: שם הפרויקט, מי מנהל, השלב והמצב.' : 'לשאר הצוות מוצגת שורה אחת: שם הפרויקט, מי מנהל, מספר השלב והמצב.']);
    assert.deepEqual(whoSees('there', shows), [...both, 'שותפים מבחוץ לא רואים את הפרויקט כאן.']);
    assert.deepEqual(whoSees('here', shows), ['כל הצוות רואה את הפרויקט.', 'שותפים מבחוץ רק אם הם בפרויקט.']);
  }
  // without the second argument, the switch decides
  assert.equal(lockedWhere(st), lockedWhere(st, LOCKED_LINE_SHOWS_STAGE));
  assert.deepEqual(whoSees('both'), whoSees('both', LOCKED_LINE_SHOWS_STAGE));
  // the one line of a real project
  const p = { stages: newProjectParts(L0, 'block', { place: 'both' }).stages };
  assert.equal(lockedWhere(status(p), false), 'שלב 1 מתוך 8');
});

test('domains: the pyramid in Yahali\'s order, and one term for none', () => {
  assert.deepEqual(PYRAMID_ORDER, DOMAINS.map((d) => d.id));
  assert.equal(domainTitle('concepts'), '1 · תפיסות');
  assert.equal(domainTitle('g2g'), 'מימון G2G');
  assert.equal(domainTitle(null), 'בלי רובד');
  assert.equal(domainName('nope'), 'בלי רובד');
});

test('checkTypePatch: editable keys, allowed places, and the commander\'s gates', () => {
  const block = T('block');
  const code = CTO_TYPES.find((t) => t.id === 'block');
  assert.deepEqual(checkTypePatch(code, block, { name: 'שם חדש' }, false), { ok: true, why: '' });
  assert.equal(checkTypePatch(code, block, { places: ['here'] }, true).ok, false);
  assert.equal(checkTypePatch(code, block, { link: 'next' }, true).ok, false);
  assert.equal(checkTypePatch(T('claude'), T('claude'), { place: 'both' }, true).ok, false);
  assert.equal(checkTypePatch(code, block, { place: 'there' }, false).ok, true);
  const lowered = typeStages(block).map((s) => (s.key === 'matplan' ? { ...s, gate: 'manager' } : s));
  const removed = typeStages(block).filter((s) => s.key !== 'transfer');
  const why = 'רק באישור {commander} אפשר להוריד שער או להסיר שלב עם שער';
  assert.deepEqual(checkTypePatch(code, block, { stages: lowered }, false), { ok: false, why });
  assert.deepEqual(checkTypePatch(code, block, { stages: removed }, false), { ok: false, why });
  assert.equal(checkTypePatch(code, block, { stages: lowered }, true).ok, true);
  const raised = typeStages(block).map((s) => (s.key === 'signal' ? { ...s, gate: 'commander' } : s));
  assert.equal(checkTypePatch(code, block, { stages: raised }, false).ok, true);
  // the stage library: the type's own first, then the classic stages, then the rest, once each
  const lib = stageLibrary(L0, T('claude'));
  assert.deepEqual(lib.slice(0, 5).map((s) => s.key), ['need', 'data', 'mvp', 'pilot', 'adoption']);
  assert.equal(new Set(lib.map((s) => s.key)).size, lib.length);
  assert.ok(lib.some((s) => s.key === 'signal'));
  // a stage the team took off a code type's path stays in that type's library, right after the stages it still has
  const L1 = library({ v: 1, log: [], types: { block: { stages: typeStages(block).filter((s) => s.key !== 'signal') } } });
  const edited = stageLibrary(L1, T('block', L1));
  assert.deepEqual(edited.slice(0, 8).map((s) => s.key), [...typeStages(T('block', L1)).map((s) => s.key), 'signal']);
  assert.equal(new Set(edited.map((s) => s.key)).size, edited.length);
});

// ---------- the store's rules (m/store.js) ----------
// The store runs here with its two browser imports stubbed (preact/hooks, app/motion.js) and storage in a Map. It loads
// once, with an m.lib whose log holds lines that are not lines, as a tab may find it.
const mem = new Map();
const LINE = { id: 'l1', at: '2026-10-29T10:00:00.000Z', who: 'yahali', text: 'שורה ביומן' };
let S = null;
let libAtLoad = null;
async function store() {
  if (S) return S;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } } });
  mem.set('m.lib', JSON.stringify({ v: 1, types: {}, log: [null, LINE, 7, 'שורה', []] }));
  const src = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
  const stubs = { hooks: src('export const useState = (v) => [v, () => {}]; export const useEffect = () => {};'), motion: src('export const haptic = () => {};') };
  const hooks = `const stubs = ${JSON.stringify(stubs)};
    export function resolve(spec, ctx, next) {
      const url = spec === 'preact/hooks' ? stubs.hooks : spec.endsWith('/app/motion.js') ? stubs.motion : null;
      return url ? { url, shortCircuit: true } : next(spec, ctx);
    }`;
  if (typeof nodeModule.registerHooks === 'function') nodeModule.registerHooks(await import(src(hooks)));
  else nodeModule.register(src(hooks));
  S = await import('./store.js');
  libAtLoad = S.getState().lib;
  return S;
}
// Each toast holds a timer, so none is left behind.
const quiet = () => { for (const t of S.getState().toasts) S.dismissToast(t.id); };
after(() => { if (S) quiet(); });
// The sample again, seen as `me`.
function fresh(me) { S.resetSample(); S.set({ me }); quiet(); }
// The structural toasts that can still be taken back, and the latest one's ביטול pressed, as ui.Toast does.
const undoable = () => S.getState().toasts.filter((t) => t.action?.label === 'ביטול').map((t) => t.text);
function undo() {
  const t = S.getState().toasts.filter((x) => x.action?.label === 'ביטול').at(-1);
  assert.ok(t, 'no toast with ביטול');
  S.dismissToast(t.id);
  t.action.run();
}

test('store: a project made שמור / סודי keeps no link out, however it got one (design §9)', async () => {
  await store();
  // the Claude project changes type, then its manager raises it: the link goes with the raise
  fresh('yarden');
  const link = S.project('p8').link;
  assert.ok(link);
  assert.equal(S.setType('p8', 'tool'), true);
  assert.equal(S.project('p8').link, link); // still בלמ"ס, so it stays
  assert.equal(S.setPlace('p8', 'both'), true);
  assert.equal(isRestricted(S.project('p8')), true);
  assert.equal(S.project('p8').link, null);
  assert.equal(S.setLink('p8', link), false);
  // a link set on another type's project, then a raise
  fresh('yahali');
  assert.equal(S.setLink('p1', '/next/'), true);
  assert.equal(S.setPlace('p1', 'there'), true);
  assert.equal(S.project('p1').link, null);
  // a project that never had a link gets none
  fresh('yarden');
  assert.equal(S.setPlace('p3', 'both'), true);
  assert.equal('link' in S.project('p3'), false);
  quiet();
});

test('store: removing a stage, its ביטול brings back only the tasks still in the project\'s "בלי שלב" (design §7)', async () => {
  await store();
  fresh('yahali');
  assert.equal(S.addStage('p1', null, 'שלב בדיקה'), true);
  const sid = S.project('p1').stages.at(-1).id;
  const stays = S.addTask({ title: 'נשארת בפרויקט', project: 'p1', stage: sid, owner: 'yahali' });
  const leaves = S.addTask({ title: 'יוצאת מהפרויקט', project: 'p1', stage: sid, owner: 'yahali' });
  const task = (id) => S.getState().tasks.find((t) => t.id === id);
  assert.equal(S.removeStage('p1', sid), true);
  assert.deepEqual([task(stays.id).stage, task(leaves.id).stage], [null, null]);
  // out of the project, as the task sheet's "בלי פרויקט" does
  S.updateTask(leaves.id, { project: null, stage: null });
  undo();
  assert.ok(S.project('p1').stages.some((s) => s.id === sid));
  assert.equal(task(stays.id).stage, sid);
  assert.deepEqual([task(leaves.id).project, task(leaves.id).stage], [null, null]);
  quiet();
});

test('store: adding a field, a fact or readiness has its own ביטול, and it replaces the toast before it (design §7)', async () => {
  await store();
  fresh('yahali');
  const p6 = () => S.project('p6');
  const st = p6().stages.find((s) => s.fields.length);
  const labels = () => p6().stages.find((s) => s.id === st.id).fields.map((f) => f.label);
  assert.equal(S.removeField('p6', st.id, st.fields[0].id), true);
  const removed = labels();
  assert.deepEqual(undoable(), [`השדה '${st.fields[0].label}' הוסר`]);
  // the add's toast is the only one live, and its ביטול takes back the add alone
  assert.equal(S.addField('p6', st.id, 'שדה בדיקה'), true);
  assert.deepEqual(undoable(), ["השדה 'שדה בדיקה' נוסף"]);
  assert.deepEqual(labels(), [...removed, 'שדה בדיקה']);
  undo();
  assert.deepEqual(labels(), removed);
  const facts = p6().facts.length;
  assert.equal(S.addFact('p6', 'עובדה בדיקה'), true);
  assert.deepEqual(undoable(), ["השדה 'עובדה בדיקה' נוסף"]);
  assert.equal(p6().facts.length, facts + 1);
  undo();
  assert.equal(p6().facts.length, facts);
  assert.equal(S.removeTrl('p6'), true);
  assert.equal(S.addTrl('p6'), true);
  assert.deepEqual(undoable(), ['המוכנות נוספה']);
  assert.equal(p6().trl, null);
  undo();
  assert.equal(p6().trl, undefined);
  quiet();
});

test('store: a log line in m.lib that is not a line is left out, on load and on the next edit (design §2.7)', async () => {
  await store();
  assert.deepEqual(libAtLoad.log, [LINE]);
  fresh('yahali');
  assert.deepEqual(S.typeLog().map((l) => l.text), [LINE.text]);
  // another tab left a broken line: the next edit reads m.lib again and leaves it out
  mem.set('m.lib', JSON.stringify({ v: 1, types: {}, log: [LINE, null] }));
  assert.equal(S.setTypeDef('block', { hint: 'רמז בדיקה' }), true);
  const saved = JSON.parse(mem.get('m.lib'));
  assert.deepEqual(saved.log.map((l) => l.text), [LINE.text, `הסוג '${T('block').name}' עודכן`]);
  assert.deepEqual(S.getState().lib.log, saved.log);
  // the code's types again, for whatever runs next
  mem.delete('m.lib');
  S.set({ lib: EMPTY_LIB });
  quiet();
});

test('store: a hidden בדה"ת type is not opened from a building block, and is again once it is offered (design §2.3, §6.6)', async () => {
  await store();
  fresh('yahali');
  assert.equal(S.hideType('bdt', true), true);
  assert.equal(S.openLinkedBdt('p6'), false);
  assert.equal(S.getState().sheet, null);
  assert.equal(S.hideType('bdt', false), true);
  assert.equal(S.openLinkedBdt('p6'), true);
  assert.equal(S.getState().sheet?.preset?.type, 'bdt');
  S.closeSheet();
  mem.delete('m.lib');
  S.set({ lib: EMPTY_LIB });
  quiet();
});
