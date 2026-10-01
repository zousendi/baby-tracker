import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, localInput, recordsForDay, summarize, goal, shiftDay } from '../lib/model.ts';
const record=(kind,at,extra={})=>({id:'id',kind,at,ml:0,left:0,right:0,milkType:'formula',note:'',version:1,author:'papa',updatedAt:0,...extra});
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
