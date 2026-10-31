'use client';
import { useEffect, useRef, useState } from 'react';
import { Leaf } from 'lucide-react';
import type { Language } from '../lib/types';
import { currentRelease, releaseStorageKey } from '../lib/release-notes.mjs';

const dismissedThisPage = new Set<string>();
export function ReleaseNotes({lang,preview=false,manualOpen=false,onClose}:{lang:Language;preview?:boolean;manualOpen?:boolean;onClose:()=>void}){
  const [automaticOpen,setAutomaticOpen]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),content=currentRelease[lang],key=releaseStorageKey();
  useEffect(()=>{
    if(preview)return;
    let seen=dismissedThisPage.has(key);
    try{seen=seen||localStorage.getItem(key)==='1';}catch{/* Storage restrictions never block the app. */}
    setAutomaticOpen(!seen);
    const sync=(event:StorageEvent)=>{if(event.key===key&&event.newValue==='1'){dismissedThisPage.add(key);setAutomaticOpen(false);}};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[key,preview]);
  const visible=manualOpen||(!preview&&automaticOpen);
  useEffect(()=>{
    if(!visible)return;
    const element=dialog.current;element?.showModal();return()=>element?.close();
  },[visible]);
  function acknowledge(){
    if(!preview){dismissedThisPage.add(key);try{localStorage.setItem(key,'1');}catch{}}
    setAutomaticOpen(false);onClose();
  }
  if(!visible)return null;
  return <dialog ref={dialog} className="editor-dialog release-notes-dialog" aria-labelledby="release-title" aria-describedby="release-intro" onCancel={event=>{event.preventDefault();acknowledge();}}>
    <header className="dialog-head"><div><span className="release-brand"><Leaf size={19}/>こもれび</span><h2 id="release-title">{content.title}</h2></div></header>
    <div className="dialog-body"><p id="release-intro" className="muted">{content.intro}</p><ul className="release-list">{content.items.map(([title,body])=><li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ul></div>
    <footer className="dialog-footer"><button type="button" className="primary-button" autoFocus onClick={acknowledge}>{content.confirm}</button></footer>
  </dialog>;
}
