'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Leaf, Milk, Droplets, Circle, Clock, BarChart3, Heart, Settings, Plus, ChevronLeft, ChevronRight, LogOut, RefreshCw, CalendarDays, Users } from 'lucide-react';
import type { AppState, Kind, Language, RecordItem } from '../lib/types';
import { text, errorText, type TextKey } from '../lib/i18n';
import { api, RequestError } from '../lib/client';
import { dayKey, shiftDay, recordsForDay, summarize, goal, time, localInput } from '../lib/model';
import { RecordEditor, ProfileEditor } from './editors';

export const kindKey = (r: Pick<RecordItem,'kind'|'milkType'>): TextKey => r.kind === 'milk' && r.milkType === 'expressed' ? 'expressed' : r.kind;
const kindIcon = { milk: Milk, breast: Heart, pee: Droplets, poop: Circle, both: Droplets };
export default function BabyApp() {
  const [lang,setLang] = useState<Language>('ja');
  const [state,setState] = useState<AppState|null>(null);
  const [loading,setLoading] = useState(true), [syncing,setSyncing] = useState(false);
  const [error,setError] = useState(''), [loginError,setLoginError] = useState('');
  const [busy,setBusy] = useState(false), [view,setView] = useState('today');
  const [date,setDate] = useState(dayKey()), [filter,setFilter] = useState('all');
  const [editor,setEditor] = useState<{kind:Kind;record?:RecordItem}|null>(null), [settings,setSettings] = useState(false);
  const [notice,setNotice] = useState<TextKey|null>(null);
  const loadSeq = useRef(0), noticeTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const visibleState = useRef<AppState|null>(null); visibleState.current = state;
  const t = (key: TextKey) => text(lang,key);
  useEffect(() => { try { if (localStorage.getItem('komorebi-language') === 'zh') setLang('zh'); } catch {} },[]);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'ja'; try { localStorage.setItem('komorebi-language',lang); } catch {} },[lang]);
  const refresh = useCallback(async (propagate = false) => {
    const sequence = ++loadSeq.current;
    setSyncing(true);
    try {
      const next = await api<AppState>('state');
      if (sequence === loadSeq.current) { setState(next); setError(''); }
    } catch(e) {
      if (sequence === loadSeq.current) {
        if (e instanceof RequestError && e.status === 401) { setState(null); setEditor(null); setSettings(false); setError(''); }
        else setError(e instanceof RequestError ? e.code : 'syncError');
      }
      if (propagate) throw e;
    } finally { if (sequence === loadSeq.current) { setLoading(false); setSyncing(false); } }
  },[]);
  useEffect(() => { void refresh(); return () => { loadSeq.current++; }; },[refresh]);
  useEffect(() => {
    const context = (document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}}).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { void Promise.resolve(context.registerTool({name:'get_family_day_summary',title:'Family daily record summary',description:'Read the signed-in family’s currently loaded daily totals. Returns the time of the last synchronization; does not create or change records.',inputSchema:{type:'object',properties:{date:{type:'string',description:'Calendar date in Japan, YYYY-MM-DD'}},required:['date'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:{date:string})=>{const current=visibleState.current;if(!current)throw new Error('LOGIN_REQUIRED');if(!input||typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(+new Date(`${input.date}T12:00+09:00`))||dayKey(`${input.date}T12:00+09:00`)!==input.date)throw new Error('INVALID_TIME');return{date:input.date,timeZone:'Asia/Tokyo',...summarize(recordsForDay(current.records,input.date)),lastSyncedAt:current.serverTime};}}, {signal:lifecycle.signal})).catch(()=>{}); } catch {}
    return ()=>lifecycle.abort();
  },[]);
  useEffect(() => {
    if (!state) return;
    const tick = () => { if (!document.hidden) void refresh(); };
    const interval = setInterval(tick,10000);
    window.addEventListener('focus',tick); document.addEventListener('visibilitychange',tick);
    return () => { clearInterval(interval); window.removeEventListener('focus',tick); document.removeEventListener('visibilitychange',tick); };
  },[!!state,refresh]);
  const notify = (key: TextKey) => { setNotice(key); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current=setTimeout(()=>setNotice(null),3500); };
  const languageButton = <button className="subtle-button language-button" aria-label={t('language')} onClick={()=>setLang(lang==='ja'?'zh':'ja')}>{lang==='ja'?'中文':'日本語'}</button>;
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(busy)return; setBusy(true);setLoginError('');
    const form = new FormData(e.currentTarget);
    try { await api('login','POST',{ username:form.get('username'), password:form.get('password') }); await refresh(true); }
    catch(e){setLoginError(e instanceof RequestError?e.code:'requestFailed');} finally{setBusy(false);}
  }
  async function logout(){setBusy(true);try{await api('logout','POST',{});loadSeq.current++;setState(null);setEditor(null);setSettings(false);setError('');}catch(e){setError(e instanceof RequestError?e.code:'requestFailed');}finally{setBusy(false);}}
  if (loading) return <main className="login-page"><div className="loading-card"><Leaf size={38}/><p>{t('loading')}</p></div></main>;
  if (!state) return <main className="login-page"><div className="login-card"><div className="login-top"><span className="brand"><Leaf/>こもれび</span>{languageButton}</div><p className="eyebrow">OUR FAMILY JOURNAL</p><h1>{t('loginTitle')}</h1><p className="muted">{t('loginHint')}</p>{(loginError||error)&&<p className="error-box" role="alert">{errorText(lang,loginError||error)}</p>}<form method="post" onSubmit={login}><label>{t('username')}<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} required/></label><label>{t('password')}<input name="password" type="password" autoComplete="current-password" maxLength={128} required/></label><button className="primary-button" disabled={busy} type="submit">{busy?t('loading'):t('login')}</button></form><p className="login-note">{t('loginNote')}</p></div></main>;
  const records=recordsForDay(state.records,date), s=summarize(records), isToday=date===dayKey();
  const prev=summarize(recordsForDay(state.records,shiftDay(date,-1),isToday?time(new Date()):'23:59'));
  const last=state.records.filter(r=>r.kind==='milk'||r.kind==='breast').sort((a,b)=>+new Date(b.at)-+new Date(a.at))[0];
  const duration=(n:number|null)=>n===null?'—':n>=1440?`${Math.floor(n/1440)}${t('days')}`:n>=60?`${Math.floor(n/60)}${t('hours')}${n%60?`${n%60}${t('minutes')}`:''}`:`${n}${t('minutes')}`;
  const nav = () => ([['today',CalendarDays,'today'],['trends',BarChart3,'trends'],['guide',Heart,'guide']] as const).map(([key,Icon,label])=><button key={key} className={`nav-item ${view===key?'active':''}`} aria-current={view===key?'page':undefined} onClick={()=>{setView(key);window.scrollTo(0,0);}}><Icon size={21}/><span>{t(label)}</span></button>);
  const days=Array.from({length:7},(_,i)=>{const key=shiftDay(date,i-6);return{key,...summarize(recordsForDay(state.records,key))};});
  const chart=<article className={`card chart-card ${view==='trends'?'large-chart':''}`}><div className="card-head"><h2>{t('chart')}</h2><span className="muted">ml</span></div><div className="bar-chart">{days.map(d=><button key={d.key} className={`chart-day ${d.key===date?'current':''}`} onClick={()=>{setDate(d.key);setView('today');}} aria-label={`${d.key} ${d.ml} ml`}><span>{d.ml}</span><span className="bar-track"><span style={{height:`${d.ml/Math.max(200,...days.map(x=>x.ml))*100}%`}}/></span><span>{d.key===dayKey()?t('todayShort'):`${+d.key.slice(5,7)}/${+d.key.slice(8)}`}</span></button>)}</div><p className="chart-note">{t('chartNote')} {isToday&&t('ongoing')}</p></article>;
  const status=goal(s.ml,state.family.goalLow,state.family.goalHigh,isToday);
  const monitor=<article className="card monitor"><div className="card-head"><h2><Leaf size={20}/>{t('monitor')}</h2><button className="text-button" onClick={()=>setSettings(true)}>{t('goalSettings')}</button></div><div className="card-body"><span className={`status-chip ${status==='within'?'green':status==='above'?'orange':''}`}>{t(status)}</span><div className="goal-numbers"><strong>{s.ml}<small> ml</small></strong><span>{state.family.goalLow?`/ ${state.family.goalLow}–${state.family.goalHigh} ml`:t('noGoal')}</span></div><div className="meter" role="img" aria-label={`${s.ml} ml / ${state.family.goalLow??'—'}–${state.family.goalHigh??'—'} ml`}><div style={{width:`${state.family.goalHigh?Math.min(100,s.ml/(state.family.goalHigh*1.2)*100):0}%`}}/></div><p className="meter-label">{state.family.goalLow?t('goalFoot'):t('noGoalHint')}</p><p className="health-note">{t('medicalNote')} {isToday&&t('ongoing')}</p></div></article>;
  const visible=records.filter(r=>filter==='all'||filter==='feed'&&(r.kind==='milk'||r.kind==='breast')||filter==='pee'&&(r.kind==='pee'||r.kind==='both')||filter==='poop'&&(r.kind==='poop'||r.kind==='both'));
  function exportRecords(){const blob=new Blob([JSON.stringify({family:state!.family,records:state!.records,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`komorebi-${dayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('exportDone');}
  return <div className="app-layout"><aside className="sidebar"><div className="brand"><Leaf/>こもれび</div><p className="sidebar-family"><Users size={16}/>{state.family.name}</p><nav>{nav()}</nav><div className="sidebar-bottom"><p><Leaf size={22}/>{t('thankYou')}</p><button className="nav-item" onClick={()=>setSettings(true)}><Settings size={21}/>{t('settings')}</button><button className="nav-item" disabled={busy} onClick={logout}><LogOut size={21}/>{t('logout')}</button></div></aside><div className="page-shell"><header className="topbar"><span><Users size={17}/>{state.family.name}</span><div>{languageButton}<span className="user-chip">{state.user.displayName}</span></div></header><main className="main-content">
    <div className="sync-bar"><span>{error?t('syncError'):syncing?t('syncing'):`${t('synced')} ${time(state.serverTime)}`}</span><button className="text-button" disabled={syncing} onClick={()=>void refresh()}><RefreshCw size={15}/>{t('refresh')}</button></div>
    {error&&<div className="error-box" role="alert">{errorText(lang,error)} {t('staleHint')}</div>}
    <div className="page-heading"><div><p className="eyebrow">OUR FAMILY JOURNAL</p><h1>{view==='today'?`${state.family.babyName}${t('greeting')}`:view==='trends'?t('trends'):t('guideTitle')}</h1><p className="muted">{t('daily')}</p></div>{view!=='guide'&&<div className="date-control"><button aria-label={t('previousDay')} onClick={()=>setDate(shiftDay(date,-1))}><ChevronLeft size={19}/></button><input type="date" aria-label={t('readOnlyDate')} value={date} max={dayKey()} onChange={e=>{if(e.target.value&&e.target.value<=dayKey())setDate(e.target.value);}}/><button disabled={date>=dayKey()} aria-label={t('nextDay')} onClick={()=>setDate(shiftDay(date,1))}><ChevronRight size={19}/></button></div>}</div>
    {view==='today'&&<><section className="quick-record"><h2>{t('quick')}</h2><div className="quick-buttons">{(['milk','pee','poop'] as Kind[]).map(kind=>{const Icon=kindIcon[kind];return <button key={kind} className={`quick ${kind}`} onClick={()=>setEditor({kind})}><Icon/><span>{t(kind==='milk'?'feed':kind)}</span><Plus size={18}/></button>;})}</div></section><div className="section-heading"><h2>{t('summary')}</h2><span>{t('japanTime')}</span></div><section className="summary-grid"><article className="stat-card milk-stat"><span><Milk size={20}/>{t('totalMilk')}</span><strong data-testid="milk-total">{s.ml}<small>ml</small></strong><p>{prev.feeds?`${s.ml-prev.ml>=0?'+':''}${s.ml-prev.ml} ml · ${t(isToday?'sameTime':'previous')}`:t('noComparison')}</p></article><article className="stat-card"><span><Clock size={20}/>{t('totalFeeds')}</span><strong>{s.feeds}<small>{t('times')}</small></strong><p>{t('direct')} {s.minutes}{t('minutes')} · {t('avgGap')} {duration(s.gap)}</p></article><article className="stat-card"><span><Droplets size={20}/>{t('pee')}</span><strong data-testid="pee-total">{s.pee}<small>{t('times')}</small></strong><p>{records.find(r=>r.kind==='pee'||r.kind==='both')?time(records.find(r=>r.kind==='pee'||r.kind==='both')!.at):t('noRecord')}</p></article><article className="stat-card"><span><Circle size={20}/>{t('poop')}</span><strong data-testid="poop-total">{s.poop}<small>{t('times')}</small></strong><p>{records.find(r=>r.kind==='poop'||r.kind==='both')?time(records.find(r=>r.kind==='poop'||r.kind==='both')!.at):t('noRecord')}</p></article></section><div className="dashboard-grid"><div className="main-column">{monitor}<article className="card timeline"><div className="card-head"><h2>{t('timeline')}</h2><span className="muted">{records.length}</span></div><div className="filter-row">{(['all','feed','pee','poop'] as const).map(key=><button key={key} className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{t(key)}</button>)}</div>{visible.length?<div className="record-list">{visible.map(r=>{const Icon=kindIcon[r.kind];return <button key={r.id} className="record-row" onClick={()=>setEditor({kind:r.kind,record:r})}><time>{time(r.at)}</time><span className={`record-icon ${r.kind}`}><Icon size={20}/></span><span className="record-description"><strong>{t(kindKey(r))}</strong><small>{r.note||r.author}</small></span><span className="record-amount">{r.kind==='milk'?`${r.ml} ml`:r.kind==='breast'?`${r.left+r.right} ${t('minutes')}`:`1 ${t('times')}`}</span></button>;})}</div>:<div className="empty-state"><Leaf size={35}/><h3>{t('emptyTitle')}</h3><p>{t('emptyHint')}</p></div>}<p className="timeline-note">{t('editHint')}</p></article></div><aside className="side-column"><article className="last-feed card"><h3><Clock size={18}/>{t('lastFeed')}</h3><strong>{last?duration(Math.max(0,Math.floor((Date.now()-+new Date(last.at))/60000))):t('noRecord')}</strong><p>{last?`${dayKey(last.at)===dayKey()?'':dayKey(last.at)+' '}${time(last.at)} · ${last.kind==='milk'?`${last.ml} ml`:`${last.left+last.right} ${t('minutes')}`}`:t('emptyHint')}</p></article>{chart}<article className="tip-card"><Heart/><h3>{t('guideTitle')}</h3><p>{t('guideIntro')}</p><button className="text-button" onClick={()=>setView('guide')}>{t('guide')}</button></article></aside></div></>}
    {view==='trends'&&<>{chart}<div className="trends-monitor">{monitor}</div><article className="card"><div className="card-head"><h2>{t('dayTotals')}</h2></div><div className="table-scroll"><table><thead><tr>{(['date','totalMilk','feed','direct','pee','poop'] as const).map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>{[...days].reverse().map(d=><tr key={d.key}><th><button className="text-button" onClick={()=>{setDate(d.key);setView('today');}}>{d.key.slice(5)}</button></th><td>{d.ml} ml</td><td>{d.feeds} {t('times')}</td><td>{d.minutes} {t('minutes')}</td><td>{d.pee} {t('times')}</td><td>{d.poop} {t('times')}</td></tr>)}</tbody></table></div></article></>}
    {view==='guide'&&<><article className="guide-intro card"><Heart size={32}/><p>{t('guideIntro')}</p></article><div className="guide-grid">{([['cuesTitle','cues',Milk],['diapersTitle','diapers',Droplets],['adviceTitle','advice',Heart],['goalTitle','goalGuide',Leaf]] as const).map(([title,body,Icon])=><article className="card guide-card" key={title}><Icon size={25}/><h2>{t(title)}</h2><p>{t(body)}</p></article>)}</div><div className="sources"><h3>{t('sources')}</h3><a href="https://www.nhs.uk/baby/breastfeeding-and-bottle-feeding/breastfeeding-problems/enough-milk/" target="_blank" rel="noreferrer">NHS — Is my baby getting enough milk?</a><a href="https://www.nhs.uk/best-start-in-life/baby/feeding-your-baby/bottle-feeding/bottle-feeding-your-baby/" target="_blank" rel="noreferrer">NHS — Bottle feeding your baby</a></div></>}
    <footer className="page-footer"><Leaf size={16}/>{t('thankYou')}<small>{t('dataScope')}</small></footer></main></div><nav className="mobile-nav">{nav()}<button className="nav-item" onClick={()=>setSettings(true)}><Settings size={21}/><span>{t('settings')}</span></button></nav>
    {editor&&<RecordEditor key={editor.record?.id||editor.kind} lang={lang} kind={editor.kind} record={editor.record} selectedDay={date} onClose={()=>setEditor(null)} onSaved={async (at,deleted)=>{setEditor(null);if(at)setDate(dayKey(at));setFilter('all');await refresh();notify(deleted?'deleted':'saved');}} onReload={async()=>{await refresh();setEditor(null);}}/>}
    {settings&&<ProfileEditor lang={lang} family={state.family} onClose={()=>setSettings(false)} onSaved={async()=>{setSettings(false);await refresh();notify('saved');}} onExport={exportRecords} onLogout={logout}/>}
    {notice&&<div className="toast" role="status">{t(notice)}</div>}
  </div>;
}
