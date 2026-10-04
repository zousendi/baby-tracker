import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWeight, weightHistory } from '../lib/weight.ts';
const now=new Date('2026-10-04T15:01:00Z'); // October 5 in Japan.
test('weight validation uses Japan dates and integer grams without accepting future or invalid days',()=>{
  assert.deepEqual(validateWeight({day:'2026-10-05',grams:3500,note:'  morning  '},now),{day:'2026-10-05',grams:3500,note:'morning'});
  for(const day of ['2026-10-06','2026-02-30','2026-13-01','2026-1-01','invalid',null])assert.throws(()=>validateWeight({day,grams:3500},now),/INVALID_TIME/);
  for(const grams of [0,-1,50001,3.5,'3500',null,NaN,Infinity])assert.throws(()=>validateWeight({day:'2026-10-04',grams},now),/INVALID_WEIGHT/);
  assert.equal(validateWeight({day:'2026-10-04',grams:1},now).grams,1);
  assert.equal(validateWeight({day:'2026-10-04',grams:50000},now).grams,50000);
  assert.throws(()=>validateWeight({day:'2026-10-04',grams:3500,note:'x'.repeat(201)},now),/INVALID_INPUT/);
});
test('weight history keeps real measurements, handles missing days and compares the previous actual measurement',()=>{
  const rows=[{id:'a',day:'2026-09-01',grams:3100},{id:'b',day:'2026-10-01',grams:3300},{id:'c',day:'2026-10-04',grams:3500},{id:'d',day:'2026-10-05',grams:3510}];
  const snapshot=rows.slice();
  const history=weightHistory(rows,'2026-10-04',7);
  assert.equal(history.start,'2026-09-28');
  assert.deepEqual(history.rows.map(r=>r.id),['b','c']);
  assert.equal(history.selected.grams,3500);
  assert.equal(history.previous.day,'2026-10-01');
  assert.equal(weightHistory(rows,'2026-10-03',7).selected,null);
  assert.equal(weightHistory(rows,'2026-10-03',7).previous.id,'b');
  assert.equal(weightHistory(rows,'2026-09-02',7).previous.id,'a');
  assert.equal(weightHistory([],'2026-10-04',30).rows.length,0);
  assert.equal(weightHistory(rows,'2026-10-04',90).rows.length,3);
  assert.deepEqual(rows,snapshot);
});
