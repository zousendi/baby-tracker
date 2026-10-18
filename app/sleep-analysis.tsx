'use client';
import { useEffect, useRef } from 'react';
import { Moon } from 'lucide-react';
import type { Language, RecordItem } from '../lib/types';
import { text, type TextKey } from '../lib/i18n';
import { analyzeSleep } from '../lib/sleep';
import { time } from '../lib/model';

export function SleepAnalysis({records,day,lang,range,onRange,onDay,onEdit,now}:{records:RecordItem[];day:string;lang:Language;range:number;onRange:(n:number)=>void;onDay:(day:string)=>void;onEdit:(r:RecordItem)=>void;now:number}) {
  const t=(key:TextKey)=>text(lang,key),a=analyzeSleep(records,day,range,now);
  const bars=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(bars.current)bars.current.scrollLeft=bars.current.scrollWidth;},[day,range]);
  const duration=(n:number|null)=>n===null?'—':`${Math.floor(n/60)}${t('hours')} ${n%60}${t('minutes')}`;
  return <section className="sleep-analysis">
    <div className="sleep-heading"><div><h2><Moon size={22}/>{t('sleepHeading')}</h2><p>{t('sleepIntro')}</p></div><div className="range-buttons" aria-label={t('sleepRange')}>{[7,14,30].map(n=><button key={n} aria-pressed={range===n} className={range===n?'selected':''} onClick={()=>onRange(n)}>{n}{t('days')}</button>)}</div></div>
    <div className="analysis-metrics sleep-metrics"><article><span>{t('sleepTotal')}</span><strong data-testid="sleep-total">{duration(a.selected.total)}</strong><small>{t('sleepCompletedOnly')}</small></article><article><span>{t('sleepLongest')}</span><strong>{duration(a.longest)}</strong><small>{a.count} {t('sleepSessions')}</small></article><article><span>{t('sleepAverage')}</span><strong>{duration(a.average)}</strong><small>{a.recordedDays}{t('days')} / {range}{t('days')}</small></article></div>
    <article className="card sleep-chart"><div className="card-head"><h2>{t('sleepDaily')}</h2><span className="muted">{t('hours')}</span></div><div className="sleep-bars" ref={bars}>{a.days.map(d=><button key={d.key} className={d.key===day?'selected':''} onClick={()=>onDay(d.key)} aria-label={`${d.key} ${d.total===null?t('missingRecord'):duration(d.total)}`}><span className="sleep-bar-track"><span style={{height:`${(d.total??0)/1440*100}%`}}/></span><small>{Number(d.key.slice(5,7))}/{Number(d.key.slice(8))}</small><b>{d.total===null?'—':(d.total/60).toFixed(1)}</b></button>)}</div><p className="analysis-caption">{t('sleepAverageHint')}</p></article>
    <article className="card"><div className="card-head"><h2>{t('sleepDayRhythm')}</h2><span className="muted">{day}</span></div><div className="sleep-day-track" role="img" aria-label={`${day} ${t('sleepTotal')} ${duration(a.selected.total)}`}>{a.selected.segments.map(s=><span key={s.start.id} style={{left:`${(s.from-+new Date(`${day}T00:00:00+09:00`))/864000}%`,width:`${s.minutes/14.4}%`}}/>)}</div><div className="sleep-axis">{['0','6','12','18','24'].map(h=><span key={h}>{h}</span>)}</div>
    {a.selected.segments.length?<div className="sleep-session-list">{a.selected.segments.map(s=><button key={s.start.id} onClick={()=>onEdit(s.start)}><Moon size={18}/><span>{time(s.from)} — {s.to===+new Date(`${day}T00:00:00+09:00`)+86400000?'24:00':time(s.to)}</span><strong>{duration(Math.round(s.minutes))}</strong></button>)}</div>:<div className="empty-state"><h3>{t('sleepEmpty')}</h3><p>{t('sleepEmptyHint')}</p></div>}</article>
    <details className="card analysis-method"><summary>{t('analysisMethod')}</summary><p>{t('sleepMethod')}</p><p>{t('sleepMissingHint')}</p></details>
  </section>;
}
