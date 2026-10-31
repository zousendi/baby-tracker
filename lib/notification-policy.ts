export function allowedPushEndpoint(value: unknown): value is string {
  if(typeof value!=='string'||value.length>2048)return false;
  try {
    const u=new URL(value),host=u.hostname;
    return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash&&(
      host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||
      host==='push.services.mozilla.com'||host.endsWith('.push.apple.com')||
      host.endsWith('.notify.windows.com')||host==='wns.windows.com');
  }catch{return false;}
}
export function validPushKeys(keys:unknown):keys is {p256dh:string;auth:string}{
  if(!keys||typeof keys!=='object')return false;
  const k=keys as Record<string,unknown>;
  return typeof k.p256dh==='string'&&/^[A-Za-z0-9_-]{87}$/.test(k.p256dh)&&
    typeof k.auth==='string'&&/^[A-Za-z0-9_-]{22}$/.test(k.auth);
}
export function reminderDue(at:string,minutes:number,now:number){
  const due=Date.parse(at)+minutes*60000;
  return minutes>=30&&minutes<=720&&Number.isFinite(due)&&now>=due&&now-due<30*60000;
}
export function notificationCopy(kind:string,language:string){
  const zh=language==='zh';
  return {title:'こもれび',body:kind==='reminder'
    ?zh?'已到您设置的喂奶提醒时间，请查看最新记录。':'設定した授乳の確認時間です。最新の記録をご確認ください。'
    :zh?'家人添加了一条育儿记录。':'家族が育児記録を追加しました。'};
}
