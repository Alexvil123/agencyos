import {validateRange,type CampaignRange} from './campaigns';
// Social media analytics: post-level views and engagement for Instagram, Facebook Pages and YouTube.
// Pure module (no environment, no secrets). Network calls take an injectable `fetcher` so they can be tested without real accounts.
//  - Instagram / Facebook: Meta Graph API. Instagram "views" and Facebook "post_media_view" replaced the retired impressions metrics.
//  - YouTube: Data API v3 public statistics (an API key is enough; watch time would need OAuth and is not used).
export type SocialPlatform='instagram'|'facebook'|'youtube';
export type SocialPost={platform:SocialPlatform;account:string;accountName:string;id:string;title:string;url:string;thumbnail:string|null;kind:string;publishedAt:string;views:number|null;reach:number|null;likes:number|null;comments:number|null;shares:number|null;saves:number|null};
export type SocialAccount={platform:SocialPlatform;account:string;name:string;followers:number|null;items:number|null;totalViews:number|null};
export type SocialFetch={posts:SocialPost[];accounts:SocialAccount[]};
export type Fetcher=typeof fetch;

const PLATFORM_NAME:Record<SocialPlatform,string>={instagram:'Instagram',facebook:'Facebook',youtube:'YouTube'};
// Meta reports most failures as HTTP 400 with an error code in the body (190 = expired or invalid token, 10/200-299 = permission, 4/17/32/613 = rate limit).
export function effectiveStatus(platform:SocialPlatform,status:number,code?:number){
  if(platform==='youtube'||code===undefined)return status;
  if(code===190||code===102||code===467)return 401;
  if(code===10||(code>=200&&code<300))return 403;
  if(code===4||code===17||code===32||code===613)return 429;
  return status;
}
export class SocialApiError extends Error{
  status:number;
  constructor(public platform:SocialPlatform,status:number,code?:number){
    const effective=effectiveStatus(platform,status,code),name=PLATFORM_NAME[platform];
    super(effective===401?`${name} rejected the saved credentials. Create a new access token or API key and update it in the hosting settings.`
      :effective===403?`${name} denied access. Check the token permissions and the account ID${platform==='youtube'?', and that the YouTube Data API is enabled for the key':''}.`
      :effective===429?`${name} rate limit or daily quota reached. Try again later.`
      :effective===0?`${name} could not be reached. Check the connection and try again.`
      :`${name} could not return post data (HTTP ${effective}). Check the account IDs and API version in the hosting settings.`);
    this.status=effective;
  }
}

const num=(value:unknown)=>{const n=typeof value==='string'||typeof value==='number'?Number(value):NaN;return Number.isFinite(n)?n:null;};
const trim=(text:string|undefined,max=140)=>{const clean=(text||'').replace(/\s+/g,' ').trim();return clean.length>max?`${clean.slice(0,max-1)}…`:clean;};
// Meta writes offsets as +0000 (no colon), which Safari cannot parse; every timestamp is stored as a standard ISO string, or '' when invalid.
export function isoTime(value:string|undefined){const t=Date.parse(value||'');return Number.isFinite(t)?new Date(t).toISOString():'';}
function istBounds(range:CampaignRange){validateRange(range);return {start:Date.parse(`${range.from}T00:00:00+05:30`),end:Date.parse(`${range.to}T23:59:59.999+05:30`)};}
async function mapLimit<T,R>(items:T[],limit:number,work:(item:T)=>Promise<R>){
  const results:R[]=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await work(items[index]);}}));
  return results;
}

