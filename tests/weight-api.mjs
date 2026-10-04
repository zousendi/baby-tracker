import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dayKey,shiftDay } from '../lib/model.ts';
const base=process.env.TEST_URL||'http://127.0.0.1:5178';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'API fixtures must be local');
const key=readFileSync('.dev.vars','utf8').match(/^ADMIN_KEY=(.+)$/m)?.[1];
const headers={'Content-Type':'application/json','X-App-Request':'komorebi'};
const families=[];
async function call(path,method='GET',body,cookie='',admin=false){return fetch(`${base}/api/${path}`,{method,headers:{...headers,...(cookie?{Cookie:cookie}:{}),...(admin?{Authorization:`Bearer ${key}`}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function create(path,body){const response=await call(`admin/${path}`,'POST',body,'',true);assert.equal(response.status,201);return response.json();}
const day=dayKey();
try{
  const cookies=[];
  for(let household=0;household<2;household++){
    const family=await create('families',{name:`Weight fixture ${randomUUID().slice(0,8)}`});families.push(family.id);
    const password=randomUUID(),username=`weight_${randomUUID().slice(0,8)}`;
    await create('users',{familyId:family.id,username,displayName:'Weight test',password});
    const login=await call('login','POST',{username,password});assert.equal(login.status,200);cookies.push(login.headers.get('set-cookie').split(';')[0]);
  }
  const [cookie,foreign]=cookies,first={id:randomUUID(),day,grams:3500,note:'Morning'};
  assert.equal((await call('weights','POST',first)).status,401);
  assert.equal((await call('weights','POST',first,cookie)).status,201);
  assert.equal((await call('weights','POST',first,cookie)).status,201,'Retry is idempotent');
  const snapshot=await(await call('state','GET',undefined,cookie)).json();
  assert.equal(snapshot.weights.length,1);assert.equal(snapshot.weights[0].grams,3500);assert.equal(snapshot.records.length,0);
  assert.equal((await call('weights','POST',{...first,id:randomUUID()},cookie)).status,409,'One measurement per household day');
  for(const grams of [0,-1,3.5,50001,'3500'])assert.equal((await call('weights','POST',{...first,id:randomUUID(),grams},cookie)).status,400);
  assert.equal((await call('weights','POST',{...first,id:randomUUID(),day:shiftDay(day,1)},cookie)).status,400);
  assert.equal((await call('weights','POST',{...first,id:randomUUID(),day:'2026-02-30'},cookie)).status,400);
  assert.equal((await call(`weights/${first.id}`,'PATCH',{...first,grams:3600,version:1},cookie)).status,200);
  assert.equal((await call(`weights/${first.id}`,'PATCH',{...first,grams:3700,version:1},cookie)).status,409,'Stale version cannot overwrite');
  assert.equal((await call(`weights/${first.id}`,'DELETE',{version:1},cookie)).status,409);
  assert.equal((await call(`weights/${first.id}`,'PATCH',{...first,version:2},foreign)).status,404);
  assert.equal((await call(`weights/${first.id}`,'DELETE',{version:2},foreign)).status,404);
  const foreignState=await(await call('state','GET',undefined,foreign)).json();assert.equal(foreignState.weights.length,0);
  assert.equal((await call('weights','POST',{...first,id:randomUUID(),grams:4000},foreign)).status,201,'Same day allowed for a different family');
  const previous={...first,id:randomUUID(),day:shiftDay(day,-1),grams:3450};
  assert.equal((await call('weights','POST',previous,cookie)).status,201);
  assert.equal((await call(`weights/${previous.id}`,'PATCH',{...previous,day,version:1},cookie)).status,409,'Cannot move a record onto an existing day');
  const current=await(await call('state','GET',undefined,cookie)).json();assert.deepEqual(current.weights.map(w=>w.grams),[3600,3450]);
  assert.equal(current.weights[0].version,2);
  assert.equal((await call(`weights/${first.id}`,'DELETE',{version:2},cookie)).status,200);
  const final=await(await call('state','GET',undefined,cookie)).json();assert.equal(final.weights.length,1);
  const csrf=await fetch(`${base}/api/weights`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(first)});assert.equal(csrf.status,403);
  console.log('Weight API: persistence, idempotency, day uniqueness, validation, optimistic locking, deletion, CSRF and family isolation passed');
}finally{
  mkdirSync('.sites-runtime',{recursive:true});
  const statements=[];
  for(const id of families){assert.match(id,/^[a-f0-9-]{36}$/);statements.push(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE family_id='${id}');`,`DELETE FROM weights WHERE family_id='${id}';`,`DELETE FROM users WHERE family_id='${id}';`,`DELETE FROM families WHERE id='${id}';`);}
  writeFileSync('.sites-runtime/weight-test-cleanup.sql',statements.join('\n'));
}
