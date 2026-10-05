import { chromium, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dayKey, shiftDay } from '../lib/model.ts';

const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try {
  const context=await browser.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const now=Date.now(),day=dayKey(now);
  const rows=[[-2,0,80],[-1,0,100],[0,0,120],[0,1,160]].map(([offset,minute,ml],i)=>({id:`fixture-${i}`,kind:'milk',at:`${shiftDay(day,offset)}T00:0${minute}:00+09:00`,ml,left:0,right:0,milkType:'formula',note:'UI fixture',version:1,author:'test',updatedAt:now}));
  const state={user:{id:'u',username:'test',displayName:'test',familyId:'f'},family:{id:'f',name:'UI fixture',babyName:'テスト',birthday:'',goalLow:null,goalHigh:null,version:1},records:rows,serverTime:now};
  await page.route('**/api/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(state)}));
  await page.goto(base);await page.locator('.quick-record').waitFor();
  assert.equal(await page.locator('.feed-interval').count(),0);
  assert.equal(await page.locator('.cumulative-legend>div').count(),3);
  assert.deepEqual(await page.locator('.cumulative-legend strong').allTextContents(),['80 ml','100 ml','280 ml']);
  assert.equal(await page.locator('.cumulative-chart polyline').count(),3);
  await page.getByRole('button',{name:'授乳の履歴を見る',exact:false}).click();
  assert.deepEqual(await page.locator('.feed-interval time').allTextContents(),['00:01','00:00']);
  await page.locator('.feed-interval').first().click();
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:600});
    assert.ok(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth),`No editor overflow at ${width}`);
    await page.locator('dialog').evaluate(d=>{d.scrollTop=100;d.scrollLeft=100;});
    assert.equal(await page.locator('dialog').evaluate(d=>d.scrollLeft),0);
    assert.ok(await page.locator('dialog').evaluate(d=>d.scrollTop>0),`Vertical scrolling at ${width}`);
    const bounds=await page.locator('dialog').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,`Editor inside viewport at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.locator('.mobile-nav').getByRole('button',{name:'分析',exact:true}).click();
  await page.getByRole('combobox',{name:'対象',exact:true}).selectOption('expressed');
  assert.equal(await page.locator('.cumulative-chart polyline').count(),0);
  await page.getByRole('combobox',{name:'対象',exact:true}).selectOption('all');
  await page.locator('.language-button').click();
  assert.equal(await page.locator('.cumulative-chart h3').textContent(),'累计奶量比较');
  await page.locator('.language-button').click();
  mkdirSync('artifacts',{recursive:true});
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No page overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.day-rhythm').screenshot({path:`artifacts/rhythm-${engine}.png`});
  assert.deepEqual(errors,[]);
  console.log(`${engine}: cumulative chart, descending logs, editor scrolling, filters and responsive layout passed`);
} finally {await browser.close();}
