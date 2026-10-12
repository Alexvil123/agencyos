'use client';
import '../app/integrations.css';
import {useCallback,useEffect,useState,useTransition} from 'react';
import {addIntegrationAccount,loadIntegrations,removeIntegration,removeIntegrationAccount,saveIntegration,type IntegrationResult} from '@/app/integration-actions';
import {PROVIDERS} from '@/lib/integrations';
import type {Overview} from '@/lib/integrations-server';
import {IntegrationCard,type IntegrationNote} from './integration-card';

export function IntegrationSettings({owner,preview=false}:{owner:boolean;preview?:boolean}){
  const [overview,setOverview]=useState<Overview>(),[error,setError]=useState(''),[notes,setNotes]=useState<Record<string,IntegrationNote>>({}),[busy,start]=useTransition();
  const apply=useCallback((provider:string|null,result:IntegrationResult)=>{
    if(result.overview)setOverview(result.overview);
    if(provider)setNotes(previous=>({...previous,[provider]:{ok:result.ok,message:result.message}}));else if(!result.ok)setError(result.message);
  },[]);
  useEffect(()=>{if(owner&&!preview)start(async()=>{try{apply(null,await loadIntegrations());}catch{setError('Integrations could not be loaded. Check your connection and retry.');}});},[owner,preview,apply]);
  if(preview)return null;
  if(!owner)return <section className="panel integ"><h2>Integrations</h2><p className="subtle">Only the Owner can set up integrations.</p></section>;
  const act=(provider:string,run:()=>Promise<IntegrationResult>)=>start(async()=>{try{apply(provider,await run());}catch{setNotes(previous=>({...previous,[provider]:{ok:false,message:'The change could not be confirmed. Refresh and check the integration.'}}));}});
  return <section className="panel integ" aria-label="Integrations">
    <div className="panel-title"><div><h2>Integrations</h2><p>Enter the credentials each integration needs and save: it switches on immediately. Secrets are encrypted and never shown again.</p></div></div>
    {error&&<p role="alert" className="form-message error">{error}</p>}
    {overview&&!overview.ready&&<p role="alert" className="notice">One-time setup: add an encryption key to the hosting settings before saving credentials here. Create it with <code>openssl rand -base64 32</code>, store it as <code>INTEGRATION_ENCRYPTION_KEY</code> and redeploy (see docs/INTEGRATIONS.md).</p>}
    {overview?.setupRequired&&<p role="alert" className="notice">The database table for saved credentials is not applied yet. Apply <code>supabase/migrations/202610100030_integration_credentials.sql</code> in Supabase, then refresh.</p>}
    {!overview&&!error&&<div className="integ-grid" role="status" aria-label="Loading integrations">{PROVIDERS.map(spec=><div key={spec.key} className="integ-card integ-skeleton" aria-hidden="true"><span/><span/><span/></div>)}</div>}
    {overview&&<div className="integ-grid">{PROVIDERS.map(spec=>{const item=overview.items.find(i=>i.provider===spec.key);return item?<IntegrationCard key={spec.key} spec={spec} item={item} busy={busy} note={notes[spec.key]} onSave={form=>act(spec.key,()=>saveIntegration(form))} onAddAccount={form=>act(spec.key,()=>addIntegrationAccount(form))} onRemoveAccount={form=>act(spec.key,()=>removeIntegrationAccount(form))} onRemove={provider=>{const form=new FormData();form.set('provider',provider);act(provider,()=>removeIntegration(form));}}/>:null;})}</div>}
  </section>;
}
