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
export function goalStatus(ml, low, high, isToday) {
  if (!(low > 0 && high >= low)) return { label: '目安は未設定', tone: 'neutral' };
  if (ml < low) return { label: isToday ? '1日の目安まで記録中' : '設定した目安より少なめ', tone: 'neutral' };
  if (ml > high) return { label: '設定した目安より多め', tone: 'warm' };
  return { label: '設定した目安の範囲内', tone: 'green' };
}
export function validateRecord(r, now = new Date()) {
  if (!r || !KINDS.includes(r.kind)) return '記録の種類を選んでください。';
  const time = +new Date(r.at);
  if (!Number.isFinite(time)) return '日時を入力してください。';
  if (time > +now + 60000) return '未来の日時は記録できません。';
  if (r.kind === 'milk' && (!Number.isInteger(r.ml) || r.ml < 1 || r.ml > 1000)) return '飲んだ量を1〜1,000 mlで入力してください。';
  if (r.kind === 'breast' && (![r.left, r.right].every(n => Number.isInteger(n) && n >= 0 && n <= 180) || r.left + r.right === 0)) return '母乳の時間を左右それぞれ0〜180分、合計1分以上で入力してください。';
  if (typeof r.note !== 'string' || r.note.length > 200) return 'メモは200文字以内で入力してください。';
  return '';
}
export function defaultProfile() {
  return { name: '赤ちゃん', birthday: '', goalLow: null, goalHigh: null };
}
export function makeDemo(now = new Date()) {
  const records = [];
  const today = dayKey(now);
  for (let offset = -6; offset <= 0; offset++) {
    const key = shiftDay(today, offset);
    const add = (kind, hour, minute, extra = {}) => {
      const at = new Date(`${key}T${pad(hour)}:${pad(minute)}:00`);
      if (at > now) return;
      records.push({ id: `sample-${offset}-${kind}-${hour}-${minute}`, kind, at: at.toISOString(), ml: 0, left: 0, right: 0, milkType: 'formula', note: '', ...extra });
    };
    [1, 5, 8, 11, 14, 18, 21].forEach((hour, i) => add('milk', hour, 15, { ml: [100, 120, 100, 120, 140, 120, 100][i] + (offset % 3) * 10 }));
    [2, 6, 9, 12, 16, 19, 22].forEach(hour => add(hour === 9 || hour === 19 ? 'both' : 'pee', hour, 0));
  }
  return { records, profile: { name: 'こはる', birthday: shiftDay(today, -72), goalLow: 700, goalHigh: 900 } };
}
