import {validateRange,type CampaignRange} from './campaigns';
// Social media analytics: post-level views and engagement for Instagram, Facebook Pages and YouTube.
// Pure module (no environment, no secrets). Network calls take an injectable `fetcher` so they can be tested without real accounts.
//  - Instagram / Facebook: Meta Graph API. Instagram "views" and Facebook "post_media_view" replaced the retired impressions metrics.
//  - YouTube: Data API v3 public statistics (an API key is enough; watch time would need OAuth and is not used).
export type SocialPlatform='instagram'|'facebook'|'youtube';
export type SocialPost={platform:SocialPlatform;account:string;accountName:string;id:string;title:string;url:string;thumbnail:string|null;kind:string;publishedAt:string;views:number|null;likes:number|null;comments:number|null;shares:number|null;saves:number|null};
export type Fetcher=typeof fetch;

export class SocialApiError extends Error{
  constructor(public platform:SocialPlatform,public status:number){
    const name=platform==='instagram'?'Instagram':platform==='facebook'?'Facebook':'YouTube';
    super(status===401||status===190?`${name} rejected the saved credentials. Create a new access token or API key and update it in the hosting settings.`
      :status===403?`${name} denied access. Check the token permissions, the account ID and (for YouTube) that the Data API is enabled and its quota is not used up.`
      :status===429?`${name} rate limit reached. Try again later.`
      :status===0?`${name} could not be reached. Check the connection and try again.`
      :`${name} could not return post data (HTTP ${status}). Check the account IDs and API version in the hosting settings.`);
  }
}

const num=(value:unknown)=>{const n=typeof value==='string'||typeof value==='number'?Number(value):NaN;return Number.isFinite(n)?n:null;};
const trim=(text:string|undefined,max=140)=>{const clean=(text||'').replace(/\s+/g,' ').trim();return clean.length>max?`${clean.slice(0,max-1)}…`:clean;};
export function istBounds(range:CampaignRange){validateRange(range);return {start:Date.parse(`${range.from}T00:00:00+05:30`),end:Date.parse(`${range.to}T23:59:59.999+05:30`)};}
async function mapLimit<T,R>(items:T[],limit:number,work:(item:T)=>Promise<R>){
  const results:R[]=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await work(items[index]);}}));
  return results;
}

