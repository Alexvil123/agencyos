import 'server-only';
import {fetchFacebook,fetchInstagram,fetchYouTube,normalizeChannelId,normalizeMetaId,SocialApiError,type MetaSocialConfig,type SocialAccount,type SocialFetch,type SocialPlatform,type SocialPost,type YouTubeConfig} from './social';
import {validateRange,type CampaignRange} from './campaigns';
import {createHash} from 'node:crypto';
import {credentialValues} from './integrations-server';
// Credentials come only from server environment variables (never from the browser, never logged):
//   META_SOCIAL_ACCESS_TOKEN  (system-user or long-lived token: pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights)
//   FACEBOOK_PAGE_IDS, INSTAGRAM_ACCOUNT_IDS (comma separated numeric IDs), optional META_GRAPH_VERSION (default v25.0)
//   YOUTUBE_API_KEY, YOUTUBE_CHANNEL_IDS (comma separated, UC...)
const list=(value:string|undefined)=>(value||'').split(',').map(v=>v.trim()).filter(Boolean);
export type SocialConfig<T>={configured:false}|{configured:true;error:string}|{configured:true;error?:undefined;config:T};
const WHERE='Add them in Settings → Integrations.';
async function metaConfig(org:string,kind:'instagram'|'facebook'):Promise<SocialConfig<MetaSocialConfig>>{
  const {values}=await credentialValues(org,'meta_social'),token=values.token,pages=list(values.facebook_page_ids),accounts=list(values.instagram_account_ids),ids=kind==='instagram'?accounts:pages;
  if(!ids.length)return token&&!pages.length&&!accounts.length&&kind==='instagram'?{configured:true,error:`Add at least one Facebook Page ID or Instagram account ID. ${WHERE}`}:{configured:false};
  if(!token)return {configured:true,error:`The Meta access token is missing. ${WHERE}`};
  try{const version=/^v\d+\.\d+$/.test(values.version||'')?values.version!:'v25.0';return {configured:true,config:{token,version,facebookPages:pages.map(normalizeMetaId),instagramAccounts:accounts.map(normalizeMetaId)}};}
  catch(error){return {configured:true,error:error instanceof Error?error.message:'Meta settings are invalid.'};}
}
async function youtubeConfig(org:string):Promise<SocialConfig<YouTubeConfig>>{
  const {values}=await credentialValues(org,'youtube'),apiKey=values.api_key,ids=list(values.channel_ids);
  if(!apiKey&&!ids.length)return {configured:false};
  if(!apiKey||!ids.length)return {configured:true,error:`Both the YouTube API key and the channel IDs are needed. ${WHERE}`};
  try{return {configured:true,config:{apiKey,channelIds:ids.map(normalizeChannelId)}};}
  catch(error){return {configured:true,error:error instanceof Error?error.message:'YouTube settings are invalid.'};}
}

export type SocialPlatformResult={platform:SocialPlatform;configured:boolean;ok:boolean;error?:string};
const cache=new Map<string,{expires:number;data:SocialFetch}>();
// The key includes a fingerprint of the saved credentials, so saving or removing them in Settings takes effect immediately everywhere.
const fingerprint=(config:unknown)=>createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0,12);
async function cached(platform:SocialPlatform,config:unknown,range:CampaignRange,fresh:boolean,load:()=>Promise<SocialFetch>){
  const key=`${platform}:${fingerprint(config)}:${range.from}:${range.to}`,hit=cache.get(key);
  if(!fresh&&hit&&hit.expires>Date.now())return hit.data;
  const data=await load();cache.set(key,{expires:Date.now()+900000,data});return data;
}
export async function socialData(range:CampaignRange,org:string,fresh=false){
  validateRange(range);
  const posts:SocialPost[]=[],accounts:SocialAccount[]=[],platforms:SocialPlatformResult[]=[];
  const jobs:[SocialPlatform,SocialConfig<unknown>,(config:never)=>Promise<SocialFetch>][]=[
    ['instagram',await metaConfig(org,'instagram'),(c:MetaSocialConfig)=>fetchInstagram(c,range)],
    ['facebook',await metaConfig(org,'facebook'),(c:MetaSocialConfig)=>fetchFacebook(c,range)],
    ['youtube',await youtubeConfig(org),(c:YouTubeConfig)=>fetchYouTube(c,range)],
  ];
  for(const [platform,config,load] of jobs){
    if(!config.configured){platforms.push({platform,configured:false,ok:false});continue;}
    if(config.error!==undefined){platforms.push({platform,configured:true,ok:false,error:config.error});continue;}
    try{const data=await cached(platform,config.config,range,fresh,()=>load(config.config as never));posts.push(...data.posts);accounts.push(...data.accounts);platforms.push({platform,configured:true,ok:true});}
    catch(error){platforms.push({platform,configured:true,ok:false,error:error instanceof SocialApiError?error.message:'The platform did not return post data.'});}
  }
  return {posts,accounts,platforms,fetchedAt:new Date().toISOString()};
}
