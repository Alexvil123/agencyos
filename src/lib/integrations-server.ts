import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {PROVIDERS,hintFor,pickValues,providerSpec,publicIntegration,type Payload,type ProviderKey,type PublicIntegration} from './integrations';
import {openJson,parseMasterKey,sealContext,sealJson} from './integrations-crypto';

// Stored integration credentials (Settings → Integrations). Ciphertext lives in public.integration_credentials, which only the
// server can read. Consumers call credentialValues(): stored credentials win, otherwise the hosting environment variables
// are used, so a setup made with environment variables keeps working until the Owner replaces it in Settings.
function service(){
  if(!process.env.SUPABASE_SECRET_KEY)throw new Error('Server configuration missing');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export const masterKey=()=>parseMasterKey(process.env);
export const masterKeyBase64=()=>masterKey()?.toString('base64')||null;
const missingTable=(error:{code?:string;message?:string}|null)=>Boolean(error&&(error.code==='42P01'||error.code==='PGRST205'||/integration_credentials/.test(error.message||'')&&/does not exist|schema cache/i.test(error.message||'')));

type Stored={payload:Payload;updatedAt:string;hint:string};
export type StoredState={state:'none'}|{state:'unreadable';updatedAt:string}|{state:'ok';stored:Stored};
type Cached=StoredState&{setupRequired?:boolean};
const cache=new Map<string,{expires:number;value:Cached}>();
const cacheKey=(org:string,provider:ProviderKey)=>`${org}:${provider}`;
export function forgetCredentials(org:string,provider:ProviderKey){cache.delete(cacheKey(org,provider));}

export async function readStored(org:string,provider:ProviderKey,fresh=false):Promise<StoredState&{setupRequired?:boolean}>{
  const key=cacheKey(org,provider),hit=cache.get(key);
  if(!fresh&&hit&&hit.expires>Date.now())return hit.value;
  let value:Cached={state:'none'};
  try{
    const {data,error}=await service().from('integration_credentials').select('encrypted,hint,updated_at').eq('organization_id',org).eq('provider',provider).maybeSingle();
    if(error){if(missingTable(error)){value={state:'none',setupRequired:true};cache.set(key,{expires:Date.now()+30000,value});return value;}throw error;}
    if(data){
      const master=masterKey();
      try{if(!master)throw new Error('No encryption key');value={state:'ok',stored:{payload:openJson(data.encrypted as string,master,sealContext(org,provider)),updatedAt:data.updated_at as string,hint:data.hint as string}};}
      catch{console.error(`[integrations] stored ${provider} credentials could not be opened (encryption key changed or removed)`);value={state:'unreadable',updatedAt:data.updated_at as string};}
    }
  }catch(error){
    // A database hiccup must never break a page; the caller falls back to the hosting environment variables.
    console.error('[integrations] could not read stored credentials',error instanceof Error?error.message:'');
    return {state:'none'};
  }
  cache.set(key,{expires:Date.now()+30000,value});return value;
}
/** Values for one provider, keyed like the provider's fields: stored credentials first, then the hosting environment. */
export async function credentialValues(org:string,provider:ProviderKey){
  const spec=providerSpec(provider)!,state=await readStored(org,provider);
  return pickValues(spec,state.state==='ok'?state.stored.payload:null,process.env);
}
export async function saveCredentials(org:string,provider:ProviderKey,payload:Payload,userId:string){
  const master=masterKey();if(!master)throw new Error('Encryption key missing');
  const {error}=await service().from('integration_credentials').upsert({organization_id:org,provider,encrypted:sealJson(payload,master,sealContext(org,provider)),hint:hintFor(provider,payload).slice(0,300),updated_by:userId,updated_at:new Date().toISOString()});
  if(error){if(missingTable(error))throw new Error('Integration storage setup required');throw new Error('Credentials could not be saved');}
  forgetCredentials(org,provider);
}
export async function removeCredentials(org:string,provider:ProviderKey){
  const {error}=await service().from('integration_credentials').delete().eq('organization_id',org).eq('provider',provider);
  if(error)throw new Error('Credentials could not be removed');
  forgetCredentials(org,provider);
}
export async function auditIntegration(org:string,actor:string,action:string,provider:ProviderKey,detail:Record<string,unknown>={}){
  const {error}=await service().from('audit_logs').insert({organization_id:org,actor_id:actor,action,entity_type:'integration',new_value:{provider,...detail}});
  if(error)throw new Error('The change could not be recorded in the audit log, so nothing was changed.');
}

export type Overview={ready:boolean;setupRequired:boolean;items:(PublicIntegration&{unreadable:boolean})[]};
/** serverFiles: integrations that are configured in a server-side file (local setups) and so are active although nothing is stored here. */
export async function integrationOverview(org:string,serverFiles:Partial<Record<ProviderKey,string>>={}):Promise<Overview>{
  let setupRequired=false;
  const items=await Promise.all(PROVIDERS.map(async spec=>{
    const state=await readStored(org,spec.key,true);
    if(state.setupRequired)setupRequired=true;
    if(state.state==='ok')return {...publicIntegration(spec,'stored',state.stored.payload,state.stored.updatedAt,state.stored.hint),unreadable:false};
    const picked=pickValues(spec,null,process.env);
    if(picked.source==='env'){const payload=Object.fromEntries(Object.entries(picked.values).filter(([,v])=>v)) as Payload;return {...publicIntegration(spec,'env',payload,null),unreadable:state.state==='unreadable'};}
    if(serverFiles[spec.key])return {...publicIntegration(spec,'file',null,null,serverFiles[spec.key]),unreadable:state.state==='unreadable'};
    return {...publicIntegration(spec,'none',null,state.state==='unreadable'?state.updatedAt:null),unreadable:state.state==='unreadable'};
  }));
  return {ready:masterKey()!==null,setupRequired,items};
}
