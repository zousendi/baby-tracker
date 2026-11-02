'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X, Minus, Plus, Download, LogOut } from 'lucide-react';
import type { Family, Kind, Language, RecordItem, WeightRecord } from '../lib/types';
import { text, errorText } from '../lib/i18n';
import { api, RequestError } from '../lib/client';
import { dayKey, localInput } from '../lib/model';

function Modal({title,children,onClose,busy}: {title:string;children:React.ReactNode;onClose:()=>void;busy:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();};},[]);
  useEffect(()=>{
    const viewport=window.visualViewport,dialog=ref.current;
    if(!viewport||!dialog)return;
    let frame=0;
    const update=()=>{
      dialog.style.setProperty('--editor-viewport-height',`${viewport.height}px`);
      dialog.style.setProperty('--editor-viewport-top',`${viewport.offsetTop}px`);
      const keyboard=window.innerHeight-viewport.height>120&&viewport.scale===1;
      dialog.dataset.keyboardOpen=String(keyboard);
      cancelAnimationFrame(frame);
      if(keyboard)frame=requestAnimationFrame(()=>{
        const input=document.activeElement;
        if(input instanceof HTMLElement&&dialog.contains(input))input.scrollIntoView({block:'nearest'});
      });
    };
    update();viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);
    return()=>{cancelAnimationFrame(frame);viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);};
  },[]);
  return <dialog className="editor-dialog" ref={ref} onInvalidCapture={event=>{const target=event.target;if(target instanceof HTMLElement){const details=target.closest('details');if(details)details.open=true;}}} onCancel={e=>{if(busy)e.preventDefault();}} onClose={onClose} aria-label={title}>{children}</dialog>;
}
export function RecordEditor({lang,kind,record,selectedDay,onClose,onSaved,onReload}:{lang:Language;kind:Kind;record?:RecordItem;selectedDay:string;onClose:()=>void;onSaved:(at?:string,deleted?:boolean)=>Promise<void>;onReload:()=>Promise<void>}) {
  const t=(key:Parameters<typeof text>[1])=>text(lang,key);
  const [draft,setDraft]=useState({id:record?.id||crypto.randomUUID(),kind:record?.kind||kind,at:record?localInput(record.at):selectedDay===dayKey()?localInput():`${selectedDay}T12:00`,ml:record?.ml||120,left:record?.left||0,right:record?.right||0,milkType:record?.milkType||'formula',note:record?.note||'',version:record?.version||1});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const mutationLock=useRef(false);
  const change=(key:string,value:string|number)=>setDraft(d=>({...d,[key]:value}));
  const sleep=draft.kind==='sleep'||draft.kind==='wake';
  const feed=draft.kind==='milk'||draft.kind==='breast';
  async function save(e:React.FormEvent){e.preventDefault();if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');try{const at=new Date(`${draft.at}:00+09:00`).toISOString();await api(record?`records/${record.id}`:'records',record?'PATCH':'POST',{...draft,at});await onSaved(at);}catch(e){setError(e instanceof RequestError?e.code:'INVALID_TIME');}finally{mutationLock.current=false;setBusy(false);}}
  async function remove(){if(mutationLock.current||!confirm(t('deleteConfirm')))return;mutationLock.current=true;setBusy(true);setError('');try{await api(`records/${record!.id}`,'DELETE',{version:draft.version});await onSaved(undefined,true);}catch(e){setError(e instanceof RequestError?e.code:'requestFailed');}finally{mutationLock.current=false;setBusy(false);}}
  const editTitles = {milk:'editMilk',breast:'editBreast',pee:'editPee',poop:'editPoop',both:'editBoth',sleep:'editSleep',wake:'editWake'} as const;
  const title=record?t(editTitles[record.kind]):t(feed?'addFeed':sleep?(draft.kind==='sleep'?'addSleep':'addWake'):'addDiaper');
  const dateTimeField=<div className="field"><div className="field-label"><label htmlFor="record-at">{t('dateTime')} <small>{t('japanTime')}</small></label>{!record&&<button type="button" className="text-button" onClick={()=>change('at',localInput())}>{t('now')}</button>}</div><input id="record-at" type="datetime-local" required value={draft.at} max={localInput()} onChange={e=>change('at',e.target.value)}/></div>;
  const milkTypeField=<div className="field"><label htmlFor="milk-type">{t('kind')}</label><select id="milk-type" value={draft.milkType} onChange={e=>change('milkType',e.target.value)}><option value="formula">{t('milk')}</option><option value="expressed">{t('expressed')}</option></select></div>;
  const noteField=<div className="field"><label htmlFor="record-note">{t('note')} <small>{t('optional')}</small></label><textarea id="record-note" rows={2} maxLength={200} placeholder={t('notePlaceholder')} value={draft.note} onChange={e=>change('note',e.target.value)}/></div>;
  const secondaryFields=<>{draft.kind==='milk'&&milkTypeField}{dateTimeField}{noteField}</>;
  return <Modal title={title} onClose={onClose} busy={busy}><form onSubmit={save}><header className="dialog-head"><div><p className="eyebrow">A LITTLE MOMENT</p><h2>{title}</h2></div><button type="button" className="icon-button" disabled={busy} aria-label={t('close')} onClick={onClose}><X/></button></header><div className="dialog-body">{!record&&<>{feed?<div className="segmented"><button type="button" className={draft.kind==='milk'?'selected':''} aria-pressed={draft.kind==='milk'} onClick={()=>change('kind','milk')}>{t('totalMilk')}</button><button type="button" className={draft.kind==='breast'?'selected':''} aria-pressed={draft.kind==='breast'} onClick={()=>change('kind','breast')}>{t('breast')}</button></div>:!sleep&&<div className="segmented diaper-choice">{(['pee','poop','both'] as const).map(key=><button key={key} type="button" className={draft.kind===key?'selected':''} aria-pressed={draft.kind===key} onClick={()=>change('kind',key)}>{t(key)}</button>)}</div>}</>}
    {draft.kind==='milk'?<><div className="amount-field"><label htmlFor="record-ml">{t('amount')}</label><div className="amount-stepper"><button type="button" aria-label={t('minus')} onClick={()=>change('ml',Math.max(1,draft.ml-10))}><Minus size={21}/></button><div><input id="record-ml" type="number" inputMode="numeric" required min={1} max={1000} step={1} value={draft.ml||''} onChange={e=>change('ml',+e.target.value)}/><span>ml</span></div><button type="button" aria-label={t('plus')} onClick={()=>change('ml',Math.min(1000,draft.ml+10))}><Plus size={21}/></button></div><div className="presets">{[60,80,100,120,140,160].map(n=><button key={n} type="button" className={draft.ml===n?'selected':''} onClick={()=>change('ml',n)}>{n}</button>)}</div><p>{t('presets')}</p></div></>:draft.kind==='breast'?<><div className="two-fields">{(['left','right'] as const).map(key=><div className="field" key={key}><label htmlFor={`${key}-minutes`}>{t(key)}</label><input id={`${key}-minutes`} type="number" inputMode="numeric" min={0} max={180} required value={draft[key]} onChange={e=>change(key,+e.target.value)}/></div>)}</div><p className="muted">{t('directHint')}</p></>:!record&&<p className="diaper-message">{t(sleep?'sleepEditHint':'diaperHint')}</p>}
    {feed?<details className="edit-details"><summary><span>{t(draft.kind==='milk'?'editMilkDetails':'editFeedDetails')}<small>{draft.at.replace('T',' ')}{draft.kind==='milk'&&<> · {t(draft.milkType==='expressed'?'expressed':'milk')}</>}</small>{draft.note&&<small className="edit-note-preview">{draft.note}</small>}</span><ChevronDown size={18} aria-hidden="true"/></summary><div>{secondaryFields}</div></details>:<>{dateTimeField}{noteField}</>}{error&&<div className="error-box" role="alert">{errorText(lang,error)}{['CONFLICT','NOT_FOUND'].includes(error)&&<button type="button" className="text-button" onClick={onReload}>{t('refreshConflict')}</button>}</div>}<p className="muted small">{t('serverSaving')}</p></div><footer className="dialog-footer">{record&&<button type="button" className="danger-button" disabled={busy} onClick={remove}>{t('delete')}</button>}<button className="primary-button" disabled={busy} type="submit"><Check size={18}/>{busy?t('saving'):t(record?'update':'save')}</button></footer></form></Modal>;
}
export function ProfileEditor({lang,family,onClose,onSaved,onExport,onLogout}:{lang:Language;family:Family;onClose:()=>void;onSaved:()=>Promise<void>;onExport:()=>void;onLogout:()=>Promise<void>}) {
  const t=(key:Parameters<typeof text>[1])=>text(lang,key);
  const [openedVersion]=useState(family.version);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const mutationLock=useRef(false);
  async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');const f=new FormData(e.currentTarget);try{await api('profile','PATCH',{babyName:f.get('babyName'),birthday:f.get('birthday'),goalLow:family.goalLow,goalHigh:family.goalHigh,version:openedVersion});await onSaved();}catch(e){setError(e instanceof RequestError?e.code:'requestFailed');}finally{mutationLock.current=false;setBusy(false);}}
  return <Modal title={t('settings')} onClose={onClose} busy={busy}><form onSubmit={save}><header className="dialog-head"><h2>{t('settings')}</h2><button type="button" className="icon-button" disabled={busy} aria-label={t('close')} onClick={onClose}><X/></button></header><div className="dialog-body"><div className="field"><label htmlFor="baby-name">{t('babyName')}</label><input id="baby-name" name="babyName" defaultValue={family.babyName} maxLength={40} required/></div><div className="field"><label htmlFor="birthday">{t('birthday')} <small>{t('optional')}</small></label><input id="birthday" name="birthday" type="date" defaultValue={family.birthday} max={dayKey()}/></div>{error&&<p className="error-box" role="alert">{errorText(lang,error)}</p>}<section className="settings-section"><h3>{t('storageTitle')}</h3><p>{t('storageHint')}</p><button type="button" className="subtle-button" onClick={onExport}><Download size={17}/>{t('export')}</button><button type="button" className="text-button logout-button" disabled={busy} onClick={onLogout}><LogOut size={17}/>{t('logout')}</button></section></div><footer className="dialog-footer"><button className="primary-button" disabled={busy} type="submit">{busy?t('saving'):t('saveSettings')}</button></footer></form></Modal>;
}
export function WeightEditor({lang,record,selectedDay,onClose,onSaved,onReload}:{lang:Language;record?:WeightRecord;selectedDay:string;onClose:()=>void;onSaved:(day?:string,deleted?:boolean)=>Promise<void>;onReload:()=>Promise<void>}) {
  const t=(key:Parameters<typeof text>[1])=>text(lang,key);
  const [draft,setDraft]=useState({id:record?.id||crypto.randomUUID(),day:record?.day||selectedDay,grams:record?String(record.grams):'',note:record?.note||'',version:record?.version||1});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const mutationLock=useRef(false);
  async function save(e:React.FormEvent){
    e.preventDefault();if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');
    try{await api(record?`weights/${record.id}`:'weights',record?'PATCH':'POST',{...draft,grams:Number(draft.grams)});await onSaved(draft.day);}
    catch(e){setError(e instanceof RequestError?e.code:'requestFailed');}finally{mutationLock.current=false;setBusy(false);}
  }
  async function remove(){
    if(!record||mutationLock.current||!confirm(t('deleteWeightConfirm')))return;mutationLock.current=true;setBusy(true);setError('');
    try{await api(`weights/${record.id}`,'DELETE',{version:draft.version});await onSaved(undefined,true);}
    catch(e){setError(e instanceof RequestError?e.code:'requestFailed');}finally{mutationLock.current=false;setBusy(false);}
  }
  return <Modal title={t(record?'editWeight':'addWeight')} onClose={onClose} busy={busy}><form onSubmit={save}><header className="dialog-head"><div><p className="eyebrow">GROWING DAY BY DAY</p><h2>{t(record?'editWeight':'addWeight')}</h2></div><button className="icon-button" type="button" disabled={busy} aria-label={t('close')} onClick={onClose}><X/></button></header><div className="dialog-body"><p className="muted small">{t('weightDailyHint')}</p><div className="field"><label htmlFor="weight-day">{t('measurementDay')} <small>{t('japanTime')}</small></label><input id="weight-day" type="date" required value={draft.day} max={dayKey()} onChange={e=>setDraft(d=>({...d,day:e.target.value}))}/></div><div className="field"><label htmlFor="weight-grams">{t('weight')} / g</label><input id="weight-grams" type="number" inputMode="numeric" required min={1} max={50000} step={1} value={draft.grams} placeholder="3500" onChange={e=>setDraft(d=>({...d,grams:e.target.value}))}/><p className="muted small">{t('weightUnitHint')}</p></div><div className="field"><label htmlFor="weight-note">{t('note')} <small>{t('optional')}</small></label><textarea id="weight-note" rows={2} maxLength={200} value={draft.note} placeholder={t('weightNotePlaceholder')} onChange={e=>setDraft(d=>({...d,note:e.target.value}))}/></div>{error&&<div className="error-box" role="alert">{errorText(lang,error)}{['CONFLICT','NOT_FOUND','WEIGHT_DAY_EXISTS'].includes(error)&&<button type="button" className="text-button" onClick={onReload}>{t('refreshConflict')}</button>}</div>}<p className="muted small">{t('serverSaving')}</p></div><footer className="dialog-footer">{record&&<button type="button" className="danger-button" disabled={busy} onClick={remove}>{t('delete')}</button>}<button type="submit" className="primary-button" disabled={busy}><Check size={18}/>{busy?t('saving'):t(record?'update':'save')}</button></footer></form></Modal>;
}
