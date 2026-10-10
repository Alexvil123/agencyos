'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {ACCOUNT_KINDS,PROVIDERS,changeAccount,keepLabels,mergeSubmitted,pickValues,providerSpec,validateProvider,type Payload,type ProviderKey} from '@/lib/integrations';
import {verifyProvider} from '@/lib/integration-verify';
import {auditIntegration,integrationOverview,masterKey,readStored,removeCredentials,saveCredentials,type Overview} from '@/lib/integrations-server';
import {readSalesGrid,salesConfig,serviceAccount} from '@/lib/sales-server';
import {oauthApp} from '@/lib/jira-oauth-server';

// Settings → Integrations. Owner only. Secrets are encrypted before they are stored and are never sent back to the browser.
export type IntegrationResult={ok:boolean;message:string;overview?:Overview};
async function owner(){
  const ctx=await workspaceContext();
  if(ctx.preview||ctx.kind!=='employee'||!ctx.roles.includes('Owner'))throw new Error('Only the Owner can manage integrations.');
  return ctx;
}
// Google Sheets and Jira may already be configured in a server-side setup (environment variables or a local server file); those count as active.
async function overviewFor(org:string):Promise<Overview>{
  const serverFiles:Partial<Record<ProviderKey,string>>={};
  try{const sales=await salesConfig(org);if(sales)serverFiles.google_sheets='Service account '+sales.email;}catch{/* an invalid server file is reported where it is used */}
  try{const jira=await oauthApp(org);if(jira)serverFiles.jira_oauth_app='Client ID '+jira.clientId.slice(0,6)+'…';}catch{/* ignored */}
  return integrationOverview(org,serverFiles);
}
const providerInput=z.object({provider:z.enum(PROVIDERS.map(p=>p.key) as [ProviderKey,...ProviderKey[]])});
const text=(error:unknown,fallback:string)=>error instanceof z.ZodError?'Choose a valid integration.':error instanceof Error&&!/^(Failed|Credentials could not|Integration storage|Server configuration)/.test(error.message)&&error.message.length<260?error.message:fallback;

export async function loadIntegrations():Promise<IntegrationResult>{
  try{const ctx=await owner();return {ok:true,message:'',overview:await overviewFor(ctx.organizationId)};}
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
    const normalized=keepLabels(provider,state.state==='ok'?state.stored.payload:null,validateProvider(provider,mergeSubmitted(spec,base,submitted)));
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
    return {ok:true,message:`${spec.title} saved and active. ${verified}`,overview:await overviewFor(ctx.organizationId)};
  }catch(error){return {ok:false,message:text(error,'The integration could not be saved. Check the values and try again.')};}
}
export async function removeIntegration(form:FormData):Promise<IntegrationResult>{
  try{
    const ctx=await owner(),{provider}=providerInput.parse({provider:form.get('provider')}),spec=providerSpec(provider)!;
    const state=await readStored(ctx.organizationId,provider,true);
    if(state.state==='none')return {ok:false,message:state.setupRequired?'The integration storage setup has not been applied yet.':'Nothing is stored for this integration.'};
    await auditIntegration(ctx.organizationId,ctx.userId,'integration_removed',provider);
    await removeCredentials(ctx.organizationId,provider);
    const overview=await overviewFor(ctx.organizationId),item=overview.items.find(i=>i.provider===provider);
    return {ok:true,message:item?.source==='env'?`${spec.title} removed. The hosting settings are used again.`:`${spec.title} removed. It is switched off.`,overview};
  }catch(error){return {ok:false,message:text(error,'The integration could not be removed.')};}
}

// One account (Page / channel / ad account) at a time, so a client that leaves can be removed without touching the rest.
const accountInput=providerInput.extend({field:z.string().min(1).max(40),id:z.string().min(1).max(200),label:z.string().max(120).optional()});
async function changeAccounts(form:FormData,op:'add'|'remove'):Promise<IntegrationResult>{
  try{
    const ctx=await owner(),input=accountInput.parse({provider:form.get('provider'),field:form.get('field'),id:form.get('id'),label:form.get('label')||undefined}),spec=providerSpec(input.provider)!;
    if(!masterKey())return {ok:false,message:'Add one encryption key in the hosting settings first (INTEGRATION_ENCRYPTION_KEY). See docs/INTEGRATIONS.md.'};
    const state=await readStored(ctx.organizationId,input.provider,true);
    if(state.setupRequired)return {ok:false,message:'The integration storage setup has not been applied yet. Apply supabase/migrations/202610100030_integration_credentials.sql in Supabase, then try again.'};
    const envValues=Object.fromEntries(Object.entries(pickValues(spec,null,process.env).values).filter(([,v])=>v)) as Payload;
    const base=state.state==='ok'?state.stored.payload:envValues;
    if(!Object.keys(base).length)return {ok:false,message:'Save the credentials for this integration first, then add accounts.'};
    const kind=ACCOUNT_KINDS[input.provider]?.find(k=>k.field===input.field);if(!kind)return {ok:false,message:'This integration has no accounts to change.'};
    const total=ACCOUNT_KINDS[input.provider]!.reduce((n,k)=>n+(base[k.field]||'').split(',').filter(Boolean).length,0);
    if(op==='remove'&&total<=1)return {ok:false,message:'This is the last account. Use Remove on the integration to switch it off completely.'};
    const changed=changeAccount(input.provider,base,{op,field:input.field,id:op==='add'?input.id:input.id.trim(),label:input.label});
    const normalized=validateProvider(input.provider,changed),withLabels=changed.labels?{...normalized,labels:changed.labels}:normalized;
    let note='';
    if(op==='add'){
      // Check just the new account, so a wrong ID is rejected instead of hiding among the working ones.
      const id=kind.normalize(input.id.trim()),probe:Payload={...withLabels};for(const k of ACCOUNT_KINDS[input.provider]!)probe[k.field]=k.field===input.field?id:'';
      const result=await verifyProvider(input.provider,probe);if(!result.ok)return {ok:false,message:result.message};note=' '+result.message;
    }
    await auditIntegration(ctx.organizationId,ctx.userId,op==='add'?'integration_account_added':'integration_account_removed',input.provider,{account:input.id.slice(0,60)});
    await saveCredentials(ctx.organizationId,input.provider,withLabels,ctx.userId);
    return {ok:true,message:(op==='add'?'Added the '+kind.noun+'.':'Removed the '+kind.noun+'.')+note,overview:await overviewFor(ctx.organizationId)};
  }catch(error){return {ok:false,message:text(error,'The account could not be changed. Check the ID and try again.')};}
}
export async function addIntegrationAccount(form:FormData):Promise<IntegrationResult>{return changeAccounts(form,'add');}
export async function removeIntegrationAccount(form:FormData):Promise<IntegrationResult>{return changeAccounts(form,'remove');}
