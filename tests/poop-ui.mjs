import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try {
 const page=await browser.newPage({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-19T18:00:00+09:00')});
 const rows=[['a','poop','00:00'],['b','both','08:00'],['c','poop','08:01'],['d','poop','23:59']].map(([id,kind,at])=>({id,kind,at:`2026-10-18T${at}:00+09:00`,ml:0,left:0,right:0,milkType:'formula',note:'',author:'test',updatedAt:0,version:1}));
 const state={user:{id:'u',displayName:'test',familyId:'f'},family:{id:'f',name:'テスト家族',babyName:'テスト',birthday:'',version:1,goalLow:null,goalHigh:null},records:rows,weights:[],serverTime:Date.parse('2026-10-19T18:00+09:00')};
 await page.route('**/api/**',async route=>{
  if(route.request().method()==='PATCH'){const body=route.request().postDataJSON(),id=route.request().url().split('/').at(-1);Object.assign(rows.find(r=>r.id===id),body,{version:2});return route.fulfill({json:{ok:true}});}
  return route.fulfill({json:state});
 });
 await page.goto(base);await page.locator('.mobile-nav').getByRole('button',{name:'分析',exact:true}).click();await page.locator('.analysis-switch').getByRole('button',{name:'うんち',exact:true}).click();
 await expect(page.locator('.poop-day')).toHaveCount(7);await expect(page.locator('.poop-event')).toHaveCount(3);
 assert.ok(await page.locator('.poop-scroll').evaluate(el=>el.scrollLeft>0),'Recent days visible on mobile');
 await page.locator('.poop-event').filter({hasText:'08:00'}).click();await expect(page.locator('.poop-records>button')).toHaveCount(4);await expect(page.locator('.poop-details')).toContainText('おしっこ ＋ うんち');
 await page.locator('.poop-records>button').filter({hasText:'08:01'}).click();await page.locator('#record-note').fill('bowel edit');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await expect(page.locator('.poop-details')).toContainText('bowel edit');
 await page.locator('.poop-event').filter({hasText:'00:00'}).click();await expect(page.locator('dialog')).toBeVisible();await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.locator('.poop-date').last().click();await expect(page.locator('.poop-empty')).toBeVisible();
 await page.locator('.poop-controls').getByRole('button',{name:'14日',exact:true}).click();await expect(page.locator('.poop-day')).toHaveCount(14);
 await page.getByRole('button',{name:'前の期間',exact:true}).click();await expect(page.locator('.poop-event')).toHaveCount(0);await page.getByRole('button',{name:'次の期間',exact:true}).click();await expect(page.locator('.poop-event')).toHaveCount(3);await expect(page.getByRole('button',{name:'次の期間',exact:true})).toBeDisabled();
 mkdirSync('artifacts',{recursive:true});
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);}
 await page.locator('.poop-controls').getByRole('button',{name:'7日',exact:true}).click();await page.screenshot({path:`artifacts/poop-desktop-${engine}.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('.poop-scroll').evaluate(el=>el.scrollLeft=el.scrollWidth);await page.screenshot({path:`artifacts/poop-mobile-${engine}.png`,fullPage:true});
 await page.locator('.language-button').click();await expect(page.locator('.poop-heading')).toContainText('对比每天的排便时间');
 assert.deepEqual(errors,[]);console.log(`${engine}: bowel chart, combined events, clusters, day selection, edits, periods, midnight edges, responsive widths and Chinese passed`);
}finally{await browser.close();}
