import type { AppState, RecordItem, WeightRecord } from './types';
import { dayKey, shiftDay } from './model.ts';
import { validateWeight } from './weight.ts';
import { normalizeWakeAt } from './record-wake.ts';

export class PreviewError extends Error {
  code:string;
  status:number;
  constructor(code:string,status=400){super(code);this.code=code;this.status=status;}
}
function integer(value:unknown,min:number,max:number){
  if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new PreviewError('INVALID_INPUT');
  return value;
}
function note(value:unknown){
  if(typeof value!=='string'||value.length>200)throw new PreviewError('INVALID_INPUT');
  return value.trim();
}
function recordInput(value:Record<string,unknown>):Pick<RecordItem,'kind'|'at'|'ml'|'left'|'right'|'milkType'|'note'|'wakeAt'>{
  const kind=value.kind as RecordItem['kind'];
  if(!['milk','breast','pee','poop','both'].includes(kind))throw new PreviewError('INVALID_INPUT');
  const date=typeof value.at==='string'?new Date(value.at):new Date(NaN);
  if(!Number.isFinite(+date)||+date>Date.now()+60000)throw new PreviewError('INVALID_TIME');
  const ml=kind==='milk'?integer(value.ml,1,1000):0;
  const left=kind==='breast'?integer(value.left,0,180):0,right=kind==='breast'?integer(value.right,0,180):0;
  if(kind==='breast'&&left+right===0)throw new PreviewError('INVALID_DURATION');
  let wakeAt;
  try{wakeAt=normalizeWakeAt(kind,date.toISOString(),value.wakeAt);}catch{throw new PreviewError('INVALID_WAKE_TIME');}
  return {kind,at:date.toISOString(),ml,left,right,milkType:value.milkType==='expressed'?'expressed':'formula',note:note(value.note??''),wakeAt};
}

// The sample session is browser memory only. No storage, cookies or server writes.
export function createPreviewSession(now=new Date()){
  const today=dayKey(now),records:RecordItem[]=[],weights:WeightRecord[]=[];
  for(let offset=-13;offset<=0;offset++){
    const day=shiftDay(today,offset);
    for(const [hour,ml] of [[1,100],[5,120],[9,130],[13,140],[17,120],[21,130]]){
      const at=new Date(`${day}T${String(hour).padStart(2,'0')}:00:00+09:00`);
      if(+at>+now)continue;
      records.push({id:crypto.randomUUID(),kind:'milk',at:at.toISOString(),ml:ml+(offset%3)*10,left:0,right:0,milkType:hour===9?'expressed':'formula',note:'',wakeAt:null,version:1,author:'サンプル',updatedAt:+now});
      if(hour===5||hour===13||hour===21)records.push({id:crypto.randomUUID(),kind:hour===13?'both':'pee',at:new Date(+at+60000).toISOString(),ml:0,left:0,right:0,milkType:'formula',note:'',version:1,author:'サンプル',updatedAt:+now});
    }
    if(offset<0)weights.push({id:crypto.randomUUID(),day,grams:4200+(offset+13)*25,note:'朝の測定',version:1,author:'サンプル',updatedAt:+now});
  }
  const state:AppState={family:{id:'sample-family',name:'サンプルの家族',babyName:'はるちゃん',birthday:shiftDay(today,-60),goalLow:null,goalHigh:null,version:1},user:{id:'sample-user',username:'sample',displayName:'サンプル',familyId:'sample-family'},records,weights,serverTime:+now};
  return {
    request(path:string,method='GET',value?:unknown):unknown{
      if(path==='state'&&method==='GET'){state.serverTime=Date.now();return structuredClone(state);}
      if(path==='logout'&&method==='POST')return {ok:true};
      if(!value||typeof value!=='object'||Array.isArray(value))throw new PreviewError('INVALID_INPUT');
      const body=value as Record<string,unknown>;
      if(path==='profile'&&method==='PATCH'){
        if(body.version!==state.family.version)throw new PreviewError('CONFLICT',409);
        if(typeof body.babyName!=='string'||!body.babyName.trim()||body.babyName.length>40)throw new PreviewError('INVALID_INPUT');
        const birthday=body.birthday;
        if(typeof birthday!=='string')throw new PreviewError('INVALID_TIME');
        if(birthday){try{validateWeight({day:birthday,grams:1});}catch{throw new PreviewError('INVALID_TIME');}}
        state.family={...state.family,babyName:body.babyName.trim(),birthday,version:state.family.version+1};return {ok:true};
      }
      const collection=path.split('/')[0],id=path.split('/')[1];
      if(!['records','weights'].includes(collection))throw new PreviewError('FORBIDDEN',403);
      const rows:Array<RecordItem|WeightRecord>=collection==='records'?state.records:state.weights;
      const existing=rows.find(r=>r.id===(id??body.id));
      if(method==='DELETE'||method==='PATCH'){
        if(!id||!existing)throw new PreviewError('NOT_FOUND',404);
        if(existing.version!==body.version)throw new PreviewError('CONFLICT',409);
      }
      if(method==='DELETE'){rows.splice(rows.indexOf(existing!),1);return {ok:true};}
      if(method!=='POST'&&method!=='PATCH')throw new PreviewError('FORBIDDEN',403);
      if(typeof (id??body.id)!=='string'||!(/^[a-f0-9-]{36}$/).test(String(id??body.id)))throw new PreviewError('INVALID_INPUT');
      let input:ReturnType<typeof validateWeight>|ReturnType<typeof recordInput>;
      if(collection==='weights'){
        let weight:ReturnType<typeof validateWeight>;
        try{weight=validateWeight(body);}catch(error){throw new PreviewError(error instanceof Error?error.message:'INVALID_INPUT');}
        input=weight;
        if(state.weights.some(w=>w.day===weight.day&&w.id!==(id??body.id)))throw new PreviewError('WEIGHT_DAY_EXISTS',409);
      }else input=recordInput(body);
      if(method==='POST'&&existing){
        if(Object.entries(input).some(([key,val])=>(existing as unknown as Record<string,unknown>)[key]!==val))throw new PreviewError('CONFLICT',409);
        return {ok:true,id:existing.id};
      }
      const next={...input,id:String(id??body.id),author:'サンプル',updatedAt:Date.now(),version:existing?existing.version+1:1};
      if(existing)Object.assign(existing,next);
      else if(collection==='records')state.records.push(next as RecordItem);
      else state.weights.push(next as WeightRecord);
      return {ok:true,id:next.id};
    }
  };
}
