'use client';
/* eslint-disable @next/next/no-img-element -- Post thumbnails come from the platforms' own CDNs and expire, so next/image optimisation does not apply. */
import {useMemo} from 'react';
import {Download,PlugZap,RefreshCw} from 'lucide-react';
import type {SocialResult} from '@/app/social-actions';
import {ANALYTICS_PRESETS,analyticsDays,type AnalyticsPreset,type AnalyticsRange} from '@/lib/analytics';
import {byKind,byPlatform,engagement,postingTimes,socialTotals,viewsByDay,type SocialPlatform,type SocialPost} from '@/lib/social';
import {csvCell} from '@/lib/work-report';
import {BarChart} from './analytics-charts';

export type SocialSortKey='published'|'views'|'reach'|'likes'|'comments'|'shares'|'engagement';
export type SocialSort={key:SocialSortKey;direction:1|-1};
const NAME:Record<SocialPlatform,string>={instagram:'Instagram',facebook:'Facebook',youtube:'YouTube'};
const count=(value:number|null)=>value===null?'—':new Intl.NumberFormat('en-IN').format(Math.round(value));
const short=(value:number)=>value>=1e7?`${(value/1e7).toFixed(1)}Cr`:value>=1e5?`${(value/1e5).toFixed(1)}L`:value>=1e3?`${(value/1e3).toFixed(1)}K`:String(Math.round(value));
const percent=(value:number|null)=>value===null?'—':`${value.toFixed(1)}%`;
const dayText=(iso:string)=>Number.isFinite(Date.parse(iso))?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).format(new Date(iso)):'—';
const shortDay=(day:string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',day:'numeric',month:'short'}).format(new Date(`${day}T00:00:00Z`));
const sortValue=(post:SocialPost,key:SocialSortKey)=>key==='published'?Date.parse(post.publishedAt)||0:key==='engagement'?engagement(post)??-1:key==='shares'?(post.shares||0)+(post.saves||0):(post[key]??-1);
const SETUP:{platform:SocialPlatform;vars:string[];note:string}[]=[
  {platform:'instagram',vars:['META_SOCIAL_ACCESS_TOKEN','INSTAGRAM_ACCOUNT_IDS'],note:'Instagram Business or Creator account linked to a Facebook Page. The token needs instagram_basic and instagram_manage_insights.'},
  {platform:'facebook',vars:['META_SOCIAL_ACCESS_TOKEN','FACEBOOK_PAGE_IDS'],note:'Page IDs (numbers). The token needs pages_read_engagement and read_insights; the same token serves Instagram.'},
  {platform:'youtube',vars:['YOUTUBE_API_KEY','YOUTUBE_CHANNEL_IDS'],note:'A YouTube Data API v3 key and the channel IDs (they start with UC). Public view, like and comment counts only.'},
];
function Thumb({post}:{post:SocialPost}){
  return post.thumbnail?<img src={post.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>:<span className="so-noimg"/>;
}

export function SocialView({result,range,preset,platform,sort,loading,onPreset,onPlatform,onSort,onRefresh}:{result:SocialResult;range:AnalyticsRange;preset:AnalyticsPreset;platform:'all'|SocialPlatform;sort:SocialSort;loading:boolean;onPreset:(value:AnalyticsPreset)=>void;onPlatform:(value:'all'|SocialPlatform)=>void;onSort:(value:SocialSort)=>void;onRefresh:()=>void}){
  const posts=useMemo(()=>result.posts.filter(p=>platform==='all'||p.platform===platform).sort((a,b)=>(sortValue(a,sort.key)-sortValue(b,sort.key))*sort.direction||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)),[result,platform,sort]);
  const totals=useMemo(()=>socialTotals(posts),[posts]);
  const perPlatform=useMemo(()=>byPlatform(posts),[posts]);
  const daily=useMemo(()=>viewsByDay(posts,analyticsDays(range)),[posts,range]);
  const top=useMemo(()=>[...posts].filter(p=>p.views).sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5),[posts]);
  const kinds=useMemo(()=>byKind(posts),[posts]),times=useMemo(()=>postingTimes(posts),[posts]),accounts=result.accounts.filter(a=>platform==='all'||a.platform===platform);
  function exportCsv(){
    const lines=[['Platform','Account','Type','Published','Title','URL','Views','Reach','Likes','Comments','Shares','Saves','Engagement %'],...posts.map(p=>[NAME[p.platform],p.accountName,p.kind,p.publishedAt,p.title,p.url,p.views??'',p.reach??'',p.likes??'',p.comments??'',p.shares??'',p.saves??'',engagement(p)?.toFixed(2)??''])];
    const url=URL.createObjectURL(new Blob([lines.map(l=>l.map(csvCell).join(',')).join('\n')],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=`social-${range.from}-${range.to}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(!result.platforms.some(p=>p.configured))return <section className="panel cp-setup">
    <span className="module-icon analytics"><PlugZap size={24}/></span><h2>Connect Instagram, Facebook and YouTube</h2>
    <p>Add the values below as server environment variables in your hosting settings (Netlify → Site configuration → Environment variables, mark secrets as secret) and redeploy. Post views, likes and comments then appear here automatically. Nothing is stored in the CRM database and the credentials never reach the browser.</p>
    <div className="an-grid3">{SETUP.map(s=><div className="an-card" key={s.platform}><h3>{NAME[s.platform]}</h3><ul className="cp-vars">{s.vars.map(v=><li key={v}><code>{v}</code></li>)}</ul><p className="subtle">{s.note}</p></div>)}</div>
    <p className="subtle">Setup guide: docs/SOCIAL-SETUP.md</p>
  </section>;
  const maxPlatformViews=Math.max(1,...perPlatform.map(p=>p.views));
  return <div className="analytics">
    <section className="panel an-controls">
      <div className="an-presets" role="group" aria-label="Period">{ANALYTICS_PRESETS.map(p=><button key={p.key} className={preset===p.key?'selected':''} onClick={()=>onPreset(p.key)}>{p.label}</button>)}</div>
      <div className="an-presets" role="group" aria-label="Platform">{(['all','instagram','facebook','youtube'] as const).map(p=><button key={p} className={platform===p?'selected':''} onClick={()=>onPlatform(p)}>{p==='all'?'All platforms':NAME[p]}</button>)}</div>
      <div className="an-actions"><button className="secondary small" disabled={loading} onClick={onRefresh}><RefreshCw size={14}/> {loading?'Loading…':'Refresh'}</button><button className="secondary small" disabled={!posts.length} onClick={exportCsv}><Download size={14}/> Export CSV</button></div>
      <p className="subtle">Posts published {shortDay(range.from)} – {shortDay(range.to)} · India time{result.fetchedAt?` · Updated ${new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}).format(new Date(result.fetchedAt))}`:''} · Cached for 15 minutes</p>
    </section>
    <section className="cp-platforms" aria-label="Connections">{result.platforms.map(p=><span key={p.platform} className={`cp-platform ${p.ok?'ok':p.configured?'bad':'off'}`}>{NAME[p.platform]}: {p.ok?'connected':p.configured?'needs attention':'not connected'}{p.error&&<small role="alert"> — {p.error}</small>}</span>)}</section>
    {accounts.length>0&&<section className="an-kpis" aria-label="Accounts">{accounts.map(a=><div className="an-kpi" key={`${a.platform}:${a.account}`}><small><span className={`so-badge ${a.platform}`}>{NAME[a.platform]}</span> {a.name}</small><strong>{count(a.followers)}</strong><span>{a.platform==='youtube'?'Subscribers':'Followers'}{a.items!==null?` · ${count(a.items)} ${a.platform==='youtube'?'videos':'posts'}`:''}{a.totalViews!==null?` · ${short(a.totalViews)} channel views`:''}</span></div>)}</section>}
    <section className="an-kpis" aria-label="Totals">
      {[['Posts',count(totals.posts),'Published in this period'],['Views',count(totals.views),'Plays and displays reported by each platform'],['Likes',count(totals.likes),'Likes and reactions'],['Comments',count(totals.comments),'On these posts'],['Shares and saves',count(totals.shares+totals.saves),'Where the platform reports them'],['Engagement rate',percent(totals.engagementRate),'Interactions ÷ views']].map(([label,value,note])=><div className="an-kpi" key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></div>)}
    </section>
    {posts.length>0&&<>
      <section className="an-grid2">
        <BarChart title="Views by publish day" unit="views of posts published each day" bars={daily.map(d=>({label:shortDay(d.day),value:d.views,detail:`${count(d.views)} views`}))}/>
        <section className="an-card"><h3>By platform</h3><ul className="an-hbars">{perPlatform.map(p=><li key={p.platform}><span className="an-hlabel">{NAME[p.platform]}</span><span className="an-htrack"><i style={{width:`${Math.max(2,p.views/maxPlatformViews*100)}%`}}/></span><b>{short(p.views)}</b><small>{p.posts} post{p.posts===1?'':'s'} · {count(p.likes)} likes · {percent(p.engagementRate)} engagement</small></li>)}</ul></section>
      </section>
      <section className="an-card"><h3>Top posts by views</h3><ol className="so-top">{top.map(p=><li key={`${p.platform}:${p.id}`}><Thumb post={p}/><div><a href={p.url||undefined} target="_blank" rel="noopener noreferrer">{p.title}</a><small><span className={`so-badge ${p.platform}`}>{NAME[p.platform]}</span> {p.kind} · {dayText(p.publishedAt)}</small></div><b>{short(p.views||0)}<small>views</small></b><b>{short(p.likes||0)}<small>likes</small></b></li>)}</ol></section>
      <section className="an-card"><h3>Content types</h3><div className="table-scroll"><table className="cp-table"><thead><tr><th>Type</th><th>Posts</th><th>Average views</th><th>Average likes</th><th>Engagement</th></tr></thead><tbody>{kinds.map(k=><tr key={`${k.platform}:${k.kind}`}><td><span className={`so-badge ${k.platform}`}>{NAME[k.platform]}</span> {k.kind}</td><td>{k.posts}</td><td>{k.avgViews===null?'—':count(k.avgViews)}</td><td>{k.avgLikes===null?'—':count(k.avgLikes)}</td><td>{percent(k.engagementRate)}</td></tr>)}</tbody></table></div></section>
      {times.sample>=3?<section className="an-grid2"><BarChart title="Average views by weekday" unit={`posts published on that weekday (India time), ${times.sample} posts with views`} bars={times.weekdays.map(d=>({label:d.label,value:Math.round(d.avgViews),detail:`${count(d.avgViews)} average views over ${d.posts} post${d.posts===1?'':'s'}`}))}/><BarChart title="Average views by posting time" unit="3-hour slots, India time" bars={times.slots.map(s=>({label:s.label,value:Math.round(s.avgViews),detail:`${count(s.avgViews)} average views over ${s.posts} post${s.posts===1?'':'s'}`}))}/></section>:<p className="subtle">Best posting times appear once at least 3 posts in this period report views.</p>}
    </>}
    <section className="panel">
      {posts.length?<div className="table-scroll"><table className="cp-table"><thead><tr><th>Post</th>{([['published','Published'],['views','Views'],['reach','Reach'],['likes','Likes'],['comments','Comments'],['shares','Shares / saves'],['engagement','Engagement']] as [SocialSortKey,string][]).map(([key,text])=><th key={key} aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):'none'}><button onClick={()=>onSort(sort.key===key?{key,direction:sort.direction===1?-1:1}:{key,direction:-1})}>{text}{sort.key===key?(sort.direction===1?' ↑':' ↓'):''}</button></th>)}</tr></thead>
        <tbody>{posts.map(p=><tr key={`${p.platform}:${p.id}`}><td className="so-post"><Thumb post={p}/><div>{p.url?<a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a>:<strong>{p.title}</strong>}<small className="block"><span className={`so-badge ${p.platform}`}>{NAME[p.platform]}</span> {p.kind} · {p.accountName}</small></div></td><td>{dayText(p.publishedAt)}</td><td title={p.views===null?'Not reported by the platform':undefined}>{count(p.views)}</td><td title={p.reach===null?'Reach is reported for Instagram posts only':undefined}>{count(p.reach)}</td><td>{count(p.likes)}</td><td>{count(p.comments)}</td><td>{p.shares===null&&p.saves===null?'—':`${count(p.shares)} / ${count(p.saves)}`}</td><td>{percent(engagement(p))}</td></tr>)}</tbody></table></div>
        :<p className="subtle">No posts were published in this period on the selected platform.</p>}
    </section>
    <details className="an-definitions"><summary>What these numbers mean</summary>
      <ul>
        <li><b>Views</b>: Instagram <i>views</i> and Facebook <i>post media views</i> (Meta replaced impressions with views; replays and plays both count), YouTube public view count. Platforms update insights with a delay of up to 48 hours.</li>
        <li><b>Likes</b>: Instagram likes, Facebook reactions, YouTube likes (shown as — when a channel hides them). <b>Shares / saves</b> are reported by Instagram (shares, saves) and Facebook (shares) only.</li>
        <li><b>Engagement rate</b> = (likes + comments + shares + saves) ÷ views, for posts that report views. It describes content response, not people.</li>
        <li>Only posts published in the chosen period are listed, and numbers are totals to date for each post. Stories are not included (they expire after 24 hours). A dash means the platform did not report that number.</li>
      </ul>
    </details>
  </div>;
}
