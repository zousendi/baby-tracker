import {chromium,webkit,devices,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createPreviewSession} from '../lib/preview.ts';
import {releaseStorageKey} from '../lib/release-notes.mjs';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
const state=createPreviewSession().request('state'),errors=[];
async function pageFor(context,signedIn=true){
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>route.fulfill(signedIn?{json:state}:{status:401,json:{error:'LOGIN_REQUIRED'}}));
 return page;
}
try{
 const desktop=await browser.newContext({viewport:{width:390,height:844}}),page=await pageFor(desktop);
 await page.addInitScript(key=>localStorage.setItem(key,'1'),releaseStorageKey('older-release'));
 await page.goto(base);
 await expect(page.locator('.release-notes-dialog')).toBeVisible();
 assert.equal(await page.locator('.release-list li').count(),5);
 await expect(page.locator('.release-list')).toContainText('同じアカウント');
 const otherTab=await pageFor(desktop);await otherTab.goto(base);await expect(otherTab.locator('.release-notes-dialog')).toBeVisible();
 await page.getByRole('button',{name:'わかりました',exact:true}).click();
 await expect(otherTab.locator('.release-notes-dialog')).toHaveCount(0);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),releaseStorageKey()),'1');
 await page.reload();await page.locator('.quick-record').waitFor();await expect(page.locator('.release-notes-dialog')).toHaveCount(0);
 await page.locator('.mobile-nav').getByRole('button',{name:'設定',exact:true}).click();
 await page.locator('.language-button').click();
 await page.getByRole('button',{name:'更新记录',exact:true}).click();
 await expect(page.locator('.release-notes-dialog')).toContainText('同一账号也能跨设备通知');
 for(const [width,height] of [[320,700],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const box=await page.locator('.release-notes-dialog').boundingBox();assert.ok(box.width<=width&&box.height<=height,'Update dialog fits the viewport');
 }
 await page.setViewportSize({width:390,height:844});mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/release-notes-${engine}.png`});
 await page.getByRole('button',{name:'知道了',exact:true}).click();
 // A fresh device/browser has its own acknowledgement and sees the update.
 const fresh=await browser.newContext(),freshPage=await pageFor(fresh,false);await freshPage.goto(base);
 await expect(freshPage.locator('.release-notes-dialog')).toBeVisible();
 await freshPage.keyboard.press('Escape');await expect(freshPage.locator('.release-notes-dialog')).toHaveCount(0);
 await freshPage.reload();await expect(freshPage.locator('[name=username]')).toBeVisible();await expect(freshPage.locator('.release-notes-dialog')).toHaveCount(0);
 await fresh.close();
 // iPhone browsers show instructions only, even when a valid account exists.
 const ios=await browser.newContext({...devices['iPhone 13'],locale:'ja-JP'}),iosPage=await pageFor(ios);
 let apiRequests=0;iosPage.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))apiRequests++;});
 await iosPage.goto(`${base}/?preview=1`);await expect(iosPage.locator('.home-screen-guide')).toBeVisible();
 await expect(iosPage.locator('.quick-record,[name=username],.release-notes-dialog')).toHaveCount(0);
 await iosPage.getByRole('button',{name:'中文',exact:true}).click();await expect(iosPage.locator('.install-steps')).toContainText('作为 Web App 打开');
 await iosPage.reload();await expect(iosPage.locator('.home-screen-guide')).toContainText('添加到主屏幕');
 assert.equal(apiRequests,0,'iOS browser guide never mounts the tracker or reads account data');
 await iosPage.screenshot({path:`artifacts/install-guide-${engine}.png`,fullPage:true});
 await ios.close();
 // iPadOS desktop user agents are identified by MacIntel plus multitouch.
 const ipad=await browser.newContext({viewport:{width:1024,height:768}});
 await ipad.addInitScript(()=>{Object.defineProperty(navigator,'platform',{value:'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{value:5});});
 const ipadPage=await pageFor(ipad);await ipadPage.goto(base);await expect(ipadPage.locator('.home-screen-guide')).toBeVisible();await ipad.close();
 // Launching from the home screen skips installation instructions and shows updates.
 const installed=await browser.newContext({...devices['iPhone 13']});
 await installed.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 const appPage=await pageFor(installed);await appPage.goto(base);await expect(appPage.locator('.quick-record')).toBeVisible();
 await expect(appPage.locator('.home-screen-guide')).toHaveCount(0);await expect(appPage.locator('.release-notes-dialog')).toBeVisible();
 await appPage.getByRole('button',{name:'わかりました',exact:true}).click();await appPage.reload();await appPage.locator('.quick-record').waitFor();await expect(appPage.locator('.release-notes-dialog')).toHaveCount(0);await installed.close();
 // Storage restrictions must not trap the user in the announcement.
 const restricted=await browser.newContext();
 await restricted.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked');};Storage.prototype.setItem=()=>{throw new Error('blocked');};});
 const restrictedPage=await pageFor(restricted);await restrictedPage.goto(base);await expect(restrictedPage.locator('.release-notes-dialog')).toBeVisible();
 await restrictedPage.getByRole('button',{name:'わかりました',exact:true}).click();await expect(restrictedPage.locator('.release-notes-dialog')).toHaveCount(0);await expect(restrictedPage.locator('.quick-record')).toBeVisible();await restricted.close();
 assert.deepEqual(errors,[]);console.log(`${engine}: first-open/version acknowledgement, reload/tabs/device isolation, manual bilingual review, responsive dialog, iPhone/iPad browser gate, home-screen launch and blocked storage passed`);
 await desktop.close();
}finally{await browser.close();}
