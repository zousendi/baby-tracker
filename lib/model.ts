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
export type MilkFilter = 'all' | 'formula' | 'expressed';
export type AnalysisRange = 7 | 14 | 30;
export type MilkEvent = RecordItem & { next: RecordItem | null; gap: number | null; wakeGap: number | null };
export function median(values: (number | null)[]) {
  const sorted = values.filter((n): n is number => n !== null && Number.isFinite(n)).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2);
}
const average = (values: number[]) => values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length) : null;
export function milkEvents(records: RecordItem[], now = new Date()): MilkEvent[] {
  const feeds = records.filter(r => (r.kind==='milk'||r.kind==='breast') && +new Date(r.at)<=+now)
    .slice().sort((a,b)=>+new Date(a.at)-+new Date(b.at));
  return feeds.flatMap((r,i) => {
    if (r.kind!=='milk') return [];
    const next = feeds[i+1] || null;
    const wake = r.wakeAt ? +new Date(r.wakeAt) : NaN;
    const validWake = Number.isFinite(wake) && wake>=+new Date(r.at) && wake<=+now && (!next||wake<=+new Date(next.at));
    return [{...r,next,gap:next?Math.round((+new Date(next.at)-+new Date(r.at))/60000):null,
      wakeGap:validWake?Math.round((wake-+new Date(r.at))/60000):null}];
  });
}
export function analyzeMilk(records: RecordItem[], endDay: string, range: AnalysisRange=7, milkType: MilkFilter='all', now=new Date()) {
  const start = shiftDay(endDay,1-range);
  // Pair all feeding kinds before filtering; the next feed can be direct breastfeeding.
  const events=milkEvents(records,now).filter(r=>milkType==='all'||r.milkType===milkType);
  const selected=events.filter(r=>dayKey(r.at)===endDay);
  const recent=events.filter(r=>dayKey(r.at)>=start&&dayKey(r.at)<=endDay);
  const cutoff=endDay===dayKey(now)?time(now):'23:59';
  const baseline=Array.from({length:range},(_,i)=>{
    const key=shiftDay(endDay,-i-1),rows=events.filter(r=>dayKey(r.at)===key);
    return {rows,total:rows.length?rows.filter(r=>time(r.at)<=cutoff).reduce((sum,r)=>sum+r.ml,0):null};
  }).filter((d): d is {rows:MilkEvent[];total:number}=>d.total!==null);
  const days=Array.from({length:range},(_,i)=>{
    const key=shiftDay(start,i),rows=recent.filter(r=>dayKey(r.at)===key);
    return {key,rows,total:rows.length?rows.reduce((sum,r)=>sum+r.ml,0):null,
      average:average(rows.map(r=>r.ml)),gap:median(rows.map(r=>r.gap)),gapCount:rows.filter(r=>r.gap!==null).length};
  });
  const groups=([[1,79],[80,119],[120,159],[160,199],[200,1000]] as const).map(([low,high])=>{
    const rows=recent.filter(r=>r.ml>=low&&r.ml<=high);
    const gaps=rows.map(r=>r.gap).filter((n):n is number=>n!==null);
    const wakes=rows.map(r=>r.wakeGap).filter((n):n is number=>n!==null);
    return {low,high,count:gaps.length,gap:median(gaps),min:gaps.length?Math.min(...gaps):null,max:gaps.length?Math.max(...gaps):null,wake:median(wakes),wakeCount:wakes.length};
  });
  return {selected,recent,days,groups,baselineDays:baseline.length,
    total:selected.length?selected.reduce((sum,r)=>sum+r.ml,0):null,baselineTotal:average(baseline.map(d=>d.total)),
    average:average(selected.map(r=>r.ml)),baselineAverage:average(baseline.flatMap(d=>d.rows.map(r=>r.ml))),
    gap:median(selected.map(r=>r.gap)),baselineGap:median(baseline.flatMap(d=>d.rows.map(r=>r.gap)))};
}
