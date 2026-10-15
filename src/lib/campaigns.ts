// Meta Ads and Google Ads campaign reporting. This file is pure (no environment, no secrets): request building,
// parsing and totals. The network calls take an injectable `fetcher` so they can be tested without real credentials.
export type CampaignPlatform='meta'|'google';
type CampaignStatus='active'|'paused'|'ended'|'other';
export type CampaignRow={platform:CampaignPlatform;account:string;id:string;name:string;status:CampaignStatus;objective:string;currency:string;spend:number;impressions:number;clicks:number;conversions:number};
export type CampaignRange={from:string;to:string};
export type Fetcher=typeof fetch;

// Meta reports most failures as HTTP 400 with an error code in the body (190 = expired or invalid token, 10/200-299 = permission, 4/17/32/613 = rate limit).
function metaEffectiveStatus(status:number,code?:number){
  if(code===undefined)return status;
  if(code===190||code===102||code===467)return 401;
  if(code===10||(code>=200&&code<300))return 403;
  if(code===4||code===17||code===32||code===613)return 429;
  return status;
}
export class CampaignApiError extends Error{
  status:number;
  constructor(public platform:CampaignPlatform,rawStatus:number,code?:number){
    const status=platform==='meta'?metaEffectiveStatus(rawStatus,code):rawStatus;
    super(status===401||status===190?`${platform==='meta'?'Meta':'Google'} rejected the saved credentials. Create a new access token and update it in the hosting settings.`
      :status===403?`${platform==='meta'?'Meta':'Google'} denied access. Check that the token can read the ad account and that the account ID is correct.`
      :status===429?`${platform==='meta'?'Meta':'Google'} rate limit reached. Try again in a few minutes.`
      :status===0?`${platform==='meta'?'Meta':'Google'} could not be reached. Check the connection and try again.`
      :`${platform==='meta'?'Meta':'Google'} could not return campaign data (HTTP ${status}). Check the account IDs and API version in the hosting settings.`);
    this.status=status;
  }
}

const DAY=86400000;
export function validateRange(range:CampaignRange){
  const ok=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
  if(!ok(range.from)||!ok(range.to)||range.from>range.to)throw new Error('Choose a valid date range.');
  if((Date.parse(`${range.to}T00:00:00Z`)-Date.parse(`${range.from}T00:00:00Z`))/DAY>366)throw new Error('Choose a range of one year or less.');
  return range;
}

// ---------- derived figures ----------
export const ctr=(row:Pick<CampaignRow,'clicks'|'impressions'>)=>row.impressions?row.clicks/row.impressions*100:null;
export const cpc=(row:Pick<CampaignRow,'spend'|'clicks'>)=>row.clicks?row.spend/row.clicks:null;
export const costPerResult=(row:Pick<CampaignRow,'spend'|'conversions'>)=>row.conversions?row.spend/row.conversions:null;
/** Totals are kept per currency: spend in different currencies is never added together. */
export function totalsByCurrency(rows:CampaignRow[]){
  const totals=new Map<string,{currency:string;spend:number;impressions:number;clicks:number;conversions:number;campaigns:number}>();
  for(const row of rows){
    const t=totals.get(row.currency)||{currency:row.currency,spend:0,impressions:0,clicks:0,conversions:0,campaigns:0};
    t.spend+=row.spend;t.impressions+=row.impressions;t.clicks+=row.clicks;t.conversions+=row.conversions;t.campaigns++;totals.set(row.currency,t);
  }
  return [...totals.values()].sort((a,b)=>b.spend-a.spend);
}
const num=(value:unknown)=>{const n=typeof value==='string'||typeof value==='number'?Number(value):0;return Number.isFinite(n)?n:0;};

