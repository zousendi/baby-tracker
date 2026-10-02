import { renderAnalysis, dayRhythm } from './analysis.js';
import { dayKey, shiftDay, localInput, recordsForDay, summarize, validateRecord, defaultProfile, makeDemo } from './model.js';

const paths = {
  leaf: '<path d="M12 21V10m0 5C4 16 2 9 3 5c6 0 10 4 9 10Zm0-4C12 5 16 2 22 2c0 6-3 10-10 9Z"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  chart: '<path d="M4 20h17M7 15v-4m5 4V5m5 10V8"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3-1 3-3 1-2 4 2 3v4l4 3 3-1 3 1 4-3v-4l2-3-2-4-3-1-1-3Z"/>',
  milk: '<path d="M10 3h4v3h-4zM8 6h8v4l2 3v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7l2-3Zm0 5h8m-2 4h4m-4 3h4"/>',
  breast: '<path d="M5 4c0 8-3 7-3 12a5 5 0 0 0 10 0 5 5 0 0 0 10 0c0-5-3-4-3-12M7 16h.01M17 16h.01"/>',
  pee: '<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13ZM8 15c0 2 1 3 3 3"/>',
  poop: '<path d="M9 7c3 0 6-3 4-5 5 2 5 5 3 7 4 0 5 3 3 5 4 1 4 7 0 7H5c-4 0-4-6 0-7-2-3 0-6 4-7Z"/><path d="M9 16h.01M15 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.heart}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'komorebi-v1';
let storageError = '';
let state = { mode: 'demo', demo: makeDemo(), real: { records: [], profile: defaultProfile() } };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) {
    if (!['demo', 'real'].includes(saved.mode) || !['demo', 'real'].every(k => saved[k]?.profile && Array.isArray(saved[k]?.records) && saved[k].records.every(r => !validateRecord(r) && typeof r.id === 'string'))) throw new Error('invalid');
    state = saved;
  }
} catch { storageError = '保存済みの記録を読み込めませんでした。デモを表示しています。元の保存内容は変更していません。'; }
let view = 'today';
let selectedDay = dayKey();
let filter = 'all';
let analysisRange = 7;
let analysisMilkType = 'all';
let draft = null;
let recordReturnView = 'today';
let deletedRecord = null;
let toastTimer;
const data = () => state[state.mode];
const isDemo = () => state.mode === 'demo';
const time = at => new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
function duration(minutes) {
  if (minutes === null) return '—';
  return minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分`;
}
function elapsed(at) {
  const mins = Math.max(0, Math.floor((Date.now() - +new Date(at)) / 60000));
  return mins < 1 ? 'たった今' : `${duration(mins)}前`;
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageError = ''; return true; }
  catch { storageError = '端末に保存できません。記録はこの画面内だけに残っています。設定から書き出してください。'; return false; }
}
function toast(message, undo = false) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').innerHTML = `${icon('check')}<span>${esc(message)}</span>${undo ? '<button data-action="undo">元に戻す</button>' : ''}`;
  document.querySelector('#toast').classList.add('visible');
  toastTimer = setTimeout(() => document.querySelector('#toast').classList.remove('visible'), undo ? 10000 : 3500);
}
function nav() {
  return [['today', 'home', '今日の記録'], ['trends', 'chart', 'ミルク分析'], ['guide', 'heart', '見守りガイド']].map(([key, symbol, label]) => `<button data-view="${key}" class="nav-item ${view === key ? 'active' : ''}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('');
}
function age() {
  const birthday = data().profile.birthday;
  if (!birthday) return '毎日の小さな成長を、いっしょに。';
  const days = Math.floor((new Date(`${dayKey()}T12:00:00`) - new Date(`${birthday}T12:00:00`)) / 86400000);
  return `生後 ${Math.max(0, days)} 日${isDemo() ? ' · サンプルの赤ちゃん' : ''}`;
}
function render() {
  const name = esc(data().profile.name || '赤ちゃん');
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a href="#" class="brand" data-view="today"><span class="brand-mark">${icon('leaf')}</span><span>こもれび<small>BABY JOURNAL</small></span></a>
      <div class="workspace-label">わが家の育児ノート</div>
      <nav aria-label="メインメニュー">${nav()}</nav>
      <div class="sidebar-bottom"><div class="little-note">${icon('leaf')}<p>小さな記録が、<br>大きな安心につながる。</p></div><button class="nav-item" data-action="settings">${icon('settings')}設定・データ</button><span class="version">こもれび · demo v0.1</span></div>
    </aside>
    <div class="page-shell">
      <header class="topbar"><div class="breadcrumb">わが家の育児ノート <span>/</span> ${view === 'today' ? '今日の記録' : view === 'trends' ? 'ミルク分析' : '見守りガイド'}</div><div class="topbar-right"><span class="local-badge"><i></i>この端末に保存</span><button class="avatar" data-action="settings" aria-label="赤ちゃんの設定">${name.slice(0, 1)}</button></div></header>
      <main>
        ${storageError ? `<div class="storage-error" role="alert">${esc(storageError)}</div>` : ''}
        <div class="demo-banner"><span>${icon(isDemo() ? 'sun' : 'check')} ${isDemo() ? '<strong>デモモード</strong><span>サンプルの記録でお試しできます</span>' : '<strong>わが家の記録</strong><span>記録はこのブラウザに保存されます</span>'}</span><button data-action="switch-mode">${isDemo() ? '自分の記録をはじめる' : 'デモを見る'} ${icon('arrow')}</button></div>
        <section class="page-heading"><div><p class="eyebrow">${view === 'today' ? 'EVERY LITTLE MOMENT' : view === 'trends' ? 'GROWING DAY BY DAY' : 'A LITTLE PEACE OF MIND'}</p><h1>${view === 'today' ? `${name}の、今日。` : view === 'trends' ? '量とリズムを、ふりかえる。' : '数字と、赤ちゃんの様子。'}</h1><p class="heading-sub">${view === 'today' ? age() : view === 'trends' ? 'いつもと比べて、どれくらい飲んで、どれくらい空いた？' : '記録を手がかりに、いっしょに見守りましょう。'}</p></div>${view !== 'guide' ? `<div class="date-control"><button data-action="prev-day" aria-label="前の日">${icon('arrow', 'rotate')}</button><label><span class="sr-only">表示する日</span><input id="selected-date" type="date" value="${selectedDay}" max="${dayKey()}" /></label><button data-action="next-day" aria-label="次の日" ${selectedDay >= dayKey() ? 'disabled' : ''}>${icon('arrow')}</button></div>` : ''}</section>
        ${view === 'today' ? dashboard() : view === 'trends' ? trends() : guide()}
        <footer class="page-footer">${icon('leaf')} きょうも、育児おつかれさま。<span>端末内保存 · 家族との同期は未対応</span></footer>
      </main>
    </div><nav class="mobile-nav" aria-label="モバイルメニュー">${nav()}<button class="nav-item" data-action="settings">${icon('settings')}<span>設定</span></button></nav>`;
}
function dashboard() {
  const records = recordsForDay(data().records, selectedDay);
  const s = summarize(records);
  const now = new Date();
  const today = selectedDay === dayKey();
  const yesterday = summarize(recordsForDay(data().records, shiftDay(selectedDay, -1), today ? now.getHours() * 60 + now.getMinutes() : 1440));
  const diff = s.ml - yesterday.ml;
  const lastFeed = data().records.filter(r => ['milk', 'breast'].includes(r.kind)).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
  return `<section class="quick-record" aria-labelledby="quick-title"><div><h2 id="quick-title">さっと記録</h2><p>今日の「できた」を、ひとつずつ。</p></div><div class="quick-buttons"><button class="quick milk" data-record="milk">${icon('milk')}<span>授乳・ミルク</span>${icon('plus')}</button><button class="quick pee" data-record="pee">${icon('pee')}<span>おしっこ</span>${icon('plus')}</button><button class="quick poop" data-record="poop">${icon('poop')}<span>うんち</span>${icon('plus')}</button></div></section>
    <div class="section-label"><h2>${today ? '今日' : 'この日'}のまとめ</h2><span>${today ? '0:00〜現在' : '0:00〜23:59'} の記録</span></div>
    <section class="summary-grid" aria-label="1日の合計">
      <article class="stat-card milk-stat"><div class="stat-top"><span class="icon-tile milk">${icon('milk')}</span><span>ミルク・搾母乳</span><span class="stat-label">TOTAL</span></div><div class="stat-value" id="milk-total">${s.ml.toLocaleString()}<small>ml</small></div><p>${yesterday.feeds ? `<span class="comparison">${diff >= 0 ? '+' : '−'}${Math.abs(diff)} ml</span> ${today ? '前日の同時刻までと比較' : '前日と比較'}` : '前日の比較データはありません'}</p></article>
      <article class="stat-card"><div class="stat-top"><span class="icon-tile pink">${icon('clock')}</span><span>授乳</span></div><div class="stat-value">${s.feeds}<small>回</small></div><p>直母 ${s.breastMinutes} 分 <span class="dot-sep">·</span> 平均間隔 ${duration(s.averageGap)}</p></article>
      <article class="stat-card"><div class="stat-top"><span class="icon-tile pee">${icon('pee')}</span><span>おしっこ</span></div><div class="stat-value">${s.pee}<small>回</small></div><p>${records.find(r => ['pee', 'both'].includes(r.kind)) ? `最後の記録 ${time(records.find(r => ['pee', 'both'].includes(r.kind)).at)}` : 'まだ記録がありません'}</p></article>
      <article class="stat-card"><div class="stat-top"><span class="icon-tile poop">${icon('poop')}</span><span>うんち</span></div><div class="stat-value">${s.poop}<small>回</small></div><p>${records.find(r => ['poop', 'both'].includes(r.kind)) ? `最後の記録 ${time(records.find(r => ['poop', 'both'].includes(r.kind)).at)}` : 'まだ記録がありません'}</p></article>
    </section>
    <div class="dashboard-columns"><div class="main-column">${dayRhythm(data().records, selectedDay, 'all', true)}${timeline(records)}</div><aside class="side-column"><article class="last-feed card"><div class="small-title">${icon('clock')} 最後の授乳から</div><div class="elapsed">${lastFeed ? elapsed(lastFeed.at).replace(/前$/, '') : 'まだ記録なし'}</div><p>${lastFeed ? `${dayKey(lastFeed.at) === dayKey() ? '' : `${dayKey(lastFeed.at)} `}${time(lastFeed.at)} · ${lastFeed.kind === 'milk' ? `${lastFeed.ml} ml` : `直母 ${lastFeed.left + lastFeed.right}分`}` : '授乳を記録してみましょう'}</p><div class="soft-divider"></div><span class="mini-note">赤ちゃんの欲しがるサインも<br>いっしょに見てあげましょう。</span></article>${chart()}<article class="tip-card">${icon('heart')}<h3>数字の先に、赤ちゃんの様子。</h3><p>飲む量には個人差があります。<br>体重の増え方やおむつの様子も、<br>大切な手がかりです。</p><button class="text-button" data-view="guide">見守りのヒント ${icon('arrow')}</button></article></aside></div>`;
}
const kindLabel = r => ({ milk: r.milkType === 'expressed' ? '搾母乳' : 'ミルク', breast: '母乳（直母）', pee: 'おしっこ', poop: 'うんち', both: 'おしっこ ＋ うんち' }[r.kind]);
function timeline(records) {
  const visible = records.filter(r => filter === 'all' || (filter === 'feed' ? ['milk', 'breast'].includes(r.kind) : filter === 'pee' ? ['pee', 'both'].includes(r.kind) : ['poop', 'both'].includes(r.kind)));
  return `<article class="card timeline"><div class="card-heading"><h2>記録のタイムライン</h2><span class="muted">${records.length} 件の記録</span></div><div class="filter-row" aria-label="記録の絞り込み">${[['all', 'すべて'], ['feed', '授乳'], ['pee', 'おしっこ'], ['poop', 'うんち']].map(([key, label]) => `<button data-filter="${key}" class="filter ${filter === key ? 'selected' : ''}" aria-pressed="${filter === key}">${label}</button>`).join('')}</div><div class="records-list">${visible.length ? visible.map(r => `<button class="record-row" data-edit="${esc(r.id)}" aria-label="${time(r.at)} ${kindLabel(r)}の記録を編集"><time>${time(r.at)}</time><span class="timeline-node ${r.kind === 'both' ? 'pee' : r.kind}">${icon(r.kind === 'both' ? 'pee' : r.kind)}</span><span class="record-info"><strong>${kindLabel(r)}</strong><small>${esc(r.note || (r.kind === 'milk' ? '飲んだ量' : r.kind === 'breast' ? `左 ${r.left}分 · 右 ${r.right}分` : 'おむつを交換'))}</small></span><span class="record-amount">${r.kind === 'milk' ? `${r.ml}<small>ml</small>` : r.kind === 'breast' ? `${r.left + r.right}<small>分</small>` : '<small>1 回</small>'}</span>${icon('arrow')}</button>`).join('') : `<div class="empty-state">${icon('leaf')}<h3>まだ記録がありません</h3><p>上の「さっと記録」から追加できます。</p></div>`}</div><p class="timeline-hint">記録をタップすると、編集・削除できます</p></article>`;
}
function chart(large = false) {
  const days = Array.from({ length: 7 }, (_, i) => { const key = shiftDay(selectedDay, i - 6); return { key, ...summarize(recordsForDay(data().records, key)) }; });
  const max = Math.max(200, ...days.map(d => d.ml));
  return `<article class="card chart-card ${large ? 'large-chart' : ''}"><div class="card-heading"><h2>7日間のミルク量</h2><span class="muted">ml</span></div><div class="chart-legend"><i></i>ミルク・搾母乳 <span>直母は含みません</span></div><div class="bar-chart">${days.map(d => `<button class="chart-day ${d.key === selectedDay ? 'current' : ''}" data-day="${d.key}" aria-label="${d.key} ミルク${d.ml}mlの記録を表示"><span class="bar-value">${d.ml}</span><span class="bar-track"><span class="bar-fill" style="height:${d.ml ? Math.max(3, d.ml / max * 100) : 0}%"></span></span><span class="bar-label">${d.key === dayKey() ? '今日' : `${+d.key.slice(5, 7)}/${+d.key.slice(8)}`}</span></button>`).join('')}</div><div class="chart-foot">${selectedDay === dayKey() ? '今日の量は、現在までの合計です。' : '各日の記録量を表示しています。'}${!large ? '<button class="text-button" data-view="trends">詳しく見る →</button>' : ''}</div></article>`;
}
function trends() {
  return renderAnalysis(data().records, selectedDay, analysisRange, analysisMilkType);
}
function guide() {
  return `<div class="guide-intro card"><span class="guide-heart">${icon('heart')}</span><div><h2>「足りている？」は、いくつかの手がかりで。</h2><p>必要な量は月齢や体重、授乳方法によって変わります。このアプリは記録と比較をお手伝いします。適量の判断は、小児科医や助産師に相談しましょう。</p></div></div><div class="guide-grid"><article class="card guide-card"><span class="icon-tile milk">${icon('milk')}</span><h2>飲んだ量と、欲しがるサイン</h2><p>飲む量には個人差があります。飲み切ることを目標にせず、赤ちゃんの欲しがる・休みたいサインも見てあげましょう。</p><p>直母の授乳時間から、飲んだmlは計算できません。分数は別に記録します。</p></article><article class="card guide-card"><span class="icon-tile pee">${icon('pee')}</span><h2>おむつと、体重の増え方</h2><p>おしっこ・うんちの記録や、体重の増え方も大切な手がかりです。回数は月齢や授乳方法で変わります。</p><p>いつもとの違いや気になる様子を、記録のメモに残しておくと相談に役立ちます。</p></article><article class="card guide-card"><span class="icon-tile pink">${icon('heart')}</span><h2>気になるときは、早めに相談</h2><p>飲みが悪い、おしっこがいつもより少ない、体重の増え方が気になるときは、小児科医や助産師に相談してください。</p><p>気になる様子は、授乳の記録といっしょにメモしておけます。</p></article><article class="card guide-card"><span class="icon-tile poop">${icon('chart')}</span><h2>いつもの量と間隔を知る</h2><p>ミルク分析で、日ごとの量や授乳の間隔をふりかえれます。記録が少ないときは、件数もいっしょに確認しましょう。</p><p>授乳の間隔は消化時間ではありません。起床時刻は、授乳記録の編集から任意で追加できます。</p><button class="text-button" data-view="trends">ミルク分析を見る →</button></article></div><div class="sources"><h3>参考情報</h3><a href="https://www.nhs.uk/baby/breastfeeding-and-bottle-feeding/breastfeeding-problems/enough-milk/" target="_blank" rel="noreferrer">NHS：赤ちゃんが十分に母乳を飲めているサイン ↗</a><a href="https://www.nhs.uk/best-start-in-life/baby/feeding-your-baby/bottle-feeding/bottle-feeding-your-baby/" target="_blank" rel="noreferrer">NHS：哺乳瓶での授乳と赤ちゃんのサイン ↗</a></div>`;
}
function readDraft() {
  const form = document.querySelector('#record-form');
  if (!form || !draft) return;
  for (const key of ['at', 'ml', 'left', 'right', 'note', 'milkType', 'wakeAt']) if (form.elements[key]) draft[key] = form.elements[key].value;
}
function openRecord(kind, id) {
  recordReturnView = view;
  const existing = id && data().records.find(r => r.id === id);
  draft = existing ? { ...existing, at: localInput(existing.at), wakeAt: existing.wakeAt ? localInput(existing.wakeAt) : '' } : { kind, at: selectedDay === dayKey() ? localInput() : `${selectedDay}T12:00`, ml: 120, left: 0, right: 0, milkType: 'formula', note: '' };
  renderRecord();
  document.querySelector('#record-dialog').showModal();
}
function renderRecord() {
  const isFeed = ['milk', 'breast'].includes(draft.kind);
  document.querySelector('#record-dialog').innerHTML = `<form id="record-form"><div class="dialog-head"><div><p class="eyebrow">${draft.id ? 'EDIT MOMENT' : 'A LITTLE MOMENT'}</p><h2 id="record-title">${draft.id ? '記録を編集' : 'きょうの記録を追加'}</h2></div><button type="button" class="icon-button" data-action="close-record" aria-label="閉じる">${icon('close')}</button></div><div class="dialog-body"><div class="record-tabs">${[['milk', 'milk', '授乳'], ['pee', 'pee', 'おしっこ'], ['poop', 'poop', 'うんち']].map(([key, symbol, label]) => `<button type="button" data-kind="${key}" class="${(key === 'milk' ? isFeed : draft.kind === key || key === 'pee' && draft.kind === 'both') ? 'selected' : ''}">${icon(symbol)}${label}</button>`).join('')}</div>${isFeed ? `<div class="segmented"><button type="button" data-kind="milk" class="${draft.kind === 'milk' ? 'selected' : ''}">ミルク・搾母乳</button><button type="button" data-kind="breast" class="${draft.kind === 'breast' ? 'selected' : ''}">母乳（直母）</button></div>` : `<label class="checkbox-label"><input type="checkbox" id="both-check" ${draft.kind === 'both' ? 'checked' : ''}> おしっこ・うんち両方を記録</label>`}<div class="field"><div class="field-label"><label for="record-at">日時</label><button type="button" class="text-button" data-action="now">今の時刻にする</button></div><input id="record-at" name="at" type="datetime-local" value="${esc(draft.at)}" max="${localInput()}" required /></div>${draft.kind === 'milk' ? `<div class="field"><label for="milk-type">授乳の種類</label><select id="milk-type" name="milkType"><option value="formula" ${draft.milkType === 'formula' ? 'selected' : ''}>ミルク</option><option value="expressed" ${draft.milkType === 'expressed' ? 'selected' : ''}>搾母乳</option></select></div><div class="field amount-field"><label for="record-ml">実際に飲んだ量</label><div class="amount-stepper"><button type="button" data-step="-10" aria-label="10ml減らす">−</button><div><input id="record-ml" name="ml" type="number" inputmode="numeric" min="1" max="1000" step="1" value="${esc(draft.ml)}" required /><span>ml</span></div><button type="button" data-step="10" aria-label="10ml増やす">＋</button></div><div class="presets">${[60, 80, 100, 120, 140, 160].map(n => `<button type="button" data-ml="${n}" class="${+draft.ml === n ? 'selected' : ''}">${n}</button>`).join('')}</div><p class="field-hint">よく使う量をタップ、または10 mlずつ調整</p></div>` : draft.kind === 'breast' ? `<div class="breast-fields"><div class="field"><label for="left-minutes">左（分）</label><input id="left-minutes" name="left" type="number" inputmode="numeric" min="0" max="180" value="${esc(draft.left)}" required /></div><div class="field"><label for="right-minutes">右（分）</label><input id="right-minutes" name="right" type="number" inputmode="numeric" min="0" max="180" value="${esc(draft.right)}" required /></div></div><p class="field-hint">直母の時間は、ミルクのmlと分けて集計します。</p>` : `<div class="diaper-message">${icon(draft.kind === 'poop' ? 'poop' : 'pee')}<span>おむつ交換を1回として記録します。</span></div>`}${draft.kind === 'milk' ? `<div class="field"><label for="record-wake">授乳後に起きた時刻 <span class="optional">任意</span></label><input id="record-wake" name="wakeAt" type="datetime-local" value="${esc(draft.wakeAt || '')}" min="${esc(draft.at)}" max="${localInput()}" /><p class="field-hint">授乳後に眠った場合、次の授乳までに起きた時刻を追加できます。あとから編集して記録できます。</p></div>` : ''}<div class="field"><label for="record-note">メモ <span class="optional">任意</span></label><textarea id="record-note" name="note" rows="2" maxlength="200" placeholder="飲み具合や、おむつの様子など">${esc(draft.note)}</textarea></div><p id="record-error" class="form-error" role="alert"></p></div><div class="dialog-footer">${draft.id ? '<button type="button" class="delete-button" data-action="delete-record">削除</button>' : ''}<button type="submit" class="primary-button">${icon('check')}${draft.id ? '変更を保存' : '記録を保存'}</button></div></form>`;
}
function openSettings() {
  const p = data().profile;
  document.querySelector('#settings-dialog').innerHTML = `<form id="settings-form"><div class="dialog-head"><div><p class="eyebrow">OUR LITTLE JOURNAL</p><h2 id="settings-title">設定・データ</h2></div><button type="button" class="icon-button" data-action="close-settings" aria-label="閉じる">${icon('close')}</button></div><div class="dialog-body"><p class="settings-intro">${isDemo() ? 'デモ用のプロフィールを編集中です。' : 'わが家のプロフィールを設定します。'}</p><div class="field"><label for="baby-name">赤ちゃんの名前</label><input id="baby-name" name="name" maxlength="20" required value="${esc(p.name)}" /></div><div class="field"><label for="birthday">誕生日 <span class="optional">任意</span></label><input id="birthday" name="birthday" type="date" value="${esc(p.birthday)}" max="${dayKey()}" /></div><p id="settings-error" class="form-error" role="alert"></p><div class="settings-section"><h3>記録の保存について</h3><p>このブラウザに保存します。端末間・家族間の同期はありません。ブラウザのデータを削除すると記録も消えるため、必要に応じて書き出してください。</p><button type="button" class="secondary-button" data-action="export">${icon('download')} ${isDemo() ? 'デモの' : ''}記録を書き出す（JSON）</button></div>${isDemo() ? '<button type="button" class="text-button reset-demo" data-action="reset-demo">サンプルデータを今日の日付で作り直す</button>' : ''}</div><div class="dialog-footer"><button type="submit" class="primary-button">設定を保存</button></div></form>`;
  document.querySelector('#settings-dialog').showModal();
}
function exportData() {
  const blob = new Blob([JSON.stringify({ version: 1, mode: state.mode, exportedAt: new Date().toISOString(), ...data() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `komorebi-${state.mode}-${dayKey()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('記録を書き出しました');
}
document.addEventListener('click', e => {
  const b = e.target.closest('button, a[data-view]');
  if (!b) return;
  if (b.dataset.view) { e.preventDefault(); view = b.dataset.view; render(); window.scrollTo(0, 0); }
  else if (b.dataset.range) { analysisRange = +b.dataset.range; render(); }
  else if (b.dataset.analysisDay) { selectedDay = b.dataset.analysisDay; render(); window.scrollTo(0, 0); }
  else if (b.dataset.record) openRecord(b.dataset.record);
  else if (b.dataset.edit) openRecord(null, b.dataset.edit);
  else if (b.dataset.filter) { filter = b.dataset.filter; render(); }
  else if (b.dataset.day) { selectedDay = b.dataset.day; view = 'today'; render(); window.scrollTo(0, 0); }
  else if (b.dataset.kind) { readDraft(); draft.kind = b.dataset.kind; renderRecord(); }
  else if (b.dataset.ml || b.dataset.step) {
    const input = document.querySelector('#record-ml');
    input.value = b.dataset.ml || Math.max(1, Math.min(1000, (+input.value || 0) + +b.dataset.step));
    document.querySelectorAll('[data-ml]').forEach(el => el.classList.toggle('selected', +el.dataset.ml === +input.value));
  } else {
    switch (b.dataset.action) {
      case 'settings': openSettings(); break;
      case 'close-record': document.querySelector('#record-dialog').close(); break;
      case 'close-settings': document.querySelector('#settings-dialog').close(); break;
      case 'now': document.querySelector('#record-at').value = localInput(); break;
      case 'prev-day': selectedDay = shiftDay(selectedDay, -1); render(); break;
      case 'next-day': if (selectedDay < dayKey()) { selectedDay = shiftDay(selectedDay, 1); render(); } break;
      case 'switch-mode': state.mode = isDemo() ? 'real' : 'demo'; selectedDay = dayKey(); filter = 'all'; deletedRecord = null; persist(); render(); toast(isDemo() ? 'デモモードに切り替えました' : 'わが家の記録をはじめましょう'); break;
      case 'delete-record': {
        deletedRecord = { mode: state.mode, record: data().records.find(r => r.id === draft.id) };
        data().records = data().records.filter(r => r.id !== draft.id);
        const saved = persist(); document.querySelector('#record-dialog').close(); render(); toast(saved ? '記録を削除しました' : '保存できませんでした。画面の案内を確認してください', true); break;
      }
      case 'undo': if (deletedRecord) { state[deletedRecord.mode].records.push(deletedRecord.record); deletedRecord = null; const saved = persist(); render(); toast(saved ? '記録を元に戻しました' : '端末への保存に失敗しました'); } break;
      case 'export': exportData(); break;
      case 'reset-demo': if (confirm('デモの編集内容をリセットして、今日の日付のサンプルを作り直します。自分の記録には影響しません。')) { state.demo = makeDemo(); persist(); document.querySelector('#settings-dialog').close(); render(); toast('サンプルデータを更新しました'); } break;
    }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'record-at') {
    const wake = document.querySelector('#record-wake');
    if (wake) wake.min = e.target.value;
  }
  if (e.target.id === 'selected-date' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= dayKey()) { selectedDay = e.target.value; render(); }
  if (e.target.id === 'analysis-milk-type') { analysisMilkType = e.target.value; render(); }
  if (e.target.id === 'both-check') { readDraft(); draft.kind = e.target.checked ? 'both' : 'pee'; renderRecord(); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'record-form') {
    e.preventDefault(); readDraft();
    const record = { ...draft, id: draft.id || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`), ml: +draft.ml, left: +draft.left, right: +draft.right, note: draft.note.trim() };
    const error = validateRecord(record);
    if (error) { document.querySelector('#record-error').textContent = error; return; }
    record.at = new Date(record.at).toISOString();
    if (record.kind === 'milk' && record.wakeAt) record.wakeAt = new Date(record.wakeAt).toISOString();
    else delete record.wakeAt;
    if (draft.id) data().records = data().records.map(r => r.id === draft.id ? record : r); else data().records.push(record);
    selectedDay = dayKey(record.at); filter = 'all'; view = recordReturnView === 'trends' ? 'trends' : 'today';
    const saved = persist(); document.querySelector('#record-dialog').close(); render(); toast(saved ? '記録しました。おつかれさま！' : '端末に保存できません。記録を書き出してください');
  }
  if (e.target.id === 'settings-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('name').trim();
    if (!name) { document.querySelector('#settings-error').textContent = '名前を入力してください。'; return; }
    data().profile = { ...data().profile, name, birthday: f.get('birthday') };
    const saved = persist(); document.querySelector('#settings-dialog').close(); render(); toast(saved ? '設定を保存しました' : '設定を端末に保存できませんでした');
  }
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close(); } });
}
setInterval(() => { if (!document.querySelector('dialog[open]') && !document.hidden && document.activeElement?.tagName !== 'INPUT') render(); }, 60000);
render();
