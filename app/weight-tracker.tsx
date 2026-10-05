'use client';
import { useState } from 'react';
import { Scale, Plus, Pencil } from 'lucide-react';
import type { Language, WeightRecord } from '../lib/types';
import { weightHistory } from '../lib/weight';
import { text, type TextKey } from '../lib/i18n';

const shortDate=(day:string)=>`${+day.slice(5,7)}/${+day.slice(8)}`;
export function WeightTracker({records,day,lang,onEdit,range:externalRange,onRange}:{records:WeightRecord[];day:string;lang:Language;onEdit:(record?:WeightRecord)=>void;range?:number;onRange?:(range:number)=>void}) {
  const [localRange,setLocalRange]=useState(30);
  const range=externalRange??localRange, setRange=onRange??setLocalRange;
  const t=(key:TextKey)=>text(lang,key);
  const {selected,previous,rows,start}=weightHistory(records,day,range);
  const difference=selected&&previous?selected.grams-previous.grams:null;
  const min=rows.length?Math.max(0,Math.floor((Math.min(...rows.map(r=>r.grams))-100)/100)*100):0;
  const max=rows.length?Math.ceil((Math.max(...rows.map(r=>r.grams))+100)/100)*100:100;
  const x=(key:string)=>44+(+new Date(`${key}T12:00+09:00`)-+new Date(`${start}T12:00+09:00`))/86400000/(range-1)*292;
  const y=(grams:number)=>166-(grams-min)/(max-min)*130;
  const editLabel=(r:WeightRecord)=>`${r.day} ${r.grams} g · ${t('editWeight')}`;
  return <article className="card weight-tracker"><div className="card-head"><h2><Scale size={20}/>{t('weightTitle')}</h2><button className="subtle-button weight-add" onClick={()=>onEdit(selected??undefined)}>{selected?<Pencil size={16}/>:<Plus size={16}/>} {t(selected?'editWeight':'addWeight')}</button></div><div className="weight-layout"><div className="weight-current"><span>{day} · {t('measurementDay')}</span>{selected?<><strong data-testid="weight-current">{selected.grams.toLocaleString()}<small>g</small></strong><span>{(selected.grams/1000).toFixed(3)} kg</span><p className="weight-difference">{difference===null?t('weightNoPrevious'):`${difference>0?'+':''}${difference} g · ${t('weightPrevious').replace('{day}',previous!.day)}`}</p>{selected.note&&<p className="weight-note">{selected.note}</p>}</>:<><strong className="weight-unrecorded">—<small>g</small></strong><p>{t('weightEmpty')}</p></>}<p className="weight-guidance">{t('weightDailyHint')}</p></div><section className="weight-history"><div className="weight-chart-head"><h3>{t('weightHistoryTitle')}</h3><div className="range-buttons" aria-label={t('weightHistoryTitle')}>{[7,30,90].map(n=><button key={n} className={range===n?'selected':''} aria-pressed={range===n} onClick={()=>setRange(n)}>{t('weightRange').replace('{range}',String(n))}</button>)}</div></div>{rows.length?<svg viewBox="0 0 360 205" aria-label={t('weightHistoryTitle')}><text x="8" y="18">g</text>{[0,1,2].map(n=>{const grams=min+(max-min)*n/2;return <g key={n}><line x1="44" x2="336" y1={y(grams)} y2={y(grams)} stroke="#e5eadf"/><text x="36" y={y(grams)+4} textAnchor="end">{grams}</text></g>;})}<text x="44" y="191" textAnchor="start">{shortDate(start)}</text><text x="190" y="191" textAnchor="middle">{shortDate(new Date(+new Date(`${start}T12:00+09:00`)+(range-1)/2*86400000).toISOString().slice(0,10))}</text><text x="336" y="191" textAnchor="end">{shortDate(day)}</text>{rows.map(r=><g key={r.id}><circle cx={x(r.day)} cy={y(r.grams)} r={r.day===day?5:4} fill={r.day===day?'#355e47':'#809967'}/><circle className="weight-chart-point" cx={x(r.day)} cy={y(r.grams)} r="12" fill="transparent" role="button" tabIndex={0} aria-label={editLabel(r)} onClick={()=>onEdit(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onEdit(r);}}}><title>{editLabel(r)}</title></circle></g>)}</svg>:<p className="weight-chart-empty">{t('weightChartEmpty')}</p>}<p className="weight-guidance">{t('weightChartNote')}</p></section></div>{rows.length>0&&<details className="weight-records"><summary>{t('weightRecent')} · {rows.length}</summary>{rows.slice().reverse().map(r=><button key={r.id} className="weight-record-row" onClick={()=>onEdit(r)}><time>{r.day}</time><span>{r.note||r.author}</span><strong>{r.grams.toLocaleString()} g</strong><Pencil size={14}/></button>)}</details>}</article>;
}
