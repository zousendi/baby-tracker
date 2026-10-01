import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, shiftDay, recordsForDay, summarize, goalStatus, validateRecord, makeDemo } from '../src/model.js';
const record = (kind, at, extra = {}) => ({ id: '1', kind, at, ml: 0, left: 0, right: 0, note: '', ...extra });
test('midnight and previous-month records use local calendar dates', () => {
  const rows = [record('milk', '2026-09-30T23:59:00', { ml: 90 }), record('milk', '2026-10-01T00:00:00', { ml: 120 })];
  assert.equal(shiftDay('2026-10-01', -1), '2026-09-30');
  assert.equal(summarize(recordsForDay(rows, '2026-10-01')).ml, 120);
  assert.equal(recordsForDay(rows, '2026-09-30', 1200).length, 0);
});
test('combined diapers count once in each category and breast minutes are not ml', () => {
  const rows = [record('milk', '2026-10-01T01:00', { ml: 120 }), record('breast', '2026-10-01T03:00', { left: 8, right: 12 }), record('both', '2026-10-01T03:10')];
  assert.deepEqual(summarize(rows), { ml: 120, feeds: 2, breastMinutes: 20, pee: 1, poop: 1, averageGap: 120 });
});
test('unfinished day is not labelled deficient and goals remain user-defined', () => {
  assert.equal(goalStatus(100, 700, 900, true).label, '1日の目安まで記録中');
  assert.equal(goalStatus(100, null, null, false).label, '目安は未設定');
  assert.equal(goalStatus(700, 700, 900, false).tone, 'green');
  assert.equal(goalStatus(950, 700, 900, false).label, '設定した目安より多め');
});
test('invalid amounts, durations and future timestamps cannot be saved', () => {
  const now = new Date('2026-10-01T12:00');
  assert.ok(validateRecord(record('milk', '2026-10-01T10:00', { ml: 0 }), now));
  assert.ok(validateRecord(record('milk', '2026-10-01T10:00', { ml: 1.5 }), now));
  assert.ok(validateRecord(record('breast', '2026-10-01T10:00', { left: -1, right: 5 }), now));
  assert.ok(validateRecord(record('milk', '2026-10-02T10:00', { ml: 100 }), now));
  assert.equal(validateRecord(record('milk', '2026-10-01T10:00', { ml: 100 }), now), '');
});
test('demo includes seven local dates without future records even near midnight', () => {
  const now = new Date('2026-10-01T00:01');
  const demo = makeDemo(now);
  assert.ok(demo.records.length > 50);
  assert.ok(demo.records.every(r => new Date(r.at) <= now));
  assert.equal(recordsForDay(demo.records, dayKey(now)).length, 0);
  assert.ok(demo.records.every(r => !validateRecord(r, now)));
});
