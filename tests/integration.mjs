import { chromium, webkit } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const base=process.env.TEST_URL||'http://127.0.0.1:5174';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Integration fixtures must run locally.');
const useProvisioned=!!process.env.TEST_FAMILY_PASSWORD;
const password=process.env.TEST_FAMILY_PASSWORD||randomUUID();
const key=readFileSync('.dev.vars','utf8').match(/^ADMIN_KEY=(.+)$/m)?.[1];
const headers={'Content-Type':'application/json','X-App-Request':'komorebi'};
async function management(path,method='GET',data){const r=await fetch(`${base}/api/admin/${path}`,{method,headers:{...headers,Authorization:`Bearer ${key}`},...(data?{body:JSON.stringify(data)}:{})});assert.ok(r.ok,`admin ${path}: ${r.status}`);return r.json();}
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
const errors=[],created=[],suffix=randomUUID().slice(0,8);
let otherFamily, fixtureFamily;
const localInput = date => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
let papaName='ypapa',mamaName='ymama';
try{
  if(!useProvisioned){fixtureFamily=await management('families','POST',{name:`Test analysis ${suffix}`});papaName=`test_p_${suffix}`;mamaName=`test_m_${suffix}`;for(const username of [papaName,mamaName])await management('users','POST',{familyId:fixtureFamily.id,username,displayName:username,password});}
  const options={locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844},...(engine==='webkit'?{isMobile:true,hasTouch:true}:{})};
  const papa=await browser.newContext(options),mama=await browser.newContext(options),outsider=await browser.newContext(options);
  const pp=await papa.newPage(),mp=await mama.newPage();
  pp.on('pageerror',e=>errors.push(e.message));mp.on('pageerror',e=>errors.push(e.message));
  const unauthorized=await papa.request.get(`${base}/api/state`);assert.equal(unauthorized.status(),401);
  async function login(page,id){await page.goto(base);await page.locator('[name=username]').fill(id);await page.locator('[name=password]').fill(password);const responsePromise=page.waitForResponse(r=>r.url()===`${base}/api/login`&&r.request().method()==='POST');await page.getByRole('button',{name:'ログイン',exact:true}).click();const response=await responsePromise;const setCookie=(await response.allHeaders())['set-cookie'];assert.match(setCookie,/SameSite=Lax/);assert.match(setCookie,/HttpOnly/);await page.locator('.quick-record').waitFor();}
  await login(pp,papaName);await login(mp,mamaName);
  const getState=async(ctx)=>(await ctx.request.get(`${base}/api/state`)).json();
  const before=await getState(papa);assert.equal(before.family.name,useProvisioned?'ゆうさくくん':`Test analysis ${suffix}`);assert.equal((await getState(mama)).user.familyId,before.user.familyId);
  assert.equal(Object.keys(await pp.evaluate(()=>({...localStorage}))).join(','),'komorebi-language');
  const cookies=await papa.cookies();const session=cookies.find(c=>c.name==='komorebi_session');assert.ok(session?.httpOnly);if(engine==='edge')assert.equal(session.sameSite,'Lax'); // WebKit on Windows does not report this field reliably; the response header is checked above.
  await pp.locator('.quick.milk').click();await pp.locator('#record-at').fill(localInput(new Date(Date.now()-20*60000)));await pp.locator('#record-wake').fill(localInput(new Date(Date.now()-10*60000)));await pp.getByRole('button',{name:'140',exact:true}).click();await pp.getByRole('button',{name:'10ml増やす',exact:true}).click();await pp.locator('#record-note').fill(`test-${suffix} <script>no</script>`);await pp.getByRole('button',{name:'記録を保存',exact:true}).click();await pp.locator('dialog').waitFor({state:'detached'});
  const after=await getState(papa),record=after.records.find(r=>r.note.startsWith(`test-${suffix}`));assert.equal(record.ml,150);assert.ok(record.wakeAt);created.push(record.id);
  await mp.getByRole('button',{name:'更新',exact:true}).click();await mp.locator('.record-row').filter({hasText:`test-${suffix}`}).waitFor();
  await mp.locator('.language-button').click();assert.equal(await mp.locator('html').getAttribute('lang'),'zh-CN');
  await mp.locator('.record-row').filter({hasText:`test-${suffix}`}).click();await mp.locator('#record-ml').fill('160');await mp.getByRole('button',{name:'保存修改',exact:true}).click();await mp.locator('dialog').waitFor({state:'detached'});
  assert.equal((await getState(papa)).records.find(r=>r.id===record.id).ml,160);assert.equal((await getState(papa)).records.find(r=>r.id===record.id).wakeAt,record.wakeAt);
  await pp.getByRole('button',{name:'更新',exact:true}).click();
  const stale=await papa.request.patch(`${base}/api/records/${record.id}`,{headers,data:{...record,ml:170}});assert.equal(stale.status(),409);
  const csrf=await papa.request.post(`${base}/api/records`,{data:{...record,id:randomUUID()}});assert.equal(csrf.status(),403);
  const crossOrigin=await fetch(`${base}/api/records`,{method:'POST',headers:{...headers,Origin:'https://example.invalid',Cookie:`komorebi_session=${session.value}`},body:JSON.stringify({...record,id:randomUUID()})});assert.equal(crossOrigin.status,403);
  const invalid=await papa.request.post(`${base}/api/records`,{headers,data:{...record,id:randomUUID(),ml:-10}});assert.equal(invalid.status(),400);
  const future=await papa.request.post(`${base}/api/records`,{headers,data:{...record,id:randomUUID(),at:new Date(Date.now()+86400000).toISOString()}});assert.equal(future.status(),400);
  const duplicate=await papa.request.post(`${base}/api/records`,{headers,data:{...record,ml:160}});assert.equal(duplicate.status(),201);assert.equal((await getState(papa)).records.filter(r=>r.id===record.id).length,1);
  const diaperId=randomUUID();created.push(diaperId);const diaper=await papa.request.post(`${base}/api/records`,{headers,data:{id:diaperId,kind:'both',at:new Date().toISOString(),note:`test-${suffix}-diaper`}});assert.equal(diaper.status(),201);
  const breastId=randomUUID();created.push(breastId);const breast=await papa.request.post(`${base}/api/records`,{headers,data:{id:breastId,kind:'breast',at:new Date().toISOString(),left:7,right:8,note:`test-${suffix}-breast`}});assert.equal(breast.status(),201);
  await pp.getByRole('button',{name:'更新',exact:true}).click();await pp.locator('.record-row').filter({hasText:`test-${suffix}-breast`}).waitFor();
  mkdirSync('artifacts',{recursive:true});await pp.screenshot({path:`artifacts/iphone-${engine}.png`,fullPage:true});
  await mp.getByRole('button',{name:'刷新',exact:true}).click();await mp.screenshot({path:`artifacts/chinese-${engine}.png`,fullPage:true});
  await mp.reload();await mp.locator('.quick-record').waitFor();assert.equal(await mp.locator('html').getAttribute('lang'),'zh-CN');
  for(const width of [320,390,768,1440]){await pp.setViewportSize({width,height:900});assert.ok(await pp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);}
  await pp.screenshot({path:`artifacts/desktop-${engine}.png`,fullPage:true});
  await pp.setViewportSize({width:390,height:844});
  await pp.locator('.mobile-nav').getByRole('button',{name:'ミルク分析',exact:true}).click();
  for(const range of [7,14,30]){await pp.getByRole('button',{name:range+'日間',exact:true}).click();assert.equal(await pp.locator('.daily-analysis tbody tr').count(),range);}
  assert.ok(await pp.locator('.wake-result').count());
  await pp.getByRole('combobox',{name:'対象',exact:true}).selectOption('expressed');
  assert.equal(await pp.locator('.rhythm-dot').count(),0);
  await pp.getByRole('combobox',{name:'対象',exact:true}).selectOption('all');
  for(const width of [320,390,768,1440]){await pp.setViewportSize({width,height:1000});assert.ok(await pp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Analysis overflow at '+width);}
  await pp.screenshot({path:'artifacts/analysis-desktop-'+engine+'.png',fullPage:true});
  await pp.setViewportSize({width:390,height:844});await pp.getByRole('button',{name:'7日間',exact:true}).click();
  await pp.screenshot({path:'artifacts/analysis-mobile-'+engine+'.png',fullPage:true});
  const rhythmTimes=await pp.locator('.feed-interval time').allTextContents();
  assert.deepEqual(rhythmTimes,[...rhythmTimes].sort().reverse(),'Rhythm log is newest first');
  assert.equal(await pp.locator('.cumulative-legend>div').count(),3);
  await pp.locator('.feed-interval').first().click();
  for(const width of [320,390,768,1440]){
    await pp.setViewportSize({width,height:600});
    assert.ok(await pp.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth),`Editor has no horizontal overflow at ${width}`);
    assert.equal(await pp.locator('dialog').evaluate(d=>getComputedStyle(d).overflowY),'auto');
    await pp.locator('dialog').evaluate(d=>{d.scrollTop=100;d.scrollLeft=100;});
    assert.equal(await pp.locator('dialog').evaluate(d=>d.scrollLeft),0);
    assert.ok(await pp.locator('dialog').evaluate(d=>d.scrollTop>0),'Editor still scrolls vertically');
  }
  await pp.setViewportSize({width:390,height:844});await pp.getByRole('button',{name:'変更を保存',exact:true}).click();await pp.locator('dialog').waitFor({state:'detached'});assert.equal(await pp.locator('.analysis-controls').count(),1);
  await mp.locator('.mobile-nav').getByRole('button',{name:'奶量分析',exact:true}).click();await mp.getByRole('button',{name:'14天',exact:true}).click();assert.equal(await mp.locator('.daily-analysis tbody tr').count(),14);
  await mp.screenshot({path:'artifacts/analysis-chinese-'+engine+'.png',fullPage:true});
  await pp.locator('.mobile-nav').getByRole('button',{name:'設定',exact:true}).click();assert.equal(await pp.locator('#goal-low').count(),0);await pp.getByRole('button',{name:'閉じる',exact:true}).click();
  const wakeInvalid=await papa.request.post(base+'/api/records',{headers,data:{...record,id:randomUUID(),wakeAt:new Date(Date.now()+86400000).toISOString()}});assert.equal(wakeInvalid.status(),400);
  const wakeBefore=await papa.request.post(base+'/api/records',{headers,data:{...record,id:randomUUID(),wakeAt:new Date(+new Date(record.at)-60000).toISOString()}});assert.equal(wakeBefore.status(),400);
  otherFamily=await management('families','POST',{name:`test-${suffix}`});
  const stranger=await management('users','POST',{familyId:otherFamily.id,username:`test_${suffix}`,displayName:'Test outsider',password:randomUUID()});
  // Reset the isolated account to a known ephemeral value, then exercise its permissions.
  const temporary=randomUUID();await management(`users/${stranger.id}`,'PATCH',{password:temporary});
  assert.equal((await outsider.request.post(`${base}/api/login`,{headers,data:{username:stranger.username,password:temporary}})).status(),200);
  const foreign=await getState(outsider);assert.equal(foreign.records.length,0);assert.notEqual(foreign.family.id,before.family.id);
  const attack=await outsider.request.patch(`${base}/api/records/${record.id}`,{headers,data:{...record,version:(await getState(papa)).records.find(r=>r.id===record.id).version}});assert.equal(attack.status(),404);
  const attackDelete=await outsider.request.delete(`${base}/api/records/${record.id}`,{headers,data:{version:2}});assert.equal(attackDelete.status(),404);
  assert.equal((await outsider.request.get(`${base}/api/admin/directory`)).status(),403);
  const foreignProfile=await outsider.request.patch(`${base}/api/profile`,{headers,data:{...foreign.family,familyId:before.family.id,babyName:'Test outsider'}});assert.equal(foreignProfile.status(),200);assert.equal((await getState(papa)).family.babyName,before.family.babyName);
  const profile=await getState(papa);assert.equal((await papa.request.patch(`${base}/api/profile`,{headers,data:profile.family})).status(),200);assert.equal((await mama.request.patch(`${base}/api/profile`,{headers,data:profile.family})).status(),409);
  await management(`users/${stranger.id}`,'PATCH',{active:false});assert.equal((await outsider.request.get(`${base}/api/state`)).status(),401);
  const adminPage=await papa.newPage();await adminPage.goto(`${base}/admin`);await adminPage.locator('[name=key]').fill(key);await adminPage.getByRole('button',{name:'管理画面を開く'}).click();await adminPage.locator('.admin-grid').waitFor();assert.ok(await adminPage.locator('.family-list').innerText());await adminPage.screenshot({path:`artifacts/admin-${engine}.png`,fullPage:true});
  await adminPage.getByRole('button',{name:'中文',exact:true}).click();assert.ok(await adminPage.getByRole('heading',{name:'家庭与账号管理'}).count());
  await adminPage.close();
  await pp.setViewportSize({width:390,height:844});await pp.locator('.mobile-nav').getByRole('button',{name:'設定',exact:true}).click();await pp.getByRole('button',{name:'ログアウト',exact:true}).last().click();await pp.locator('[name=username]').waitFor();assert.equal((await papa.request.get(`${base}/api/state`)).status(),401);
  assert.deepEqual(errors,[]);
  // Delete only the records this test created, through the same scoped API.
  const final=await getState(mama);for(const id of created){const r=final.records.find(r=>r.id===id);if(r)assert.equal((await mama.request.delete(`${base}/api/records/${id}`,{headers,data:{version:r.version}})).status(),200);}
  console.log(`${engine}: PASS milk analysis, wake persistence, removed goals, login, shared persistence, bilingual UI, mobile layout, edits, conflicts, family isolation, CSRF, invalid input, admin gate, account disabling and logout.`);
}finally{
  const cleanupContext=browser.contexts()[1];
  if(cleanupContext){const response=await cleanupContext.request.get(`${base}/api/state`);if(response.ok()){const snapshot=await response.json();for(const r of snapshot.records.filter(r=>created.includes(r.id))){await cleanupContext.request.delete(`${base}/api/records/${r.id}`,{headers,data:{version:r.version}});}}}
  for(const family of [otherFamily,fixtureFamily].filter(Boolean)){const id=family.id;if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid fixture id');writeFileSync('.sites-runtime/test-cleanup-'+id+'.sql',`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE family_id='${id}');\nDELETE FROM records WHERE family_id='${id}';\nDELETE FROM users WHERE family_id='${id}';\nDELETE FROM families WHERE id='${id}';\n`);}
  await browser.close();
}
