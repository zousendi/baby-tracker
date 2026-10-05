'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Leaf, Milk, Droplets, Circle, Clock, BarChart3, Heart, Settings, Plus, ChevronLeft, ChevronRight, LogOut, RefreshCw, CalendarDays, Users, History, Scale, Download } from 'lucide-react';
import type { AppState, Kind, Language, RecordItem, WeightRecord } from '../lib/types';
import { text, errorText, type TextKey } from '../lib/i18n';
import { api, RequestError, beginPreview, endPreview } from '../lib/client';
import { dayKey, shiftDay, recordsForDay, summarize, time, type AnalysisRange, type MilkFilter } from '../lib/model';
import { DayRhythm, MilkAnalysis } from './milk-analysis';
import { RecordEditor, ProfileEditor, WeightEditor } from './editors';
import { WeightTracker } from './weight-tracker';
import { HistoryPanel, type HistoryFilter } from './history-panel';

export const kindKey = (r: Pick<RecordItem,'kind'|'milkType'>): TextKey => r.kind === 'milk' && r.milkType === 'expressed' ? 'expressed' : r.kind;
const kindIcon = { milk: Milk, breast: Heart, pee: Droplets, poop: Circle, both: Droplets };
export default function BabyApp() {
  const [lang,setLang] = useState<Language>('ja');
  const [state,setState] = useState<AppState|null>(null);
  const [preview,setPreview]=useState(false);
  const [loading,setLoading] = useState(true), [syncing,setSyncing] = useState(false);
  const [error,setError] = useState(''), [loginError,setLoginError] = useState('');
  const [busy,setBusy] = useState(false), [view,setView] = useState('today');
  const [analysisRange,setAnalysisRange]=useState<AnalysisRange>(7), [milkType,setMilkType]=useState<MilkFilter>('all');
  const [historyDay,setHistoryDay]=useState(dayKey()), [analysisDay,setAnalysisDay]=useState(dayKey());
  const [filter,setFilter]=useState<HistoryFilter>('all'), [analysisType,setAnalysisType]=useState<'milk'|'weight'>('milk');
  const [weightRange,setWeightRange]=useState(30);
  const [now,setNow]=useState(Date.now), [guide,setGuide]=useState(false);
  const [scrollPositions,setScrollPositions]=useState<Record<string,number>>({});
  useLayoutEffect(()=>{window.scrollTo(0,scrollPositions[view]||0);},[view,scrollPositions]);
  useEffect(()=>{const tick=()=>setNow(Date.now());const timer=setInterval(tick,15000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};},[]);
  const [editor,setEditor] = useState<{kind:Kind;record?:RecordItem;selectedDay:string}|null>(null), [settings,setSettings] = useState(false);
  const [weightEditor,setWeightEditor]=useState<{record?:WeightRecord;selectedDay:string}|null>(null);
  const [notice,setNotice] = useState<TextKey|null>(null);
  const loadSeq = useRef(0), noticeTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const visibleState = useRef<AppState|null>(null);
  useEffect(()=>{visibleState.current=state;},[state]);
  const navigate=useCallback((next:string)=>{const position=window.scrollY;setScrollPositions(previous=>({...previous,[view]:position}));setView(next);setGuide(false);},[view]);
  const signedIn=state!==null;
  const t = (key: TextKey) => text(lang,key);
  useEffect(() => { try { if (localStorage.getItem('komorebi-language') === 'zh') queueMicrotask(()=>setLang('zh')); } catch {} },[]);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'ja'; try { localStorage.setItem('komorebi-language',lang); } catch {} },[lang]);
  const refresh = useCallback(async (propagate = false) => {
    const sequence = ++loadSeq.current;
    setSyncing(true);
    try {
      const next = await api<AppState>('state');
      if (sequence === loadSeq.current) { setState(next); setError(''); }
    } catch(e) {
      if (sequence === loadSeq.current) {
        if (e instanceof RequestError && e.status === 401) { setState(null); setEditor(null); setWeightEditor(null); setSettings(false); setError(''); }
        else setError(e instanceof RequestError ? e.code : 'syncError');
      }
      if (propagate) throw e;
    } finally { if (sequence === loadSeq.current) { setLoading(false); setSyncing(false); } }
  },[]);
  const startDemo=useCallback(()=>{++loadSeq.current;setState(beginPreview());setPreview(true);setLoading(false);setSyncing(false);setError('');setLoginError('');setView('today');setGuide(false);setEditor(null);setWeightEditor(null);setSettings(false);setNotice(null);setNow(Date.now());setHistoryDay(dayKey());setAnalysisDay(dayKey());setFilter('all');setScrollPositions({});},[]);
  useEffect(() => { const sequence=loadSeq;queueMicrotask(()=>{if(new URLSearchParams(window.location.search).get('preview')==='1')startDemo();else void refresh();}); return () => { ++sequence.current; }; },[refresh,startDemo]);
  useEffect(() => {
    const context = (document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}}).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try { void Promise.resolve(context.registerTool({name:'get_family_day_summary',title:'Family daily record summary',description:'Read the signed-in family’s currently loaded daily totals. Returns the time of the last synchronization; does not create or change records.',inputSchema:{type:'object',properties:{date:{type:'string',description:'Calendar date in Japan, YYYY-MM-DD'}},required:['date'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:{date:string})=>{const current=visibleState.current;if(!current)throw new Error('LOGIN_REQUIRED');if(!input||typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(+new Date(`${input.date}T12:00+09:00`))||dayKey(`${input.date}T12:00+09:00`)!==input.date)throw new Error('INVALID_TIME');return{date:input.date,timeZone:'Asia/Tokyo',...summarize(recordsForDay(current.records,input.date)),lastSyncedAt:current.serverTime};}}, {signal:lifecycle.signal})).catch(()=>{}); } catch {}
    return ()=>lifecycle.abort();
  },[]);
  useEffect(() => {
    if (!signedIn) return;
    const tick = () => { if (!document.hidden) void refresh(); };
    const interval = setInterval(tick,10000);
    window.addEventListener('focus',tick); document.addEventListener('visibilitychange',tick);
    return () => { clearInterval(interval); window.removeEventListener('focus',tick); document.removeEventListener('visibilitychange',tick); };
  },[signedIn,refresh]);
  const notify = (key: TextKey) => { setNotice(key); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current=setTimeout(()=>setNotice(null),3500); };
  const languageButton = <button className="subtle-button language-button" aria-label={t('language')} onClick={()=>setLang(lang==='ja'?'zh':'ja')}>{lang==='ja'?'中文':'日本語'}</button>;
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(busy)return; setBusy(true);setLoginError('');
    const form = new FormData(e.currentTarget);
    try { await api('login','POST',{ username:form.get('username'), password:form.get('password') }); await refresh(true); }
    catch(e){setLoginError(e instanceof RequestError?e.code:'requestFailed');} finally{setBusy(false);}
  }
  async function logout(){setBusy(true);try{if(preview){endPreview();setPreview(false);const url=new URL(window.location.href);url.searchParams.delete('preview');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}else await api('logout','POST',{});loadSeq.current++;setState(null);setEditor(null);setWeightEditor(null);setSettings(false);setError('');}catch(e){setError(e instanceof RequestError?e.code:'requestFailed');}finally{setBusy(false);}}
  if (loading) return <main className="login-page"><div className="loading-card"><Leaf size={38}/><p>{t('loading')}</p></div></main>;
  if (!state) return <main className="login-page"><div className="login-card"><div className="login-top"><span className="brand"><Leaf/>こもれび</span>{languageButton}</div><p className="eyebrow">OUR FAMILY JOURNAL</p><h1>{t('loginTitle')}</h1><p className="muted">{t('loginHint')}</p>{(loginError||error)&&<p className="error-box" role="alert">{errorText(lang,loginError||error)}</p>}<form method="post" onSubmit={login}><label>{t('username')}<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} required/></label><label>{t('password')}<input name="password" type="password" autoComplete="current-password" maxLength={128} required/></label><button className="primary-button" disabled={busy} type="submit">{busy?t('loading'):t('login')}</button></form><p className="login-note">{t('loginNote')}</p><section className="preview-entry"><button type="button" className="subtle-button" disabled={busy} onClick={startDemo}><BarChart3 size={18}/>{t('previewStart')}</button><p>{t('previewHint')}</p></section></div></main>;
  const today=dayKey(now), weights=state.weights??[];
  const records=recordsForDay(state.records,today), s=summarize(records);
  const last=state.records.filter(r=>(r.kind==='milk'||r.kind==='breast')&&+new Date(r.at)<=now).slice().sort((a,b)=>+new Date(b.at)-+new Date(a.at))[0];
  const duration=(n:number)=>n>=1440?`${Math.floor(n/1440)}${t('days')} ${Math.floor(n%1440/60)}${t('hours')}`:n>=60?`${Math.floor(n/60)}${t('hours')}${n%60?`${n%60}${t('minutes')}`:''}`:`${n}${t('minutes')}`;

  const openRecord=(kind:Kind,record?:RecordItem,selectedDay=today)=>setEditor({kind,record,selectedDay});
  const openWeight=(record?:WeightRecord,selectedDay=today)=>setWeightEditor({record,selectedDay});
  const navigation= ([['today',CalendarDays,'homeTab'],['history',History,'history'],['trends',BarChart3,'analysisTab'],['settings',Settings,'settings']] as const).map(([key,Icon,label])=><button key={key} className={`nav-item ${view===key?'active':''}`} aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}><Icon size={21}/><span>{t(label)}</span></button>);
  const dateControl=(day:string,onDay:(day:string)=>void)=><div className="history-date"><div className="date-control"><button aria-label={t('previousDay')} onClick={()=>onDay(shiftDay(day,-1))}><ChevronLeft size={19}/></button><input type="date" aria-label={t('readOnlyDate')} value={day} max={today} onChange={e=>{if(e.target.value&&e.target.value<=today)onDay(e.target.value);}}/><button disabled={day>=today} aria-label={t('nextDay')} onClick={()=>onDay(shiftDay(day,1))}><ChevronRight size={19}/></button></div>{day!==today&&<button className="text-button" onClick={()=>onDay(today)}>{t('backToday')}</button>}</div>;
  function exportRecords(){const blob=new Blob([JSON.stringify({family:state!.family,records:state!.records,weights:state!.weights??[],exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`komorebi-${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('exportDone');}
  const feedHistory=()=>{setHistoryDay(today);setFilter('feed');setScrollPositions(previous=>({...previous,history:0}));navigate('history');};
  return <div className="app-layout redesigned"><aside className="sidebar"><div className="brand"><Leaf/>こもれび</div><p className="sidebar-family"><Users size={16}/>{state.family.name}</p><nav>{navigation}</nav><div className="sidebar-bottom"><p><Leaf size={22}/>{t('thankYou')}</p><button className="nav-item" disabled={busy} onClick={logout}><LogOut size={21}/>{t('logout')}</button></div></aside><div className="page-shell"><header className="topbar"><span>{view==='today'?state.family.babyName:state.family.name}</span><div>{languageButton}<span className="user-chip">{state.user.displayName}</span></div></header><main className="main-content">
    {preview&&<aside className="preview-banner" aria-label={t('previewMode')}><div><strong>{t('previewMode')}</strong><p>{t('previewSessionHint')}</p></div><div><button className="text-button" onClick={startDemo}>{t('previewReset')}</button><button className="subtle-button" onClick={logout}>{t('previewExit')}</button></div></aside>}
    <div className="sync-bar"><span>{preview?t('previewSessionHint'):error?t('syncError'):syncing?t('syncing'):`${t('synced')} ${time(state.serverTime)}`}</span><button className="text-button" disabled={syncing} aria-label={t('refresh')} onClick={()=>void refresh()}><RefreshCw size={14}/></button></div>
    {error&&<div className="error-box" role="alert">{errorText(lang,error)} {t('staleHint')}</div>}
    {view==='today'&&<div className="today-view">
      <section className="quick-record"><div className="quick-heading"><h2>{t('quick')}</h2><time>{today}</time></div><div className="quick-buttons">{(['milk','pee','poop'] as Kind[]).map(kind=>{const Icon=kindIcon[kind];return <button key={kind} className={`quick ${kind}`} onClick={()=>openRecord(kind)}><Icon/><span>{t(kind==='milk'?'feed':kind)}</span><Plus size={18}/></button>;})}</div></section>
      <article className="last-feed card"><div><h3><Clock size={18}/>{t('lastFeed')}</h3><strong data-testid="last-feed-elapsed">{last?duration(Math.max(0,Math.floor((now-+new Date(last.at))/60000))):t('noRecord')}</strong></div><p>{last?`${t('previousFeed')} ${dayKey(last.at)===today?'':dayKey(last.at)+' '}${time(last.at)} ／ ${last.kind==='milk'?`${last.ml} ml`:`${last.left+last.right} ${t('minutes')}`}`:t('emptyHint')}</p></article>
      {!weights.some(w=>w.day===today)&&<button className="weight-reminder" onClick={()=>openWeight()}><Scale size={19}/><span>{t('todayWeightPrompt')}</span><Plus size={18}/></button>}
      <section className="today-summary" aria-label={t('todaySummary')}><h2>{t('todaySummary')}</h2><div className="compact-summary">{([['milkAmountShort',Milk,s.ml,'ml','milk-total'],['totalFeeds',Clock,s.feeds,t('times'),'feed-total'],['pee',Droplets,s.pee,t('times'),'pee-total'],['poop',Circle,s.poop,t('times'),'poop-total']] as const).map(([label,Icon,value,unit,testid])=><article key={label}><span><Icon size={16}/>{t(label)}</span><strong data-testid={testid}>{value}<small>{unit}</small></strong></article>)}</div></section>
      <DayRhythm records={state.records} day={today} lang={lang} onEdit={r=>openRecord(r.kind,r)} onHistory={feedHistory}/>
    </div>}
    {view==='history'&&<><div className="page-heading"><h1>{t('history')}</h1>{dateControl(historyDay,setHistoryDay)}</div><HistoryPanel records={state.records} weights={weights} day={historyDay} lang={lang} now={now} filter={filter} onFilter={setFilter} onEdit={r=>openRecord(r.kind,r,historyDay)} onWeight={r=>openWeight(r,historyDay)} onAdd={kind=>openRecord(kind,undefined,historyDay)}/></>}
    {view==='trends'&&<><div className="page-heading"><h1>{t('analysisTab')}</h1>{dateControl(analysisDay,setAnalysisDay)}</div><div className="analysis-switch segmented" aria-label={t('analysisTab')}>{(['milk','weight'] as const).map(type=><button key={type} className={analysisType===type?'selected':''} aria-pressed={analysisType===type} onClick={()=>setAnalysisType(type)}>{t(type)}</button>)}</div><div hidden={analysisType!=='milk'}><MilkAnalysis records={state.records} day={analysisDay} lang={lang} range={analysisRange} milkType={milkType} onRange={setAnalysisRange} onType={setMilkType} onDay={setAnalysisDay} onEdit={r=>openRecord(r.kind,r,analysisDay)}/></div><div hidden={analysisType!=='weight'}><WeightTracker records={weights} day={analysisDay} lang={lang} range={weightRange} onRange={setWeightRange} onEdit={r=>openWeight(r,analysisDay)}/></div></>}
    {view==='settings'&&<><div className="page-heading"><h1>{t(guide?'guide':'settings')}</h1>{guide&&<button className="text-button" onClick={()=>setGuide(false)}><ChevronLeft size={16}/>{t('backSettings')}</button>}</div>{!guide&&<article className="card settings-menu"><p>{state.family.name} · {state.user.displayName}</p><button onClick={()=>setSettings(true)}><Users size={21}/>{t('profileSettings')}<ChevronRight size={18}/></button><button onClick={()=>setLang(lang==='ja'?'zh':'ja')}><span className="language-symbol">文</span>{t('language')}<small>{lang==='ja'?'日本語':'中文'}</small></button><button onClick={exportRecords}><Download size={21}/>{t('export')}<ChevronRight size={18}/></button><button onClick={()=>setGuide(true)}><Heart size={21}/>{t('guide')}<ChevronRight size={18}/></button><button disabled={busy} onClick={logout}><LogOut size={21}/>{t('logout')}</button></article>}
{guide&&<><article className="guide-intro card"><Heart size={32}/><p>{t('guideIntro')}</p></article><div className="guide-grid">{([['cuesTitle','cues',Milk],['diapersTitle','diapers',Droplets],['adviceTitle','advice',Heart],['analysisGuideTitle','analysisGuide',BarChart3]] as const).map(([title,body,Icon])=><article className="card guide-card" key={title}><Icon size={25}/><h2>{t(title)}</h2><p>{t(body)}</p></article>)}</div><div className="sources"><h3>{t('sources')}</h3><a href="https://www.nhs.uk/baby/breastfeeding-and-bottle-feeding/breastfeeding-problems/enough-milk/" target="_blank" rel="noreferrer">NHS — Is my baby getting enough milk?</a><a href="https://www.nhs.uk/best-start-in-life/baby/feeding-your-baby/bottle-feeding/bottle-feeding-your-baby/" target="_blank" rel="noreferrer">NHS — Bottle feeding your baby</a></div></>}
    </>}
    <footer className="page-footer"><Leaf size={16}/>{t('thankYou')}<small>{t('dataScope')}</small></footer></main></div><nav className="mobile-nav" aria-label={t('family')}>{navigation}</nav>
    {editor&&<RecordEditor key={editor.record?.id||editor.kind+editor.selectedDay} lang={lang} kind={editor.kind} record={editor.record} selectedDay={editor.selectedDay} onClose={()=>setEditor(null)} onSaved={async(_at,deleted)=>{setEditor(null);await refresh();notify(deleted?'deleted':'saved');}} onReload={async()=>{await refresh();setEditor(null);}}/>}
    {weightEditor&&<WeightEditor key={weightEditor.record?.id||weightEditor.selectedDay} lang={lang} record={weightEditor.record} selectedDay={weightEditor.selectedDay} onClose={()=>setWeightEditor(null)} onSaved={async(_day,deleted)=>{setWeightEditor(null);await refresh();notify(deleted?'deleted':'saved');}} onReload={async()=>{await refresh();setWeightEditor(null);}}/>}
    {settings&&<ProfileEditor lang={lang} family={state.family} onClose={()=>setSettings(false)} onSaved={async()=>{setSettings(false);await refresh();notify('saved');}} onExport={exportRecords} onLogout={logout}/>}
    {notice&&<div className="toast" role="status">{t(notice)}</div>}
  </div>;
}
