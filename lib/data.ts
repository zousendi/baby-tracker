import { env } from 'cloudflare:workers';
export function database(): D1Database {
  if (!env.DB) throw new Error('DB_UNAVAILABLE');
  return env.DB;
}
export const familySelect = 'id,name,baby_name AS babyName,birthday,goal_low AS goalLow,goal_high AS goalHigh,version';
export const recordSelect = `r.id,r.kind,r.at,r.ml,r.left_minutes AS "left",r.right_minutes AS "right",r.milk_type AS milkType,r.note,r.version,r.updated_at AS updatedAt,u.display_name AS author`;
