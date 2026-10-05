import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try{
 const context=await browser.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-05T11:00:00+09:00')});
 const record=(id,kind,at,extra={})=>({id,kind,at,ml:0,left:0,right:0,milkType:'formula',note:'',version:1,author:'test',updatedAt:0,...extra});
 const state={family:{id:'f',name:'テスト家族',babyName:'テスト',birthday:'',goalLow:null,goalHigh:null,version:1},user:{id:'u',familyId:'f',displayName:'test'},records:[record('yesterday','milk','2026-10-04T23:00+09:00',{ml:100,wakeAt:'2026-10-05T00:00+09:00'}),record('milk','milk','2026-10-05T08:00+09:00',{ml:120}),record('direct','breast','2026-10-05T10:00+09:00',{left:5,right:5}),record('both','both','2026-10-05T09:00+09:00')],weights:[{id:'past-weight',day:'2026-10-03',grams:3500,note:'',version:1,author:'test',updatedAt:0}],serverTime:Date.parse('2026-10-05T11:00+09:00')};
 await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(req.method()==='GET')return route.fulfill({json:state});
   const data=req.postDataJSON();
   if(path==='/api/weights')state.weights.push({...data,author:'test',version:1,updatedAt:0});
   else if(path.startsWith('/api/weights/')&&req.method()==='DELETE')state.weights=state.weights.filter(w=>w.id!==path.split('/').at(-1));
   else if(path==='/api/records')state.records.push({...data,author:'test',version:1,updatedAt:0});
   else if(path.startsWith('/api/records/')&&req.method()==='PATCH')Object.assign(state.records.find(r=>r.id===path.split('/').at(-1)),data);
   else if(path.startsWith('/api/records/')&&req.method()==='DELETE')state.records=state.records.filter(r=>r.id!==path.split('/').at(-1));
   else throw new Error(`Unexpected mutation ${path}`);
   await route.fulfill({json:{ok:true}});
 });
 const tab=name=>page.locator('.mobile-nav').getByRole('button',{name,exact:true});
 await page.goto(base);await page.locator('.quick-record').waitFor();
 assert.deepEqual(await page.locator('.mobile-nav .nav-item').allTextContents(),['今日','履歴','分析','設定']);
 assert.equal(await page.locator('.date-control').count(),0);
 assert.equal(await page.locator('.record-row,.feed-interval,.weight-tracker').count(),0);
 await expect(page.locator('[data-testid=last-feed-elapsed]')).toHaveText('1時間');
 await expect(page.locator('[data-testid=milk-total]')).toHaveText('120ml');
 await expect(page.locator('.weight-reminder')).toBeVisible();
 const lastBox=await page.locator('.last-feed').boundingBox();assert.ok(lastBox.y+lastBox.height<844-80,'Last feed visible without scrolling');
 const positions=await page.locator('.quick-record,.last-feed,.weight-reminder,.today-summary,.day-rhythm').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 await page.locator('.weight-reminder').click();await page.locator('#weight-grams').fill('3600');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('.weight-reminder')).toHaveCount(0);
 await tab('履歴').click();await page.getByRole('button',{name:'前の日',exact:true}).click();
 await expect(page.locator('.date-control input')).toHaveValue('2026-10-04');
 await page.locator('.filter-row').getByRole('button',{name:'授乳',exact:true}).click();
 await expect(page.locator('.record-row')).toHaveCount(1);await expect(page.locator('.history-interval')).toContainText('9時間');await expect(page.locator('.wake-result')).toContainText('1時間');
 await page.locator('.history-add').getByRole('button',{name:'授乳',exact:true}).click();await expect(page.locator('#record-at')).toHaveValue('2026-10-04T12:00');await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await tab('今日').click();await expect(page.locator('.quick-heading time')).toHaveText('2026-10-05');
 await page.locator('.quick.milk').click();await expect(page.locator('#record-at')).toHaveValue('2026-10-05T11:00');
 await page.locator('#record-at').fill('2026-10-02T12:00');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('.quick-heading time')).toHaveText('2026-10-05');
 await tab('履歴').click();await expect(page.locator('.date-control input')).toHaveValue('2026-10-04');await expect(page.locator('.filter-row .selected')).toHaveText('授乳');
 await tab('分析').click();await page.getByRole('button',{name:'前の日',exact:true}).click();await page.locator('.analysis-switch').getByRole('button',{name:'体重',exact:true}).click();await page.getByRole('button',{name:'90日',exact:true}).click();
 await tab('今日').click();await expect(page.locator('.quick-heading time')).toHaveText('2026-10-05');
 await tab('分析').click();await expect(page.locator('.date-control input')).toHaveValue('2026-10-04');await expect(page.locator('.analysis-switch .selected')).toHaveText('体重');await expect(page.locator('.weight-chart-head .selected')).toHaveText('90日');
 await tab('今日').click();await page.getByRole('button',{name:'授乳の履歴を見る',exact:false}).click();await expect(page.locator('.date-control input')).toHaveValue('2026-10-05');await expect(page.locator('.record-row')).toHaveCount(2);assert.deepEqual(await page.locator('.record-row time').allTextContents(),['10:00','08:00']);
 await page.locator('.filter-row').getByRole('button',{name:'すべて',exact:true}).click();await expect(page.locator('.record-row')).toHaveCount(3);await expect(page.locator('.history-weight')).toBeVisible();
 await page.locator('.history-add').getByRole('button',{name:'うんち',exact:true}).click();await page.locator('#record-note').fill('history-added');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'history-added'})).toHaveCount(1);
 await page.locator('.record-row').filter({hasText:'history-added'}).click();await page.locator('#record-note').fill('history-edited');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'history-edited'})).toHaveCount(1);
 await page.locator('.record-row').filter({hasText:'history-edited'}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('.record-row')).toHaveCount(3);await expect(page.locator('.date-control input')).toHaveValue('2026-10-05');
 for(let i=0;i<15;i++)state.records.push(record(`scroll-${i}`,'pee','2026-10-05T09:00+09:00'));
 await page.getByRole('button',{name:'更新',exact:true}).click();await expect(page.locator('.record-row')).toHaveCount(18);await page.evaluate(()=>window.scrollTo(0,400));await tab('今日').click();await tab('履歴').click();assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-400)<5,'History scroll position is restored');
 state.records=state.records.filter(r=>!r.id.startsWith('scroll-'));await page.getByRole('button',{name:'更新',exact:true}).click();await expect(page.locator('.record-row')).toHaveCount(3);
 await page.locator('.history-weight').click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await tab('今日').click();await expect(page.locator('.weight-reminder')).toBeVisible();
 // A family member records today's weight; refresh hides the reminder.
 state.weights.push({id:'family-weight',day:'2026-10-05',grams:3610,note:'',version:1,author:'family',updatedAt:0});await page.getByRole('button',{name:'更新',exact:true}).click();await expect(page.locator('.weight-reminder')).toHaveCount(0);
 await tab('設定').click();await page.getByRole('button',{name:'見守りガイド',exact:true}).click();await expect(page.locator('.guide-grid')).toBeVisible();await page.getByRole('button',{name:'設定に戻る',exact:true}).click();await expect(page.locator('.settings-menu')).toBeVisible();
 await page.clock.runFor(4000);mkdirSync('artifacts',{recursive:true});
 for(const name of ['今日','履歴','分析','設定']){
   await tab(name).click();
   for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow at ${width}`);}
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:`artifacts/uiux-${engine}-${name}.png`,fullPage:true});
 }
 await tab('今日').click();await page.locator('.language-button').click();assert.deepEqual(await page.locator('.mobile-nav .nav-item').allTextContents(),['今天','记录','分析','设置']);await page.locator('.language-button').click();
 // Crossing midnight must change today without overwriting an open draft.
 await page.clock.setSystemTime(new Date('2026-10-05T23:59:50+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.quick.milk').click();await page.locator('#record-note').fill('keep my draft');await page.clock.runFor(20000);
 await expect(page.locator('.quick-heading time')).toHaveText('2026-10-06');await expect(page.locator('#record-note')).toHaveValue('keep my draft');await expect(page.locator('#record-at')).toHaveValue('2026-10-05T23:59');await page.getByRole('button',{name:'閉じる',exact:true}).click();await expect(page.locator('.weight-reminder')).toBeVisible();await expect(page.locator('[data-testid=milk-total]')).toHaveText('0ml');
 await page.clock.setSystemTime(new Date('2026-10-07T07:00+09:00'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.quick-heading time')).toHaveText('2026-10-07');
 assert.deepEqual(errors,[]);console.log(`${engine}: UIUX tabs, daily priority, history, date isolation, weight reminder, family sync, responsive layouts and midnight draft preservation passed`);
}finally{await browser.close();}
