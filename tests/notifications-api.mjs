// Isolated Workers runtime and ephemeral D1; never opens the existing local/hosted DB.
import {Miniflare,Log,LogLevel} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
import webpush from 'web-push';
import {hashPassword} from '../lib/security.ts';
const vapid=webpush.generateVAPIDKeys(),jobKey=randomBytes(32).toString('hex');
process.env.CLOUDFLARE_CF_FETCH_ENABLED='false';
const outgoing=[];
const mf=new Miniflare({
  log:new Log(LogLevel.WARN),modules:[{type:'ESModule',path:resolve('dist/server/index.js')},
    ...readdirSync('dist/server',{recursive:true}).filter(path=>path.endsWith('.js')&&path!=='index.js').map(path=>({type:'ESModule',path:resolve('dist/server',path)}))],
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],
  d1Databases:['DB'],d1Persist:false,cachePersist:false,kvPersist:false,
  outboundService:async request=>{assert.equal(new URL(request.url).hostname,'fcm.googleapis.com');outgoing.push({url:request.url,headers:request.headers,body:await request.arrayBuffer()});return new Response(null,{status:201});},
  bindings:{PUSH_PUBLIC_KEY:vapid.publicKey,PUSH_PRIVATE_KEY:vapid.privateKey,PUSH_SUBJECT:'mailto:test@example.com',PUSH_JOB_KEY:jobKey,PUSH_REMINDERS_ENABLED:'true'},
});
try{
 const db=await mf.getD1Database('DB');
 for(const migration of ['0000_polite_bug','0001_neat_sentry','0002_sharp_alex_wilder','0003_notifications']){
   const sql=readFileSync(new URL(`../drizzle/${migration}.sql`,import.meta.url),'utf8');
   for(const statement of sql.split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(statement).run();
 }
 const now=Date.now(),hash=await hashPassword('test-only-password');
 await db.prepare('INSERT INTO families(id,name,baby_name,created_at) VALUES (?,?,?,?)').bind('test-family','test','test',now).run();
 for(const id of ['first','second'])await db.prepare('INSERT INTO users(id,username,display_name,family_id,password_hash,created_at) VALUES (?,?,?,?,?,?)').bind(id,id,id,'test-family',hash,now).run();
 async function request(path,method='GET',value,cookie='',extra={}){
   return mf.dispatchFetch(`https://local.test/api/${path}`,{method,headers:{'Content-Type':'application/json','X-App-Request':'komorebi',Origin:'https://local.test',Cookie:cookie,...extra},...(value===undefined?{}:{body:JSON.stringify(value)})});
 }
 assert.equal((await request('notifications')).status,401);
 const login=await request('login','POST',{username:'first',password:'test-only-password'});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/Secure/);
 const login2=await request('login','POST',{username:'second',password:'test-only-password'});
 const otherCookie=login2.headers.get('set-cookie').split(';')[0];
 const stateBefore=await(await request('state','GET',undefined,cookie)).json();
 const status=await(await request('notifications','GET',undefined,cookie)).json();
 assert.equal(status.configured,true);assert.equal(status.remindersConfigured,true);assert.equal(status.publicKey,vapid.publicKey);assert.equal(JSON.stringify(status).includes(vapid.privateKey),false);
 const ecdh=createECDH('prime256v1');ecdh.generateKeys();
 const value={subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/local-api-test',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},familyEvents:true,reminderMinutes:180,language:'zh'};
 assert.equal((await request('notifications','POST',value,cookie,{'X-App-Request':''})).status,403);
 assert.equal((await request('notifications','POST',{...value,subscription:{...value.subscription,endpoint:'https://127.0.0.1/private'}},cookie)).status,400);
 assert.equal((await request('notifications','POST',{...value,reminderMinutes:1},cookie)).status,400);
 const saved=await request('notifications','POST',value,cookie);assert.equal(saved.status,200);const {id}=await saved.json();
 await db.prepare('INSERT INTO notification_outbox(id,subscription_id,kind,record_id,created_at,expires_at,delivered_at) VALUES (?,?,?,?,?,?,?)').bind('dedup',id,'family','fake',now,now+10000,now).run();
 assert.equal((await request('notifications','POST',value,cookie)).status,200);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM notification_outbox WHERE id=?').bind('dedup').first()).n,1,'Saving preferences retains deduplication history');
 assert.equal((await(await request('notifications','GET',undefined,otherCookie)).json()).subscriptions.length,0);
 assert.equal((await request('notifications','DELETE',{id},otherCookie)).status,200);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM notification_subscriptions').first()).n,1,'Another user cannot unsubscribe the owner');
 const forged={...value,subscription:{...value.subscription,keys:{...value.subscription.keys,auth:randomBytes(16).toString('base64url')}}};
 assert.equal((await request('notifications','POST',forged,otherCookie)).status,403);
 assert.equal((await request('notifications/dispatch','POST',{},'',{Authorization:'Bearer invalid'})).status,403);
 const record={id:randomUUID(),kind:'milk',at:new Date().toISOString(),ml:120,note:''};
 const created=await request('records','POST',record,otherCookie);assert.equal(created.status,201);
 if(created.waitUntil)await created.waitUntil();
 assert.equal((await request('notifications/dispatch','POST',{},'',{Authorization:`Bearer ${jobKey}`})).status,200);
 assert.equal(outgoing.length,1,'Worker sends one encrypted family notification through the test-only outbound interceptor');
 assert.equal(outgoing[0].headers.get('content-encoding'),'aes128gcm');assert.match(outgoing[0].headers.get('authorization'),/^vapid /);
 assert.ok(outgoing[0].body.byteLength>16);
 assert.equal((await request('records','POST',record,otherCookie)).status,201);
 assert.equal((await request('notifications/dispatch','POST',{},'',{Authorization:`Bearer ${jobKey}`})).status,200);
 assert.equal(outgoing.length,1,'Idempotent record retries cannot generate another push');
 const earlier=new Date(Date.now()-180*60000).toISOString();
 assert.equal((await request(`records/${record.id}`,'PATCH',{...record,at:earlier,version:1},otherCookie)).status,200);
 assert.equal((await request('notifications/dispatch','POST',{},'',{Authorization:`Bearer ${jobKey}`})).status,200);
 assert.equal(outgoing.length,2,'Due feeding reminder sends while no client page is involved');
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='reminder' AND delivered_at IS NOT NULL").first()).n,1);
 await request('notifications/dispatch','POST',{},'',{Authorization:`Bearer ${jobKey}`});
 assert.equal(outgoing.length,2,'Repeated scheduler invocations do not repeat a delivered reminder');
 assert.equal((await request('notifications','DELETE',{id},cookie)).status,200);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM notification_outbox').first()).n,0,'Unsubscribe cascades notification jobs');
 const stateAfter=await(await request('state','GET',undefined,cookie)).json();
 assert.deepEqual(stateAfter.family,stateBefore.family);assert.equal(stateAfter.records.length,1);assert.equal(stateAfter.records[0].id,record.id);assert.equal(stateAfter.records[0].ml,120);assert.deepEqual(stateAfter.weights,stateBefore.weights);
 // Two independent logins of the SAME account represent different devices.
 const siblingLogin=await request('login','POST',{username:'first',password:'test-only-password'});
 assert.equal(siblingLogin.status,200);const siblingCookie=siblingLogin.headers.get('set-cookie').split(';')[0];
 assert.notEqual(siblingCookie,cookie);
 assert.equal((await request('notifications','POST',{...value,reminderMinutes:0},cookie)).status,200);
 const siblingValue={...value,reminderMinutes:0,subscription:{...value.subscription,endpoint:'https://fcm.googleapis.com/fcm/send/sibling-device'}};
 const siblingSaved=await request('notifications','POST',siblingValue,siblingCookie);assert.equal(siblingSaved.status,200);
 const siblingId=(await siblingSaved.json()).id;
 const sameAccountRecord={...record,id:randomUUID(),at:new Date().toISOString(),ml:150};
 const sameAccountCreated=await request('records','POST',sameAccountRecord,cookie);assert.equal(sameAccountCreated.status,201);
 if(sameAccountCreated.waitUntil)await sameAccountCreated.waitUntil();
 await request('notifications/dispatch','POST',{},'',{Authorization:`Bearer ${jobKey}`});
 assert.equal(outgoing.length,3,'One notification for the other device of the same account');
 assert.match(outgoing.at(-1).url,/\/sibling-device$/);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM notification_outbox WHERE record_id=?').bind(sameAccountRecord.id).first()).n,1,'Originating device is excluded');
 await request('notifications','DELETE',{id:siblingId},siblingCookie);
 await request('notifications','DELETE',{id},cookie);
 await request('logout','POST',{},cookie);assert.equal((await request('notifications','GET',undefined,cookie)).status,401);
 console.log('Isolated Workers/D1: cookie auth, notifications opt-in/validation, account isolation, dispatcher secret, deduplication preservation, unsubscribe and unchanged family data passed');
}finally{await mf.dispose();}