// ---------- Meta (Instagram + Facebook) ----------
export type MetaSocialConfig={token:string;version:string;facebookPages:string[];instagramAccounts:string[]};
const GRAPH_HOST='graph.facebook.com';
export function normalizeMetaId(value:string){const id=value.trim();if(!/^\d{5,25}$/.test(id))throw new Error('Facebook Page and Instagram account IDs are numbers.');return id;}
async function graph<T>(url:string,token:string,fetcher:Fetcher,platform:SocialPlatform):Promise<T>{
  if(new URL(url).hostname!==GRAPH_HOST)throw new SocialApiError(platform,502);
  let response:Response;
  try{response=await fetcher(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new SocialApiError(platform,0);}
  if(!response.ok){
    let code:number|undefined;
    try{const body=await response.json() as {error?:{code?:unknown}};if(typeof body?.error?.code==='number')code=body.error.code;}catch{/* The body is only used for the numeric error code, never shown. */}
    throw new SocialApiError(platform,response.status,code);
  }
  return await response.json() as T;
}
type Insight={name?:string;values?:{value?:unknown}[];total_value?:{value?:unknown}};
export function insightValue(body:{data?:Insight[]}|undefined,name:string){
  const item=body?.data?.find(i=>i.name===name);
  return num(item?.values?.[0]?.value??item?.total_value?.value);
}
const IG_KIND:Record<string,string>={REELS:'Reel',VIDEO:'Video',CAROUSEL_ALBUM:'Carousel',IMAGE:'Photo'};
const IG_METRICS=['views','reach','saved','shares'] as const;
type IgMedia={id:string;caption?:string;media_type?:string;media_product_type?:string;permalink?:string;timestamp?:string;like_count?:number;comments_count?:number;thumbnail_url?:string;media_url?:string};
// One unsupported metric makes a multi-metric call fail, so on failure each metric is asked alone and unsupported ones are remembered per media type.
async function igInsights(base:string,item:IgMedia,token:string,fetcher:Fetcher,unsupported:Set<string>){
  const type=item.media_product_type||item.media_type||'unknown',wanted=IG_METRICS.filter(m=>!unsupported.has(`${type}:${m}`));
  const result:Record<string,number|null>={views:null,reach:null,saved:null,shares:null};
  if(!wanted.length)return result;
  const run=(metrics:string[])=>graph<{data?:Insight[]}>(`${base}/${item.id}/insights?metric=${metrics.join(',')}`,token,fetcher,'instagram');
  try{const body=await run([...wanted]);for(const metric of wanted)result[metric]=insightValue(body,metric);return result;}
  catch{
    for(const metric of wanted){
      try{result[metric]=insightValue(await run([metric]),metric);}catch{unsupported.add(`${type}:${metric}`);}
    }
    return result;
  }
}
export async function fetchInstagram(config:MetaSocialConfig,range:CampaignRange,fetcher:Fetcher=fetch,maxPosts=50):Promise<SocialFetch>{
  const {start,end}=istBounds(range),base=`https://${GRAPH_HOST}/${config.version}`,posts:SocialPost[]=[],accounts:SocialAccount[]=[];
  for(const account of config.instagramAccounts){
    const profile=await graph<{username?:string;name?:string;followers_count?:number;media_count?:number}>(`${base}/${account}?fields=username,name,followers_count,media_count`,config.token,fetcher,'instagram');
    const accountName=profile.username?`@${profile.username}`:profile.name||account,media:IgMedia[]=[],unsupported=new Set<string>();
    accounts.push({platform:'instagram',account,name:accountName,followers:num(profile.followers_count),items:num(profile.media_count),totalViews:null});
    let url:string|undefined=`${base}/${account}/media?fields=${encodeURIComponent('id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url')}&limit=50`;
    for(let page=0;url&&page<8&&media.length<maxPosts;page++){
      const body:{data?:IgMedia[];paging?:{next?:string}}=await graph<{data?:IgMedia[];paging?:{next?:string}}>(url,config.token,fetcher,'instagram');
      const items=body.data||[];media.push(...items.filter(m=>{const t=Date.parse(m.timestamp||'');return t>=start&&t<=end;}));
      const oldest=Date.parse(items.at(-1)?.timestamp||'');url=items.length&&oldest>=start?body.paging?.next:undefined;
    }
    const picked=media.slice(0,maxPosts);
    const insights=await mapLimit(picked,5,item=>igInsights(base,item,config.token,fetcher,unsupported));
    picked.forEach((item,index)=>{
      // For videos media_url is the video file itself, so only a real thumbnail is used for them.
      const still=item.media_type==='VIDEO'?null:item.media_url||null;
      posts.push({platform:'instagram',account,accountName,id:item.id,title:trim(item.caption)||'(no caption)',url:item.permalink||'',thumbnail:item.thumbnail_url||still,kind:IG_KIND[item.media_product_type==='REELS'?'REELS':item.media_type||'']||'Post',publishedAt:isoTime(item.timestamp),views:insights[index].views,reach:insights[index].reach,likes:num(item.like_count),comments:num(item.comments_count),shares:insights[index].shares,saves:insights[index].saved});
    });
  }
  return {posts:posts.filter(p=>p.publishedAt),accounts};
}
type FbPost={id:string;message?:string;story?:string;created_time?:string;permalink_url?:string;full_picture?:string;shares?:{count?:number};reactions?:{summary?:{total_count?:number}};comments?:{summary?:{total_count?:number}}};
export async function fetchFacebook(config:MetaSocialConfig,range:CampaignRange,fetcher:Fetcher=fetch,maxPosts=50):Promise<SocialFetch>{
  const {start,end}=istBounds(range),base=`https://${GRAPH_HOST}/${config.version}`,posts:SocialPost[]=[],accounts:SocialAccount[]=[];
  for(const account of config.facebookPages){
    const page=await graph<{name?:string;access_token?:string;followers_count?:number;fan_count?:number}>(`${base}/${account}?fields=name,access_token,followers_count,fan_count`,config.token,fetcher,'facebook');
    // Post reads need a Page access token; a user or system-user token can obtain it from the Page itself.
    const token=page.access_token||config.token,accountName=page.name||account,items:FbPost[]=[];
    accounts.push({platform:'facebook',account,name:accountName,followers:num(page.followers_count)??num(page.fan_count),items:null,totalViews:null});
    const fields=encodeURIComponent('id,message,story,created_time,permalink_url,full_picture,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)');
    let url:string|undefined=`${base}/${account}/published_posts?fields=${fields}&since=${Math.floor(start/1000)}&until=${Math.floor(end/1000)}&limit=50`;
    for(let pageNo=0;url&&pageNo<8&&items.length<maxPosts;pageNo++){
      const body:{data?:FbPost[];paging?:{next?:string}}=await graph<{data?:FbPost[];paging?:{next?:string}}>(url,token,fetcher,'facebook');
      items.push(...(body.data||[]));url=body.paging?.next;
    }
    const picked=items.slice(0,maxPosts);
    const insights=await mapLimit(picked,5,item=>graph<{data?:Insight[]}>(`${base}/${item.id}/insights?metric=post_media_view`,token,fetcher,'facebook').catch(()=>undefined));
    picked.forEach((item,index)=>posts.push({platform:'facebook',account,accountName,id:item.id,title:trim(item.message||item.story)||'(no text)',url:item.permalink_url||'',thumbnail:item.full_picture||null,kind:'Post',publishedAt:isoTime(item.created_time),views:insightValue(insights[index],'post_media_view'),reach:null,likes:num(item.reactions?.summary?.total_count),comments:num(item.comments?.summary?.total_count),shares:num(item.shares?.count),saves:null}));
  }
  return {posts:posts.filter(p=>p.publishedAt),accounts};
}

// ---------- YouTube ----------
export type YouTubeConfig={apiKey:string;channelIds:string[]};
export function normalizeChannelId(value:string){const id=value.trim();if(!/^UC[\w-]{22}$/.test(id))throw new Error('YouTube channel IDs start with UC and have 24 characters (YouTube Studio → Settings → Channel → Advanced).');return id;}
export function isoDurationSeconds(value:string|undefined){
  const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value||'');
  return m?(Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0)):null;
}
async function youtube<T>(path:string,params:Record<string,string>,apiKey:string,fetcher:Fetcher):Promise<T>{
  const url=new URL(`https://www.googleapis.com/youtube/v3/${path}`);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  let response:Response;
  // The key is sent as a header so it never appears in URLs or logs.
  try{response=await fetcher(url.toString(),{headers:{'x-goog-api-key':apiKey,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new SocialApiError('youtube',0);}
  if(!response.ok){
    let reason='';
    try{const body=await response.json() as {error?:{errors?:{reason?:string}[]}};reason=body?.error?.errors?.[0]?.reason||'';}catch{/* Only the reason keyword is used. */}
    throw new SocialApiError('youtube',/keyInvalid|API_KEY_INVALID/.test(reason)?401:/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(reason)?429:response.status);
  }
  return await response.json() as T;
}
export async function fetchYouTube(config:YouTubeConfig,range:CampaignRange,fetcher:Fetcher=fetch,maxPosts=100):Promise<SocialFetch>{
  const {start,end}=istBounds(range),posts:SocialPost[]=[],accounts:SocialAccount[]=[];
  for(const channel of config.channelIds){
    const info=await youtube<{items?:{snippet?:{title?:string};contentDetails?:{relatedPlaylists?:{uploads?:string}};statistics?:{subscriberCount?:string;viewCount?:string;videoCount?:string;hiddenSubscriberCount?:boolean}}[]}>('channels',{part:'snippet,contentDetails,statistics',id:channel},config.apiKey,fetcher);
    const first=info.items?.[0],uploads=first?.contentDetails?.relatedPlaylists?.uploads,accountName=first?.snippet?.title||channel;
    if(!uploads)throw new SocialApiError('youtube',404);
    accounts.push({platform:'youtube',account:channel,name:accountName,followers:first?.statistics?.hiddenSubscriberCount?null:num(first?.statistics?.subscriberCount),items:num(first?.statistics?.videoCount),totalViews:num(first?.statistics?.viewCount)});
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
      const body=await youtube<{items?:{id:string;snippet?:{title?:string;publishedAt?:string;thumbnails?:Record<string,{url?:string}>};contentDetails?:{duration?:string};statistics?:{viewCount?:string;likeCount?:string;commentCount?:string}}[]}>('videos',{part:'snippet,statistics,contentDetails',id:batch.join(',')},config.apiKey,fetcher);
      for(const video of body.items||[]){
        const seconds=isoDurationSeconds(video.contentDetails?.duration);
        posts.push({platform:'youtube',account:channel,accountName,id:video.id,title:trim(video.snippet?.title)||'(untitled)',url:`https://www.youtube.com/watch?v=${video.id}`,thumbnail:video.snippet?.thumbnails?.medium?.url||video.snippet?.thumbnails?.default?.url||null,kind:seconds!==null&&seconds>0&&seconds<=180?'Short (≤3 min)':'Video',publishedAt:isoTime(video.snippet?.publishedAt),views:num(video.statistics?.viewCount),reach:null,likes:num(video.statistics?.likeCount),comments:num(video.statistics?.commentCount),shares:null,saves:null});
      }
    }
  }
  return {posts:posts.filter(p=>p.publishedAt),accounts};
}

// ---------- totals and comparisons ----------
export const engagement=(post:Pick<SocialPost,'views'|'likes'|'comments'|'shares'|'saves'>)=>post.views?((post.likes||0)+(post.comments||0)+(post.shares||0)+(post.saves||0))/post.views*100:null;
const interactions=(p:Pick<SocialPost,'likes'|'comments'|'shares'|'saves'>)=>(p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0);
export function socialTotals(posts:SocialPost[]){
  const sum=(pick:(p:SocialPost)=>number|null)=>posts.reduce((total,p)=>total+(pick(p)||0),0);
  const withViews=posts.filter(p=>p.views);
  const withViewsInteractions=withViews.reduce((t,p)=>t+interactions(p),0),withViewsCount=withViews.reduce((t,p)=>t+(p.views||0),0);
  return {posts:posts.length,views:sum(p=>p.views),likes:sum(p=>p.likes),comments:sum(p=>p.comments),shares:sum(p=>p.shares),saves:sum(p=>p.saves),interactions:sum(interactions),engagementRate:withViewsCount?withViewsInteractions/withViewsCount*100:null};
}
const dayOf=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
export function viewsByDay(posts:SocialPost[],days:string[]){
  const totals=new Map(days.map(day=>[day,0]));
  for(const post of posts){if(!Number.isFinite(Date.parse(post.publishedAt)))continue;const day=dayOf(post.publishedAt);if(totals.has(day))totals.set(day,(totals.get(day)||0)+(post.views||0));}
  return days.map(day=>({day,views:totals.get(day)||0}));
}
export function byPlatform(posts:SocialPost[]){
  return (['instagram','facebook','youtube'] as const).map(platform=>({platform,...socialTotals(posts.filter(p=>p.platform===platform))})).filter(row=>row.posts>0);
}
/** Average views, likes and engagement per content type (for example Instagram Reel vs Photo, YouTube Short vs Video). */
export function byKind(posts:SocialPost[]){
  const groups=new Map<string,SocialPost[]>();
  for(const post of posts){const key=`${post.platform}|${post.kind}`;groups.set(key,[...(groups.get(key)||[]),post]);}
  return [...groups.entries()].map(([key,list])=>{
    const [platform,kind]=key.split('|') as [SocialPlatform,string],viewed=list.filter(p=>p.views!==null);
    return {platform,kind,posts:list.length,avgViews:viewed.length?viewed.reduce((t,p)=>t+(p.views||0),0)/viewed.length:null,avgLikes:list.some(p=>p.likes!==null)?list.reduce((t,p)=>t+(p.likes||0),0)/list.length:null,engagementRate:socialTotals(list).engagementRate};
  }).sort((a,b)=>(b.avgViews??-1)-(a.avgViews??-1));
}
const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function istParts(iso:string){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
  return {weekday:Math.max(0,WEEKDAYS.indexOf(parts.weekday)),hour:Number(parts.hour)};
}
/** Average views of posts by India weekday and by 3-hour slot of the day, to show when posts tend to do well. Only posts that report views count. */
export function postingTimes(posts:SocialPost[]){
  const viewed=posts.filter(p=>p.views!==null&&Number.isFinite(Date.parse(p.publishedAt)));
  const days=WEEKDAYS.map(label=>({label,posts:0,total:0})),slots=Array.from({length:8},(_,i)=>({label:`${String(i*3).padStart(2,'0')}–${String(i*3+3).padStart(2,'0')}h`,posts:0,total:0}));
  for(const post of viewed){const {weekday,hour}=istParts(post.publishedAt),d=days[weekday],s=slots[Math.floor(hour/3)];d.posts++;d.total+=post.views||0;s.posts++;s.total+=post.views||0;}
  const shape=(rows:typeof days)=>rows.map(r=>({label:r.label,posts:r.posts,avgViews:r.posts?r.total/r.posts:0}));
  return {weekdays:shape(days),slots:shape(slots),sample:viewed.length};
}
