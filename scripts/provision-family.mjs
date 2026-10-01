// Reads {name, users:[{username,displayName,password}]} from stdin. Never logs passwords.
import { readFileSync } from 'node:fs';
const base = process.env.APP_URL || 'http://127.0.0.1:5174';
const url = new URL(base);
const local = ['127.0.0.1','localhost'].includes(url.hostname);
if (!local && url.protocol !== 'https:') throw new Error('Hosted provisioning requires HTTPS.');
let key = process.env.ADMIN_KEY;
if (!key && local) key = readFileSync('.dev.vars','utf8').match(/^ADMIN_KEY=(.+)$/m)?.[1];
if (!key) throw new Error('Set ADMIN_KEY for the target site.');
const input = JSON.parse(readFileSync(0,'utf8').replace(/^\uFEFF/,''));
if (!input.name || !Array.isArray(input.users)) throw new Error('Expected a family name and users.');
async function call(path, method='GET', body) {
  const response = await fetch(new URL(`/api/admin/${path}`,base),{method,headers:{'Content-Type':'application/json','X-App-Request':'komorebi',Authorization:`Bearer ${key}`},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json(); if(!response.ok) throw new Error(`Provisioning failed: ${data.error}`); return data;
}
const directory=await call('directory');
const family=directory.families.find(f=>f.name===input.name) || await call('families','POST',{name:input.name});
for(const user of input.users){
  const existing=directory.users.find(u=>u.username===String(user.username).toLowerCase());
  if(existing){if(existing.familyId!==family.id)throw new Error('An account belongs to another family; refusing to move it.');console.log(`Existing account retained: ${user.username}`);continue;}
  await call('users','POST',{...user,familyId:family.id}); console.log(`Created account: ${user.username}`);
}
console.log(`Family ready: ${input.name}`);
