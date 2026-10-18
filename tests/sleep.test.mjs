import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sleepTimeline,analyzeSleep} from '../lib/sleep.ts';
import {createPreviewSession} from '../lib/preview.ts';
const r=(kind,at)=>({id:randomUUID(),kind,at,ml:0,left:0,right:0,milkType:'formula',note:'',version:1,author:'test',updatedAt:+new Date(at)});
test('sleep crosses Japan midnight, splits daily totals and assigns full session length to wake day',()=>{
  const rows=[r('sleep','2026-10-01T22:30+09:00'),r('milk','2026-10-01T23:00+09:00'),r('wake','2026-10-02T02:00+09:00')];
  const a=analyzeSleep(rows,'2026-10-02',7,+new Date('2026-10-02T12:00+09:00'));
  assert.equal(a.days.at(-2).total,90);assert.equal(a.selected.total,120);assert.equal(a.longest,210);assert.equal(a.count,1);assert.equal(a.average,105);assert.equal(a.recordedDays,2);assert.equal(a.days[0].total,null);
  assert.equal(sleepTimeline(rows).sessions.length,1);
});
test('missing events, duplicate starts, ongoing and future events never inflate completed totals',()=>{
  const rows=[r('wake','2026-10-01T05:00+09:00'),r('sleep','2026-10-01T08:00+09:00'),r('sleep','2026-10-01T09:00+09:00'),r('wake','2026-10-01T10:00+09:00'),r('sleep','2026-10-01T11:00+09:00'),r('wake','2026-10-01T13:00+09:00')];
  const a=analyzeSleep(rows,'2026-10-01',7,+new Date('2026-10-01T12:00+09:00'));
  assert.equal(a.selected.total,60);assert.equal(a.unmatched.length,2);assert.equal(a.ongoing.id,rows[4].id);assert.equal(a.count,1);
  assert.equal(analyzeSleep([], '2026-10-01').average,null);
  assert.equal(sleepTimeline([r('sleep','2026-10-01T08:00+09:00'),r('wake','2026-10-01T08:00+09:00')]).sessions.length,0);
});
test('sleep records support CRUD, stale shortcut rejection, idempotency and removal in preview',()=>{
  const session=createPreviewSession(new Date(Date.now()-86400000));
  const latest=sleepTimeline(session.request('state').records).latest;
  const event={id:randomUUID(),kind:latest?.kind==='sleep'?'wake':'sleep',at:new Date().toISOString(),note:'',quickSleep:true,expectedSleepId:latest?.id??''};
  session.request('records','POST',event);session.request('records','POST',event);
  assert.throws(()=>session.request('records','POST',{...event,id:randomUUID()}),/SLEEP_CONFLICT/);
  session.request(`records/${event.id}`,'PATCH',{...event,note:'corrected',version:1});
  assert.equal(session.request('state').records.find(r=>r.id===event.id).note,'corrected');
  assert.throws(()=>session.request(`records/${event.id}`,'DELETE',{version:1}),/CONFLICT/);
  session.request(`records/${event.id}`,'DELETE',{version:2});
  assert.equal(session.request('state').records.some(r=>r.id===event.id),false);
});
