// The ID card's rules, run with: node --test m/card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stagesFromTemplate, closeStage, returnStage, weeklyUpdate, needsCommander, status, stageReady, cardFill, DAY } from './card.js';

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
