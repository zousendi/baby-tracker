import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dayKey, shiftDay } from '../lib/model.ts';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try {
  const context=await browser.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}});
  const page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  const today=dayKey(),now=Date.now();
  const state={user:{id:'u',username:'test',displayName:'test',familyId:'f'},family:{id:'f',name:'UI fixture',babyName:'テスト',birthday:'',goalLow:null,goalHigh:null,version:1},records:[],weights:[{id:'previous',day:shiftDay(today,-2),grams:3500,note:'朝の測定',version:1,author:'test',updatedAt:now}],serverTime:now};
  await page.route('**/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(request.method()==='GET')return route.fulfill({json:state});
    const body=request.postDataJSON();writes.push({path,method:request.method(),body});
    if(path==='/api/weights'&&request.method()==='POST')state.weights.push({...body,version:1,author:'test',updatedAt:now});
    else if(path.startsWith('/api/weights/')&&request.method()==='PATCH'){const record=state.weights.find(w=>w.id===path.split('/').at(-1));Object.assign(record,body,{version:record.version+1});}
    else if(path.startsWith('/api/weights/')&&request.method()==='DELETE')state.weights=state.weights.filter(w=>w.id!==path.split('/').at(-1));
    else throw new Error(`Unexpected mutation ${path}`);
    await route.fulfill({json:{ok:true}});
  });
  await page.goto(base);await page.locator('.weight-tracker').waitFor();
  assert.match(await page.locator('.weight-current').textContent(),/まだ記録されていません/);
  await page.getByRole('button',{name:'体重を記録',exact:true}).click();
  assert.equal(await page.locator('#weight-day').inputValue(),today);
  assert.equal(await page.locator('#weight-grams').inputValue(),'');
  await page.locator('#weight-grams').fill('3620');
  await page.locator('#weight-note').fill('朝・おむつなし');
  await page.getByRole('button',{name:'記録を保存',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(writes[0].body.grams,3620);
  await expect(page.locator('.weight-current')).toContainText('3,620');
  assert.match(await page.locator('.weight-difference').textContent(),/\+120 g/);
  assert.equal(await page.locator('.weight-chart-point').count(),2);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);}
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'体重を編集',exact:true}).click();
  assert.equal(await page.locator('#weight-grams').inputValue(),'3620');
  await page.locator('#weight-grams').fill('3640');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(writes.at(-1).method,'PATCH');assert.equal(writes.at(-1).body.version,1);
  await expect(page.locator('.weight-current')).toContainText('3,640');
  await page.locator('.weight-records summary').click();
  assert.equal(await page.locator('.weight-record-row').count(),2);
  for(const range of [7,30,90])await page.locator('.weight-chart-head').getByRole('button',{name:`${range}日`,exact:true}).click();
  await page.locator('.language-button').click();assert.equal(await page.locator('.weight-tracker h2').textContent(),'每日体重');
  await page.locator('.language-button').click();
  mkdirSync('artifacts',{recursive:true});await page.locator('.weight-tracker').screenshot({path:`artifacts/weight-${engine}.png`});
  await page.getByRole('button',{name:'体重を編集',exact:true}).click();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(writes.at(-1).method,'DELETE');assert.equal(writes.at(-1).body.version,2);
  assert.equal(state.weights.length,1);
  await expect(page.locator('.weight-current')).toContainText('まだ記録されていません');
  // Edit a previous measurement from the graph, including keyboard access.
  await page.locator('.weight-chart-point').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#weight-day').inputValue(),shiftDay(today,-2));
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log(`${engine}: weight create/edit/delete, daily totals, previous measurement, history, keyboard access, bilingual and responsive UI passed`);
}finally{await browser.close();}
