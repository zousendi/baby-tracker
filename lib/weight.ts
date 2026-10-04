import { dayKey, shiftDay } from './model.ts';
import type { WeightRecord } from './types';

export function validateWeight(value: Record<string, unknown>, now = new Date()) {
  const day = value.day;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('INVALID_TIME');
  const date = new Date(`${day}T00:00:00+09:00`);
  if (!Number.isFinite(+date) || dayKey(date) !== day || day > dayKey(now)) throw new Error('INVALID_TIME');
  if (typeof value.grams !== 'number' || !Number.isInteger(value.grams) || value.grams < 1 || value.grams > 50000) throw new Error('INVALID_WEIGHT');
  const note = value.note ?? '';
  if (typeof note !== 'string' || note.length > 200) throw new Error('INVALID_INPUT');
  return {day, grams: value.grams, note: note.trim()};
}

export function weightHistory(records: WeightRecord[], day: string, range: number) {
  const start = shiftDay(day, 1-range);
  const sorted = records.filter(r => r.day <= day).slice().sort((a,b)=>a.day.localeCompare(b.day));
  const selected = sorted.find(r=>r.day===day) ?? null;
  const previous = sorted.filter(r=>r.day<day).at(-1) ?? null;
  return {selected, previous, rows: sorted.filter(r=>r.day>=start), start};
}