// ---------- Meta (Graph / Marketing API) ----------
export type MetaConfig={token:string;accounts:string[];version:string};
const META_HOST='graph.facebook.com';
const META_LEADS=['lead','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_lead'];
const META_PURCHASES=['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase'];
type MetaAction={action_type?:string;value?:string};
// Meta reports the same result under several overlapping action types, so only the first present type of each group counts.
export function metaConversions(actions:MetaAction[]|undefined){
  const find=(group:string[])=>{for(const type of group){const hit=actions?.find(a=>a.action_type===type);if(hit)return num(hit.value);}return 0;};
  return find(META_LEADS)+find(META_PURCHASES);
}
export function metaStatus(value:string|undefined):CampaignStatus{
  if(value==='ACTIVE')return 'active';
  if(value&&/PAUSED/.test(value))return 'paused';
  if(value==='ARCHIVED'||value==='DELETED')return 'ended';
  return 'other';
}
export function normalizeMetaAccount(value:string){const id=value.trim().replace(/^act_/i,'');if(!/^\d{5,20}$/.test(id))throw new Error('Meta ad account IDs must be numbers (for example act_1234567890).');return `act_${id}`;}
function metaRequestUrls(config:MetaConfig,account:string,range:CampaignRange){
  const base=`https://${META_HOST}/${config.version}/${account}`,time=encodeURIComponent(JSON.stringify({since:range.from,until:range.to}));
  return {
    campaigns:`${base}/campaigns?fields=${encodeURIComponent('id,name,effective_status,objective')}&limit=500`,
    insights:`${base}/insights?level=campaign&fields=${encodeURIComponent('campaign_id,campaign_name,spend,impressions,clicks,actions,account_currency')}&time_range=${time}&limit=500`,
  };
}
async function metaPages<T>(url:string,token:string,fetcher:Fetcher){
  const items:T[]=[];let next:string|undefined=url;
  for(let page=0;next&&page<20;page++){
    if(new URL(next).hostname!==META_HOST)throw new CampaignApiError('meta',502);
    let response:Response;
    try{response=await fetcher(next,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}
    catch{throw new CampaignApiError('meta',0);}
    if(!response.ok){
      let code:number|undefined;
      try{const body=await response.json() as {error?:{code?:unknown}};if(typeof body?.error?.code==='number')code=body.error.code;}catch{/* Only the numeric error code is used, never shown. */}
      throw new CampaignApiError('meta',response.status,code);
    }
    const body=await response.json() as {data?:T[];paging?:{next?:string}};
    items.push(...(body.data||[]));next=body.paging?.next;
  }
  return items;
}
export async function fetchMeta(config:MetaConfig,range:CampaignRange,fetcher:Fetcher=fetch):Promise<CampaignRow[]>{
  validateRange(range);const rows:CampaignRow[]=[];
  for(const account of config.accounts){
    const urls=metaRequestUrls(config,account,range);
    const [campaigns,insights]=await Promise.all([
      metaPages<{id:string;name?:string;effective_status?:string;objective?:string}>(urls.campaigns,config.token,fetcher),
      metaPages<{campaign_id:string;campaign_name?:string;spend?:string;impressions?:string;clicks?:string;actions?:MetaAction[];account_currency?:string}>(urls.insights,config.token,fetcher),
    ]);
    const stats=new Map(insights.map(i=>[i.campaign_id,i])),seen=new Set<string>(),currency=insights.find(i=>i.account_currency)?.account_currency||'';
    for(const campaign of campaigns){
      seen.add(campaign.id);const stat=stats.get(campaign.id);
      rows.push({platform:'meta',account,id:campaign.id,name:campaign.name||campaign.id,status:metaStatus(campaign.effective_status),objective:(campaign.objective||'').replaceAll('_',' ').toLowerCase(),currency:stat?.account_currency||currency,spend:num(stat?.spend),impressions:num(stat?.impressions),clicks:num(stat?.clicks),conversions:metaConversions(stat?.actions)});
    }
    for(const stat of insights)if(!seen.has(stat.campaign_id))rows.push({platform:'meta',account,id:stat.campaign_id,name:stat.campaign_name||stat.campaign_id,status:'other',objective:'',currency:stat.account_currency||currency,spend:num(stat.spend),impressions:num(stat.impressions),clicks:num(stat.clicks),conversions:metaConversions(stat.actions)});
  }
  return rows;
}

// ---------- Google Ads ----------
export type GoogleConfig={developerToken:string;clientId:string;clientSecret:string;refreshToken:string;customerIds:string[];loginCustomerId?:string;version:string};
const GOOGLE_HOST='googleads.googleapis.com';
export function normalizeGoogleCustomer(value:string){const id=value.trim().replaceAll('-','');if(!/^\d{10}$/.test(id))throw new Error('Google Ads customer IDs have 10 digits (for example 123-456-7890).');return id;}
export function googleQuery(range:CampaignRange){
  validateRange(range);
  return `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, customer.currency_code, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${range.from}' AND '${range.to}' AND campaign.status != 'REMOVED'`;
}
export function googleStatus(value:string|undefined):CampaignStatus{return value==='ENABLED'?'active':value==='PAUSED'?'paused':value==='REMOVED'?'ended':'other';}
type GoogleResult={campaign?:{id?:string;name?:string;status?:string;advertisingChannelType?:string};customer?:{currencyCode?:string};metrics?:{costMicros?:string;impressions?:string;clicks?:string;conversions?:number|string}};
export function parseGoogleRows(account:string,results:GoogleResult[]):CampaignRow[]{
  return results.filter(r=>r.campaign?.id).map(r=>({platform:'google' as const,account,id:String(r.campaign!.id),name:r.campaign!.name||String(r.campaign!.id),status:googleStatus(r.campaign!.status),objective:(r.campaign!.advertisingChannelType||'').replaceAll('_',' ').toLowerCase(),currency:r.customer?.currencyCode||'',spend:num(r.metrics?.costMicros)/1_000_000,impressions:num(r.metrics?.impressions),clicks:num(r.metrics?.clicks),conversions:num(r.metrics?.conversions)}));
}
async function googleAccessToken(config:GoogleConfig,fetcher:Fetcher){
  let response:Response;
  try{response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch{throw new CampaignApiError('google',0);}
  if(!response.ok)throw new CampaignApiError('google',response.status===400?401:response.status);
  const body=await response.json() as {access_token?:string};
  if(!body.access_token)throw new CampaignApiError('google',401);
  return body.access_token;
}
export async function fetchGoogle(config:GoogleConfig,range:CampaignRange,fetcher:Fetcher=fetch):Promise<CampaignRow[]>{
  const query=googleQuery(range),token=await googleAccessToken(config,fetcher),rows:CampaignRow[]=[];
  for(const customer of config.customerIds){
    let pageToken:string|undefined;
    for(let page=0;page<50;page++){
      let response:Response;
      try{response=await fetcher(`https://${GOOGLE_HOST}/${config.version}/customers/${customer}/googleAds:search`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'developer-token':config.developerToken,'Content-Type':'application/json',...(config.loginCustomerId?{'login-customer-id':config.loginCustomerId}:{})},body:JSON.stringify({query,...(pageToken?{pageToken}:{})}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});}
      catch{throw new CampaignApiError('google',0);}
      if(!response.ok)throw new CampaignApiError('google',response.status);
      const body=await response.json() as {results?:GoogleResult[];nextPageToken?:string};
      rows.push(...parseGoogleRows(customer,body.results||[]));
      pageToken=body.nextPageToken;if(!pageToken)break;
    }
  }
  return rows;
}
