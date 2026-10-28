// The ID card's rules, run with: node --test m/card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stagesFromTemplate, closeStage, returnStage, weeklyUpdate, needsCommander, status, stageReady, cardFill, schedule, dayStart, addDays, DAY,
  placeProject, byRank, askState, KIND_ORDER } from './card.js';

const base = (template = 'tool') => ({ id: 'p', name: 'בדיקה', stages: stagesFromTemplate(template), what: '', forWhom: '', success: '', log: [], tolDays: 14 });

test('a template starts on its first stage', () => {
  const p = base();
  assert.equal(p.stages[0].state, 'active');
  assert.equal(status(p).where, 'תיחום');
});

test('a manager stage closes at once; a commander stage waits for the commander', () => {
  let p = base();
  p = closeStage(p, { choice: 'next', by: 'm' }); // scope
  p = closeStage(p, { choice: 'next', by: 'm' }); // need
  p = closeStage(p, { choice: 'next', by: 'm' }); // spec
  assert.equal(p.stages[3].name, 'משאבים');
  p = closeStage(p, { choice: 'next', by: 'm' });
  assert.equal(p.stages[3].state, 'pending');
  assert.equal(needsCommander(p).filter((x) => x.kind === 'gate').length, 1);
  const back = returnStage(p, { by: 'c', note: 'חסר תקציב' });
  assert.equal(back.stages[3].state, 'active');
  p = closeStage(p, { choice: 'next', by: 'c', byCommander: true });
  assert.equal(p.stages[3].state, 'done');
  assert.equal(p.stages[4].state, 'active');
});

test('stop and back are logged', () => {
  let p = closeStage(base(), { choice: 'next', by: 'm' });
  p = closeStage(p, { choice: 'back', by: 'm' });
  assert.equal(p.stages[0].state, 'active');
  p = closeStage(p, { choice: 'stop', by: 'm', note: 'אין דורש' });
  assert.equal(p.phase, 'stopped');
  assert.equal(p.log[0].reversible, false);
  assert.deepEqual(needsCommander(p), []);
});

test('the commander hears of a stage late beyond tolerance, and of stuck for two weeks', () => {
  const now = Date.now();
  const p = base();
  p.stages[0].target = new Date(now - 20 * DAY).toISOString();
  assert.equal(needsCommander(p, [], now)[0].kind, 'late');
  const q = weeklyUpdate(base(), { hill: 'up', confidence: 'stuck', note: 'x', now: now - 14 * DAY });
  assert.equal(needsCommander(q, [], now)[0].kind, 'late');
});

test('an external commitment near its date and not in progress reaches the commander', () => {
  const now = Date.now();
  const tasks = [{ id: 't', project: 'p', external: 'ספק', status: 'todo', due: new Date(now + DAY).toISOString(), title: 'מסמך' }];
  assert.equal(needsCommander(base(), tasks, now)[0].kind, 'commit');
  assert.equal(needsCommander(base(), [{ ...tasks[0], status: 'doing' }], now).length, 0);
});

test('a stage is ready when all of its tasks are done', () => {
  const p = base();
  const s = p.stages[0].id;
  assert.equal(stageReady(p, []), false);
  assert.equal(stageReady(p, [{ project: 'p', stage: s, status: 'done' }]), true);
  assert.equal(stageReady(p, [{ project: 'p', stage: s, status: 'done' }, { project: 'p', stage: s, status: 'todo' }]), false);
});

test('unknown and classified fields count as answered', () => {
  const p = base();
  p.stages[0].fields[0].classified = true;
  assert.deepEqual(cardFill(p), { done: 1, of: 4 });
});

