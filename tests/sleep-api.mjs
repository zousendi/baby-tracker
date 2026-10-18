import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dayKey,shiftDay } from '../lib/model.ts';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
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
    const family=await create('families',{name:`Sleep fixture ${randomUUID().slice(0,8)}`});families.push(family.id);
    const password=randomUUID(),username=`sleep_${randomUUID().slice(0,8)}`;
    await create('users',{familyId:family.id,username,displayName:'Sleep test',password});
    const login=await call('login','POST',{username,password});assert.equal(login.status,200);cookies.push(login.headers.get('set-cookie').split(';')[0]);
  }

  const [cookie,foreign]=cookies;
  const first={id:randomUUID(),kind:'sleep',at:new Date(Date.now()-3600000).toISOString(),note:'',quickSleep:true,expectedSleepId:''};
  assert.equal((await call('records','POST',first)).status,401);
  const concurrent=await Promise.all([call('records','POST',first,cookie),call('records','POST',{...first,id:randomUUID()},cookie)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409],'Atomic quick shortcuts prevent simultaneous duplicate starts');
  let state=await(await call('state','GET',undefined,cookie)).json();assert.equal(state.records.length,1);
  const saved=state.records[0];
  assert.equal((await call('records','POST',{...first,id:saved.id},cookie)).status,201,'Retry is idempotent');
  assert.equal((await call('records','POST',{...first,id:randomUUID(),expectedSleepId:saved.id},cookie)).status,409);
  const wake={id:randomUUID(),kind:'wake',at:new Date().toISOString(),note:'',quickSleep:true,expectedSleepId:saved.id};
  assert.equal((await call('records','POST',{...wake,expectedSleepId:''},cookie)).status,409);
  assert.equal((await call('records','POST',wake,cookie)).status,201);
  state=await(await call('state','GET',undefined,cookie)).json();assert.equal(state.records.length,2);assert.equal(state.records[0].kind,'wake');
  assert.equal((await call(`records/${saved.id}`,'PATCH',{...saved,at:new Date(Date.now()-7200000).toISOString(),note:'corrected',version:1},cookie)).status,200);
  assert.equal((await call(`records/${saved.id}`,'PATCH',{...saved,version:1},cookie)).status,409);
  assert.equal((await call(`records/${saved.id}`,'DELETE',{version:2},foreign)).status,404);
  assert.equal((await(await call('state','GET',undefined,foreign)).json()).records.length,0);
  assert.equal((await call('records','POST',{...wake,id:randomUUID(),quickSleep:false,at:new Date(Date.now()+86400000).toISOString()},cookie)).status,400);
  assert.equal((await call(`records/${saved.id}`,'DELETE',{version:2},cookie)).status,200);
  assert.equal((await(await call('state','GET',undefined,cookie)).json()).records.length,1);
  console.log('Sleep API: persisted events, concurrent quick shortcuts, retry, edits, version conflicts, deletion and family isolation passed');

}finally{
  mkdirSync('.sites-runtime',{recursive:true});
  const statements=[];
  for(const id of families){assert.match(id,/^[a-f0-9-]{36}$/);statements.push(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE family_id='${id}');`,`DELETE FROM records WHERE family_id='${id}';`,`DELETE FROM weights WHERE family_id='${id}';`,`DELETE FROM users WHERE family_id='${id}';`,`DELETE FROM families WHERE id='${id}';`);}
  writeFileSync('.sites-runtime/sleep-test-cleanup.sql',statements.join('\n'));
}
