import {createTestContext} from './ui-context.mjs';
import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try{
 const context=await createTestContext(browser,{locale:'ja-JP',timezoneId:'Asia/Tokyo',viewport:{width:390,height:844}});
 const page=await context.newPage(),requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>{requests.push({method:route.request().method(),url:route.request().url()});return route.fulfill({status:401,json:{error:'LOGIN_REQUIRED'}});});
 async function inspectPopup(name){
  for(const [width,height] of [[320,700],[844,390]]){
   await page.setViewportSize({width,height});await page.locator('.editor-dialog .dialog-body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const close=await page.locator('.editor-dialog .icon-button').boundingBox(),save=await page.locator('.editor-dialog .dialog-footer .primary-button').boundingBox();
   assert.ok(close.y>=0&&close.y+close.height<=height);assert.ok(save.y>=0&&save.y+save.height<=height);
   assert.ok(await page.locator('.editor-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
   await page.screenshot({path:`artifacts/popup-${name}-${width}-${engine}.png`});
  }
  await page.setViewportSize({width:390,height:844});
 }
 await page.goto(`${base}/?preview=1`);await expect(page.locator('.preview-banner')).toBeVisible();assert.equal(requests.length,0,'Direct preview does not contact the DB');
 await page.locator('.quick.milk').click();mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/add-milk-${engine}.png`});await page.locator('.edit-details summary').click();await page.locator('#record-note').fill('sample edit test');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await page.locator('.mobile-nav').getByRole('button',{name:'履歴',exact:true}).click();await page.locator('.record-row').filter({hasText:'sample edit test'}).click();await expect(page.getByRole('dialog',{name:'ミルクの記録を編集',exact:true})).toBeVisible();
 await expect(page.locator('.editor-dialog .record-tabs,.editor-dialog .segmented,.editor-dialog .checkbox-label')).toHaveCount(0);
 assert.equal(await page.locator('.dialog-body input').first().getAttribute('id'),'record-ml','Milk edit starts with the amount');
 await expect(page.locator('.edit-details')).not.toHaveAttribute('open','');
 await expect(page.locator('#record-at')).toBeHidden();await expect(page.locator('#record-note')).toBeHidden();
 assert.equal(await page.locator('#record-ml').evaluate(el=>getComputedStyle(el).fontSize),'44px');
 mkdirSync('artifacts',{recursive:true});
 for(const [width,height] of [[320,700],[390,844],[844,390],[1280,900]]){
  await page.setViewportSize({width,height});
  const dialog=await page.locator('.editor-dialog').boundingBox();assert.ok(dialog.width<=width&&dialog.height<=height,'Edit dialog fits the screen');
  const save=await page.getByRole('button',{name:'変更を保存',exact:true}).boundingBox();assert.ok(save.y>=0&&save.y+save.height<=height,'Save stays visible');
  assert.ok(await page.locator('.editor-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),'No horizontal scrolling in the editor');
  await page.screenshot({path:`artifacts/edit-milk-${width}-${engine}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 const originalAt=await page.locator('#record-at').inputValue(),originalMilkType=await page.locator('#milk-type').inputValue();
 await page.locator('#record-ml').fill('150');await page.getByRole('button',{name:'変更を保存',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'sample edit test'})).toContainText('150 ml');
 await page.locator('.record-row').filter({hasText:'sample edit test'}).click();
 await expect(page.getByRole('dialog',{name:'ミルクの記録を編集',exact:true})).toBeVisible();
 await page.locator('.edit-details summary').focus();await page.keyboard.press('Enter');
 await expect(page.locator('#record-at')).toBeVisible();await expect(page.locator('#record-note')).toBeVisible();
 await expect(page.locator('.editor-dialog').getByRole('button',{name:'今の時刻にする',exact:true})).toHaveCount(0);
 await page.screenshot({path:`artifacts/edit-milk-expanded-${engine}.png`});
 await expect(page.locator('#record-ml')).toHaveValue('150');await expect(page.locator('#record-at')).toHaveValue(originalAt);await expect(page.locator('#milk-type')).toHaveValue(originalMilkType);await expect(page.locator('#record-note')).toHaveValue('sample edit test');
 await page.locator('#record-at').fill('');await page.locator('.edit-details summary').click();
 await page.getByRole('button',{name:'変更を保存',exact:true}).click();
 await expect(page.locator('.edit-details')).toHaveAttribute('open','');await expect(page.locator('#record-at')).toBeFocused();
 await page.locator('#record-at').fill(originalAt);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('.record-row').filter({hasText:'sample edit test'})).toHaveCount(0);
 for(const [index,kind,title] of [[0,'breast','母乳の記録を編集'],[1,'both','おしっこ＋うんちの記録を編集'],[2,'poop','うんちの記録を編集'],[3,'sleep','寝た時刻を編集'],[4,'wake','起きた時刻を編集']]){
  await page.locator('.history-add>button').nth(index).click();
  await expect(page.locator('.record-tabs')).toHaveCount(0);
  if(kind==='breast'){await page.locator('.editor-dialog .segmented button').nth(1).click();await page.locator('#left-minutes').fill('8');await page.locator('#right-minutes').fill('5');}
  if(kind==='both')await page.locator('.diaper-choice button').nth(2).click();
  if(kind==='breast')await page.locator('.edit-details summary').click();
  await page.screenshot({path:`artifacts/add-${kind}-${engine}.png`});
  const note='edit review '+kind;await page.locator('#record-note').fill(note);
  await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('.editor-dialog')).toHaveCount(0);
  await page.locator('.record-row').filter({hasText:note}).click();
  await expect(page.getByRole('dialog',{name:title,exact:true})).toBeVisible();
  await expect(page.locator('.editor-dialog .record-tabs,.editor-dialog .segmented,.editor-dialog .checkbox-label')).toHaveCount(0);
  if(kind==='breast'){
   await expect(page.locator('#left-minutes')).toBeVisible();await expect(page.locator('#left-minutes')).toHaveValue('8');
   await expect(page.locator('#record-at')).toBeHidden();await page.locator('.edit-details summary').click();
  }
  await expect(page.locator('#record-at')).toBeVisible();await expect(page.locator('#record-note')).toHaveValue(note);
  await page.screenshot({path:`artifacts/edit-${kind}-${engine}.png`});
  await page.getByRole('button',{name:'変更を保存',exact:true}).click();await expect(page.locator('.editor-dialog')).toHaveCount(0);
 }
 await page.locator('.mobile-nav').getByRole('button',{name:'今日',exact:true}).click();await page.locator('.weight-reminder').click();await page.locator('#weight-grams').fill('4550');await inspectPopup('weight');await page.getByRole('button',{name:'記録を保存',exact:true}).click();await expect(page.locator('.weight-reminder')).toHaveCount(0);
 await page.locator('.mobile-nav').getByRole('button',{name:'分析',exact:true}).click();await page.locator('.analysis-switch').getByRole('button',{name:'体重',exact:true}).click();await expect(page.locator('[data-testid=weight-current]')).toContainText('4,550');
 await page.getByRole('button',{name:'サンプルをリセット',exact:true}).click();await expect(page.locator('.weight-reminder')).toBeVisible();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Preview overflow at ${width}`);}
 assert.equal(requests.length,0,'All preview CRUD and resets avoid real API requests');
 await page.setViewportSize({width:390,height:844});mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/preview-${engine}.png`,fullPage:true});
 await page.locator('.mobile-nav').getByRole('button',{name:'設定',exact:true}).click();await page.locator('.settings-menu>button').first().click();
 await inspectPopup('profile');await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('button',{name:'プレビューを終了',exact:true}).click();await expect(page.locator('[name=username]')).toBeVisible();assert.equal(new URL(page.url()).searchParams.has('preview'),false);
 await page.getByRole('button',{name:'サンプルで試す',exact:true}).click();await expect(page.locator('.preview-banner')).toBeVisible();assert.equal(requests.length,0);
 await page.getByRole('button',{name:'プレビューを終了',exact:true}).click();await page.locator('[name=username]').fill('real-login');await page.locator('[name=password]').fill('test-login');await page.getByRole('button',{name:'ログイン',exact:true}).click();await expect(page.locator('.error-box')).toBeVisible();assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.ok(requests[0].url.endsWith('/api/login'),'Normal login uses the real API');
 await page.goto(base);await expect(page.getByRole('button',{name:'サンプルで試す',exact:true})).toBeVisible();assert.equal(await page.locator('.preview-banner').count(),0,'Reload clears the in-memory demo');
 await page.locator('.language-button').click();await expect(page.getByRole('button',{name:'试用示例',exact:true})).toBeVisible();
 assert.deepEqual(errors,[]);console.log(`${engine}: direct sample link, login preview entry, CRUD, memory reset, DB isolation, responsive layout and normal authentication passed`);
}finally{await browser.close();}
