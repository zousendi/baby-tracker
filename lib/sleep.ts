import type { RecordItem } from './types';
import { shiftDay } from './model.ts';

export const isSleep = (r: Pick<RecordItem, 'kind'>) => r.kind === 'sleep' || r.kind === 'wake';
export function sleepTimeline(records: RecordItem[], now = Date.now()) {
  const events = records.filter(r => isSleep(r) && +new Date(r.at) <= now)
    .slice().sort((a,b) => +new Date(a.at)-+new Date(b.at) || a.updatedAt-b.updatedAt || a.id.localeCompare(b.id));
  const sessions: {start: RecordItem; end: RecordItem; minutes: number}[] = [];
  const unmatched: RecordItem[] = [];
  let pending: RecordItem | null = null;
  for (const event of events) {
    if (event.kind === 'sleep') {
      if (pending) unmatched.push(pending);
      pending = event;
    } else if (pending && +new Date(event.at) > +new Date(pending.at)) {
      sessions.push({start:pending,end:event,minutes:(+new Date(event.at)-+new Date(pending.at))/60000});
      pending = null;
    } else {
      unmatched.push(event);
      if (pending) { unmatched.push(pending); pending=null; }
    }
  }
  return {events, sessions, unmatched, ongoing:pending, latest:events.at(-1)??null};
}
export function analyzeSleep(records: RecordItem[], day: string, range = 7, now = Date.now()) {
  const timeline = sleepTimeline(records,now);
  const days = Array.from({length:range},(_,i)=>{
    const key=shiftDay(day,i+1-range), start=+new Date(`${key}T00:00:00+09:00`),end=Math.min(start+86400000,now);
    const segments=timeline.sessions.flatMap(s=>{
      const from=Math.max(start,+new Date(s.start.at)),to=Math.min(end,+new Date(s.end.at));
      return to>from?[{...s,from,to,minutes:(to-from)/60000}]:[];
    });
    const minutes=segments.reduce((sum,s)=>sum+s.minutes,0);
    return {key,segments,total:segments.length?Math.round(minutes):null};
  });
  const selected=days.at(-1)!;
  const completed=timeline.sessions.filter(s=>s.end.at && +new Date(s.end.at)>=+new Date(`${day}T00:00:00+09:00`) && +new Date(s.end.at)<+new Date(`${shiftDay(day,1)}T00:00:00+09:00`));
  const recorded=days.filter(d=>d.total!==null);
  return {...timeline,days,selected,count:completed.length,longest:completed.length?Math.round(Math.max(...completed.map(s=>s.minutes))):null,
    average:recorded.length?Math.round(recorded.reduce((sum,d)=>sum+d.total!,0)/recorded.length):null,recordedDays:recorded.length};
}
