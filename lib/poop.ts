import type { RecordItem } from './types';
import { dayKey, shiftDay } from './model.ts';

/** Japan calendar days, with nearby events grouped to keep touch targets apart. */
export function poopDays(records: RecordItem[], endDay: string, range = 7, now = Date.now()) {
  return Array.from({length: range}, (_, index) => {
    const day = shiftDay(endDay, index + 1 - range);
    const midnight = +new Date(`${day}T00:00:00+09:00`);
    const rows = records.filter(r => (r.kind === 'poop' || r.kind === 'both') &&
      +new Date(r.at) <= now && dayKey(r.at) === day)
      .slice().sort((a,b) => +new Date(a.at) - +new Date(b.at));
    const groups: {records: RecordItem[]; minute: number}[] = [];
    for (const record of rows) {
      const minute = (+new Date(record.at) - midnight) / 60000;
      const previous = groups.at(-1);
      // Transitive grouping keeps separate targets at least 50 px apart on a 480 px day.
      if (previous && minute - (+new Date(previous.records.at(-1)!.at) - midnight) / 60000 < 150) {
        previous.records.push(record);
        previous.minute = previous.records.reduce((sum,r) => sum + (+new Date(r.at)-midnight)/60000,0) / previous.records.length;
      } else groups.push({records:[record],minute});
    }
    return {day,rows,groups};
  });
}
