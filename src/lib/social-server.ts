import 'server-only';
import {fetchFacebook,fetchInstagram,fetchYouTube,normalizeChannelId,normalizeMetaId,SocialApiError,type MetaSocialConfig,type SocialPlatform,type SocialPost,type YouTubeConfig} from './social';
import {validateRange,type CampaignRange} from './campaigns';
// Credentials come only from server environment variables (never from the browser, never logged):
//   META_SOCIAL_ACCESS_TOKEN  (system-user or long-lived token: pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights)
//   FACEBOOK_PAGE_IDS, INSTAGRAM_ACCOUNT_IDS (comma separated numeric IDs), optional META_GRAPH_VERSION (default v25.0)
//   YOUTUBE_API_KEY, YOUTUBE_CHANNEL_IDS (comma separated, UC...)
const list=(value:string|undefined)=>(value||'').split(',').map(v=>v.trim()).filter(Boolean);
export type SocialConfig<T>={configured:false}|{configured:true;error:string}|{configured:true;error?:undefined;config:T};
function metaConfig(kind:'instagram'|'facebook'):SocialConfig<MetaSocialConfig>{
  const token=process.env.META_SOCIAL_ACCESS_TOKEN?.trim(),pages=list(process.env.FACEBOOK_PAGE_IDS),accounts=list(process.env.INSTAGRAM_ACCOUNT_IDS),ids=kind==='instagram'?accounts:pages;
  if(!ids.length)return token&&!pages.length&&!accounts.length&&kind==='instagram'?{configured:true,error:'Set FACEBOOK_PAGE_IDS and/or INSTAGRAM_ACCOUNT_IDS in the hosting settings.'}:{configured:false};
  if(!token)return {configured:true,error:'Set META_SOCIAL_ACCESS_TOKEN in the hosting settings.'};
  try{const version=/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION||'')?process.env.META_GRAPH_VERSION!:'v25.0';return {configured:true,config:{token,version,facebookPages:pages.map(normalizeMetaId),instagramAccounts:accounts.map(normalizeMetaId)}};}
  catch(error){return {configured:true,error:error instanceof Error?error.message:'Meta settings are invalid.'};}
}
function youtubeConfig():SocialConfig<YouTubeConfig>{
  const apiKey=process.env.YOUTUBE_API_KEY?.trim(),ids=list(process.env.YOUTUBE_CHANNEL_IDS);
  if(!apiKey&&!ids.length)return {configured:false};
  if(!apiKey||!ids.length)return {configured:true,error:'Set both YOUTUBE_API_KEY and YOUTUBE_CHANNEL_IDS in the hosting settings.'};
  try{return {configured:true,config:{apiKey,channelIds:ids.map(normalizeChannelId)}};}
  catch(error){return {configured:true,error:error instanceof Error?error.message:'YouTube settings are invalid.'};}
}

export type SocialPlatformResult={platform:SocialPlatform;configured:boolean;ok:boolean;error?:string};
const cache=new Map<string,{expires:number;posts:SocialPost[]}>();
async function cached(platform:SocialPlatform,range:CampaignRange,fresh:boolean,load:()=>Promise<SocialPost[]>){
  const key=`${platform}:${range.from}:${range.to}`,hit=cache.get(key);
  if(!fresh&&hit&&hit.expires>Date.now())return hit.posts;
  const posts=await load();cache.set(key,{expires:Date.now()+900000,posts});return posts;
}
export async function socialData(range:CampaignRange,fresh=false){
  validateRange(range);
  const posts:SocialPost[]=[],platforms:SocialPlatformResult[]=[];
  const jobs:[SocialPlatform,SocialConfig<unknown>,(config:never)=>Promise<SocialPost[]>][]=[
    ['instagram',metaConfig('instagram'),(c:MetaSocialConfig)=>fetchInstagram(c,range)],
    ['facebook',metaConfig('facebook'),(c:MetaSocialConfig)=>fetchFacebook(c,range)],
    ['youtube',youtubeConfig(),(c:YouTubeConfig)=>fetchYouTube(c,range)],
  ];
  for(const [platform,config,load] of jobs){
    if(!config.configured){platforms.push({platform,configured:false,ok:false});continue;}
    if(config.error!==undefined){platforms.push({platform,configured:true,ok:false,error:config.error});continue;}
    try{posts.push(...await cached(platform,range,fresh,()=>load(config.config as never)));platforms.push({platform,configured:true,ok:true});}
    catch(error){platforms.push({platform,configured:true,ok:false,error:error instanceof SocialApiError?error.message:'The platform did not return post data.'});}
  }
  return {posts,platforms,fetchedAt:new Date().toISOString()};
}