// ---------- Meta (Instagram + Facebook) ----------
export type MetaSocialConfig={token:string;version:string;facebookPages:string[];instagramAccounts:string[]};
const GRAPH_HOST='graph.facebook.com';
export function normalizeMetaId(value:string){const id=value.trim();if(!/^\d{5,25}$/.test(id))throw new Error('Facebook Page and Instagram account IDs are numbers.');return id;}
async function graph<T>(url:string,token:string,fetcher:Fetcher):Promise<T>{
  if(new URL(url).hostname!==GRAPH_HOST)throw new SocialApiError('facebook',502);
  let response:Response;
  try{response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new SocialApiError('facebook',0);}
  if(!response.ok)throw new SocialApiError('facebook',response.status);
  return await response.json() as T;
}
type Insight={name?:string;values?:{value?:unknown}[];total_value?:{value?:unknown}};
export function insightValue(body:{data?:Insight[]}|undefined,name:string){
  const item=body?.data?.find(i=>i.name===name);
  return num(item?.values?.[0]?.value??item?.total_value?.value);
}
const IG_KIND:Record<string,string>={REELS:'Reel',VIDEO:'Video',CAROUSEL_ALBUM:'Carousel',IMAGE:'Photo'};
type IgMedia={id:string;caption?:string;media_type?:string;media_product_type?:string;permalink?:string;timestamp?:string;like_count?:number;comments_count?:number;thumbnail_url?:string;media_url?:string};
export async function fetchInstagram(config:MetaSocialConfig,range:CampaignRange,fetcher:Fetcher=fetch,maxPosts=50):Promise<SocialPost[]>{
  const {start,end}=istBounds(range),base=`https://${GRAPH_HOST}/${config.version}`,posts:SocialPost[]=[];
  for(const account of config.instagramAccounts){
    const profile=await graph<{username?:string;name?:string}>(`${base}/${account}?fields=username,name`,config.token,fetcher).catch(error=>{if(error instanceof SocialApiError)throw new SocialApiError('instagram',error.status);throw error;});
    const accountName=profile.username?`@${profile.username}`:profile.name||account,media:IgMedia[]=[];
    let url:string|undefined=`${base}/${account}/media?fields=${encodeURIComponent('id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url')}&limit=50`;
    for(let page=0;url&&page<8&&media.length<maxPosts;page++){
      const body:{data?:IgMedia[];paging?:{next?:string}}=await graph<{data?:IgMedia[];paging?:{next?:string}}>(url,config.token,fetcher).catch(error=>{if(error instanceof SocialApiError)throw new SocialApiError('instagram',error.status);throw error;});
      const items=body.data||[];media.push(...items.filter(m=>{const t=Date.parse(m.timestamp||'');return t>=start&&t<=end;}));
      const oldest=Date.parse(items.at(-1)?.timestamp||'');url=items.length&&oldest>=start?body.paging?.next:undefined;
    }
    const picked=media.slice(0,maxPosts);
    const insights=await mapLimit(picked,5,async item=>{
      const metrics=async(list:string)=>graph<{data?:Insight[]}>(`${base}/${item.id}/insights?metric=${list}`,config.token,fetcher);
      try{return await metrics('views,reach,saved,shares');}catch{try{return await metrics('views');}catch{return undefined;}}
    });
    picked.forEach((item,index)=>posts.push({platform:'instagram',account,accountName,id:item.id,title:trim(item.caption)||'(no caption)',url:item.permalink||'',thumbnail:item.thumbnail_url||item.media_url||null,kind:IG_KIND[item.media_product_type==='REELS'?'REELS':item.media_type||'']||'Post',publishedAt:item.timestamp||'',views:insightValue(insights[index],'views'),likes:num(item.like_count),comments:num(item.comments_count),shares:insightValue(insights[index],'shares'),saves:insightValue(insights[index],'saved')}));
  }
  return posts;
}
type FbPost={id:string;message?:string;story?:string;created_time?:string;permalink_url?:string;full_picture?:string;shares?:{count?:number};reactions?:{summary?:{total_count?:number}};comments?:{summary?:{total_count?:number}}};
export async function fetchFacebook(config:MetaSocialConfig,range:CampaignRange,fetcher:Fetcher=fetch,maxPosts=50):Promise<SocialPost[]>{
  const {start,end}=istBounds(range),base=`https://${GRAPH_HOST}/${config.version}`,posts:SocialPost[]=[];
  for(const account of config.facebookPages){
    const page=await graph<{name?:string;access_token?:string}>(`${base}/${account}?fields=name,access_token`,config.token,fetcher);
    // Post reads need a Page access token; a user or system-user token can obtain it from the Page itself.
    const token=page.access_token||config.token,accountName=page.name||account,items:FbPost[]=[];
    const fields=encodeURIComponent('id,message,story,created_time,permalink_url,full_picture,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)');
    let url:string|undefined=`${base}/${account}/published_posts?fields=${fields}&since=${Math.floor(start/1000)}&until=${Math.floor(end/1000)}&limit=50`;
    for(let pageNo=0;url&&pageNo<8&&items.length<maxPosts;pageNo++){
      const body:{data?:FbPost[];paging?:{next?:string}}=await graph(url,token,fetcher);
      items.push(...(body.data||[]));url=body.paging?.next;
    }
    const picked=items.slice(0,maxPosts);
    const insights=await mapLimit(picked,5,item=>graph<{data?:Insight[]}>(`${base}/${item.id}/insights?metric=post_media_view`,token,fetcher).catch(()=>undefined));
    picked.forEach((item,index)=>posts.push({platform:'facebook',account,accountName,id:item.id,title:trim(item.message||item.story)||'(no text)',url:item.permalink_url||'',thumbnail:item.full_picture||null,kind:'Post',publishedAt:item.created_time||'',views:insightValue(insights[index],'post_media_view'),likes:num(item.reactions?.summary?.total_count),comments:num(item.comments?.summary?.total_count),shares:num(item.shares?.count),saves:null}));
  }
  return posts;
}

