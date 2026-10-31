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
export type NotificationRecord={kind:string;at?:string|null;day?:string|null;ml?:number;left?:number;right?:number;milkType?:string|null;grams?:number|null};
export function notificationCopy(kind:string,language:string,record?:NotificationRecord|null){
  const zh=language==='zh';
  if(kind==='family'&&record){
    const names:Record<string,string>=zh
      ?{milk:record.milkType==='expressed'?'瓶喂母乳':'奶粉',breast:'亲喂',pee:'小便',poop:'大便',both:'小便＋大便',sleep:'入睡',wake:'醒来',weight:'体重'}
      :{milk:record.milkType==='expressed'?'搾母乳':'ミルク',breast:'直母',pee:'おしっこ',poop:'うんち',both:'おしっこ＋うんち',sleep:'寝た',wake:'起きた',weight:'体重'};
    const at=record.at?new Date(record.at):null;
    const stamp=at&&Number.isFinite(+at)?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at)
      :record.day&&/^\d{4}-\d{2}-\d{2}$/.test(record.day)?record.day.slice(5).replace('-','/'):'';
    const amount=record.kind==='milk'?`${record.ml} ml`:record.kind==='breast'?`${(record.left||0)+(record.right||0)} ${zh?'分钟':'分'}`:record.kind==='weight'?`${record.grams} g`:'';
    return {title:'こもれび',body:[stamp,names[record.kind]|| (zh?'育儿记录':'育児記録'),amount].filter(Boolean).join(' ')};
  }
  return {title:'こもれび',body:kind==='reminder'
    ?zh?'已到您设置的喂奶提醒时间，请查看最新记录。':'設定した授乳の確認時間です。最新の記録をご確認ください。'
    :zh?'家人添加了一条育儿记录。':'家族が育児記録を追加しました。'};
}
