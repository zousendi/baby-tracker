import { createPreviewSession, PreviewError } from './preview';
import type { AppState } from './types';
let preview:ReturnType<typeof createPreviewSession>|null=null;
export function beginPreview():AppState{preview=createPreviewSession();return preview.request('state') as AppState;}
export function endPreview(){preview=null;}
export class RequestError extends Error { constructor(public code: string, public status: number) { super(code); } }
export async function api<T = Record<string, unknown>>(path: string, method = 'GET', value?: unknown, adminKey?: string): Promise<T> {
  if(preview){
    try{return preview.request(path,method,value) as T;}
    catch(error){if(error instanceof PreviewError)throw new RequestError(error.code,error.status);throw error;}
  }
  let response: Response;
  try { response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-App-Request': 'komorebi', ...(adminKey ? { Authorization: `Bearer ${adminKey}` } : {}) }, ...(value !== undefined ? { body: JSON.stringify(value) } : {}) }); }
  catch { throw new RequestError('requestFailed', 0); }
  let payload;
  try { payload = await response.json(); } catch { throw new RequestError('SERVICE_UNAVAILABLE', response.status); }
  if (!response.ok) throw new RequestError((payload as {error?:string})?.error || 'requestFailed', response.status);
  return payload as T;
}
