'use client';
import '../app/analytics.css';
import {useCallback,useEffect,useMemo,useState,useTransition} from 'react';
import {Download,RefreshCw,PlugZap} from 'lucide-react';
import {loadCampaigns,type CampaignsResult} from '@/app/campaigns-actions';
import {ANALYTICS_PRESETS,analyticsRange,type AnalyticsPreset} from '@/lib/analytics';
import {costPerResult,cpc,ctr,totalsByCurrency,type CampaignPlatform,type CampaignRow} from '@/lib/campaigns';
import {csvCell,indiaDate} from '@/lib/work-report';

type SortKey='name'|'spend'|'impressions'|'clicks'|'ctr'|'cpc'|'conversions'|'cpr';
const money=(value:number|null,currency:string)=>{
  if(value===null)return '—';
  try{return currency?new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(value):value.toFixed(2);}catch{return `${currency} ${value.toFixed(2)}`;}
};
const count=(value:number)=>new Intl.NumberFormat('en-IN').format(Math.round(value));
const label:Record<CampaignPlatform,string>={meta:'Meta Ads',google:'Google Ads'};
const sortValue=(row:CampaignRow,key:SortKey)=>key==='name'?row.name.toLowerCase():key==='ctr'?ctr(row)??-1:key==='cpc'?cpc(row)??-1:key==='cpr'?costPerResult(row)??-1:row[key];
const SETUP:{platform:CampaignPlatform;title:string;vars:string[];note:string}[]=[
  {platform:'meta',title:'Meta Ads (Facebook & Instagram)',vars:['META_ADS_ACCESS_TOKEN','META_ADS_ACCOUNT_IDS'],note:'Use a Meta system-user access token with ads_read permission. Account IDs are comma separated (act_1234567890).'},
  {platform:'google',title:'Google Ads',vars:['GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_IDS'],note:'Customer IDs are comma separated. Add GOOGLE_ADS_LOGIN_CUSTOMER_ID if you read client accounts through a manager (MCC) account.'},
];

