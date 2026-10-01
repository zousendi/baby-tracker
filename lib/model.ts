import type { RecordItem } from './types';
export const localInput = (value: string | number | Date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).format(new Date(value)).replace(' ', 'T');
export const dayKey = (value: string | number | Date = new Date()) => localInput(value).slice(0,10);
export function shiftDay(key: string, days: number) { const d = new Date(`${key}T12:00:00+09:00`); d.setUTCDate(d.getUTCDate() + days); return dayKey(d); }
export const time = (value: string | number | Date) => localInput(value).slice(11);
export const recordsForDay = (records: RecordItem[], day: string, cutoff = '23:59') => records.filter(r => dayKey(r.at) === day && time(r.at) <= cutoff).sort((a,b) => +new Date(b.at) - +new Date(a.at));
export function summarize(records: RecordItem[]) {
  const feeds = records.filter(r => r.kind === 'milk' || r.kind === 'breast');
  const ts = feeds.map(r => +new Date(r.at)).sort((a,b) => a-b);
  return { ml: records.reduce((n,r) => n + (r.kind === 'milk' ? r.ml : 0), 0), feeds: feeds.length, minutes: records.reduce((n,r) => n + (r.kind === 'breast' ? r.left+r.right : 0), 0), pee: records.filter(r => r.kind === 'pee' || r.kind === 'both').length, poop: records.filter(r => r.kind === 'poop' || r.kind === 'both').length, gap: ts.length > 1 ? Math.round((ts.at(-1)!-ts[0])/60000/(ts.length-1)) : null };
}
export function goal(ml: number, low: number | null, high: number | null, today: boolean) {
  if (!low || !high) return 'noGoal';
  return ml < low ? today ? 'inProgress' : 'below' : ml > high ? 'above' : 'within';
}
