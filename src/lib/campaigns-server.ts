import 'server-only';
import {fetchGoogle,fetchMeta,normalizeGoogleCustomer,normalizeMetaAccount,CampaignApiError,validateRange,type CampaignPlatform,type CampaignRange,type CampaignRow,type GoogleConfig,type MetaConfig} from './campaigns';
// Credentials come only from server environment variables (never from the browser, never logged):
//   META_ADS_ACCESS_TOKEN, META_ADS_ACCOUNT_IDS (comma separated), optional META_GRAPH_VERSION (default v25.0)
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
//   GOOGLE_ADS_CUSTOMER_IDS (comma separated), optional GOOGLE_ADS_LOGIN_CUSTOMER_ID, GOOGLE_ADS_API_VERSION (default v25)
const list=(value:string|undefined)=>(value||'').split(',').map(v=>v.trim()).filter(Boolean);
export type PlatformConfig<T>={configured:false}|{configured:true;error:string}|{configured:true;error?:undefined;config:T};
export function metaConfig():PlatformConfig<MetaConfig>{
  const token=process.env.META_ADS_ACCESS_TOKEN?.trim(),ids=list(process.env.META_ADS_ACCOUNT_IDS);
  if(!token&&!ids.length)return {configured:false};
  if(!token||!ids.length)return {configured:true,error:'Set both META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_IDS in the hosting settings.'};
  try{const version=/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION||'')?process.env.META_GRAPH_VERSION!:'v25.0';return {configured:true,config:{token,accounts:ids.map(normalizeMetaAccount),version}};}
  catch(error){return {configured:true,error:error instanceof Error?error.message:'Meta settings are invalid.'};}
}
export function googleConfig():PlatformConfig<GoogleConfig>{
  const e=process.env,values={developerToken:e.GOOGLE_ADS_DEVELOPER_TOKEN?.trim(),clientId:e.GOOGLE_ADS_CLIENT_ID?.trim(),clientSecret:e.GOOGLE_ADS_CLIENT_SECRET?.trim(),refreshToken:e.GOOGLE_ADS_REFRESH_TOKEN?.trim()},ids=list(e.GOOGLE_ADS_CUSTOMER_IDS);
  if(!Object.values(values).some(Boolean)&&!ids.length)return {configured:false};
  if(!values.developerToken||!values.clientId||!values.clientSecret||!values.refreshToken||!ids.length)return {configured:true,error:'Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN and GOOGLE_ADS_CUSTOMER_IDS in the hosting settings.'};
  try{
    const login=e.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim(),version=/^v\d+$/.test(e.GOOGLE_ADS_API_VERSION||'')?e.GOOGLE_ADS_API_VERSION!:'v25';
    return {configured:true,config:{developerToken:values.developerToken,clientId:values.clientId,clientSecret:values.clientSecret,refreshToken:values.refreshToken,customerIds:ids.map(normalizeGoogleCustomer),...(login?{loginCustomerId:normalizeGoogleCustomer(login)}:{}),version}};
  }catch(error){return {configured:true,error:error instanceof Error?error.message:'Google Ads settings are invalid.'};}
}

export type PlatformResult={platform:CampaignPlatform;configured:boolean;ok:boolean;error?:string};
const cache=new Map<string,{expires:number;rows:CampaignRow[]}>();
async function cached(platform:CampaignPlatform,range:CampaignRange,fresh:boolean,load:()=>Promise<CampaignRow[]>){
  const key=`${platform}:${range.from}:${range.to}`,hit=cache.get(key);
  if(!fresh&&hit&&hit.expires>Date.now())return hit.rows;
  const rows=await load();cache.set(key,{expires:Date.now()+300000,rows});return rows;
}
export async function campaignData(range:CampaignRange,fresh=false){
  validateRange(range);
  const rows:CampaignRow[]=[],platforms:PlatformResult[]=[];
  const meta=metaConfig(),google=googleConfig();
  if(!meta.configured)platforms.push({platform:'meta',configured:false,ok:false});
  else if(meta.error!==undefined)platforms.push({platform:'meta',configured:true,ok:false,error:meta.error});
  else{
    try{rows.push(...await cached('meta',range,fresh,()=>fetchMeta(meta.config,range)));platforms.push({platform:'meta',configured:true,ok:true});}
    catch(error){platforms.push({platform:'meta',configured:true,ok:false,error:error instanceof CampaignApiError?error.message:'Meta did not return campaign data.'});}
  }
  if(!google.configured)platforms.push({platform:'google',configured:false,ok:false});
  else if(google.error!==undefined)platforms.push({platform:'google',configured:true,ok:false,error:google.error});
  else{
    try{rows.push(...await cached('google',range,fresh,()=>fetchGoogle(google.config,range)));platforms.push({platform:'google',configured:true,ok:true});}
    catch(error){platforms.push({platform:'google',configured:true,ok:false,error:error instanceof CampaignApiError?error.message:'Google Ads did not return campaign data.'});}
  }
  return {rows,platforms,fetchedAt:new Date().toISOString()};
}
