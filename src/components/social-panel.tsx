'use client';
import '../app/analytics.css';
import {useCallback,useEffect,useMemo,useState,useTransition} from 'react';
import {loadSocial,type SocialResult} from '@/app/social-actions';
import {analyticsRange,type AnalyticsPreset} from '@/lib/analytics';
import type {SocialPlatform} from '@/lib/social';
import {indiaDate} from '@/lib/work-report';
import {SocialView,type SocialSort} from './social-view';

// Loads post performance from the server (credentials stay there) and keeps the period, platform and sort choices.
export function SocialPanel({preview=false}:{preview?:boolean}){
  const [preset,setPreset]=useState<AnalyticsPreset>('30d'),[platform,setPlatform]=useState<'all'|SocialPlatform>('all'),[sort,setSort]=useState<SocialSort>({key:'views',direction:-1}),[result,setResult]=useState<SocialResult>(),[loading,start]=useTransition();
  const range=useMemo(()=>analyticsRange(preset,indiaDate(new Date().toISOString())),[preset]);
  const load=useCallback((fresh=false)=>{start(async()=>{try{setResult(await loadSocial({...range,fresh}));}catch{setResult({ok:false,message:'Social analytics could not be loaded. Check your connection and retry.',posts:[],accounts:[],platforms:[],fetchedAt:''});}});},[range]);
  useEffect(()=>{if(!preview)void Promise.resolve().then(()=>load());},[preview,load]);
  if(preview)return <section className="panel"><h2>Social analytics</h2><p>Sign in to see post performance.</p></section>;
  if(!result)return <section className="panel"><p role="status">Loading social analytics…</p></section>;
  if(!result.ok)return <section className="panel"><h2>Social analytics</h2><p role="alert">{result.message}</p><button className="secondary" onClick={()=>load()}>Retry</button></section>;
  return <SocialView result={result} range={range} preset={preset} platform={platform} sort={sort} loading={loading} onPreset={setPreset} onPlatform={setPlatform} onSort={setSort} onRefresh={()=>load(true)}/>;
}