// ---------- YouTube ----------
export type YouTubeConfig={apiKey:string;channelIds:string[]};
export function normalizeChannelId(value:string){const id=value.trim();if(!/^UC[\w-]{22}$/.test(id))throw new Error('YouTube channel IDs start with UC and have 24 characters (YouTube Studio → Settings → Channel → Advanced).');return id;}
async function youtube<T>(path:string,params:Record<string,string>,apiKey:string,fetcher:Fetcher):Promise<T>{
  const url=new URL(`https://www.googleapis.com/youtube/v3/${path}`);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  let response:Response;
  // The key is sent as a header so it never appears in URLs or logs.
  try{response=await fetcher(url.toString(),{headers:{'x-goog-api-key':apiKey,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new SocialApiError('youtube',0);}
  if(!response.ok)throw new SocialApiError('youtube',response.status);
  return await response.json() as T;
}
export async function fetchYouTube(config:YouTubeConfig,range:CampaignRange,fetcher:Fetcher=fetch,maxPosts=100):Promise<SocialPost[]>{
  const {start,end}=istBounds(range),posts:SocialPost[]=[];
  for(const channel of config.channelIds){
    const info=await youtube<{items?:{snippet?:{title?:string};contentDetails?:{relatedPlaylists?:{uploads?:string}}}[]}>('channels',{part:'snippet,contentDetails',id:channel},config.apiKey,fetcher);
    const uploads=info.items?.[0]?.contentDetails?.relatedPlaylists?.uploads,accountName=info.items?.[0]?.snippet?.title||channel;
    if(!uploads)throw new SocialApiError('youtube',404);
    const ids:string[]=[];let pageToken:string|undefined;
    for(let page=0;page<6&&ids.length<maxPosts;page++){
      const body:{items?:{contentDetails?:{videoId?:string;videoPublishedAt?:string}}[];nextPageToken?:string}=await youtube('playlistItems',{part:'contentDetails',playlistId:uploads,maxResults:'50',...(pageToken?{pageToken}:{})},config.apiKey,fetcher);
      const items=body.items||[];
      for(const item of items){const t=Date.parse(item.contentDetails?.videoPublishedAt||'');if(item.contentDetails?.videoId&&t>=start&&t<=end)ids.push(item.contentDetails.videoId);}
      const oldest=Date.parse(items.at(-1)?.contentDetails?.videoPublishedAt||'');
      pageToken=items.length&&oldest>=start?body.nextPageToken:undefined;if(!pageToken)break;
    }
    for(let offset=0;offset<Math.min(ids.length,maxPosts);offset+=50){
      const batch=ids.slice(offset,Math.min(offset+50,maxPosts));
      const body=await youtube<{items?:{id:string;snippet?:{title?:string;publishedAt?:string;thumbnails?:Record<string,{url?:string}>};statistics?:{viewCount?:string;likeCount?:string;commentCount?:string}}[]}>('videos',{part:'snippet,statistics',id:batch.join(',')},config.apiKey,fetcher);
      for(const video of body.items||[])posts.push({platform:'youtube',account:channel,accountName,id:video.id,title:trim(video.snippet?.title)||'(untitled)',url:`https://www.youtube.com/watch?v=${video.id}`,thumbnail:video.snippet?.thumbnails?.medium?.url||video.snippet?.thumbnails?.default?.url||null,kind:'Video',publishedAt:video.snippet?.publishedAt||'',views:num(video.statistics?.viewCount),likes:num(video.statistics?.likeCount),comments:num(video.statistics?.commentCount),shares:null,saves:null});
    }
  }
  return posts;
}

// ---------- totals ----------
export const engagement=(post:Pick<SocialPost,'views'|'likes'|'comments'|'shares'|'saves'>)=>post.views?((post.likes||0)+(post.comments||0)+(post.shares||0)+(post.saves||0))/post.views*100:null;
export function socialTotals(posts:SocialPost[]){
  const sum=(pick:(p:SocialPost)=>number|null)=>posts.reduce((total,p)=>total+(pick(p)||0),0);
  const views=sum(p=>p.views),interactions=sum(p=>(p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0)),withViews=posts.filter(p=>p.views);
  const withViewsInteractions=withViews.reduce((t,p)=>t+(p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0),0),withViewsCount=withViews.reduce((t,p)=>t+(p.views||0),0);
  return {posts:posts.length,views,likes:sum(p=>p.likes),comments:sum(p=>p.comments),shares:sum(p=>p.shares),saves:sum(p=>p.saves),interactions,engagementRate:withViewsCount?withViewsInteractions/withViewsCount*100:null};
}
export function viewsByDay(posts:SocialPost[],days:string[]){
  const totals=new Map(days.map(day=>[day,0]));
  for(const post of posts){const t=Date.parse(post.publishedAt);if(!Number.isFinite(t))continue;const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));if(totals.has(day))totals.set(day,(totals.get(day)||0)+(post.views||0));}
  return days.map(day=>({day,views:totals.get(day)||0}));
}
export function byPlatform(posts:SocialPost[]){
  return (['instagram','facebook','youtube'] as const).map(platform=>({platform,...socialTotals(posts.filter(p=>p.platform===platform))})).filter(row=>row.posts>0);
}
