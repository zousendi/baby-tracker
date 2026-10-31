'use client';
import { useEffect, useState } from 'react';
import { Leaf, Share, PlusSquare, ArrowUpRight } from 'lucide-react';
import type { Language } from '../lib/types';

export function HomeScreenGate({children}:{children:React.ReactNode}){
  const [mode,setMode]=useState<'loading'|'guide'|'app'>('loading'),[lang,setLang]=useState<Language>('ja');
  useEffect(()=>{
    try{if(localStorage.getItem('komorebi-language')==='zh')setLang('zh');}catch{}
    const check=()=>{
      const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      const standalone=(navigator as Navigator&{standalone?:boolean}).standalone===true||window.matchMedia('(display-mode: standalone)').matches;
      setMode(ios&&!standalone?'guide':'app');
    };
    const display=window.matchMedia('(display-mode: standalone)');
    check();window.addEventListener('pageshow',check);window.addEventListener('focus',check);display.addEventListener('change',check);
    return()=>{window.removeEventListener('pageshow',check);window.removeEventListener('focus',check);display.removeEventListener('change',check);};
  },[]);
  useEffect(()=>{if(mode==='guide')document.documentElement.lang=lang==='zh'?'zh-CN':'ja';},[lang,mode]);
  if(mode==='app')return children;
  if(mode==='loading')return <main className="login-page"><div className="loading-card" aria-label="こもれび"><Leaf size={38}/></div></main>;
  const zh=lang==='zh';
  return <main className="login-page home-screen-guide"><article className="login-card">
    <div className="login-top"><span className="brand"><Leaf/>こもれび</span><button type="button" className="subtle-button" onClick={()=>{const next=zh?'ja':'zh';setLang(next);try{localStorage.setItem('komorebi-language',next);}catch{}}}>{zh?'日本語':'中文'}</button></div>
    <img src="/apple-touch-icon.png?v=2" width={80} height={80} alt="" className="install-icon"/>
    <h1>{zh?'添加到主屏幕，开始记录':'ホーム画面に追加して、記録をはじめよう'}</h1>
    <p className="muted">{zh?'在 iPhone／iPad 上，请从主屏幕图标打开こもれび。':'iPhone・iPadでは、ホーム画面のアイコンからこもれびを開いてください。'}</p>
    <ol className="install-steps">
      <li><Share size={21}/><span>{zh?'点击浏览器的“分享”按钮。':'ブラウザの「共有」ボタンをタップ。'}</span></li>
      <li><PlusSquare size={21}/><span>{zh?'选择“添加到主屏幕”，如有“作为 Web App 打开”选项，请保持开启，再点“添加”。':'「ホーム画面に追加」を選択。「Webアプリとして開く」が表示されたらオンにして、「追加」をタップ。'}</span></li>
      <li><ArrowUpRight size={21}/><span>{zh?'回到主屏幕，点击こもれび图标即可使用。':'ホーム画面に戻り、こもれびのアイコンから起動。'}</span></li>
    </ol>
    <p className="muted small">{zh?'找不到添加选项时，请用 Safari 打开本页面。添加后，在主屏幕应用中登录原账号。':'追加の項目が見つからない場合は、Safariでこのページを開いてください。追加後はホーム画面のアプリで、いつものアカウントにログインできます。'}</p>
  </article></main>;
}
