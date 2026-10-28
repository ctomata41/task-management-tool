// The ID card's rules, run with: node --test m/card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stagesFromTemplate, closeStage, returnStage, weeklyUpdate, needsCommander, status, stageReady, cardFill, schedule, dayStart, addDays, DAY } from './card.js';

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

test('a skipped first stage keeps the closed stages on their dates, whatever day it is', () => {
  const now = new Date(2026, 9, 28, 12).getTime();
  const p = base();
  p.stages[0] = { ...p.stages[0], state: 'skipped' }; // skipping never sets closedAt
  p.stages[1] = { ...p.stages[1], state: 'done', closedAt: new Date(2026, 9, 21, 16).toISOString() };
  p.stages[2] = { ...p.stages[2], state: 'active', target: '2026-11-06' };
  const sch = schedule(p, now);
  assert.equal(sch[1].end, dayStart('2026-10-21'));
  assert.equal(sch[0].start, sch[0].end); // the skipped stage takes no time
  assert.equal(sch[0].end, sch[1].start);
  assert.equal(sch[2].start, dayStart('2026-10-21'));
  assert.equal(sch[2].end, dayStart('2026-11-06'));
  // A week later nothing that has a date has moved.
  assert.deepEqual(schedule(p, addDays(now, 7)).slice(0, 3), sch.slice(0, 3));
  // A stage not started yet, moved in front of the open one, doesn't push the open one into the future.
  const q = base();
  q.stages = [q.stages[1], q.stages[0], ...q.stages.slice(2)]; // todo, active, …
  const r = schedule(q, now);
  assert.equal(r[0].end, r[0].start);
  assert.ok(r[1].start < dayStart(now));
});

test('a target that is not a plausible day is no target', () => {
  const now = new Date(2026, 9, 28, 12).getTime();
  const today = dayStart(now);
  const p = base();
  // A date field passes through these while a year is typed; a fifth digit gives a five-digit year.
  for (const target of ['0002-11-06', '0202-11-06', '1999-12-31', '2101-01-01', '20266-11-06', 'not a date']) {
    p.stages[0].target = target;
    const sch = schedule(p, now);
    assert.equal(sch[0].est, true, target);
    assert.equal(sch[0].late, false, target);
    assert.equal(sch[0].start, addDays(today, -7), target);
    for (const r of sch) assert.ok(r.start >= addDays(today, -7) && r.end < addDays(today, 400), target);
  }
  p.stages[0].target = '2026-11-06';
  assert.equal(schedule(p, now)[0].end, dayStart('2026-11-06'));
  assert.equal(schedule(p, now)[0].est, false);
});

test('stages after a late open stage start no earlier than tomorrow', () => {
  const now = new Date(2026, 9, 28, 12).getTime();
  const tomorrow = addDays(dayStart(now), 1);
  const p = base();
  p.stages[0] = { ...p.stages[0], state: 'done', closedAt: new Date(2026, 7, 2, 11).toISOString() };
  p.stages[1] = { ...p.stages[1], state: 'pending', target: '2026-09-18' }; // forty days late
  const sch = schedule(p, now);
  assert.equal(sch[1].late, true);
  assert.equal(sch[1].end, dayStart('2026-09-18')); // the late stage keeps its target; the overrun is drawn to today
  assert.equal(sch[2].start, tomorrow);
  for (const r of sch.slice(2)) assert.ok(r.start >= tomorrow && r.end > r.start);
  // On time, the next stage starts where the open one ends.
  p.stages[1].target = '2026-11-20';
  assert.equal(schedule(p, now)[2].start, dayStart('2026-11-20'));
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
