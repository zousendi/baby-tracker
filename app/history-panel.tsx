'use client';
import { Milk, Heart, Droplets, Circle, Scale, Plus, Moon, Sun } from 'lucide-react';
import type { Kind, Language, RecordItem, WeightRecord } from '../lib/types';
import { dayKey, milkEvents, recordsForDay, time } from '../lib/model';
import { sleepTimeline } from '../lib/sleep';
import { text, type TextKey } from '../lib/i18n';

export type HistoryFilter = 'all' | 'feed' | 'diaper' | 'weight' | 'sleep';
export function HistoryPanel({records,weights,day,lang,now,filter,onFilter,onEdit,onWeight,onAdd}:{records:RecordItem[];weights:WeightRecord[];day:string;lang:Language;now:number;filter:HistoryFilter;onFilter:(filter:HistoryFilter)=>void;onEdit:(r:RecordItem)=>void;onWeight:(r?:WeightRecord)=>void;onAdd:(kind:Kind)=>void}) {
  const t=(key:TextKey)=>text(lang,key);
  const rows=recordsForDay(records,day).filter(r=>filter==='all'||filter==='feed'&&(r.kind==='milk'||r.kind==='breast')||filter==='diaper'&&['pee','poop','both'].includes(r.kind)||filter==='sleep'&&['sleep','wake'].includes(r.kind));
  const weight=weights.find(w=>w.day===day);
  const showWeight=(filter==='all'||filter==='weight')&&weight;
  const events=new Map(milkEvents(records,new Date(now)).map(r=>[r.id,r]));
  const feeds=records.filter(r=>(r.kind==='milk'||r.kind==='breast')&&+new Date(r.at)<=now).slice().sort((a,b)=>+new Date(a.at)-+new Date(b.at));
  const sleep=sleepTimeline(records,now);
  const icons={milk:Milk,breast:Heart,pee:Droplets,poop:Circle,both:Droplets,sleep:Moon,wake:Sun};
  const duration=(n:number)=>n<60?`${n}${t('minutes')}`:`${Math.floor(n/60)}${t('hours')}${n%60?`${n%60}${t('minutes')}`:''}`;
  return <article className="card history-panel"><div className="filter-row" aria-label={t('historyFilter')}>{(['all','feed','diaper','sleep','weight'] as const).map(key=><button key={key} className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>onFilter(key)}>{t(key==='sleep'?'sleepFilter':key)}</button>)}</div>
    <div className="history-add" aria-label={t('addRecord')}>{filter!=='weight'&&(['milk','pee','poop','sleep','wake'] as Kind[]).filter(kind=>filter==='all'||filter==='feed'&&kind==='milk'||filter==='diaper'&&['pee','poop'].includes(kind)||filter==='sleep'&&['sleep','wake'].includes(kind)).map(kind=><button key={kind} className="subtle-button" onClick={()=>onAdd(kind)}><Plus size={15}/>{t(kind==='milk'?'feed':kind)}</button>)}{(filter==='all'||filter==='weight')&&<button className="subtle-button" onClick={()=>onWeight(weight)}><Scale size={15}/>{t(weight?'editWeight':'addWeight')}</button>}</div>
    {showWeight&&<button className="history-weight" onClick={()=>onWeight(weight)}><Scale size={20}/><span><strong>{t('dayWeight')}</strong><small>{weight.note||weight.author}</small></span><b>{weight.grams.toLocaleString()} g</b></button>}
    <div className="record-list">{rows.map(r=>{
      const Icon=icons[r.kind],event=events.get(r.id),next=event?.next??(r.kind==='breast'?feeds[feeds.findIndex(f=>f.id===r.id)+1]:undefined);
      const gap=next?Math.round((+new Date(next.at)-+new Date(r.at))/60000):null;
      const session=sleep.sessions.find(s=>s.start.id===r.id||s.end.id===r.id);
      const kind:TextKey=r.kind==='milk'&&r.milkType==='expressed'?'expressed':r.kind;
      return <button key={r.id} className={`record-row ${filter==='feed'?'feed-interval':''}`} onClick={()=>onEdit(r)}><time>{time(r.at)}</time><span className={`record-icon ${r.kind}`}><Icon size={20}/></span><span className="record-description"><strong>{t(kind)}</strong><small>{r.note||r.author}</small>{(r.kind==='sleep'||r.kind==='wake')&&<span className="history-interval">{session?`${time(session.start.at)} → ${dayKey(session.end.at)!==dayKey(session.start.at)?dayKey(session.end.at)+' ':''}${time(session.end.at)} · ${duration(Math.round(session.minutes))}`:t(sleep.ongoing?.id===r.id?'sleepPending':'sleepMissing')}</span>}{filter==='feed'&&<span className="history-interval">{next?`${t('nextFeed')} ${duration(gap!)} → ${dayKey(next.at)!==day?`${dayKey(next.at)} `:''}${time(next.at)}`:t('pendingFeed')}</span>}</span><span className="record-amount">{r.kind==='milk'?`${r.ml} ml`:r.kind==='breast'?`${r.left+r.right} ${t('minutes')}`:r.kind==='sleep'||r.kind==='wake'?'':`1 ${t('times')}`}</span></button>;
    })}</div>
    {!rows.length&&!showWeight&&<div className="empty-state"><h3>{t('historyEmpty')}</h3><p>{t('historyEmptyHint')}</p></div>}<p className="timeline-note">{t('editHint')}</p>
  </article>;
}
