import { analyzeMilk, dayKey, milkEvents, shiftDay } from './model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = at => new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const date = key => `${+key.slice(5, 7)}/${+key.slice(8)}`;
const duration = value => value === null ? '—' : value < 60 ? `${value}分` : `${Math.floor(value / 60)}時間${value % 60 ? `${value % 60}分` : ''}`;
const amount = value => value === null ? '—' : `${value} ml`;
const change = (value, baseline, unit) => value === null || baseline === null ? '比較できる記録がありません' : `${value - baseline > 0 ? '+' : value - baseline < 0 ? '−' : '±'}${Math.abs(value - baseline)} ${unit}`;
const percentage = at => { const d = new Date(at); return (d.getHours() * 60 + d.getMinutes()) / 14.4; };
const typeLabel = r => r.milkType === 'expressed' ? '搾母乳' : 'ミルク';

function comparison(a, range, selectedDay) {
  const partial = selectedDay === dayKey();
  return `<section class="analysis-metrics" aria-label="いつもとの比較">
    <article><span>${partial ? '今日、ここまで' : '選択日の合計'}</span><strong>${amount(a.total)}</strong><p class="analysis-diff">${change(a.total, a.baselineTotal, 'ml')}</p><small>前${range}日平均 ${amount(a.baselineTotal)}${partial ? '（同時刻まで）' : ''}</small></article>
    <article><span>選択日の1回あたり</span><strong>${amount(a.average)}</strong><p class="analysis-diff">${change(a.average, a.baselineAverage, 'ml')}</p><small>前${range}日の1回平均 ${amount(a.baselineAverage)}</small></article>
    <article><span>次の授乳まで・選択日</span><strong>${duration(a.gap)}</strong><p class="analysis-diff">${change(a.gap, a.baselineGap, '分')}</p><small>前${range}日の中央値 ${duration(a.baselineGap)}</small></article>
  </section><p class="analysis-caption">比較対象は選択日の前${range}日間のうち、対象のミルク記録がある${a.baselineDays}日。記録のない日は平均から除外しています。記録漏れがあると比較にも影響します。</p>`;
}

function axis() { return '<div class="rhythm-axis"><span>0時</span><span>6時</span><span>12時</span><span>18時</span><span>24時</span></div>'; }
function track(rows, selectedDay) {
  return `<div class="rhythm-track" aria-label="${selectedDay}の授乳時刻">${rows.map(r => {
    const nextEnd = r.next ? dayKey(r.next.at) === selectedDay ? percentage(r.next.at) : 100 : null;
    return `${nextEnd !== null ? `<span class="rhythm-gap" style="left:${percentage(r.at)}%;width:${Math.max(0, nextEnd - percentage(r.at))}%" aria-hidden="true"></span>` : ''}<button class="rhythm-dot ${r.milkType === 'expressed' ? 'expressed' : ''}" data-edit="${esc(r.id)}" style="left:${percentage(r.at)}%;--dot-size:${Math.min(22, 9 + r.ml / 18)}px" title="${time(r.at)} ${typeLabel(r)} ${r.ml} ml・次の授乳まで ${duration(r.gap)}" aria-label="${selectedDay} ${time(r.at)} ${typeLabel(r)} ${r.ml} mlの記録を編集"></button>`;
  }).join('')}</div>`;
}

export function dayRhythm(records, selectedDay, milkType = 'all', compact = false) {
  const rows = milkEvents(records).filter(r => dayKey(r.at) === selectedDay && (milkType === 'all' || (r.milkType || 'formula') === milkType));
  return `<article class="card day-rhythm"><div class="card-heading"><h2>24時間のミルクリズム</h2>${compact ? '<button class="text-button" data-view="trends">分析を見る →</button>' : `<span class="muted">${date(selectedDay)} · ${rows.length}回</span>`}</div>
    <div class="rhythm-scroll"><div class="single-rhythm">${axis()}${track(rows, selectedDay)}</div></div>
    <p class="analysis-caption">丸の位置は授乳時刻、大きさは飲んだ量。線は次の授乳までの間隔です。丸をタップすると編集できます。</p>
    ${rows.length ? `<div class="feed-intervals">${rows.map(r => `<button class="feed-interval" data-edit="${esc(r.id)}"><span><time>${time(r.at)}</time><small>${typeLabel(r)}</small></span><strong>${r.ml}<small> ml</small></strong><span class="interval-result">${r.next ? `${duration(r.gap)}後<small>→ ${dayKey(r.next.at) !== selectedDay ? date(dayKey(r.next.at)) + ' ' : ''}${time(r.next.at)} ${r.next.kind === 'breast' ? '直母' : typeLabel(r.next)}</small>` : '次の授乳は未記録'}${r.wakeGap !== null ? `<small class="wake-result">起床まで ${duration(r.wakeGap)}</small>` : ''}</span></button>`).join('')}</div>` : '<p class="analysis-empty">この日の対象のミルク記録はありません。</p>'}
    <p class="analysis-caption">授乳の開始時刻から次の授乳（直母を含む）の開始時刻までを表示。日付をまたぐ間隔も含みます。</p>
  </article>`;
}

