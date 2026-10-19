'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import type { Language, RecordItem } from '../lib/types';
import { text, type TextKey } from '../lib/i18n';
import { dayKey, shiftDay, time } from '../lib/model';
import { poopDays } from '../lib/poop';

export function PoopAnalysis({records,day,lang,now,onDay,onEdit}:{records:RecordItem[];day:string;lang:Language;now:number;onDay:(day:string)=>void;onEdit:(r:RecordItem)=>void}) {
  const t=(key:TextKey)=>text(lang,key);
  const [range,setRange]=useState(7),[selected,setSelected]=useState(day);
  const scroll=useRef<HTMLDivElement>(null),detail=useRef<HTMLElement>(null);
  const days=poopDays(records,day,range,now),today=dayKey(now);
  const active=days.find(d=>d.day===selected)??days.at(-1)!;
  useEffect(()=>{setSelected(day);if(scroll.current)scroll.current.scrollLeft=scroll.current.scrollWidth;},[day,range]);
  const date=(key:string)=>`${Number(key.slice(5,7))}/${Number(key.slice(8))}`;
  const weekday=(key:string)=>new Intl.DateTimeFormat(lang==='ja'?'ja-JP':'zh-CN',{weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(`${key}T12:00+09:00`));
  function selectGroup(key:string,rows:RecordItem[]) {
    if(rows.length===1){onEdit(rows[0]);return;}
    setSelected(key);detail.current?.scrollIntoView({behavior:'instant',block:'nearest'});detail.current?.focus({preventScroll:true});
  }
  return <section className="poop-analysis">
    <div className="poop-heading"><h2>{t('poopHeading')}</h2><p>{t('poopIntro')}</p></div>
    <div className="poop-controls"><div className="range-buttons" aria-label={t('poopRange')}>{[7,14].map(n=><button key={n} className={range===n?'selected':''} aria-pressed={range===n} onClick={()=>setRange(n)}>{n}{t('days')}</button>)}</div><div className="poop-period"><button className="icon-button" aria-label={t('poopPrevious')} onClick={()=>onDay(shiftDay(day,-range))}><ChevronLeft size={19}/></button><span>{date(days[0].day)} — {date(day)}</span><button className="icon-button" aria-label={t('poopNext')} disabled={day>=today} onClick={()=>onDay(shiftDay(day,range)>today?today:shiftDay(day,range))}><ChevronRight size={19}/></button></div></div>
    <article className="card poop-chart"><div className="card-head"><h2><Circle size={18}/>{t('poopChart')}</h2><span className="muted">{t('japanTime')}</span></div><p className="poop-chart-help">{t('poopChartHint')}</p>
      <div className="poop-calendar"><div className="poop-axis" aria-hidden="true"><div className="poop-axis-head"/>{(['poopNight','poopMorning','poopAfternoon','poopEvening'] as const).map((key,i)=><div className={`poop-axis-band band-${i}`} key={key}><time>{i*6}:00</time><span>{t(key)}</span></div>)}<time className="poop-axis-end">24:00</time></div>
        <div className="poop-scroll" ref={scroll} tabIndex={0} role="region" aria-label={t('poopChart')}><div className="poop-columns">{days.map(d=><div className={`poop-day ${d.day===active.day?'is-selected':''}`} key={d.day}><button className="poop-date" aria-pressed={d.day===active.day} aria-label={`${d.day} ${t('poopDetails')}`} onClick={()=>setSelected(d.day)}><strong>{date(d.day)}</strong><span>{d.day===today?t('todayShort'):weekday(d.day)}</span><small>{d.rows.length?`${d.rows.length}${t('times')}`:t('missingRecord')}</small></button><div className="poop-day-track">{[0,1,2,3].map(i=><div key={i} className={`poop-time-band band-${i}`}/>)}{d.groups.map(group=><button className="poop-event" key={group.records[0].id} style={{top:`${24+group.minute/3}px`}} aria-label={`${d.day} ${group.records.map(r=>time(r.at)).join(' / ')} ${group.records.length}${t('times')}`} title={group.records.map(r=>`${time(r.at)} ${t(r.kind==='both'?'both':'poop')}`).join('\n')} onClick={()=>selectGroup(d.day,group.records)}><span className="poop-dot">{group.records.length>1?group.records.length:<Circle size={12} fill="currentColor"/>}</span><span>{group.records.length===1?time(group.records[0].at):`${time(group.records[0].at)}–`}</span></button>)}</div></div>)}</div></div>
      </div><p className="analysis-caption">{t('poopMethod')}</p>
    </article>
    <article className="card poop-details" ref={detail} tabIndex={-1} aria-label={t('poopDetails')}><div className="card-head"><h2>{date(active.day)} · {t('poopDetails')}</h2><span className="muted">{active.rows.length?`${active.rows.length}${t('times')}`:t('missingRecord')}</span></div>{active.rows.length?<div className="poop-records">{active.rows.map(r=><button key={r.id} onClick={()=>onEdit(r)}><time>{time(r.at)}</time><span><strong>{t(r.kind==='both'?'both':'poop')}</strong><small>{r.note||r.author}</small></span><ChevronRight size={18}/></button>)}</div>:<p className="poop-empty">{t('poopEmpty')}</p>}<p className="timeline-note">{t('editHint')}</p></article>
  </section>;
}
