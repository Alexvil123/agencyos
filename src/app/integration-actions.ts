'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {PROVIDERS,mergeSubmitted,pickValues,providerSpec,validateProvider,type Payload,type ProviderKey} from '@/lib/integrations';
import {verifyProvider} from '@/lib/integration-verify';
import {auditIntegration,integrationOverview,masterKey,readStored,removeCredentials,saveCredentials,type Overview} from '@/lib/integrations-server';
import {readSalesGrid,serviceAccount} from '@/lib/sales-server';

// Settings → Integrations. Owner only. Secrets are encrypted before they are stored and are never sent back to the browser.
export type IntegrationResult={ok:boolean;message:string;overview?:Overview};
async function owner(){
  const ctx=await workspaceContext();
  if(ctx.preview||ctx.kind!=='employee'||!ctx.roles.includes('Owner'))throw new Error('Only the Owner can manage integrations.');
  return ctx;
}
const providerInput=z.object({provider:z.enum(PROVIDERS.map(p=>p.key) as [ProviderKey,...ProviderKey[]])});
const text=(error:unknown,fallback:string)=>error instanceof z.ZodError?'Choose a valid integration.':error instanceof Error&&!/^(Failed|Credentials could not|Integration storage|Server configuration)/.test(error.message)&&error.message.length<260?error.message:fallback;

export async function loadIntegrations():Promise<IntegrationResult>{
  try{const ctx=await owner();return {ok:true,message:'',overview:await integrationOverview(ctx.organizationId)};}
  catch(error){return {ok:false,message:text(error,'Integrations could not be loaded. Check your connection and retry.')};}
}
export async function saveIntegration(form:FormData):Promise<IntegrationResult>{
  try{
    const ctx=await owner(),{provider}=providerInput.parse({provider:form.get('provider')}),spec=providerSpec(provider)!;
    if(!masterKey())return {ok:false,message:'Add one encryption key in the hosting settings first (INTEGRATION_ENCRYPTION_KEY, a random 32-byte base64 value), then save again. See docs/INTEGRATIONS.md.'};
    const submitted:Payload={};for(const field of spec.fields){const value=form.get(field.key);if(typeof value==='string')submitted[field.key]=value;}
    const state=await readStored(ctx.organizationId,provider,true);
    if(state.setupRequired)return {ok:false,message:'The integration storage setup has not been applied yet. Apply supabase/migrations/202610100030_integration_credentials.sql in Supabase, then try again.'};
    const envValues=Object.fromEntries(Object.entries(pickValues(spec,null,process.env).values).filter(([,v])=>v)) as Payload;
    const base=state.state==='ok'?state.stored.payload:envValues;
    const normalized=validateProvider(provider,mergeSubmitted(spec,base,submitted));
    let verified:string;
    if(provider==='google_sheets'){
      const config=serviceAccount(JSON.parse(normalized.service_account_json),ctx.organizationId);
      await readSalesGrid(config,'Tracksheet',true);verified='The spreadsheet was read successfully.';
    }else{
      const result=await verifyProvider(provider,normalized);
      if(!result.ok)return {ok:false,message:result.message};
      verified=result.message;
    }
    await auditIntegration(ctx.organizationId,ctx.userId,'integration_saved',provider);
    await saveCredentials(ctx.organizationId,provider,normalized,ctx.userId);
    return {ok:true,message:`${spec.title} saved and active. ${verified}`,overview:await integrationOverview(ctx.organizationId)};
  }catch(error){return {ok:false,message:text(error,'The integration could not be saved. Check the values and try again.')};}
}
export async function removeIntegration(form:FormData):Promise<IntegrationResult>{
  try{
    const ctx=await owner(),{provider}=providerInput.parse({provider:form.get('provider')}),spec=providerSpec(provider)!;
    const state=await readStored(ctx.organizationId,provider,true);
    if(state.state==='none')return {ok:false,message:state.setupRequired?'The integration storage setup has not been applied yet.':'Nothing is stored for this integration.'};
    await auditIntegration(ctx.organizationId,ctx.userId,'integration_removed',provider);
    await removeCredentials(ctx.organizationId,provider);
    const overview=await integrationOverview(ctx.organizationId),item=overview.items.find(i=>i.provider===provider);
    return {ok:true,message:item?.source==='env'?`${spec.title} removed. The hosting settings are used again.`:`${spec.title} removed. It is switched off.`,overview};
  }catch(error){return {ok:false,message:text(error,'The integration could not be removed.')};}
}
