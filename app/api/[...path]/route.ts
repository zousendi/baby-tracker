import { env } from 'cloudflare:workers';
import { database, familySelect, recordSelect, weightSelect } from '../../../lib/data';
import { digest, equal, hashPassword, randomToken, verifyPassword } from '../../../lib/security';
import { validateWeight } from '../../../lib/weight';
import type { User } from '../../../lib/types';
import { allowedPushEndpoint, validPushKeys } from '../../../lib/notification-policy';
import { dispatchNotifications, notificationTablesReady, pushConfigured, remindersConfigured, queueFamilyNotification } from '../../../lib/notifications';

export const dynamic = 'force-dynamic';
class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
function cookie(request: Request, token: string, maxAge: number) {
  const url = new URL(request.url);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  return `komorebi_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${local && url.protocol === 'http:' ? '' : '; Secure'}`;
}
function sessionToken(request: Request) {
  return (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('komorebi_session='))?.slice(17) || '';
}
async function currentUser(request: Request): Promise<User> {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'LOGIN_REQUIRED');
  const user = await database().prepare(`SELECT u.id,u.username,u.display_name AS displayName,u.family_id AS familyId FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(await digest(token), Date.now()).first<User>();
  if (!user) throw new ApiError(401, 'LOGIN_REQUIRED');
  return user;
}
function mutationGuard(request: Request) {
  if (request.headers.get('x-app-request') !== 'komorebi') throw new ApiError(403, 'FORBIDDEN');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'FORBIDDEN');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'INVALID_INPUT');
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 16000) throw new ApiError(413, 'INVALID_INPUT');
  try { const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new ApiError(400, 'INVALID_INPUT'); }
}
function str(value: unknown, max: number, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || !allowEmpty && !value.trim()) throw new ApiError(400, 'INVALID_INPUT');
  return value.trim();
}
function int(value: unknown, low: number, high: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < low || value > high) throw new ApiError(400, 'INVALID_INPUT');
  return value;
}
function validateRecord(b: Record<string, unknown>) {
  const kind = str(b.kind, 10);
  if (!['milk','breast','pee','poop','both','sleep','wake'].includes(kind)) throw new ApiError(400, 'INVALID_INPUT');
  const d = new Date(str(b.at, 40));
  if (!Number.isFinite(+d) || +d > Date.now() + 60000) throw new ApiError(400, 'INVALID_TIME');
  const ml = kind === 'milk' ? int(b.ml, 1, 1000) : 0;
  const left = kind === 'breast' ? int(b.left, 0, 180) : 0;
  const right = kind === 'breast' ? int(b.right, 0, 180) : 0;
  if (kind === 'breast' && left + right === 0) throw new ApiError(400, 'INVALID_DURATION');
  const milkType = b.milkType === 'expressed' ? 'expressed' : 'formula';
  const wakeAt = null;
  return { kind, at: d.toISOString(), ml, left, right, milkType, wakeAt, note: str(b.note ?? '', 200, true) };
}
function weightInput(b: Record<string, unknown>) {
  try { return validateWeight(b); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'INVALID_INPUT'); }
}
async function rateLimit(key: string, limit: number) {
  const db = database(), now = Date.now();
  const row = await db.prepare(`INSERT INTO login_attempts (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END RETURNING count`).bind(key, now + 15 * 60000, now, now, now + 15 * 60000).first<{ count: number }>();
  if (!row || row.count > limit) throw new ApiError(429, 'RATE_LIMIT');
}
async function admin(request: Request) {
  const key = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!env.ADMIN_KEY || key.length < 32 || !equal(await digest(key), await digest(env.ADMIN_KEY))) throw new ApiError(403, 'ADMIN_REQUIRED');
}
async function handle(request: Request) {
  const url = new URL(request.url), path = url.pathname.replace(/^\/api\//, ''), method = request.method;
  try {
    if(path==='notifications/dispatch'&&method==='POST'){
      const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
      if(!env.PUSH_JOB_KEY||env.PUSH_JOB_KEY.length<32||!equal(await digest(token),await digest(env.PUSH_JOB_KEY)))throw new ApiError(403,'FORBIDDEN');
      return reply(await dispatchNotifications(env,true));
    }
    if (method !== 'GET') mutationGuard(request);
    if (path === 'login' && method === 'POST') {
      const b = await body(request), username = str(b.username, 40).toLowerCase(), password = str(b.password, 128);
      const db = database();
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(`ip:${await digest(ip)}`, 60);
      await rateLimit(`user:${await digest(username)}`, 12);
      const row = await db.prepare('SELECT id,password_hash AS passwordHash FROM users WHERE username=? AND active=1').bind(username).first<{ id: string; passwordHash: string }>();
      const valid = await verifyPassword(password, row?.passwordHash || `pbkdf2-sha256$100000$${'0'.repeat(64)}$${'0'.repeat(64)}`);
      if (!row || !valid) throw new ApiError(401, 'INVALID_LOGIN');
      const token = randomToken();
      await db.batch([
        db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token), row.id, Date.now() + 30 * 86400000),
        db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),
        db.prepare('DELETE FROM login_attempts WHERE reset_at<?').bind(Date.now()),
        db.prepare('DELETE FROM login_attempts WHERE key=?').bind(`user:${await digest(username)}`),
      ]);
      return reply({ ok: true }, 200, { 'Set-Cookie': cookie(request, token, 30 * 86400) });
    }
    if (path === 'logout' && method === 'POST') {
      const token = sessionToken(request);
      if (token) await database().prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
      return reply({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
    }
    if (path.startsWith('admin/')) {
      await admin(request);
      const db = database();
      if (path === 'admin/directory' && method === 'GET') {
        const families = await db.prepare(`SELECT ${familySelect} FROM families ORDER BY created_at`).all();
        const users = await db.prepare('SELECT id,username,display_name AS displayName,family_id AS familyId,active FROM users ORDER BY created_at').all();
        return reply({ families: families.results, users: users.results });
      }
      if (path === 'admin/families' && method === 'POST') {
        const b = await body(request), id = crypto.randomUUID(), name = str(b.name, 40);
        await db.prepare('INSERT INTO families(id,name,baby_name,created_at) VALUES (?,?,?,?)').bind(id, name, name, Date.now()).run();
        return reply({ id, name }, 201);
      }
      if (path === 'admin/users' && method === 'POST') {
        const b = await body(request), username = str(b.username, 40).toLowerCase();
        if (!/^[a-z0-9_-]{3,40}$/.test(username)) throw new ApiError(400, 'INVALID_USERNAME');
        const password = str(b.password, 128), displayName = str(b.displayName || username, 40), familyId = str(b.familyId, 60);
        if (password.length < 3) throw new ApiError(400, 'INVALID_PASSWORD');
        if (!await db.prepare('SELECT id FROM families WHERE id=?').bind(familyId).first()) throw new ApiError(404, 'NOT_FOUND');
        if (await db.prepare('SELECT id FROM users WHERE username=?').bind(username).first()) throw new ApiError(409, 'USERNAME_TAKEN');
        const id = crypto.randomUUID();
        try { await db.prepare('INSERT INTO users(id,username,display_name,family_id,password_hash,created_at) VALUES (?,?,?,?,?,?)').bind(id, username, displayName, familyId, await hashPassword(password), Date.now()).run(); }
        catch (e) { if (String(e).includes('UNIQUE')) throw new ApiError(409, 'USERNAME_TAKEN'); throw e; }
        return reply({ id, username, familyId }, 201);
      }
      if (/^admin\/users\/[^/]+$/.test(path) && method === 'PATCH') {
        const id = path.split('/')[2], b = await body(request);
        if (!await db.prepare('SELECT id FROM users WHERE id=?').bind(id).first()) throw new ApiError(404, 'NOT_FOUND');
        if (typeof b.password === 'string') {
          const password = str(b.password, 128); if (password.length < 3) throw new ApiError(400, 'INVALID_PASSWORD');
          await db.batch([db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(password), id), db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]);
        } else if (typeof b.active === 'boolean') {
          await db.batch([db.prepare('UPDATE users SET active=? WHERE id=?').bind(b.active ? 1 : 0, id), db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]);
        } else throw new ApiError(400, 'INVALID_INPUT');
        return reply({ ok: true });
      }
      throw new ApiError(404, 'NOT_FOUND');
    }
    const user = await currentUser(request), db = database();
    if(path==='notifications'&&method==='GET'){
      const ready=await notificationTablesReady(db);
      const rows=ready?await db.prepare('SELECT id,family_events AS familyEvents,reminder_minutes AS reminderMinutes FROM notification_subscriptions WHERE user_id=? AND session_hash=?').bind(user.id,await digest(sessionToken(request))).all():{results:[]};
      return reply({configured:ready&&pushConfigured(env),remindersConfigured:ready&&remindersConfigured(env),publicKey:ready&&pushConfigured(env)?env.PUSH_PUBLIC_KEY:null,subscriptions:rows.results});
    }
    if(path==='notifications'&&method==='POST'){
      if(!pushConfigured(env)||!await notificationTablesReady(db))throw new ApiError(503,'PUSH_NOT_CONFIGURED');
      const b=await body(request),subscription=b.subscription as Record<string,unknown>|undefined;
      if(!subscription||!allowedPushEndpoint(subscription.endpoint)||!validPushKeys(subscription.keys))throw new ApiError(400,'INVALID_INPUT');
      if(typeof b.familyEvents!=='boolean'||!['ja','zh'].includes(String(b.language)))throw new ApiError(400,'INVALID_INPUT');
      const minutes=int(b.reminderMinutes,0,720);
      if(minutes!==0&&(minutes<30||minutes%15!==0))throw new ApiError(400,'INVALID_INPUT');
      if(minutes&&!remindersConfigured(env))throw new ApiError(503,'PUSH_REMINDERS_UNAVAILABLE');
      const id=await digest(subscription.endpoint),sessionHash=await digest(sessionToken(request)),now=Date.now();
      const previous=await db.prepare('SELECT user_id,p256dh,auth FROM notification_subscriptions WHERE id=?').bind(id).first<{user_id:string;p256dh:string;auth:string}>();
      if(previous&&previous.user_id!==user.id&&(previous.auth!==subscription.keys.auth||previous.p256dh!==subscription.keys.p256dh))throw new ApiError(403,'FORBIDDEN');
      const count=await db.prepare('SELECT COUNT(*) AS n FROM notification_subscriptions WHERE user_id=? AND id<>?').bind(user.id,id).first<{n:number}>();
      if((count?.n||0)>=10)throw new ApiError(400,'INVALID_INPUT');
      await db.batch([
        db.prepare('DELETE FROM notification_outbox WHERE subscription_id=? AND EXISTS (SELECT 1 FROM notification_subscriptions WHERE id=? AND user_id<>?)').bind(id,id,user.id),
        db.prepare(`INSERT INTO notification_subscriptions(id,user_id,family_id,session_hash,endpoint,p256dh,auth,language,family_events,reminder_minutes,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,family_id=excluded.family_id,session_hash=excluded.session_hash,p256dh=excluded.p256dh,auth=excluded.auth,language=excluded.language,family_events=excluded.family_events,reminder_minutes=excluded.reminder_minutes,updated_at=excluded.updated_at`)
          .bind(id,user.id,user.familyId,sessionHash,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,b.language,b.familyEvents?1:0,minutes,now,now),
      ]);
      return reply({ok:true,id});
    }
    if(path==='notifications'&&method==='DELETE'){
      const b=await body(request),id=str(b.id,64);
      await db.prepare('DELETE FROM notification_subscriptions WHERE id=? AND user_id=?').bind(id,user.id).run();
      return reply({ok:true});
    }
    if (path === 'state' && method === 'GET') {
      const family = await db.prepare(`SELECT ${familySelect} FROM families WHERE id=?`).bind(user.familyId).first();
      const records = await db.prepare(`SELECT ${recordSelect} FROM records r JOIN users u ON u.id=r.updated_by WHERE r.family_id=? ORDER BY r.at DESC`).bind(user.familyId).all();
      const weights = await db.prepare(`SELECT ${weightSelect} FROM weights w JOIN users u ON u.id=w.updated_by WHERE w.family_id=? ORDER BY w.day DESC`).bind(user.familyId).all();
      return reply({ user, family, records: records.results, weights: weights.results, serverTime: Date.now() });
    }
    if (path === 'weights' && method === 'POST') {
      const b = await body(request), w = weightInput(b), id = str(b.id, 60);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(400, 'INVALID_INPUT');
      const result = await db.prepare('INSERT OR IGNORE INTO weights(id,family_id,day,grams,note,created_by,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, user.familyId, w.day, w.grams, w.note, user.id, user.id, Date.now()).run();
      if (!result.meta.changes) {
        const existing = await db.prepare('SELECT day,grams,note FROM weights WHERE id=? AND family_id=?').bind(id, user.familyId).first();
        if (!existing || Object.entries(w).some(([key,value])=>existing[key]!==value)) throw new ApiError(409, 'WEIGHT_DAY_EXISTS');
      }
      if(result.meta.changes)try{await queueFamilyNotification(env,user.familyId,await digest(sessionToken(request)),id);}catch{console.warn('Notification enqueue unavailable');}
      return reply({ok:true,id},201);
    }
    if (/^weights\/[^/]+$/.test(path) && ['PATCH','DELETE'].includes(method)) {
      const id=path.split('/')[1], b=await body(request), version=int(b.version,1,2147483647);
      if (!await db.prepare('SELECT id FROM weights WHERE id=? AND family_id=?').bind(id,user.familyId).first()) throw new ApiError(404,'NOT_FOUND');
      let result;
      if (method==='DELETE') result=await db.prepare('DELETE FROM weights WHERE id=? AND family_id=? AND version=?').bind(id,user.familyId,version).run();
      else {
        const w=weightInput(b);
        try { result=await db.prepare('UPDATE weights SET day=?,grams=?,note=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND family_id=? AND version=?').bind(w.day,w.grams,w.note,user.id,Date.now(),id,user.familyId,version).run(); }
        catch(error) { if(String(error).includes('UNIQUE'))throw new ApiError(409,'WEIGHT_DAY_EXISTS');throw error; }
      }
      if(!result.meta.changes)throw new ApiError(409,'CONFLICT');
      return reply({ok:true});
    }
    if (path === 'records' && method === 'POST') {
      const b = await body(request), r = validateRecord(b), id = str(b.id, 60);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(400, 'INVALID_INPUT');
      if (b.quickSleep === true && (r.kind === 'sleep' || r.kind === 'wake')) {
        const expected = typeof b.expectedSleepId === 'string' ? b.expectedSleepId : '';
        const result = await db.prepare(`INSERT OR IGNORE INTO records(id,family_id,kind,at,created_by,updated_by,updated_at)
          SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT id FROM records WHERE family_id=? AND kind IN ('sleep','wake') ORDER BY at DESC,updated_at DESC,id DESC LIMIT 1),'')=?
          AND COALESCE((SELECT kind FROM records WHERE family_id=? AND kind IN ('sleep','wake') ORDER BY at DESC,updated_at DESC,id DESC LIMIT 1),'')<>?
          AND COALESCE((SELECT at FROM records WHERE family_id=? AND kind IN ('sleep','wake') ORDER BY at DESC,updated_at DESC,id DESC LIMIT 1),'')<?`)
          .bind(id,user.familyId,r.kind,r.at,user.id,user.id,Date.now(),user.familyId,expected,user.familyId,r.kind,user.familyId,r.at).run();
        if (!result.meta.changes && !await db.prepare('SELECT id FROM records WHERE id=? AND family_id=? AND kind=? AND at=?').bind(id,user.familyId,r.kind,r.at).first()) throw new ApiError(409,'SLEEP_CONFLICT');
        if(result.meta.changes)try{await queueFamilyNotification(env,user.familyId,await digest(sessionToken(request)),id);}catch{console.warn('Notification enqueue unavailable');}
        return reply({ok:true,id},201);
      }
      const result = await db.prepare(`INSERT OR IGNORE INTO records(id,family_id,kind,at,ml,left_minutes,right_minutes,milk_type,note,wake_at,created_by,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, user.familyId, r.kind, r.at, r.ml, r.left, r.right, r.milkType, r.note, r.wakeAt, user.id, user.id, Date.now()).run();
      if (!result.meta.changes) {
        const existing = await db.prepare('SELECT kind,at,ml,left_minutes AS "left",right_minutes AS "right",milk_type AS milkType,note,wake_at AS wakeAt FROM records WHERE id=? AND family_id=?').bind(id, user.familyId).first();
        if (!existing || Object.entries(r).some(([key, value]) => existing[key] !== value)) throw new ApiError(409, 'CONFLICT');
      }
      if(result.meta.changes)try{await queueFamilyNotification(env,user.familyId,await digest(sessionToken(request)),id);}catch{console.warn('Notification enqueue unavailable');}
      return reply({ ok: true, id }, 201);
    }
    if (/^records\/[^/]+$/.test(path) && ['PATCH', 'DELETE'].includes(method)) {
      const id = path.split('/')[1], b = await body(request), version = int(b.version, 1, 2147483647);
      if (!await db.prepare('SELECT id FROM records WHERE id=? AND family_id=?').bind(id, user.familyId).first()) throw new ApiError(404, 'NOT_FOUND');
      let result;
      if (method === 'DELETE') result = await db.prepare('DELETE FROM records WHERE id=? AND family_id=? AND version=?').bind(id, user.familyId, version).run();
      else {
        const r = validateRecord(b);
        result = await db.prepare('UPDATE records SET kind=?,at=?,ml=?,left_minutes=?,right_minutes=?,milk_type=?,note=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND family_id=? AND version=?').bind(r.kind, r.at, r.ml, r.left, r.right, r.milkType, r.note, user.id, Date.now(), id, user.familyId, version).run();
      }
      if (!result.meta.changes) throw new ApiError(409, 'CONFLICT');
      return reply({ ok: true });
    }
    if (path === 'profile' && method === 'PATCH') {
      const b = await body(request), name = str(b.babyName, 40), birthday = str(b.birthday ?? '', 10, true);
      if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || !Number.isFinite(+new Date(birthday)) || new Date(birthday).toISOString().slice(0,10) !== birthday || +new Date(birthday) > Date.now())) throw new ApiError(400, 'INVALID_TIME');
      const low = b.goalLow === null ? null : int(b.goalLow, 1, 5000), high = b.goalHigh === null ? null : int(b.goalHigh, 1, 5000);
      if ((low === null) !== (high === null) || low !== null && high !== null && high < low) throw new ApiError(400, 'INVALID_GOAL');
      const version = int(b.version, 1, 2147483647);
      const result = await db.prepare('UPDATE families SET baby_name=?,birthday=?,goal_low=?,goal_high=?,version=version+1 WHERE id=? AND version=?').bind(name, birthday, low, high, user.familyId, version).run();
      if (!result.meta.changes) throw new ApiError(409, 'CONFLICT');
      return reply({ ok: true });
    }
    throw new ApiError(404, 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError) return reply({ error: error.code }, error.status, error.status === 429 ? { 'Retry-After': '900' } : {});
    console.error('App request failed', path, error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
