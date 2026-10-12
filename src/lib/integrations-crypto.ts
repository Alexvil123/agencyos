import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {Payload,ProviderKey} from './integrations';
// Server-only: kept apart from integrations.ts because that module is also used by the browser bundle, which has no node:crypto.
// ---------- encryption ----------
/** The master key comes from the hosting settings. INTEGRATION_ENCRYPTION_KEY is preferred; the Jira key is reused so an existing setup needs nothing new. */
export function parseMasterKey(env:Record<string,string|undefined>):Buffer|null{
  for(const name of ['INTEGRATION_ENCRYPTION_KEY','JIRA_OAUTH_ENCRYPTION_KEY']){
    const raw=env[name]?.trim();if(!raw)continue;
    try{const key=Buffer.from(raw,'base64');if(key.length===32)return key;}catch{/* try the next name */}
  }
  return null;
}
export function sealJson(value:Payload,key:Buffer,aad:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
  return Buffer.concat([iv,cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
export function openJson(sealed:string,key:Buffer,aad:string):Payload{
  const packed=Buffer.from(sealed,'base64');if(packed.length<29)throw new Error('Invalid sealed value');
  const decipher=createDecipheriv('aes-256-gcm',key,packed.subarray(0,12));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(packed.subarray(-16));
  const parsed=JSON.parse(Buffer.concat([decipher.update(packed.subarray(12,-16)),decipher.final()]).toString('utf8')) as unknown;
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid sealed value');
  return Object.fromEntries(Object.entries(parsed as Record<string,unknown>).filter(([,v])=>typeof v==='string')) as Payload;
}
export const sealContext=(organizationId:string,provider:ProviderKey)=>`integration:${organizationId}:${provider}`;
