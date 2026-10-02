export const KINDS = ['milk', 'breast', 'pee', 'poop', 'both'];
export const pad = n => String(n).padStart(2, '0');
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function shiftDay(key, amount) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return dayKey(d);
}
export function localInput(date = new Date()) {
  const d = new Date(date);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function recordsForDay(records, key, cutoffMinutes = 1440) {
  return records.filter(r => {
    const d = new Date(r.at);
    return dayKey(d) === key && d.getHours() * 60 + d.getMinutes() <= cutoffMinutes;
  }).sort((a, b) => new Date(b.at) - new Date(a.at));
}
export function summarize(records) {
  const feeds = records.filter(r => ['milk', 'breast'].includes(r.kind));
  const times = feeds.map(r => +new Date(r.at)).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 60000);
  return {
    ml: records.reduce((n, r) => n + (r.kind === 'milk' ? r.ml : 0), 0),
    feeds: feeds.length,
    breastMinutes: records.reduce((n, r) => n + (r.kind === 'breast' ? r.left + r.right : 0), 0),
    pee: records.filter(r => ['pee', 'both'].includes(r.kind)).length,
    poop: records.filter(r => ['poop', 'both'].includes(r.kind)).length,
    averageGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
  };
}
export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
const average = values => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

// Pair before filtering by date or milk type so midnight and direct breastfeeding
// never silently disappear from the interval calculation.
export function milkEvents(records, now = new Date()) {
  const feeds = records.filter(r => ['milk', 'breast'].includes(r.kind) && new Date(r.at) <= now)
    .slice().sort((a, b) => new Date(a.at) - new Date(b.at));
  return feeds.flatMap((r, i) => {
    if (r.kind !== 'milk') return [];
    const next = feeds[i + 1] || null;
    const gap = next ? Math.round((new Date(next.at) - new Date(r.at)) / 60000) : null;
    const wakeTime = r.wakeAt ? +new Date(r.wakeAt) : NaN;
    const wakeValid = Number.isFinite(wakeTime) && wakeTime >= +new Date(r.at) && wakeTime <= +now && (!next || wakeTime <= +new Date(next.at));
    return [{ ...r, next, gap, wakeGap: wakeValid ? Math.round((wakeTime - new Date(r.at)) / 60000) : null }];
  });
}

export function analyzeMilk(records, endDay, range = 7, milkType = 'all', now = new Date()) {
  const startDay = shiftDay(endDay, 1 - range);
  const matches = r => milkType === 'all' || (r.milkType || 'formula') === milkType;
  const events = milkEvents(records, now).filter(matches);
  const selected = events.filter(r => dayKey(r.at) === endDay);
  const recent = events.filter(r => dayKey(r.at) >= startDay && dayKey(r.at) <= endDay);
  const cutoff = endDay === dayKey(now) ? now.getHours() * 60 + now.getMinutes() : 1440;
  const previousDays = Array.from({ length: range }, (_, i) => shiftDay(endDay, -i - 1));
  // A day with no matching milk record is unknown, not a zero-intake day.
  const baseline = previousDays.map(key => {
    const rows = events.filter(r => dayKey(r.at) === key);
    const comparable = rows.filter(r => { const d = new Date(r.at); return d.getHours() * 60 + d.getMinutes() <= cutoff; });
    return { key, rows, total: rows.length ? comparable.reduce((sum, r) => sum + r.ml, 0) : null };
  }).filter(d => d.total !== null);
  const days = Array.from({ length: range }, (_, i) => {
    const key = shiftDay(startDay, i);
    const rows = recent.filter(r => dayKey(r.at) === key);
    return { key, rows, total: rows.length ? rows.reduce((sum, r) => sum + r.ml, 0) : null,
      average: average(rows.map(r => r.ml)), gap: median(rows.map(r => r.gap)), gapCount: rows.filter(r => r.gap !== null).length };
  });
  const groups = [[1, 79], [80, 119], [120, 159], [160, 199], [200, 1000]].map(([low, high]) => {
    const rows = recent.filter(r => r.ml >= low && r.ml <= high);
    const gaps = rows.map(r => r.gap).filter(Number.isFinite);
    const wakes = rows.map(r => r.wakeGap).filter(Number.isFinite);
    return { label: high === 1000 ? '200 ml以上' : `${low}〜${high} ml`, count: gaps.length,
      gap: median(gaps), min: gaps.length ? Math.min(...gaps) : null, max: gaps.length ? Math.max(...gaps) : null,
      wake: median(wakes), wakeCount: wakes.length };
  });
  return { selected, recent, days, groups, baselineDays: baseline.length,
    total: selected.length ? selected.reduce((sum, r) => sum + r.ml, 0) : null,
    baselineTotal: average(baseline.map(d => d.total)),
    average: average(selected.map(r => r.ml)), baselineAverage: average(baseline.flatMap(d => d.rows.map(r => r.ml))),
    gap: median(selected.map(r => r.gap)), baselineGap: median(baseline.flatMap(d => d.rows.map(r => r.gap))) };
}
export function validateRecord(r, now = new Date()) {
  if (!r || !KINDS.includes(r.kind)) return '記録の種類を選んでください。';
  const time = +new Date(r.at);
  if (!Number.isFinite(time)) return '日時を入力してください。';
  if (time > +now + 60000) return '未来の日時は記録できません。';
  if (r.kind === 'milk' && (!Number.isInteger(r.ml) || r.ml < 1 || r.ml > 1000)) return '飲んだ量を1〜1,000 mlで入力してください。';
  if (r.kind === 'milk' && r.wakeAt && (!Number.isFinite(+new Date(r.wakeAt)) || new Date(r.wakeAt) < new Date(r.at) || new Date(r.wakeAt) > now)) return '起きた時刻は授乳日時以降、現在までの日時にしてください。';
  if (r.kind === 'breast' && (![r.left, r.right].every(n => Number.isInteger(n) && n >= 0 && n <= 180) || r.left + r.right === 0)) return '母乳の時間を左右それぞれ0〜180分、合計1分以上で入力してください。';
  if (typeof r.note !== 'string' || r.note.length > 200) return 'メモは200文字以内で入力してください。';
  return '';
}
export function defaultProfile() {
  return { name: '赤ちゃん', birthday: '' };
}
export function makeDemo(now = new Date()) {
  const records = [];
  const today = dayKey(now);
  for (let offset = -29; offset <= 0; offset++) {
    const key = shiftDay(today, offset);
    const add = (kind, hour, minute, extra = {}) => {
      const at = new Date(`${key}T${pad(hour)}:${pad(minute)}:00`);
      if (at > now) return;
      const wake = new Date(+at + (90 + (extra.ml || 0) / 2) * 60000);
      records.push({ id: `sample-${offset}-${kind}-${hour}-${minute}`, kind, at: at.toISOString(), ml: 0, left: 0, right: 0, milkType: 'formula', note: '', ...extra,
        ...(kind === 'milk' && hour % 2 === 0 && wake <= now ? { wakeAt: wake.toISOString() } : {}) });
    };
    [1, 5, 8, 11, 14, 18, 21].forEach((hour, i) => add('milk', hour, 15 + ((i + Math.abs(offset)) % 3) * 10, { ml: [100, 120, 100, 120, 140, 120, 100][i] + (offset % 3) * 10 }));
    [2, 6, 9, 12, 16, 19, 22].forEach(hour => add(hour === 9 || hour === 19 ? 'both' : 'pee', hour, 0));
  }
  return { records, profile: { name: 'こはる', birthday: shiftDay(today, -72) } };
}
