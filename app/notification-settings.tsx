'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { Language } from '../lib/types';
import { api, RequestError } from '../lib/client';

type Status={configured:boolean;remindersConfigured:boolean;publicKey:string|null;subscriptions:{id:string;familyEvents:number;reminderMinutes:number}[]};
async function endpointId(endpoint:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))),n=>n.toString(16).padStart(2,'0')).join('');}
function applicationKey(key:string){const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export function NotificationSettings({lang,preview}:{lang:Language;preview:boolean}){
  const zh=lang==='zh',tr=(ja:string,cn:string)=>zh?cn:ja;
  const [status,setStatus]=useState<Status|null>(null),[supported,setSupported]=useState(false);
  const [family,setFamily]=useState(true),[reminder,setReminder]=useState(false),[minutes,setMinutes]=useState(180);
  const [id,setId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{
    let alive=true;
    const support='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window&&window.isSecureContext;
    setSupported(support);
    if(preview)return;
    async function load(){
      try{
        const next=await api<Status>('notifications');
        const registration=support?await navigator.serviceWorker.getRegistration('/'):undefined;
        const sub=await registration?.pushManager.getSubscription();
        const key=sub?await endpointId(sub.endpoint):'';
        if(!alive)return;
        setStatus(next);
        const saved=next.subscriptions.find(row=>row.id===key);
        if(saved){setId(saved.id);setFamily(Boolean(saved.familyEvents));setReminder(saved.reminderMinutes>0);if(saved.reminderMinutes)setMinutes(saved.reminderMinutes);}
      }catch{if(alive){setFailed(true);setMessage(tr('通知設定を取得できません。ページを更新して再試行してください。','无法获取通知设置，请刷新页面重试。'));}}
    }
    void load();return()=>{alive=false;};
  // The device preferences are loaded once when entering settings.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[preview]);
  function errorMessage(error:unknown){
    if(error instanceof RequestError&&error.status===401)return tr('もう一度ログインしてください。','请重新登录。');
    if('Notification' in window&&Notification.permission==='denied')return tr('通知が拒否されています。端末の通知設定で許可してください。','通知权限已拒绝，请在设备的通知设置中允许。');
    return tr('通知を設定できませんでした。接続と権限を確認して再試行してください。','通知设置失败，请检查网络和权限后重试。');
  }
  async function save(){
    if(lock.current||!supported||!status?.configured||!status.publicKey)return;
    lock.current=true;setBusy(true);setFailed(false);setMessage('');
    try{
      // Permission must be requested directly from the user's click on iOS.
      const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(permission!=='granted')throw new Error('PERMISSION');
      const registration=await navigator.serviceWorker.register('/notifications-sw.js',{scope:'/',updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      let sub=await registration.pushManager.getSubscription();
      if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(status.publicKey)});
      await api('notifications','POST',{subscription:sub.toJSON(),familyEvents:family,reminderMinutes:reminder?minutes:0,language:lang});
      setId(await endpointId(sub.endpoint));
      setMessage(tr('この端末の通知設定を保存しました。','已保存此设备的通知设置。'));
    }catch(error){setFailed(true);setMessage(errorMessage(error));}
    finally{lock.current=false;setBusy(false);}
  }
  async function disable(){
    if(lock.current||!id)return;lock.current=true;setBusy(true);setMessage('');setFailed(false);
    try{
      // Remove server permission first. A failed browser unsubscribe cannot keep sending.
      await api('notifications','DELETE',{id});
      setId('');
      const registration=await navigator.serviceWorker.getRegistration('/');
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      setMessage(tr('この端末の通知を停止しました。','已关闭此设备的通知。'));
    }catch(error){setFailed(true);setMessage(errorMessage(error));}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className="card notification-settings" aria-labelledby="notification-heading">
    <h2 id="notification-heading"><Bell size={20}/>{tr('通知とリマインダー','通知与提醒')}</h2>
    <p className="muted small">{tr('ほかの端末で追加した記録を通知。同じアカウントでも受信できます。通知には時刻・種類・量を表示し、メモは含めません。','接收其他设备新增的记录，同一账号也可接收。通知显示时间、类型和数值，不包含备注。')}</p>
    {preview?<p className="muted">{tr('サンプルでは通知を送信しません。','示例模式不发送通知。')}</p>:<>
      {!supported&&<p className="muted">{tr('iPhoneではホーム画面に追加したアプリから開いてください（iOS 16.4以降）。対応ブラウザと通知の許可が必要です。','iPhone 请从添加到主屏幕的 App 打开（iOS 16.4 以上），需浏览器支持并允许通知。')}</p>}
      {status&&!status.configured&&<p className="muted">{tr('通知の準備中です。サーバー設定が完了すると有効にできます。','通知尚未配置完成，服务器准备好后即可开启。')}</p>}
      <fieldset disabled={busy||!supported||!status?.configured}>
        <label className="checkbox-label"><input type="checkbox" checked={family} onChange={e=>setFamily(e.target.checked)}/>{tr('ほかの端末で記録を追加したら通知','其他设备新增记录时通知')}</label>
        <label className="checkbox-label"><input type="checkbox" checked={reminder} disabled={!status?.remindersConfigured} onChange={e=>setReminder(e.target.checked)}/>{tr('最後の授乳からのリマインダー','距上次喂奶的定时提醒')}</label>
        {status?.configured&&!status.remindersConfigured&&<p className="muted small">{tr('定時リマインダーはサーバーの定期実行設定後に利用できます。','定时提醒需服务器后台调度配置完成后才能开启。')}</p>}
        {reminder&&<label className="reminder-interval">{tr('授乳後の経過時間','距喂奶时间')}<select aria-label={tr('リマインダーの間隔','提醒间隔')} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[60,90,120,150,180,210,240,300,360].map(n=><option key={n} value={n}>{n/60}{tr('時間','小时')}</option>)}</select></label>}
        <button type="button" className="subtle-button" disabled={!family&&!reminder} onClick={()=>void save()}>{busy?tr('保存中…','保存中…'):id?tr('通知設定を保存','保存通知设置'):tr('この端末の通知を有効にする','开启此设备通知')}</button>
      </fieldset>
      {id&&<button type="button" className="text-button" disabled={busy} onClick={()=>void disable()}>{tr('この端末の通知を停止','关闭此设备通知')}</button>}
      <p className="muted small">{tr('授乳を促す医療上の判断ではなく、設定した時間の確認用です。通知は遅延することがあります。ログアウト・ログイン期限切れ後は再設定してください。','提醒仅用于确认您设置的时间，不作喂养判断。通知可能延迟，退出或登录过期后需重新设置。')}</p>
    </>}
    {message&&<p className={failed?'error-box':'success-box'} role={failed?'alert':'status'}>{message}</p>}
  </section>;
}
