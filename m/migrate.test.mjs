// Loading a saved state: the v2 → v3 → v4 steps, run with: node --test m/*.test.mjs
// The numbers are the items of design §11.2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toV3, upgradeV4, migrate, freshState } from './migrate.js';
import { PLACES, placeOf, levelOf, nextLink } from './card.js';
import * as seed from './data.js';

const R = PLACES.both.level; // the closed level, read from the model
const clone = (x) => JSON.parse(JSON.stringify(x));
const T0 = '2026-10-20T10:00:00.000Z';
const stage = (id, key, name, state, fields, more = {}) => ({ id, key, name, exit: '', gate: 'manager', fields, state, target: null, evidence: [], closedAt: state === 'done' ? T0 : null, ...more });

// A state as the v3 build saved it: ranks the commander set, an ask answered and broken down, a field filled by index,
// a field that already has an id, and a person whose saved perms are empty.
const v3 = () => ({
  v: 3,
  people: [
    { id: 'yoash', name: 'יואש', role: 'commander', title: 'מפקד', color: '#5856d6', account: true },
    { id: 'yonatan', name: 'יונתן', role: 'member', title: 'סגן', color: '#0071e3', account: true, command: true },
    { id: 'yahali', name: 'יהלי', role: 'member', title: 'צוות', color: '#ff9500', account: true },
    { id: 'yarden', name: 'ירדן', role: 'member', title: 'יועצת', color: '#34c759', account: true, perms: [] },
    { id: 'avi', name: 'אבי כהן', role: 'external', title: 'ספק פיתוח', org: 'חברת הפיתוח', color: '#30b0c7', account: true },
  ],
  projects: [
    { id: 'p1', name: 'פרויקט ראשון', color: '#ff9500', classification: 'open', template: 'tool', manager: 'yahali', partners: ['yarden', 'avi'],
      what: 'משהו', forWhom: '', success: '', stopRule: '', hill: 'up', confidence: 'on', lastUpdate: T0, tolDays: 14, log: [],
      rank: 2, rankSeen: 1, rankAt: T0, rankBy: 'yoash',
      stages: [
        stage('sa', 'scope', 'תיחום', 'done', [{ label: 'גבולות', value: 'בפנים ובחוץ' }]),
        stage('sb', 'need', 'צורך ומיקודו', 'active', [{ label: 'הצורך במשפט', value: '' }, { label: 'הדורש', value: 'נכתב לפני העדכון' }], { target: '2026-11-05' }),
        stage('sc', 'custom', 'שלב משלנו', 'todo', [{ id: 'keep-me', label: 'שדה עם מזהה', value: '' }, { label: 'בלי מזהה', value: '', unknown: true }]),
      ] },
    { id: 'p2', name: 'פרויקט שני', color: '#5856d6', classification: R, template: 'rnd', trl: 3, manager: 'yonatan', partners: [],
      what: '', forWhom: '', success: '', stopRule: '', hill: 'top', confidence: 'on', lastUpdate: T0, tolDays: 14, log: [],
      rank: 1, rankSeen: 1, rankAt: T0, rankBy: 'yoash',
      stages: [stage('sd', 'resources', 'משאבים', 'pending', [{ label: 'תקציב', value: '', classified: true }], { gate: 'commander', askedAt: T0 })] },
  ],
  tasks: [
    { id: 'k1', title: 'בקשה', project: 'p1', stage: null, owner: 'yahali', by: 'yoash', status: 'todo', ask: true, ack: { state: 'ok', at: T0 }, fromCommander: true, priority: 'high', due: '2026-11-01', createdAt: T0 },
    { id: 'c1', title: 'משימה תחת הבקשה', project: 'p1', stage: 'sb', owner: 'yarden', by: 'yahali', status: 'doing', parent: 'k1', due: null, createdAt: T0 },
    { id: 'm1', title: 'משימה של המפקד', project: null, stage: null, owner: 'yoash', by: 'yoash', status: 'todo', due: null, createdAt: T0 },
  ],
  outputs: [],
  meetings: [],
});
// Takes out what v4 may change (field ids, perms and v), to compare the rest.
const rest = (s) => clone({ ...s, v: 0, people: s.people.map(({ perms, ...x }) => x),
  projects: s.projects.map((p) => ({ ...p, stages: p.stages.map((st) => ({ ...st, fields: st.fields.map(({ id, ...f }) => f) })) })) });

test('26 a v3 state: only field ids, perms and v change', () => {
  const before = v3();
  const out = migrate(clone(before));
  assert.equal(out.v, 4);
  assert.deepEqual(rest(out), rest(before));
  // ranks, asks and the commander's own task are untouched
  assert.deepEqual(out.tasks, before.tasks);
  assert.deepEqual(out.projects.map(({ id, rank, rankSeen, rankAt, rankBy }) => ({ id, rank, rankSeen, rankAt, rankBy })),
    before.projects.map(({ id, rank, rankSeen, rankAt, rankBy }) => ({ id, rank, rankSeen, rankAt, rankBy })));
  // field ids: `${stage id}f${index}`, and an id already there is kept
  const [p1, p2] = out.projects;
  assert.deepEqual(p1.stages.map((s) => s.fields.map((f) => f.id)), [['saf0'], ['sbf0', 'sbf1'], ['keep-me', 'scf1']]);
  assert.equal(p1.stages[1].fields[1].value, 'נכתב לפני העדכון');
  assert.deepEqual(p2.stages[0].fields[0], { label: 'תקציב', value: '', classified: true, id: 'sdf0' });
  // perms come from the sample only where the key is absent
  assert.deepEqual(out.people.find((x) => x.id === 'yahali').perms, ['types']);
  assert.deepEqual(out.people.find((x) => x.id === 'yarden').perms, []);
  assert.equal('perms' in out.people.find((x) => x.id === 'yonatan'), false);
  // twice is once
  assert.deepEqual(migrate(clone(out)), out);
  assert.deepEqual(migrate(migrate(clone(before))), out);
  // a saved perms of [] for Yahali stays empty
  const none = v3();
  none.people.find((x) => x.id === 'yahali').perms = [];
  assert.deepEqual(migrate(none).people.find((x) => x.id === 'yahali').perms, []);
  // upgradeV4 reads the permissions it is given, and with none gives none
  assert.deepEqual(upgradeV4(v3(), [{ id: 'yarden', perms: ['types'] }]).people.find((x) => x.id === 'yarden').perms, []);
  assert.equal('perms' in upgradeV4(v3()).people.find((x) => x.id === 'yahali'), false);
});

