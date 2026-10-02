import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, shiftDay, recordsForDay, summarize, analyzeMilk, milkEvents, median, validateRecord, makeDemo } from '../src/model.js';
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
test('milk intervals cross midnight, include direct breastfeeding, and omit pending/future feeds', () => {
  const rows = [record('milk', '2026-09-30T23:00', { ml: 120 }), record('breast', '2026-10-01T01:00', { left: 5 }), record('milk', '2026-10-01T03:00', { ml: 80 }), record('milk', '2026-10-02T03:00', { ml: 100 })];
  const events = milkEvents(rows.reverse(), new Date('2026-10-01T12:00'));
  assert.equal(events.length, 2);
  assert.equal(events[0].gap, 120);
  assert.equal(events[0].next.kind, 'breast');
  assert.equal(events[1].gap, null);
  assert.equal(median([null, 0, 10, 30, 90]), 20);
  assert.equal(median([null]), null);
});

test('today compares same-clock totals, excludes missing days, and keeps per-feed averages', () => {
  const rows = [record('milk', '2026-09-29T08:00', { ml: 80 }), record('milk', '2026-09-29T18:00', { ml: 200 }), record('milk', '2026-09-30T18:00', { ml: 120 }), record('milk', '2026-10-01T08:00', { ml: 100 })];
  const a = analyzeMilk(rows, '2026-10-01', 7, 'all', new Date('2026-10-01T12:00'));
  assert.equal(a.baselineDays, 2);
  assert.equal(a.baselineTotal, 40);
  assert.equal(a.baselineAverage, 133);
  assert.equal(a.total, 100);
  assert.equal(a.days[0].total, null);
  assert.equal(a.days.length, 7);
  assert.equal(analyzeMilk([], '2026-10-01', 30).baselineTotal, null);
  const past = analyzeMilk(rows, '2026-09-30', 14, 'all', new Date('2026-10-01T12:00'));
  assert.equal(past.baselineTotal, 280);
  assert.equal(past.gap, 840);
});

test('amount grouping uses completed intervals and valid explicitly-recorded wakes only', () => {
  const rows = [record('milk', '2026-10-01T01:00', { ml: 79, wakeAt: '2026-10-01T02:00' }), record('milk', '2026-10-01T03:00', { ml: 80, milkType: 'expressed', wakeAt: '2026-10-01T07:00' }), record('milk', '2026-10-01T06:00', { ml: 120 })];
  const now = new Date('2026-10-01T12:00');
  const a = analyzeMilk(rows, '2026-10-01', 7, 'all', now);
  assert.deepEqual(a.groups.map(g => g.count), [1, 1, 0, 0, 0]);
  assert.equal(a.groups[0].wake, 60);
  assert.equal(a.groups[1].wake, null);
  const filtered = analyzeMilk(rows, '2026-10-01', 7, 'formula', now);
  assert.equal(filtered.total, 199);
  assert.equal(filtered.selected[0].gap, 120);
  assert.equal(filtered.groups[1].count, 0);
  assert.ok(validateRecord({ ...rows[0], wakeAt: '2026-09-30T23:00' }, now));
  assert.ok(validateRecord({ ...rows[0], wakeAt: '2026-10-02T02:00' }, now));
  assert.equal(validateRecord(rows[0], now), '');
});
test('invalid amounts, durations and future timestamps cannot be saved', () => {
  const now = new Date('2026-10-01T12:00');
  assert.ok(validateRecord(record('milk', '2026-10-01T10:00', { ml: 0 }), now));
  assert.ok(validateRecord(record('milk', '2026-10-01T10:00', { ml: 1.5 }), now));
  assert.ok(validateRecord(record('breast', '2026-10-01T10:00', { left: -1, right: 5 }), now));
  assert.ok(validateRecord(record('milk', '2026-10-02T10:00', { ml: 100 }), now));
  assert.equal(validateRecord(record('milk', '2026-10-01T10:00', { ml: 100 }), now), '');
});
test('demo includes recent history without future records or future wake times even near midnight', () => {
  const now = new Date('2026-10-01T00:01');
  const demo = makeDemo(now);
  assert.ok(demo.records.length > 50);
  assert.ok(demo.records.every(r => new Date(r.at) <= now));
  assert.equal(recordsForDay(demo.records, dayKey(now)).length, 0);
  assert.ok(demo.records.every(r => !validateRecord(r, now)));
});
