import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createPreviewSession} from '../lib/preview.ts';
import webpush from 'web-push';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const engine=process.env.TEST_BROWSER==='webkit'?'webkit':'edge';
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'msedge'}));
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ja-JP'});
 const page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 const state=createPreviewSession().request('state'),vapid=webpush.generateVAPIDKeys();
 await page.addInitScript(()=>{
   window.notificationTest={permissions:0,registered:0,unsubscribed:0};
   const test=window.notificationTest;
   class Notifications{static permission='default';static async requestPermission(){test.permissions++;Notifications.permission='granted';return 'granted';}}
   Object.defineProperty(window,'Notification',{value:Notifications,configurable:true});
   Object.defineProperty(window,'PushManager',{value:class{},configurable:true});
   let subscription=null;
   const registration={pushManager:{async getSubscription(){return subscription;},async subscribe(){subscription={endpoint:'https://fcm.googleapis.com/fcm/send/local-test',toJSON(){return{endpoint:this.endpoint,keys:{p256dh:'B'.repeat(87),auth:'a'.repeat(22)}};},async unsubscribe(){test.unsubscribed++;subscription=null;return true;}};return subscription;}}};
   Object.defineProperty(navigator,'serviceWorker',{value:{async getRegistration(){return registration;},async register(){test.registered++;return registration;},ready:Promise.resolve(registration)},configurable:true});
   const vv=new EventTarget();Object.assign(vv,{height:innerHeight,offsetTop:0,scale:1});
   Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});
   window.simulateKeyboard=height=>{vv.height=height;vv.offsetTop=8;vv.dispatchEvent(new Event('resize'));};
 });
 let failSave=false;
 await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(path==='/api/notifications'){
     if(req.method()==='GET')return route.fulfill({json:{configured:true,remindersConfigured:true,publicKey:vapid.publicKey,subscriptions:[]}});
     writes.push({method:req.method(),data:req.postDataJSON()});
     return route.fulfill({status:failSave?503:200,json:failSave?{error:'SERVICE_UNAVAILABLE'}:{ok:true}});
   }
   return route.fulfill({json:state});
 });
 await page.goto(base);await page.locator('.quick-record').waitFor();
 assert.equal(await page.locator('meta[name=viewport]').getAttribute('content'),'width=device-width, initial-scale=1, viewport-fit=cover');
 assert.equal(await page.locator('meta[name=apple-mobile-web-app-capable]').getAttribute('content'),'yes');
 assert.equal(await page.locator('link[rel=apple-touch-icon]').getAttribute('href'),'/apple-touch-icon.png?v=2');
 const manifestResponse=await context.request.get(`${base}/manifest.webmanifest`),manifest=await manifestResponse.json();
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.name,'こもれび');
 for(const icon of ['/apple-touch-icon.png','/app-icon-192.png','/app-icon-512.png']){
   const response=await context.request.get(base+icon);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/image\/png/);
 }
 const sw=await context.request.get(`${base}/notifications-sw.js`);assert.equal(sw.status(),200);assert.match(sw.headers()['content-type'],/javascript/);
 assert.ok(!(await sw.text()).includes("addEventListener('fetch'"),'Push worker does not cache/intercept pages');
 await page.locator('.mobile-nav').getByRole('button',{name:'設定',exact:true}).click();await page.locator('.notification-settings fieldset').waitFor();
 await expect(page.getByRole('button',{name:'この端末の通知を有効にする',exact:true})).toBeEnabled();
 assert.equal(await page.evaluate(()=>notificationTest.permissions),0,'No permission prompt on page load');
 assert.equal(await page.evaluate(()=>notificationTest.registered),0,'No SW registration before opt-in');
 await page.getByLabel('最後の授乳からのリマインダー',{exact:true}).check();
 await page.getByRole('combobox',{name:'リマインダーの間隔'}).selectOption('120');
 failSave=true;await page.getByRole('button',{name:'この端末の通知を有効にする',exact:true}).click();
 await expect(page.locator('.notification-settings [role=alert]')).toBeVisible();
 failSave=false;await page.getByRole('button',{name:'この端末の通知を有効にする',exact:true}).click();
 await expect(page.getByRole('button',{name:'通知設定を保存',exact:true})).toBeVisible();
 assert.equal(writes.at(-1).data.reminderMinutes,120);assert.equal(writes.at(-1).data.familyEvents,true);
 assert.equal(await page.evaluate(()=>notificationTest.permissions),1,'Retry does not re-request granted permission');
 await page.getByRole('button',{name:'この端末の通知を停止',exact:true}).click();await expect(page.locator('.notification-settings [role=status]')).toContainText('停止');
 assert.equal(writes.at(-1).method,'DELETE');assert.equal(await page.evaluate(()=>notificationTest.unsubscribed),1);
 await page.locator('.mobile-nav').getByRole('button',{name:'今日',exact:true}).click();
 for(const [width,height] of [[320,700],[390,844],[844,390],[932,430]]){
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow ${width}x${height}`);
   await expect(page.locator('.mobile-nav')).toBeVisible();
   const dock=await page.locator('.mobile-nav').boundingBox();
   assert.ok(dock.x>=11&&dock.x+dock.width<=width-11,'Dock inset from both curved corners');
   assert.ok(dock.y+dock.height<=height-11,'Dock floats above bottom edge');
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.quick.milk').click();await page.locator('#record-note').fill('keyboard test');
 await page.evaluate(()=>simulateKeyboard(380));
 await expect(page.locator('dialog')).toHaveAttribute('data-keyboard-open','true');
 assert.ok(await page.locator('dialog').evaluate(node=>node.getBoundingClientRect().height<=356),'Dialog fits simulated keyboard viewport');
 await page.evaluate(()=>simulateKeyboard(innerHeight));await expect(page.locator('dialog')).toHaveAttribute('data-keyboard-open','false');
 await page.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({media:'screen'});
 // A touch device in a wide, tall viewport remains on the desktop layout.
 await expect(page.locator('.sidebar')).toBeVisible();await expect(page.locator('.mobile-nav')).toBeHidden();
 await page.setViewportSize({width:390,height:844});mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:`artifacts/web-app-floating-${engine}.png`,fullPage:true});
 assert.deepEqual(errors,[]);console.log(`${engine}: install metadata/icons, floating dock portrait/landscape, simulated keyboard, opt-in notifications, settings retry and unsubscribe passed`);
 await context.close();
}finally{await browser.close();}