test('a stage field that is not a field passes through v4 as it was, so the load goes on as the v3 build\'s did', () => {
  const s = v3();
  s.projects[0].stages[2].fields = [null, { label: 'בלי מזהה', value: '' }, 'טקסט', [], { id: 'keep-me', label: 'עם מזהה', value: '' }];
  let out;
  assert.doesNotThrow(() => { out = migrate(clone(s)); });
  assert.deepEqual(out.projects[0].stages[2].fields, [null, { label: 'בלי מזהה', value: '', id: 'scf1' }, 'טקסט', [], { id: 'keep-me', label: 'עם מזהה', value: '' }]);
  assert.deepEqual(out.projects[0].stages[1].fields.map((f) => f.id), ['sbf0', 'sbf1']);
  assert.deepEqual(migrate(clone(out)), out);
});

test('27 a v2 state goes through toV3, then v4', () => {
  const v2 = clone(v3());
  delete v2.v;
  v2.people = v2.people.map(({ command, ...x }) => x); // v2 had no command
  v2.projects = v2.projects.map(({ rank, rankSeen, rankAt, rankBy, ...p }) => p); // nor an order
  v2.tasks = [
    { id: 'x1', title: 'מה שהמפקד הוסיף', project: 'p1', stage: 'sb', owner: 'yahali', by: 'yoash', status: 'todo', fromCommander: true, due: null, createdAt: T0 },
    { id: 'x2', title: 'משימה של מי שלא בפרויקט', project: 'p1', stage: 'sb', owner: 'yonatan', by: 'yonatan', status: 'todo', due: null, createdAt: T0 },
  ];
  const three = toV3(clone(v2));
  assert.equal(three.v, 3);
  assert.equal(three.people.find((x) => x.id === 'yonatan').command, true);
  // the order follows the sample's: p1 first, then p2
  assert.deepEqual(three.projects.map((p) => [p.id, p.rank, p.rankSeen]), [['p1', 1, 1], ['p2', 2, 2]]);
  assert.equal(three.tasks.find((t) => t.id === 'x1').ask, true);
  assert.equal(three.projects.find((p) => p.id === 'p1').partners.includes('yonatan'), true);
  const four = migrate(clone(v2));
  assert.equal(four.v, 4);
  // toV3 stamps the asks it makes with the time it runs, so the two runs may be a millisecond apart
  const stamp = (s) => ({ ...s, tasks: s.tasks.map((t) => (t.ack ? { ...t, ack: { ...t.ack, at: 'AT' } } : t)) });
  assert.ok(four.tasks.filter((t) => t.ack).every((t) => !Number.isNaN(Date.parse(t.ack.at))));
  assert.deepEqual(rest(stamp(four)), rest(stamp(three)));
  assert.deepEqual(four.projects[0].stages[1].fields.map((f) => f.id), ['sbf0', 'sbf1']);
  assert.deepEqual(four.people.find((x) => x.id === 'yahali').perms, ['types']);
  // toV3 passes a v3 state through unchanged
  const saved = v3();
  assert.equal(toV3(saved), saved);
});

test('28 the fresh sample is v4, with ids on every field and places that agree with levels', () => {
  const s = freshState();
  assert.equal(s.v, 4);
  for (const p of s.projects) for (const st of p.stages) for (const f of st.fields) assert.ok(f.id, `${p.id} ${st.name} ${f.label}`);
  const ids = s.projects.map((p) => p.id);
  assert.deepEqual(ids, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  for (const p of s.projects) {
    assert.equal(p.place, placeOf(p), p.id);
    assert.equal(p.classification, levelOf(p), p.id);
  }
  const by = (id) => s.projects.find((p) => p.id === id);
  assert.equal(by('p7').parent, 'p6');
  assert.notEqual(nextLink(by('p8').link), null);
  assert.deepEqual(s.people.find((x) => x.id === 'yahali').perms, ['types']);
  // the sample's own literal fields (p2) get their ids here
  const p2 = by('p2');
  const pending = p2.stages.find((st) => st.state === 'pending');
  assert.deepEqual(pending.fields.map((f) => f.id), pending.fields.map((f, i) => `${pending.id}f${i}`));
  // a fresh state never shares objects with the sample
  assert.notEqual(s.projects[0], seed.projects[0]);
  // the ranks stay 1 to N, and p7 waits for a place
  assert.deepEqual(s.projects.filter((p) => p.rank != null).map((p) => p.rank).sort(), [1, 2, 3, 4, 5, 6]);
  assert.equal(by('p7').rank, null);
});

test('29 rollback: v4 data saved again by the old build comes back as it was', () => {
  const s = clone(freshState());
  // the old build passes v4 data through (its guard is >= 3), and its next save writes v: 3 with every project key
  const oldSave = { ...clone(s), v: 3 };
  assert.deepEqual(migrate(oldSave), { ...s, v: 4 });
});
