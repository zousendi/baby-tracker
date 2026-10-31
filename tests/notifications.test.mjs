import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createECDH,randomBytes} from 'node:crypto';
import webpush from 'web-push';
import {allowedPushEndpoint,validPushKeys,reminderDue} from '../lib/notification-policy.ts';
import {dispatchNotifications,queueFamilyNotification,queueDueReminders} from '../lib/notifications.ts';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of ['0000_polite_bug','0001_neat_sentry','0002_sharp_alex_wilder'])sql.exec(readFileSync(new URL(`../drizzle/${file}.sql`,import.meta.url),'utf8'));
  const before=sql.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  sql.exec(readFileSync(new URL('../drizzle/0003_notifications.sql',import.meta.url),'utf8'));
  for(const row of before)assert.equal(sql.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(row.name).sql,row.sql,'Existing schema remains identical');
  const now=Date.now(),at=new Date(now-180*60000).toISOString();
  sql.prepare('INSERT INTO families(id,name,baby_name,created_at) VALUES (?,?,?,?)').run('f','Test family','Test baby',now);
  sql.prepare('INSERT INTO families(id,name,baby_name,created_at) VALUES (?,?,?,?)').run('f2','Other family','Other baby',now);
  const key=createECDH('prime256v1');key.generateKeys();
  const keys={p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};
  for(const [id,family,expiry,active,minutes,events] of [['actor','f',now+86400000,1,0,1],['recipient','f',now+86400000,1,180,1],['expired','f',now-1,1,180,1],['inactive','f',now+86400000,0,180,1],['other','f2',now+86400000,1,180,1],['muted','f',now+86400000,1,0,0]]){
    sql.prepare('INSERT INTO users(id,username,display_name,family_id,password_hash,active,created_at) VALUES (?,?,?,?,?,?,?)').run(id,id,id,family,'not-a-real-hash',active,now);
    sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(`session-${id}`,id,expiry);
    sql.prepare('INSERT INTO notification_subscriptions(id,user_id,family_id,session_hash,endpoint,p256dh,auth,language,family_events,reminder_minutes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(`sub-${id}`,id,family,`session-${id}`,`https://fcm.googleapis.com/fcm/send/test-${id}`,keys.p256dh,keys.auth,'zh',events,minutes,now,now);
  }
  sql.prepare('INSERT INTO records(id,family_id,kind,at,ml,created_by,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('feed','f','milk',at,120,'actor','actor',now);
  const db={prepare(query){let values=[];return{bind(...v){values=v;return this;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return{results:sql.prepare(query).all(...values)};},async run(){const result=sql.prepare(query).run(...values);return{meta:{changes:result.changes}};}};},async batch(statements){return Promise.all(statements.map(statement=>statement.run()));}};
  const vapid=webpush.generateVAPIDKeys();
  const env={DB:db,PUSH_PUBLIC_KEY:vapid.publicKey,PUSH_PRIVATE_KEY:vapid.privateKey,PUSH_SUBJECT:'mailto:test@example.com',PUSH_REMINDERS_ENABLED:'true'};
  return{sql,db,env,now,at};
}
test('push destinations reject arbitrary hosts, credentials, ports and malformed keys',()=>{
  assert.ok(allowedPushEndpoint('https://web.push.apple.com/test'));
  assert.ok(allowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/test'));
  for(const url of ['http://fcm.googleapis.com/test','https://127.0.0.1/private','https://push.apple.com.evil.test/a','https://user:pass@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://example.com/'])assert.equal(allowedPushEndpoint(url),false,url);
  assert.equal(validPushKeys({p256dh:'bad',auth:'bad'}),false);
  assert.equal(reminderDue('invalid',180,Date.now()),false);
  assert.equal(reminderDue(new Date(Date.now()-6*3600000).toISOString(),180,Date.now()),false,'Do not send very stale reminders');
});
test('family events isolate families, exclude author, inactive/expired/muted users and deduplicate retries',async()=>{
  const f=fixture();
  try{
    await queueFamilyNotification(f.env,'f','actor','feed');await queueFamilyNotification(f.env,'f','actor','feed');
    assert.deepEqual(f.sql.prepare('SELECT subscription_id FROM notification_outbox').all().map(r=>r.subscription_id),['sub-recipient']);
  }finally{f.sql.close();}
});
test('overlapping dispatches lease each job once and use encrypted Web Push',async()=>{
  const f=fixture(),original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});await new Promise(resolve=>setTimeout(resolve,10));return new Response(null,{status:201});};
  try{
    await queueFamilyNotification(f.env,'f','actor','feed');
    await Promise.all([dispatchNotifications(f.env),dispatchNotifications(f.env)]);
    assert.equal(calls.length,1);assert.match(calls[0].url,/test-recipient$/);
    assert.equal(calls[0].options.redirect,'manual','Workers-supported mode rejects redirects without following them');
    const headers=new Headers(Object.entries(calls[0].options.headers).map(([k,v])=>[k,String(v)]));
    assert.equal(headers.get('Content-Encoding'),'aes128gcm');assert.match(headers.get('Authorization'),/^vapid /);
    assert.ok(!Buffer.from(calls[0].options.body).toString().includes('家人'));
    await dispatchNotifications(f.env);assert.equal(calls.length,1,'Successful deliveries are not retried');
  }finally{globalThis.fetch=original;f.sql.close();}
});
test('reminders deduplicate scheduler runs and cancel when a later feed is recorded',async()=>{
  const f=fixture(),original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:201});};
  try{
    await queueDueReminders(f.env,f.now);await queueDueReminders(f.env,f.now);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind='reminder'").get().n,1);
    f.sql.prepare('INSERT INTO records(id,family_id,kind,at,created_by,updated_by,updated_at) VALUES (?,?,?,?,?,?,?)').run('new-feed','f','breast',new Date().toISOString(),'actor','actor',Date.now());
    await dispatchNotifications(f.env);assert.equal(calls,0,'Stale feed reminders do not send');
  }finally{globalThis.fetch=original;f.sql.close();}
});
test('session revocation stops queued notifications and gone push endpoints are removed',async()=>{
  const f=fixture(),original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:410});};
  try{
    await queueFamilyNotification(f.env,'f','actor','feed');
    f.sql.prepare('DELETE FROM sessions WHERE user_id=?').run('recipient');
    await dispatchNotifications(f.env);assert.equal(calls,0);
    f.sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run('session-recipient','recipient',Date.now()+86400000);
    const sub=f.sql.prepare('SELECT * FROM notification_subscriptions WHERE id=?').get('sub-actor');
    f.sql.prepare('INSERT INTO notification_subscriptions(id,user_id,family_id,session_hash,endpoint,p256dh,auth,language,family_events,reminder_minutes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('sub-recipient','recipient','f','session-recipient','https://fcm.googleapis.com/new',sub.p256dh,sub.auth,'zh',1,0,Date.now(),Date.now());
    await queueFamilyNotification(f.env,'f','actor','feed');await dispatchNotifications(f.env);
    assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT id FROM notification_subscriptions WHERE id=?').get('sub-recipient'),undefined);
  }finally{globalThis.fetch=original;f.sql.close();}
});
test('transient push failure backs off without changing baby records',async()=>{
  const f=fixture(),original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('offline');};
  try{
    await queueFamilyNotification(f.env,'f','actor','feed');await dispatchNotifications(f.env);await dispatchNotifications(f.env);
    assert.equal(calls,1);assert.ok(f.sql.prepare('SELECT next_attempt_at FROM notification_outbox').get().next_attempt_at>Date.now());
    assert.equal(f.sql.prepare('SELECT ml FROM records WHERE id=?').get('feed').ml,120);
  }finally{globalThis.fetch=original;f.sql.close();}
});