export function CampaignsPanel({preview=false}:{preview?:boolean}){
  const [preset,setPreset]=useState<AnalyticsPreset>('30d'),[platform,setPlatform]=useState<'all'|CampaignPlatform>('all'),[sort,setSort]=useState<{key:SortKey;direction:1|-1}>({key:'spend',direction:-1}),[result,setResult]=useState<CampaignsResult>(),[loading,start]=useTransition();
  const range=useMemo(()=>analyticsRange(preset,indiaDate(new Date().toISOString())),[preset]);
  const load=useCallback((fresh=false)=>{start(async()=>{try{setResult(await loadCampaigns({...range,fresh}));}catch{setResult({ok:false,message:'Campaigns could not be loaded. Check your connection and retry.',rows:[],platforms:[],fetchedAt:''});}});},[range]);
  useEffect(()=>{if(!preview)void Promise.resolve().then(()=>load());},[preview,load]);
  const rows=useMemo(()=>(result?.rows||[]).filter(r=>platform==='all'||r.platform===platform).sort((a,b)=>{const x=sortValue(a,sort.key),y=sortValue(b,sort.key);return (typeof x==='string'&&typeof y==='string'?x.localeCompare(y):Number(x)-Number(y))*sort.direction||a.name.localeCompare(b.name);}),[result,platform,sort]);
  const totals=useMemo(()=>totalsByCurrency(rows),[rows]);
  function exportCsv(){
    const lines=[['Platform','Account','Campaign','Status','Objective','Currency','Spend','Impressions','Clicks','CTR %','CPC','Results','Cost per result'],...rows.map(r=>[label[r.platform],r.account,r.name,r.status,r.objective,r.currency,r.spend.toFixed(2),r.impressions,r.clicks,ctr(r)?.toFixed(2)??'',cpc(r)?.toFixed(2)??'',r.conversions,costPerResult(r)?.toFixed(2)??''])];
    const url=URL.createObjectURL(new Blob([lines.map(l=>l.map(csvCell).join(',')).join('\n')],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=`campaigns-${range.from}-${range.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(preview)return <section className="panel"><h2>Campaigns</h2><p>Sign in as Owner to view campaign performance.</p></section>;
  if(!result)return <section className="panel"><p role="status">Loading campaigns…</p></section>;
  if(!result.ok)return <section className="panel"><h2>Campaigns</h2><p role="alert">{result.message}</p><button className="secondary" onClick={()=>load()}>Retry</button></section>;
  const connected=result.platforms.filter(p=>p.configured);
  if(!connected.length)return <section className="panel cp-setup">
    <span className="module-icon campaigns"><PlugZap size={24}/></span><h2>Connect your ad accounts</h2>
    <p>Add the credentials below as server environment variables in your hosting settings (Netlify → Site configuration → Environment variables, mark them secret) and redeploy. Campaign spend and results then appear here automatically. Nothing is stored in the CRM database and the credentials are never sent to the browser.</p>
    <div className="an-grid3">{SETUP.map(s=><div className="an-card" key={s.platform}><h3>{s.title}</h3><ul className="cp-vars">{s.vars.map(v=><li key={v}><code>{v}</code></li>)}</ul><p className="subtle">{s.note}</p></div>)}</div>
    <p className="subtle">Setup guide: docs/CAMPAIGNS-SETUP.md · Only the Owner can view campaign spend.</p>
  </section>;
  return <div className="analytics">
    <section className="panel an-controls">
      <div className="an-presets" role="group" aria-label="Period">{ANALYTICS_PRESETS.map(p=><button key={p.key} className={preset===p.key?'selected':''} onClick={()=>setPreset(p.key)}>{p.label}</button>)}</div>
      <div className="an-presets" role="group" aria-label="Platform">{(['all','meta','google'] as const).map(p=><button key={p} className={platform===p?'selected':''} onClick={()=>setPlatform(p)}>{p==='all'?'All platforms':label[p]}</button>)}</div>
      <div className="an-actions"><button className="secondary small" disabled={loading} onClick={()=>load(true)}><RefreshCw size={14}/> {loading?'Loading…':'Refresh'}</button><button className="secondary small" disabled={!rows.length} onClick={exportCsv}><Download size={14}/> Export CSV</button></div>
      <p className="subtle">{range.from} – {range.to} · {result.fetchedAt?`Updated ${new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}).format(new Date(result.fetchedAt))}`:''} · Results are cached for 5 minutes</p>
    </section>
    <section className="cp-platforms" aria-label="Connections">{result.platforms.map(p=><span key={p.platform} className={`cp-platform ${p.ok?'ok':p.configured?'bad':'off'}`}>{label[p.platform]}: {p.ok?'connected':p.configured?'needs attention':'not connected'}{p.error&&<small role="alert"> — {p.error}</small>}</span>)}</section>
    {totals.length>0&&<section className="an-kpis" aria-label="Totals">{totals.map(t=><div className="an-kpi" key={t.currency||'none'}><small>Spend{totals.length>1?` (${t.currency||'unknown currency'})`:''}</small><strong>{money(t.spend,t.currency)}</strong><span>{t.campaigns} campaign{t.campaigns===1?'':'s'}</span></div>)}
      {(()=>{const all=rows.reduce((a,r)=>({i:a.i+r.impressions,c:a.c+r.clicks,v:a.v+r.conversions}),{i:0,c:0,v:0});return <><div className="an-kpi"><small>Impressions</small><strong>{count(all.i)}</strong><span>Across shown campaigns</span></div><div className="an-kpi"><small>Clicks</small><strong>{count(all.c)}</strong><span>CTR {all.i?(all.c/all.i*100).toFixed(2):'—'}%</span></div><div className="an-kpi"><small>Results</small><strong>{count(all.v)}</strong><span>Leads and purchases reported</span></div></>;})()}
    </section>}
    <section className="panel">
      {rows.length?<div className="table-scroll"><table className="cp-table"><thead><tr>{([['name','Campaign'],['spend','Spend'],['impressions','Impressions'],['clicks','Clicks'],['ctr','CTR'],['cpc','CPC'],['conversions','Results'],['cpr','Cost / result']] as [SortKey,string][]).map(([key,text])=><th key={key} aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):'none'}><button onClick={()=>setSort(previous=>previous.key===key?{key,direction:previous.direction===1?-1:1}:{key,direction:key==='name'?1:-1})}>{text}{sort.key===key?(sort.direction===1?' ↑':' ↓'):''}</button></th>)}</tr></thead>
        <tbody>{rows.map(r=><tr key={`${r.platform}:${r.id}`}><td><strong>{r.name}</strong><small className="block"><span className={`cp-badge ${r.platform}`}>{label[r.platform]}</span> <span className={`cp-status ${r.status}`}>{r.status}</span> {r.objective&&<span className="subtle">{r.objective}</span>}</small></td><td>{money(r.spend,r.currency)}</td><td>{count(r.impressions)}</td><td>{count(r.clicks)}</td><td>{ctr(r)===null?'—':`${ctr(r)!.toFixed(2)}%`}</td><td>{money(cpc(r),r.currency)}</td><td>{count(r.conversions)}</td><td>{money(costPerResult(r),r.currency)}</td></tr>)}</tbody></table></div>
        :<p className="subtle">No campaigns with data for this period and platform.</p>}
      <p className="subtle">Spend, impressions and clicks come straight from the ad platforms. <b>Results</b> are leads plus purchases as the platform reports them (each result counted once). Amounts are shown in each account&apos;s own currency and never added across currencies.</p>
    </section>
  </div>;
}