test('the Gantt places closed stages by their dates, open ones by target, and estimates the rest', () => {
  const now = new Date(2026, 9, 28, 12).getTime();
  const day = (n) => addDays(dayStart(now), n);
  const p = base();
  p.stages[0] = { ...p.stages[0], state: 'done', closedAt: new Date(day(-14)).toISOString() };
  p.stages[1] = { ...p.stages[1], state: 'done', closedAt: new Date(day(-7)).toISOString() };
  p.stages[2] = { ...p.stages[2], state: 'active', target: '2026-11-06' };
  const sch = schedule(p, now);
  assert.equal(sch.length, p.stages.length);
  assert.equal(sch[0].end, day(-14));
  assert.equal(sch[1].start, day(-14));
  assert.equal(sch[1].end, day(-7));
  assert.equal(sch[2].start, day(-7));
  assert.equal(sch[2].end, dayStart('2026-11-06'));
  assert.equal(sch[2].est, false);
  assert.equal(sch[2].late, false);
  assert.equal(sch[3].start, sch[2].end);
  assert.equal(sch[3].est, true);
  assert.ok(sch[3].end > sch[3].start);
  // An open stage past its target is late; one with no target never ends before tomorrow.
  p.stages[2].target = '2026-10-20';
  assert.equal(schedule(p, now)[2].late, true);
  p.stages[2].target = null;
  p.stages[1].closedAt = new Date(day(-60)).toISOString();
  p.stages[0].closedAt = new Date(day(-90)).toISOString();
  assert.ok(schedule(p, now)[2].end > dayStart(now));
});

test('a date-only string is a local day', () => {
  const d = new Date(dayStart('2026-10-30'));
  assert.equal(d.getDate(), 30);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getHours(), 0);
});

test('Gantt days stay on midnight across the clock change', () => {
  // Israel leaves summer time on 25/10/2026; six weeks of stages from 1/10 must still land on whole days.
  const p = base();
  p.startedAt = '2026-10-01';
  for (const r of schedule(p, new Date(2026, 9, 2).getTime())) {
    assert.equal(new Date(r.start).getHours(), 0);
    assert.equal(new Date(r.end).getHours(), 0);
  }
});

test('a half-typed year stays that year, and the commander sees lateness in calendar days', () => {
  assert.equal(new Date(dayStart('0026-10-29')).getFullYear(), 26);
  const now = new Date(2026, 9, 28, 15, 0).getTime();
  const p = base();
  p.stages[0].target = '2026-10-08';
  const late = needsCommander(p, [], now).find((x) => x.kind === 'late');
  assert.equal(late.text.includes('20 ימים'), true);
  assert.equal(late.by, '2026-10-08');
  // Due today is not late yet, even in the afternoon; due yesterday is.
  const t = { id: 't', project: 'p', external: 'ספק', status: 'doing', title: 'מסמך' };
  assert.equal(needsCommander(base(), [{ ...t, due: '2026-10-28' }], now).length, 0);
  assert.equal(needsCommander(base(), [{ ...t, due: '2026-10-27' }], now)[0].why, 'התחייבות חיצונית באיחור');
});

// ---------- the order of the projects ----------
const order = () => [
  { id: 'a', rank: 1 }, { id: 'b', rank: 2 }, { id: 'c', rank: 3 }, { id: 'd', rank: 4 },
  { id: 'me', personal: 'x', rank: null }, { id: 'new', rank: null },
];

test('placing a project at the top renumbers the rest', () => {
  assert.deepEqual(placeProject(order(), 'c', 1), { a: 2, b: 3, c: 1, d: 4, me: null, new: null });
  assert.deepEqual(placeProject(order(), 'a', 3), { a: 3, b: 1, c: 2, d: 4, me: null, new: null });
  // Past the end means last; its own place changes nothing.
  assert.deepEqual(placeProject(order(), 'b', 99), { a: 1, b: 4, c: 2, d: 3, me: null, new: null });
  assert.deepEqual(placeProject(order(), 'b', 2), { a: 1, b: 2, c: 3, d: 4, me: null, new: null });
});

test('a new project waits unplaced until it is given a place, and a personal one never takes one', () => {
  assert.deepEqual(placeProject(order(), 'new', 2), { a: 1, new: 2, b: 3, c: 4, d: 5, me: null });
  assert.deepEqual(placeProject(order(), 'me', 1), { a: 1, b: 2, c: 3, d: 4, me: null, new: null });
  assert.deepEqual(placeProject(order(), 'b', null), { a: 1, b: null, c: 2, d: 3, me: null, new: null });
});

test('held, stopped and finished projects drop out of the order, and the rest close up', () => {
  const ps = order();
  ps[1].phase = 'hold';
  ps[2].phase = 'stopped';
  assert.deepEqual(placeProject(ps), { a: 1, b: null, c: null, d: 2, me: null, new: null });
  ps[0].phase = 'done';
  assert.deepEqual(placeProject(ps, 'd', 1), { a: null, b: null, c: null, d: 1, me: null, new: null });
  // A held project can't be placed; back from the hold it goes to the end.
  assert.equal(placeProject(ps, 'b', 1).b, null);
  ps[1].phase = 'active';
  ps[1].rank = null;
  assert.deepEqual(placeProject(ps, 'b', Infinity), { a: null, b: 2, c: null, d: 1, me: null, new: null });
});

