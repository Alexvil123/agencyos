import 'server-only';
import {createHash} from 'node:crypto';
import {fetchGoogle,fetchMeta,normalizeGoogleCustomer,normalizeMetaAccount,CampaignApiError,validateRange,type CampaignPlatform,type CampaignRange,type CampaignRow,type GoogleConfig,type MetaConfig} from './campaigns';
import {credentialValues} from './integrations-server';
// Credentials are entered by the Owner in Settings → Integrations (stored encrypted); hosting environment variables are the fallback:
//   META_ADS_ACCESS_TOKEN, META_ADS_ACCOUNT_IDS (comma separated), optional META_GRAPH_VERSION (default v25.0)
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
//   GOOGLE_ADS_CUSTOMER_IDS (comma separated), optional GOOGLE_ADS_LOGIN_CUSTOMER_ID, GOOGLE_ADS_API_VERSION (default v25)
// They never reach the browser and are never logged.
const list=(value:string|undefined)=>(value||'').split(',').map(v=>v.trim()).filter(Boolean);
export type PlatformConfig<T>={configured:false}|{configured:true;error:string}|{configured:true;error?:undefined;config:T};
const WHERE='Add them in Settings → Integrations.';
export async function metaConfig(org:string):Promise<PlatformConfig<MetaConfig>>{
  const {values}=await credentialValues(org,'meta_ads'),token=values.token,ids=list(values.account_ids);
  if(!token&&!ids.length)return {configured:false};
  if(!token||!ids.length)return {configured:true,error:`Both the Meta access token and the ad account IDs are needed. ${WHERE}`};
  try{const version=/^v\d+\.\d+$/.test(values.version||'')?values.version!:'v25.0';return {configured:true,config:{token,accounts:ids.map(normalizeMetaAccount),version}};}
  catch(error){return {configured:true,error:error instanceof Error?error.message:'Meta settings are invalid.'};}
}
export async function googleConfig(org:string):Promise<PlatformConfig<GoogleConfig>>{
  const {values}=await credentialValues(org,'google_ads'),parts={developerToken:values.developer_token,clientId:values.client_id,clientSecret:values.client_secret,refreshToken:values.refresh_token},ids=list(values.customer_ids);
  if(!Object.values(parts).some(Boolean)&&!ids.length)return {configured:false};
  if(!parts.developerToken||!parts.clientId||!parts.clientSecret||!parts.refreshToken||!ids.length)return {configured:true,error:`The developer token, OAuth client ID and secret, refresh token and customer IDs are all needed. ${WHERE}`};
  try{
    const login=values.login_customer_id,version=/^v\d+$/.test(values.api_version||'')?values.api_version!:'v25';
    return {configured:true,config:{developerToken:parts.developerToken,clientId:parts.clientId,clientSecret:parts.clientSecret,refreshToken:parts.refreshToken,customerIds:ids.map(normalizeGoogleCustomer),...(login?{loginCustomerId:normalizeGoogleCustomer(login)}:{}),version}};
  }catch(error){return {configured:true,error:error instanceof Error?error.message:'Google Ads settings are invalid.'};}
}

export type PlatformResult={platform:CampaignPlatform;configured:boolean;ok:boolean;error?:string};
const cache=new Map<string,{expires:number;rows:CampaignRow[]}>();
// The cache key includes a fingerprint of the saved credentials, so saving or removing them in Settings takes effect immediately everywhere.
const fingerprint=(config:unknown)=>createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0,12);
async function cached(platform:CampaignPlatform,config:unknown,range:CampaignRange,fresh:boolean,load:()=>Promise<CampaignRow[]>){
  const key=`${platform}:${fingerprint(config)}:${range.from}:${range.to}`,hit=cache.get(key);
  if(!fresh&&hit&&hit.expires>Date.now())return hit.rows;
  const rows=await load();cache.set(key,{expires:Date.now()+300000,rows});return rows;
}
export async function campaignData(range:CampaignRange,org:string,fresh=false){
  validateRange(range);
  const rows:CampaignRow[]=[],platforms:PlatformResult[]=[];
  const [meta,google]=await Promise.all([metaConfig(org),googleConfig(org)]);
  if(!meta.configured)platforms.push({platform:'meta',configured:false,ok:false});
  else if(meta.error!==undefined)platforms.push({platform:'meta',configured:true,ok:false,error:meta.error});
  else{
    try{rows.push(...await cached('meta',meta.config,range,fresh,()=>fetchMeta(meta.config,range)));platforms.push({platform:'meta',configured:true,ok:true});}
    catch(error){platforms.push({platform:'meta',configured:true,ok:false,error:error instanceof CampaignApiError?error.message:'Meta did not return campaign data.'});}
  }
  if(!google.configured)platforms.push({platform:'google',configured:false,ok:false});
  else if(google.error!==undefined)platforms.push({platform:'google',configured:true,ok:false,error:google.error});
  else{
    try{rows.push(...await cached('google',google.config,range,fresh,()=>fetchGoogle(google.config,range)));platforms.push({platform:'google',configured:true,ok:true});}
    catch(error){platforms.push({platform:'google',configured:true,ok:false,error:error instanceof CampaignApiError?error.message:'Google Ads did not return campaign data.'});}
  }
  return {rows,platforms,fetchedAt:new Date().toISOString()};
}
