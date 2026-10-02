'use client';
import type { CSSProperties } from 'react';
import type { Language, RecordItem } from '../lib/types';
import { analyzeMilk, dayKey, milkEvents, shiftDay, time, type AnalysisRange, type MilkEvent, type MilkFilter } from '../lib/model';
import { text, type TextKey } from '../lib/i18n';

function labels(lang: Language) {
  const t = (key: TextKey) => text(lang,key);
  const f = (key: TextKey, values: Record<string,string|number>) => t(key).replace(/\{(\w+)\}/g,(_,key:string)=>String(values[key]??''));
  const duration = (value: number|null):string => value===null?'—':value<60?`${value}${t('minutes')}`:`${Math.floor(value/60)}${t('hours')}${value%60?`${value%60}${t('minutes')}`:''}`;
  return {t,f,duration};
}
const dateLabel = (day:string)=>`${+day.slice(5,7)}/${+day.slice(8)}`;
const amount = (value:number|null)=>value===null?'—':`${value} ml`;
const position = (at:string)=>{const [h,m]=time(at).split(':').map(Number);return(h*60+m)/14.4;};
const typeKey = (r:RecordItem):TextKey=>r.kind==='breast'?'direct':r.milkType==='expressed'?'expressed':'milk';
function Axis({lang}:{lang:Language}) {return <div className="rhythm-axis">{[0,6,12,18,24].map(h=><span key={h}>{h}{lang==='ja'?'時':'时'}</span>)}</div>;}
function Track({rows,day,lang,onEdit}:{rows:MilkEvent[];day:string;lang:Language;onEdit:(record:RecordItem)=>void}) {
  const {t,duration}=labels(lang);
  return <div className="rhythm-track" aria-label={`${day} ${t('rhythmTitle')}`}>{rows.map(r=>{
    const end=r.next?(dayKey(r.next.at)===day?position(r.next.at):100):null;
    const label=`${day} ${time(r.at)} ${t(typeKey(r))} ${r.ml} ml · ${t('nextFeed')} ${duration(r.gap)}`;
    return <span key={r.id}>{end!==null&&<span className="rhythm-gap" style={{left:`${position(r.at)}%`,width:`${Math.max(0,end-position(r.at))}%`}} aria-hidden="true"/>}<button className={`rhythm-dot ${r.milkType==='expressed'?'expressed':''}`} style={{left:`${position(r.at)}%`,'--dot-size':`${Math.min(22,9+r.ml/18)}px`} as CSSProperties} title={label} aria-label={`${label} · ${t('editRecord')}`} onClick={()=>onEdit(r)}/></span>;
  })}</div>;
}
export function DayRhythm({records,day,lang,milkType='all',onEdit,onAnalysis}:{records:RecordItem[];day:string;lang:Language;milkType?:MilkFilter;onEdit:(record:RecordItem)=>void;onAnalysis?:()=>void}) {
  const {t,f,duration}=labels(lang);
  const rows=milkEvents(records).filter(r=>dayKey(r.at)===day&&(milkType==='all'||r.milkType===milkType));
  return <article className="card day-rhythm"><div className="card-head"><h2>{t('rhythmTitle')}</h2>{onAnalysis?<button className="text-button" onClick={onAnalysis}>{t('analysisLink')}</button>:<span className="muted">{dateLabel(day)} · {rows.length}{t('times')}</span>}</div><div className="rhythm-scroll"><div className="single-rhythm"><Axis lang={lang}/><Track rows={rows} day={day} lang={lang} onEdit={onEdit}/></div></div><p className="analysis-caption">{t('rhythmLegend')}</p>
    {rows.length?<div className="feed-intervals">{rows.map(r=><button key={r.id} className="feed-interval" onClick={()=>onEdit(r)}><span><time>{time(r.at)}</time><small>{t(typeKey(r))}</small></span><strong>{r.ml}<small> ml</small></strong><span className="interval-result">{r.next?<>{f('afterGap',{value:duration(r.gap)})}<small>→ {dayKey(r.next.at)!==day?`${dateLabel(dayKey(r.next.at))} `:''}{time(r.next.at)} {t(typeKey(r.next))}</small></>:t('pendingFeed')}{r.wakeGap!==null&&<small className="wake-result">{f('wakeResult',{value:duration(r.wakeGap)})}</small>}</span></button>)}</div>:<p className="analysis-empty">{t('rhythmEmpty')}</p>}
    <p className="analysis-caption">{t('rhythmNote')}</p></article>;
}
export function MilkAnalysis({records,day,lang,range,milkType,onRange,onType,onDay,onEdit}:{records:RecordItem[];day:string;lang:Language;range:AnalysisRange;milkType:MilkFilter;onRange:(range:AnalysisRange)=>void;onType:(type:MilkFilter)=>void;onDay:(day:string)=>void;onEdit:(record:RecordItem)=>void}) {
  const {t,f,duration}=labels(lang),a=analyzeMilk(records,day,range,milkType);
  const diff=(value:number|null,baseline:number|null,unit:string)=>value===null||baseline===null?t('analysisNoComparison'):`${value>baseline?'+':value<baseline?'−':'±'}${Math.abs(value-baseline)} ${unit}`;
  const max=Math.max(1,...a.days.map(d=>d.total||0)),gapMax=Math.max(1,...a.groups.map(g=>g.max||0));
  return <><div className="analysis-controls"><div className="range-buttons" aria-label={t('trends')}>{([7,14,30] as const).map(n=><button key={n} className={range===n?'selected':''} aria-pressed={range===n} onClick={()=>onRange(n)}>{f('analysisRange',{range:n})}</button>)}</div><label>{t('analysisType')}<select aria-label={t('analysisType')} value={milkType} onChange={e=>onType(e.target.value as MilkFilter)}><option value="all">{t('totalMilk')}</option><option value="formula">{t('analysisFormula')}</option><option value="expressed">{t('analysisExpressed')}</option></select></label></div>
    <section className="analysis-metrics" aria-label={t('trends')}><article><span>{t(day===dayKey()?'analysisToday':'analysisSelected')}</span><strong>{amount(a.total)}</strong><p className="analysis-diff">{diff(a.total,a.baselineTotal,'ml')}</p><small>{f('analysisBaselineTotal',{range,value:amount(a.baselineTotal)})}{day===dayKey()&&t('analysisSameClock')}</small></article><article><span>{t('analysisAverage')}</span><strong>{amount(a.average)}</strong><p className="analysis-diff">{diff(a.average,a.baselineAverage,'ml')}</p><small>{f('analysisBaselineAmount',{range,value:amount(a.baselineAverage)})}</small></article><article><span>{t('analysisGap')}</span><strong>{duration(a.gap)}</strong><p className="analysis-diff">{diff(a.gap,a.baselineGap,t('minutes'))}</p><small>{f('analysisBaselineGap',{range,value:duration(a.baselineGap)})}</small></article></section><p className="analysis-caption">{f('analysisBaselineNote',{range,count:a.baselineDays})}</p>
    <DayRhythm records={records} day={day} lang={lang} milkType={milkType} onEdit={onEdit}/>
    <article className="card analysis-card"><div className="card-head"><div><h2>{t('amountRelation')}</h2><p>{dateLabel(shiftDay(day,1-range))}〜{dateLabel(day)}</p></div></div><p className="analysis-caption">{t('amountRelationNote')}</p><div className="amount-groups">{a.groups.map(g=><div className="amount-group" key={g.low}><div className="amount-group-heading"><strong>{g.high===1000?f('amountAbove',{value:g.low}):`${g.low}〜${g.high} ml`}</strong><span>{f('sampleCount',{count:g.count})}{g.count>0&&g.count<3?` · ${t('fewSamples')}`:''}</span></div><div className="gap-bar-track"><span style={{width:`${g.gap===null?0:g.gap/gapMax*100}%`}}/></div><div className="amount-group-stats"><span>{t('nextFeed')}<strong>{duration(g.gap)}</strong><small>{g.count?f('gapRange',{min:duration(g.min),max:duration(g.max)}):t('noIntervals')}</small></span><span>{t('wakeUntil')}<strong>{duration(g.wake)}</strong><small>{f('wakeCount',{count:g.wakeCount})}</small></span></div></div>)}</div><p className="analysis-caption">{t('wakeNote')}</p></article>
    <article className="card analysis-card"><div className="card-head"><div><h2>{f('recentRhythm',{range})}</h2><p>{dateLabel(shiftDay(day,1-range))}〜{dateLabel(day)} · {t('selectAnalysisDay')}</p></div></div><p className="analysis-caption analysis-scroll-hint">{t('scrollRhythm')}</p><div className="table-scroll"><table className="daily-analysis"><thead><tr><th>{t('date')}</th><th>{t('recordedAmount')}</th><th>{t('feedAndAverage')}</th><th>{t('gapMedian')}</th><th className="rhythm-cell"><Axis lang={lang}/></th></tr></thead><tbody>{a.days.map(d=><tr key={d.key} className={d.key===day?'selected-day':''}><th><button className="text-button" onClick={()=>{onDay(d.key);window.scrollTo(0,0);}}>{dateLabel(d.key)}{d.key===dayKey()&&<small> {t('partialDay')}</small>}</button></th><td><div className="daily-total"><span className="daily-total-bar" style={{width:`${(d.total||0)/max*100}%`}}/><strong>{d.total===null?t('missingRecord'):d.total}</strong></div></td><td>{d.rows.length?`${d.rows.length}${t('times')} / ${d.average} ml`:'—'}</td><td>{duration(d.gap)}<small>{f('sampleCount',{count:d.gapCount})}</small></td><td className="rhythm-cell"><Track rows={d.rows} day={d.key} lang={lang} onEdit={onEdit}/></td></tr>)}</tbody></table></div><p className="analysis-caption">{t('recentNote')}</p></article>
    <details className="card analysis-method"><summary>{t('analysisMethod')}</summary><p>{f('analysisMethodAmount',{range})}</p><p>{t('analysisMethodGap')}</p><p>{t('analysisMethodLimit')}</p></details></>;
}
