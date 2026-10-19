import test from 'node:test';
import assert from 'node:assert/strict';
import {poopDays} from '../lib/poop.ts';
const r=(id,kind,at)=>({id,kind,at,updatedAt:0});
test('bowel rhythm uses Japan dates, includes combined diapers and excludes other or future events',()=>{
 const rows=[r('a','poop','2026-10-01T14:59:00Z'),r('b','both','2026-10-01T15:00:00Z'),r('c','pee','2026-10-02T01:00+09:00'),r('d','sleep','2026-10-02T02:00+09:00'),r('e','poop','2026-10-03T01:00+09:00')];
 const days=poopDays(rows,'2026-10-02',7,+new Date('2026-10-02T12:00+09:00'));
 assert.equal(days.length,7);assert.equal(days[0].day,'2026-09-26');assert.equal(days[0].rows.length,0);
 assert.deepEqual(days.at(-2).rows.map(r=>r.id),['a']);assert.deepEqual(days.at(-1).rows.map(r=>r.id),['b']);
 assert.equal(days.at(-2).groups[0].minute,1439);assert.equal(days.at(-1).groups[0].minute,0);
});
test('nearby and simultaneous records remain individually accessible in chronological groups',()=>{
 const rows=[r('d','poop','2026-10-01T22:00+09:00'),r('c','both','2026-10-01T08:01+09:00'),r('a','poop','2026-10-01T08:00+09:00'),r('b','poop','2026-10-01T08:00+09:00')];
 const before=structuredClone(rows),day=poopDays(rows,'2026-10-01',14)[13];
 assert.equal(day.rows.length,4);assert.equal(day.groups.length,2);assert.equal(day.groups[0].records.length,3);assert.equal(day.groups[1].records[0].id,'d');assert.deepEqual(rows,before);
});
