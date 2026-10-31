import webpush from 'web-push';
import { digest } from './security.ts';
import { notificationCopy, reminderDue } from './notification-policy.ts';

type PushEnv=Pick<Cloudflare.Env,'DB'|'PUSH_PUBLIC_KEY'|'PUSH_PRIVATE_KEY'|'PUSH_SUBJECT'|'PUSH_JOB_KEY'|'PUSH_REMINDERS_ENABLED'>;
export function pushConfigured(env:PushEnv){return Boolean(env.PUSH_PUBLIC_KEY&&env.PUSH_PRIVATE_KEY&&env.PUSH_SUBJECT);}
export function remindersConfigured(env:PushEnv){return pushConfigured(env)&&env.PUSH_REMINDERS_ENABLED==='true';}
export async function notificationTablesReady(db:D1Database){
  const result=await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('notification_subscriptions','notification_outbox')").first<{n:number}>();
  return result?.n===2;
}
// Called only after an actual insertion. Failure never rolls back a baby record.
export async function queueFamilyNotification(env:PushEnv,familyId:string,actorId:string,recordId:string){
  if(!env.DB||!pushConfigured(env))return;
  const now=Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO notification_outbox(id,subscription_id,kind,record_id,created_at,expires_at)
    SELECT 'family:'||n.id||':'||?,n.id,'family',?,?,? FROM notification_subscriptions n
    JOIN users u ON u.id=n.user_id JOIN sessions s ON s.token_hash=n.session_hash AND s.user_id=u.id
    WHERE n.family_id=? AND u.family_id=n.family_id AND n.user_id<>? AND n.family_events=1 AND u.active=1 AND s.expires_at>?`)
    .bind(recordId,recordId,now,now+15*60000,familyId,actorId,now).run();
}
export async function queueDueReminders(env:PushEnv,now=Date.now()){
  if(!env.DB||!remindersConfigured(env))return;
  // The latest feed ID, timestamp and chosen interval form the reminder identity.
  // Each delivery is checked again; new feeds and edits invalidate stale jobs.
  const subscriptions=await env.DB.prepare(`SELECT n.id,n.family_id,n.reminder_minutes,
    (SELECT r.id FROM records r WHERE r.family_id=n.family_id AND r.kind IN ('milk','breast') ORDER BY r.at DESC,r.updated_at DESC,r.id DESC LIMIT 1) AS record_id,
    (SELECT r.at FROM records r WHERE r.family_id=n.family_id AND r.kind IN ('milk','breast') ORDER BY r.at DESC,r.updated_at DESC,r.id DESC LIMIT 1) AS record_at
    FROM notification_subscriptions n JOIN users u ON u.id=n.user_id
    JOIN sessions s ON s.token_hash=n.session_hash AND s.user_id=u.id
    WHERE n.reminder_minutes>0 AND u.active=1 AND u.family_id=n.family_id AND s.expires_at>?`)
    .bind(now).all<{id:string;family_id:string;reminder_minutes:number;record_id:string;record_at:string}>();
  const jobs=subscriptions.results.filter(row=>reminderDue(row.record_at,row.reminder_minutes,now));
  // Bound SQL batch size; repeated scheduler runs pick up any remaining work.
  for(let i=0;i<jobs.length;i+=50){
    await env.DB.batch(jobs.slice(i,i+50).map(row=>env.DB!.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id,subscription_id,kind,record_id,record_at,reminder_minutes,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(`reminder:${row.id}:${row.record_id}:${row.record_at}:${row.reminder_minutes}`,row.id,'reminder',row.record_id,row.record_at,row.reminder_minutes,now,now+15*60000)));
  }
}
type Job={id:string;subscription_id:string;kind:string;record_id:string;record_at:string|null;reminder_minutes:number;attempts:number};
type Subscription={endpoint:string;p256dh:string;auth:string;language:string;family_id:string;family_events:number;reminder_minutes:number};
export async function dispatchNotifications(env:PushEnv,includeReminders=false){
  if(!env.DB||!pushConfigured(env)||!await notificationTablesReady(env.DB))return {configured:false,accepted:0};
  const db=env.DB,now=Date.now();
  if(includeReminders)await queueDueReminders(env,now);
  const pending=await db.prepare(`SELECT id FROM notification_outbox WHERE delivered_at IS NULL AND next_attempt_at<=? AND expires_at>? AND lease_until<? AND attempts<4 ORDER BY created_at LIMIT 20`).bind(now,now,now).all<{id:string}>();
  let accepted=0;
  for(let i=0;i<pending.results.length;i+=5){
    await Promise.all(pending.results.slice(i,i+5).map(async({id})=>{
      const job=await db.prepare(`UPDATE notification_outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND delivered_at IS NULL AND lease_until<? AND expires_at>? AND next_attempt_at<=? AND attempts<4 RETURNING *`).bind(now+120000,id,now,now,now).first<Job>();
      if(!job)return;
      try{
        const sub=await db.prepare(`SELECT n.* FROM notification_subscriptions n JOIN users u ON u.id=n.user_id
          JOIN sessions s ON s.token_hash=n.session_hash AND s.user_id=u.id
          WHERE n.id=? AND u.active=1 AND u.family_id=n.family_id AND s.expires_at>?`).bind(job.subscription_id,Date.now()).first<Subscription>();
        let valid=Boolean(sub);
        if(sub&&job.kind==='family'){
          const record=await db.prepare(`SELECT id FROM records WHERE id=? AND family_id=? UNION ALL SELECT id FROM weights WHERE id=? AND family_id=?`).bind(job.record_id,sub.family_id,job.record_id,sub.family_id).first();
          valid=Boolean(sub.family_events&&record);
        }
        if(sub&&job.kind==='reminder'){
          const latest=await db.prepare(`SELECT id,at FROM records WHERE family_id=? AND kind IN ('milk','breast') ORDER BY at DESC,updated_at DESC,id DESC LIMIT 1`).bind(sub.family_id).first<{id:string;at:string}>();
          valid=remindersConfigured(env)&&sub.reminder_minutes===job.reminder_minutes&&latest?.id===job.record_id&&latest.at===job.record_at&&reminderDue(latest.at,job.reminder_minutes,Date.now());
        }
        if(!sub||!valid){await db.prepare('DELETE FROM notification_outbox WHERE id=?').bind(id).run();return;}
        const copy=notificationCopy(job.kind,sub.language);
        const details=webpush.generateRequestDetails({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({...copy,tag:await digest(job.id)}),{
          TTL:300,urgency:'normal',vapidDetails:{subject:env.PUSH_SUBJECT!,publicKey:env.PUSH_PUBLIC_KEY!,privateKey:env.PUSH_PRIVATE_KEY!},
        });
        const response=await fetch(details.endpoint,{method:'POST',headers:details.headers as Record<string,string>,body:details.body as Uint8Array<ArrayBuffer>,redirect:'manual',signal:AbortSignal.timeout(8000)});
        if(response.status===404||response.status===410){await db.prepare('DELETE FROM notification_subscriptions WHERE id=?').bind(job.subscription_id).run();return;}
        if(!response.ok)throw new Error('PUSH_REJECTED');
        await db.prepare('UPDATE notification_outbox SET delivered_at=?,lease_until=0 WHERE id=?').bind(Date.now(),id).run();accepted++;
      }catch(error){
        // Do not log subscription endpoints, keys or notification payloads.
        console.warn('Push delivery failed',error instanceof Error?error.name:'UnknownError');
        await db.prepare('UPDATE notification_outbox SET lease_until=0,next_attempt_at=? WHERE id=?').bind(Date.now()+Math.min(15*60000,30000*2**job.attempts),id).run();
      }
    }));
  }
  // Keep deduplication rows longer than the reminder's 30-minute validity window.
  await db.batch([
    db.prepare('DELETE FROM notification_outbox WHERE expires_at<?').bind(now-7*86400000),
    db.prepare('DELETE FROM notification_subscriptions WHERE NOT EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=notification_subscriptions.session_hash AND s.user_id=notification_subscriptions.user_id AND s.expires_at>? AND u.active=1 AND u.family_id=notification_subscriptions.family_id)').bind(now),
  ]);
  return {configured:true,accepted};
}
