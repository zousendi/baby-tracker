import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, localInput, recordsForDay, summarize, goal, shiftDay, analyzeMilk, milkEvents, median, cumulativeMilk } from '../lib/model.ts';
import { normalizeWakeAt } from '../lib/record-wake.ts';
const record=(kind,at,extra={})=>({id:'id',kind,at,ml:0,left:0,right:0,milkType:'formula',note:'',version:1,author:'papa',updatedAt:0,...extra});
test('cumulative milk uses Japan dates, steps, same-clock comparison and stops today at now',()=>{
  const rows=[record('milk','2026-09-30T15:00:00Z',{ml:50}),record('milk','2026-10-01T08:00+09:00',{ml:100}),record('milk','2026-10-01T18:00+09:00',{ml:200}),record('milk','2026-10-02T08:00+09:00',{ml:80,milkType:'expressed'}),record('milk','2026-10-03T12:00+09:00',{ml:120}),record('breast','2026-10-03T09:00+09:00',{left:10}),record('milk','2026-10-03T13:00+09:00',{ml:999})];
  const before=rows.slice(),now=new Date('2026-10-03T12:00+09:00');
  const series=cumulativeMilk(rows,'2026-10-03','all',now);
  assert.deepEqual(series.map(s=>s.key),['2026-10-01','2026-10-02','2026-10-03']);
  assert.deepEqual(series.map(s=>s.total),[350,80,120]);
  assert.deepEqual(series.map(s=>s.sameTimeTotal),[150,80,120]);
  assert.deepEqual(series.map(s=>s.endMinute),[1440,1440,720]);
  assert.deepEqual(series[0].points.slice(0,5),[{minute:0,ml:0},{minute:0,ml:0},{minute:0,ml:50},{minute:480,ml:50},{minute:480,ml:150}]);
  assert.deepEqual(rows,before);
  assert.equal(cumulativeMilk(rows,'2026-10-03','formula',now)[1].hasRecords,false);
  assert.equal(cumulativeMilk(rows,'2026-10-03','expressed',now)[1].total,80);
  const past=cumulativeMilk(rows,'2026-10-02','all',now);
  assert.equal(past[0].hasRecords,false);
  assert.equal(past[1].sameTimeTotal,350);
  assert.equal(past[2].endMinute,1440);
});
test('family calendar uses Japan time regardless of device time zone',()=>{
  assert.equal(dayKey('2026-10-01T15:00:00Z'),'2026-10-02');
  assert.equal(localInput('2026-10-01T15:05:00Z'),'2026-10-02T00:05');
  assert.equal(shiftDay('2026-10-01',-1),'2026-09-30');
  assert.equal(recordsForDay([record('milk','2026-10-01T14:59:00Z'),record('milk','2026-10-01T15:00:00Z')],'2026-10-01').length,1);
});
test('direct feeding and combined diaper totals preserve their separate meanings',()=>{
  const rows=[record('milk','2026-10-01T03:00:00Z',{ml:120}),record('breast','2026-10-01T05:00:00Z',{left:8,right:7}),record('both','2026-10-01T05:15:00Z')];
  assert.deepEqual(summarize(rows),{ml:120,feeds:2,minutes:15,pee:1,poop:1,gap:120});
  assert.equal(recordsForDay(rows,'2026-10-01','13:00').length,1);
});
test('unfinished day does not produce a deficiency diagnosis',()=>{
  assert.equal(goal(100,700,900,true),'inProgress');
  assert.equal(goal(100,null,null,false),'noGoal');
  assert.equal(goal(100,700,900,false),'below');
  assert.equal(goal(950,700,900,true),'above');
  assert.equal(goal(900,700,900,true),'within');
});

test('milk intervals cross midnight, include direct breastfeeding, and omit pending/future feeds', () => {
  const rows = [record('milk', '2026-09-30T23:00+09:00', { ml: 120 }), record('breast', '2026-10-01T01:00+09:00', { left: 5 }), record('milk', '2026-10-01T03:00+09:00', { ml: 80 }), record('milk', '2026-10-02T03:00+09:00', { ml: 100 })];
  const events = milkEvents(rows.reverse(), new Date('2026-10-01T12:00+09:00'));
  assert.equal(events.length, 2);
  assert.equal(events[0].gap, 120);
  assert.equal(events[0].next.kind, 'breast');
  assert.equal(events[1].gap, null);
  assert.equal(median([null, 0, 10, 30, 90]), 20);
  assert.equal(median([null]), null);
});

test('today compares same-clock totals, excludes missing days, and keeps per-feed averages', () => {
  const rows = [record('milk', '2026-09-29T08:00+09:00', { ml: 80 }), record('milk', '2026-09-29T18:00+09:00', { ml: 200 }), record('milk', '2026-09-30T18:00+09:00', { ml: 120 }), record('milk', '2026-10-01T08:00+09:00', { ml: 100 })];
  const a = analyzeMilk(rows, '2026-10-01', 7, 'all', new Date('2026-10-01T12:00+09:00'));
  assert.equal(a.baselineDays, 2);
  assert.equal(a.baselineTotal, 40);
  assert.equal(a.baselineAverage, 133);
  assert.equal(a.total, 100);
  assert.equal(a.days[0].total, null);
  assert.equal(a.days.length, 7);
  assert.equal(analyzeMilk([], '2026-10-01', 30).baselineTotal, null);
  const past = analyzeMilk(rows, '2026-09-30', 14, 'all', new Date('2026-10-01T12:00+09:00'));
  assert.equal(past.baselineTotal, 280);
  assert.equal(past.gap, 840);
});

test('amount grouping uses completed intervals and valid explicitly-recorded wakes only', () => {
  const rows = [record('milk', '2026-10-01T01:00+09:00', { ml: 79, wakeAt: '2026-10-01T02:00+09:00' }), record('milk', '2026-10-01T03:00+09:00', { ml: 80, milkType: 'expressed', wakeAt: '2026-10-01T07:00+09:00' }), record('milk', '2026-10-01T06:00+09:00', { ml: 120 })];
  const now = new Date('2026-10-01T12:00+09:00');
  const a = analyzeMilk(rows, '2026-10-01', 7, 'all', now);
  assert.deepEqual(a.groups.map(g => g.count), [1, 1, 0, 0, 0]);
  assert.equal(a.groups[0].wake, 60);
  assert.equal(a.groups[1].wake, null);
  const filtered = analyzeMilk(rows, '2026-10-01', 7, 'formula', now);
  assert.equal(filtered.total, 199);
  assert.equal(filtered.selected[0].gap, 120);
  assert.equal(filtered.groups[1].count, 0);
  assert.throws(()=>normalizeWakeAt('milk',rows[0].at,'2026-09-30T23:00+09:00',+now));
  assert.throws(()=>normalizeWakeAt('milk',rows[0].at,'2026-10-02T02:00+09:00',+now));
  assert.equal(normalizeWakeAt('milk',rows[0].at,rows[0].wakeAt,+now),new Date(rows[0].wakeAt).toISOString());
  assert.equal(normalizeWakeAt('milk',rows[0].at,undefined,+now),null);
  assert.equal(normalizeWakeAt('breast',rows[0].at,rows[0].wakeAt,+now),null);
});