export function renderAnalysis(records, selectedDay, range, milkType) {
  const a = analyzeMilk(records, selectedDay, range, milkType);
  const max = Math.max(1, ...a.days.map(d => d.total || 0));
  const gapMax = Math.max(1, ...a.groups.map(g => g.max || 0));
  const start = shiftDay(selectedDay, 1 - range);
  return `<div class="analysis-controls"><div class="range-buttons" aria-label="分析期間">${[7, 14, 30].map(n => `<button data-range="${n}" aria-pressed="${range === n}" class="${range === n ? 'selected' : ''}">${n}日間</button>`).join('')}</div><label>対象 <select id="analysis-milk-type"><option value="all" ${milkType === 'all' ? 'selected' : ''}>ミルク・搾母乳</option><option value="formula" ${milkType === 'formula' ? 'selected' : ''}>ミルクのみ</option><option value="expressed" ${milkType === 'expressed' ? 'selected' : ''}>搾母乳のみ</option></select></label></div>
    ${comparison(a, range, selectedDay)}
    ${dayRhythm(records, selectedDay, milkType)}
    <article class="card analysis-card"><div class="card-heading"><div><h2>飲んだ量と、次の授乳・起床まで</h2><p>${date(start)}〜${date(selectedDay)}の記録</p></div></div>
    <p class="analysis-caption">量ごとに実際の間隔をまとめました。代表値は中央値です。次の授乳が未記録のものは間隔の集計から除外します。</p>
    <div class="amount-groups">${a.groups.map(g => `<div class="amount-group"><div class="amount-group-heading"><strong>${g.label}</strong><span>${g.count}件${g.count > 0 && g.count < 3 ? ' · 少ない記録' : ''}</span></div><div class="gap-bar-track"><span style="width:${g.gap === null ? 0 : g.gap / gapMax * 100}%"></span></div><div class="amount-group-stats"><span>次の授乳 <strong>${duration(g.gap)}</strong><small>${g.count ? `最短 ${duration(g.min)}〜最長 ${duration(g.max)}` : '間隔の記録なし'}</small></span><span>起床まで <strong>${duration(g.wake)}</strong><small>${g.wakeCount}件の起床記録</small></span></div></div>`).join('')}</div>
    <p class="analysis-caption">起床は各授乳の編集画面で「授乳後に起きた時刻」を任意で追加できます。次の授乳を超えた起床は集計対象外です。授乳からの経過時間で、睡眠時間・消化時間を示すものではありません。</p></article>
    <article class="card analysis-card"><div class="card-heading"><div><h2>${range}日間の量とリズム</h2><p>${date(start)}〜${date(selectedDay)} · 日付をタップしてその日を表示</p></div></div><p class="analysis-caption analysis-scroll-hint">表を横にスクロールすると、各日の24時間のリズムを確認できます →</p><div class="table-scroll"><table class="daily-analysis"><thead><tr><th>日付</th><th>記録量 / ml</th><th>回数・1回平均</th><th>次の授乳まで<br>中央値</th><th class="rhythm-cell">${axis()}</th></tr></thead><tbody>${a.days.map(d => `<tr class="${d.key === selectedDay ? 'selected-day' : ''}"><th><button class="text-button" data-analysis-day="${d.key}">${date(d.key)}${d.key === dayKey() ? '<small> 途中</small>' : ''}</button></th><td><div class="daily-total"><span class="daily-total-bar" style="width:${(d.total || 0) / max * 100}%"></span><strong>${d.total === null ? '記録なし' : d.total}</strong></div></td><td>${d.rows.length ? `${d.rows.length}回 / ${d.average} ml` : '—'}</td><td>${duration(d.gap)}<small>${d.gapCount}件</small></td><td class="rhythm-cell">${track(d.rows, d.key)}</td></tr>`).join('')}</tbody></table></div><p class="analysis-caption">対象のミルク記録がない日は「記録なし」と表示します。当日は途中の合計です。搾母乳は青い丸で表示します。</p></article>
    <details class="card analysis-method"><summary>集計の見方</summary><p>合計は選択日の前${range}日平均と比較します。当日を選んだときは、過去の日も現在と同じ時刻までの合計を使います。1回の平均量と間隔は、それぞれの期間にある記録を集計します。</p><p>間隔は対象のミルクから次の授乳（種類を問わず、直母も含む）までです。0分の記録も含みます。中央値は間隔を短い順に並べた中央の値です。日別の間隔は授乳を始めた日にまとめます。</p><p>飲んだ量と間隔・起床の関係を振り返るための画面です。消化や空腹になった時刻は記録から推定していません。</p></details>`;
}