test('the order lists placed projects first, then unplaced, then held', () => {
  const ps = [{ id: 'h', phase: 'hold', rank: null }, { id: 'u', rank: null }, { id: 'two', rank: 2 }, { id: 'one', rank: 1 }];
  assert.deepEqual([...ps].sort(byRank).map((p) => p.id), ['one', 'two', 'u', 'h']);
});

// ---------- asks ----------
test('an ask goes sent, accepted, in work, talk, late and done', () => {
  const now = new Date(2026, 9, 28, 15, 0).getTime();
  const ask = { id: 'k', project: 'p', ask: true, status: 'todo', ack: null, due: '2026-10-29', title: 'בקשה' };
  const st = (a, tasks = []) => askState(a, tasks, now);
  assert.deepEqual(st(ask), { state: 'sent', n: 0, m: 0 });
  const ok = { ...ask, ack: { state: 'ok' } };
  assert.deepEqual(st(ok), { state: 'ok', n: 0, m: 0 });
  const under = [{ id: 'c1', parent: 'k', status: 'todo' }, { id: 'c2', parent: 'k', status: 'done' }, { id: 'x', status: 'done' }];
  assert.deepEqual(st(ok, under), { state: 'doing', n: 1, m: 2 });
  assert.deepEqual(st(ok, [under[0]]), { state: 'doing', n: 0, m: 1 }); // "בעבודה 0/1" as soon as it is broken down
  assert.equal(st({ ...ask, ack: { state: 'talk' } }, under).state, 'talk');
  // After "דיברנו" it is accepted again.
  assert.equal(st({ ...ask, ack: { state: 'ok' } }, under).state, 'doing');
  // Due today is not late yet, even in the afternoon; due yesterday is, answered or not.
  assert.equal(st({ ...ok, due: '2026-10-28' }).state, 'ok');
  assert.equal(st({ ...ok, due: '2026-10-27' }, under).state, 'late');
  assert.equal(st({ ...ask, due: '2026-10-27' }).state, 'late');
  assert.equal(st({ ...ask, due: null }).state, 'sent');
  assert.deepEqual(st({ ...ok, due: '2026-10-27', status: 'done' }, under), { state: 'done', n: 1, m: 2 });
});

test('an ask the manager wants to talk about, or a late one, reaches the commander; a stuck task under it never does', () => {
  const now = new Date(2026, 9, 28, 15, 0).getTime();
  const p = base();
  const ask = { id: 'k', project: 'p', ask: true, status: 'todo', ack: { state: 'ok' }, due: '2026-11-05', title: 'בקשה' };
  const stuck = { id: 'c', project: 'p', parent: 'k', status: 'stuck', due: '2026-10-01', title: 'משימה תקועה' };
  assert.deepEqual(needsCommander(p, [ask, stuck], now), []);
  const talk = needsCommander(p, [{ ...ask, ack: { state: 'talk' } }, stuck], now);
  assert.deepEqual(talk.map((x) => [x.kind, x.why, x.task]), [['talk', 'צריך לדבר על הבקשה', 'k']]);
  const late = needsCommander(p, [{ ...ask, due: '2026-10-27' }, stuck], now);
  assert.deepEqual(late.map((x) => [x.kind, x.why, x.task]), [['asklate', 'בקשה שלך באיחור', 'k']]);
  // Done, or in a stopped project, it leaves the queue.
  assert.deepEqual(needsCommander(p, [{ ...ask, due: '2026-10-27', status: 'done' }], now), []);
  assert.deepEqual(needsCommander({ ...p, phase: 'stopped' }, [{ ...ask, due: '2026-10-27' }], now), []);
});

test('the queue reads gates first, then seniors, talks, late stages, late asks and commitments', () => {
  assert.deepEqual(KIND_ORDER, ['gate', 'senior', 'talk', 'late', 'asklate', 'commit']);
  const q = ['commit', 'asklate', 'gate', 'talk', 'late', 'senior'].map((kind) => ({ kind }));
  assert.deepEqual(q.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).map((x) => x.kind), KIND_ORDER);
});
