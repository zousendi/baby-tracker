import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try{
 const context=await browser.newContext({locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}});
 const page=await context.newPage(),requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>{requests.push({method:route.request().method(),url:route.request().url()});return route.fulfill({status:401,json:{error:'LOGIN_REQUIRED'}});});
 await page.goto(`${base}/?preview=1`);await expect(page.locator('.preview-banner')).toBeVisible();assert.equal(requests.length,0,'Direct preview does not contact the DB');
 await page.locator('.quick.milk').click();await page.locator('#record-note').fill('sample edit test');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await page.locator('.mobile-nav').getByRole('button',{name:'履歴',exact:true}).click();await page.locator('.record-row').filter({hasText:'sample edit test'}).click();await page.locator('#record-ml').fill('150');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'sample edit test'})).toContainText('150 ml');
 await page.locator('.record-row').filter({hasText:'sample edit test'}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'sample edit test'})).toHaveCount(0);
 await page.locator('.mobile-nav').getByRole('button',{name:'今日',exact:true}).click();await page.locator('.weight-reminder').click();await page.locator('#weight-grams').fill('4550');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('.weight-reminder')).toHaveCount(0);
 await page.locator('.mobile-nav').getByRole('button',{name:'分析',exact:true}).click();await page.locator('.analysis-switch').getByRole('button',{name:'体重',exact:true}).click();await expect(page.locator('[data-testid=weight-current]')).toContainText('4,550');
 await page.getByRole('button',{name:'サンプルをリセット',exact:true}).click();await expect(page.locator('.weight-reminder')).toBeVisible();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Preview overflow at ${width}`);}
 assert.equal(requests.length,0,'All preview CRUD and resets avoid real API requests');
 await page.setViewportSize({width:390,height:844});mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/preview-${engine}.png`,fullPage:true});
 await page.getByRole('button',{name:'プレビューを終了',exact:true}).click();await expect(page.locator('[name=username]')).toBeVisible();assert.equal(new URL(page.url()).searchParams.has('preview'),false);
 await page.getByRole('button',{name:'サンプルで試す',exact:true}).click();await expect(page.locator('.preview-banner')).toBeVisible();assert.equal(requests.length,0);
 await page.getByRole('button',{name:'プレビューを終了',exact:true}).click();await page.locator('[name=username]').fill('real-login');await page.locator('[name=password]').fill('test-login');await page.getByRole('button',{name:'ログイン',exact:true}).click();await expect(page.locator('.error-box')).toBeVisible();assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.ok(requests[0].url.endsWith('/api/login'),'Normal login uses the real API');
 await page.goto(base);await expect(page.getByRole('button',{name:'サンプルで試す',exact:true})).toBeVisible();assert.equal(await page.locator('.preview-banner').count(),0,'Reload clears the in-memory demo');
 await page.locator('.language-button').click();await expect(page.getByRole('button',{name:'试用示例',exact:true})).toBeVisible();
 assert.deepEqual(errors,[]);console.log(`${engine}: direct sample link, login preview entry, CRUD, memory reset, DB isolation, responsive layout and normal authentication passed`);
}finally{await browser.close();}
