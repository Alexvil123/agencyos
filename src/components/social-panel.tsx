'use client';
import '../app/analytics.css';
import {useCallback,useEffect,useState,useTransition} from 'react';
import {loadSocial,type SocialResult} from '@/app/social-actions';
import {analyticsRange,type AnalyticsPreset} from '@/lib/analytics';
import type {SocialPlatform} from '@/lib/social';
import {indiaDate} from '@/lib/work-report';
import {useAutoRefresh} from './use-auto-refresh';
import {SocialView,type SocialSort} from './social-view';

// Loads post performance from the server (credentials stay there) and keeps the period, platform and sort choices.
export function SocialPanel({preview=false}:{preview?:boolean}){
  const [preset,setPreset]=useState<AnalyticsPreset>('30d'),[platform,setPlatform]=useState<'all'|SocialPlatform>('all'),[sort,setSort]=useState<SocialSort>({key:'views',direction:-1}),[result,setResult]=useState<SocialResult>(),[loading,start]=useTransition();
  const [range,setRange]=useState(()=>analyticsRange('30d',indiaDate(new Date().toISOString())));
  // The period is worked out at read time, so a page left open past midnight still ends today.
  const fetchSocial=useCallback(async(fresh:boolean)=>{
    const next=analyticsRange(preset,indiaDate(new Date().toISOString()));setRange(next);
    try{const loaded=await loadSocial({...next,fresh});setResult(loaded);return loaded.ok&&loaded.platforms.every(p=>!p.configured||p.ok);}
    catch{setResult(previous=>previous?.ok?previous:{ok:false,message:'Social analytics could not be loaded. Check your connection and retry.',posts:[],accounts:[],platforms:[],fetchedAt:''});return false;}
  },[preset]);
  const load=useCallback((fresh=false)=>{start(async()=>{await fetchSocial(fresh);});},[fetchSocial]);
  useEffect(()=>{if(!preview)void Promise.resolve().then(()=>load());},[preview,load]);
  // Every 5 minutes while this page is open and visible; a failed or rate-limited read backs off instead of retrying faster.
  useAutoRefresh(()=>fetchSocial(false),!preview,300000);
  if(preview)return <section className="panel"><h2>Social analytics</h2><p>Sign in to see post performance.</p></section>;
  if(!result)return <section className="panel"><p role="status">Loading social analytics…</p></section>;
  if(!result.ok)return <section className="panel"><h2>Social analytics</h2><p role="alert">{result.message}</p><button className="secondary" onClick={()=>load()}>Retry</button></section>;
  return <SocialView result={result} range={range} preset={preset} platform={platform} sort={sort} loading={loading} onPreset={setPreset} onPlatform={setPlatform} onSort={setSort} onRefresh={()=>load(true)}/>;
}
