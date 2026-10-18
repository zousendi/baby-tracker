import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try{
 const page=await browser.newPage({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{requests.push(route.request().url());return route.fulfill({status:401,json:{error:'LOGIN_REQUIRED'}});});
 await page.goto(`${base}/?preview=1`);await expect(page.locator('.sleep-actions')).toBeVisible();
 const enabled=page.locator('.sleep-actions button:enabled');await expect(enabled).toHaveCount(1);
 const label=await enabled.innerText();await enabled.click();await expect(page.locator('.toast')).toContainText('睡眠イベント');
 await expect(page.locator('.sleep-actions').getByRole('button',{name:label.trim(),exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'睡眠の履歴を見る',exact:false}).click();
 await expect(page.locator('.filter-row').getByRole('button',{name:'睡眠',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.locator('.record-row').first().click();await expect(page.locator('#record-wake')).toHaveCount(0);
 await page.locator('#record-note').fill('sleep UI test');await page.getByRole('button',{name:'変更を保存',exact:true}).click();
 await expect(page.locator('.record-row').filter({hasText:'sleep UI test'})).toBeVisible();
 await page.locator('.record-row').filter({hasText:'sleep UI test'}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'sleep UI test'})).toHaveCount(0);
 await page.locator('.history-add').getByRole('button',{name:'寝た',exact:true}).click();await page.locator('#record-note').fill('past sleep');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'past sleep'})).toBeVisible();
 await page.locator('.mobile-nav').getByRole('button',{name:'分析',exact:true}).click();await page.locator('.analysis-switch').getByRole('button',{name:'睡眠',exact:true}).click();
 await expect(page.locator('.sleep-analysis')).toBeVisible();await expect(page.locator('[data-testid=sleep-total]')).toBeVisible();
 await page.locator('.sleep-analysis .range-buttons').getByRole('button',{name:'30日',exact:true}).click();await expect(page.locator('.sleep-bars>button')).toHaveCount(30);
 mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/sleep-analysis-${engine}.png`,fullPage:true});
 for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   for(const tab of ['今日','履歴','分析','設定']){
     const nav=page.locator(width<=700?'.mobile-nav':'.sidebar nav');await nav.getByRole('button',{name:tab,exact:true}).click();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${tab} overflow at ${width}`);
   }
 }
 await page.setViewportSize({width:390,height:844});await page.locator('.mobile-nav').getByRole('button',{name:'今日',exact:true}).click();await page.screenshot({path:`artifacts/sleep-home-${engine}.png`,fullPage:true});
 await page.locator('.quick.milk').click();await expect(page.locator('#record-wake')).toHaveCount(0);await page.screenshot({path:`artifacts/sleep-editor-${engine}.png`});await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.locator('.language-button').click();await expect(page.locator('.sleep-actions')).toContainText('睡着了');await expect(page.locator('.sleep-actions')).toContainText('醒来了');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(`${engine}: sleep shortcuts, history CRUD, analysis, bilingual labels, removed wake input and responsive layout passed`);
}finally{await browser.close();}
