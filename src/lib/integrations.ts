import {normalizeGoogleCustomer,normalizeMetaAccount} from './campaigns';
import {normalizeChannelId,normalizeMetaId} from './social';

// Integration credentials that the Owner enters in Settings. This module is pure (no environment, no database):
// provider definitions, validation, masking and encryption. Secrets are sealed with AES-256-GCM and are never returned to the browser.
export type ProviderKey='meta_social'|'youtube'|'meta_ads'|'google_ads'|'google_sheets'|'jira_oauth_app';
type FieldSpec={key:string;label:string;secret?:boolean;required?:boolean;multiline?:boolean;placeholder?:string;help?:string};
export type ProviderSpec={key:ProviderKey;title:string;description:string;env:Record<string,string>;fields:FieldSpec[];guide:string};

export const PROVIDERS:ProviderSpec[]=[
  {key:'meta_social',title:'Instagram & Facebook (Analytics)',description:'Post views, likes and engagement for your Pages and Instagram accounts.',guide:'Business Settings → System users → generate a token with pages_read_engagement, read_insights, instagram_basic and instagram_manage_insights.',
    env:{token:'META_SOCIAL_ACCESS_TOKEN',facebook_page_ids:'FACEBOOK_PAGE_IDS',instagram_account_ids:'INSTAGRAM_ACCOUNT_IDS',version:'META_GRAPH_VERSION'},
    fields:[{key:'token',label:'Access token',secret:true,required:true,placeholder:'EAAB…',help:'System-user token from Meta Business Settings.'},{key:'facebook_page_ids',label:'Facebook Page IDs',placeholder:'1234567890, 9876543210',help:'Comma separated numbers.'},{key:'instagram_account_ids',label:'Instagram account IDs',placeholder:'17841400000000000',help:'Instagram Business/Creator accounts linked to a Page. Comma separated.'},{key:'version',label:'Graph API version (optional)',placeholder:'v25.0'}]},
  {key:'youtube',title:'YouTube (Analytics)',description:'Video views, likes and comments for your channels.',guide:'Google Cloud → APIs & Services → enable YouTube Data API v3 → Credentials → API key. Channel IDs: YouTube Studio → Settings → Channel → Advanced.',
    env:{api_key:'YOUTUBE_API_KEY',channel_ids:'YOUTUBE_CHANNEL_IDS'},
    fields:[{key:'api_key',label:'API key',secret:true,required:true,placeholder:'AIza…'},{key:'channel_ids',label:'Channel IDs',required:true,placeholder:'UCxxxxxxxxxxxxxxxxxxxxxx',help:'Start with UC. Comma separated.'}]},
  {key:'meta_ads',title:'Meta Ads (Campaigns)',description:'Spend, clicks and results for your Facebook and Instagram ad accounts.',guide:'Use a system-user token with ads_read. Ad account IDs are in Ads Manager (act_…).',
    env:{token:'META_ADS_ACCESS_TOKEN',account_ids:'META_ADS_ACCOUNT_IDS',version:'META_GRAPH_VERSION'},
    fields:[{key:'token',label:'Access token',secret:true,required:true,placeholder:'EAAB…'},{key:'account_ids',label:'Ad account IDs',required:true,placeholder:'act_1234567890',help:'Comma separated.'},{key:'version',label:'Graph API version (optional)',placeholder:'v25.0'}]},
  {key:'google_ads',title:'Google Ads (Campaigns)',description:'Spend, clicks and conversions for your Google Ads accounts.',guide:'Developer token: Google Ads manager account → API Center. OAuth client and refresh token: Google Cloud (scope https://www.googleapis.com/auth/adwords).',
    env:{developer_token:'GOOGLE_ADS_DEVELOPER_TOKEN',client_id:'GOOGLE_ADS_CLIENT_ID',client_secret:'GOOGLE_ADS_CLIENT_SECRET',refresh_token:'GOOGLE_ADS_REFRESH_TOKEN',customer_ids:'GOOGLE_ADS_CUSTOMER_IDS',login_customer_id:'GOOGLE_ADS_LOGIN_CUSTOMER_ID',api_version:'GOOGLE_ADS_API_VERSION'},
    fields:[{key:'developer_token',label:'Developer token',secret:true,required:true},{key:'client_id',label:'OAuth client ID',required:true},{key:'client_secret',label:'OAuth client secret',secret:true,required:true},{key:'refresh_token',label:'Refresh token',secret:true,required:true},{key:'customer_ids',label:'Customer IDs',required:true,placeholder:'123-456-7890',help:'Comma separated.'},{key:'login_customer_id',label:'Manager (MCC) account ID (optional)',placeholder:'123-456-7890'},{key:'api_version',label:'API version (optional)',placeholder:'v25'}]},
  {key:'google_sheets',title:'Google Sheets (Sales)',description:'The Business Development spreadsheet used by the Sales menu.',guide:'Google Cloud → create a service account → Keys → JSON. Share the spreadsheet with the service account email as Editor.',
    env:{service_account_json:'GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON'},
    fields:[{key:'service_account_json',label:'Service account key (JSON)',secret:true,required:true,multiline:true,placeholder:'Paste the contents of the JSON key file',help:'Verified against the spreadsheet before it is saved.'}]},
  {key:'jira_oauth_app',title:'Jira OAuth app',description:'The Atlassian OAuth app used by "Connect Jira" (the connection itself is made below).',guide:'developer.atlassian.com → your OAuth 2.0 app → Settings (Client ID and Secret). Register the callback URL shown in the Jira section.',
    env:{client_id:'JIRA_OAUTH_CLIENT_ID',client_secret:'JIRA_OAUTH_CLIENT_SECRET'},
    fields:[{key:'client_id',label:'Client ID',required:true},{key:'client_secret',label:'Client secret',secret:true,required:true}]},
];
export const providerSpec=(key:string)=>PROVIDERS.find(p=>p.key===key);
export type Payload=Record<string,string>;

// ---------- validation ----------
const list=(value:string)=>value.split(/[,\n]/).map(v=>v.trim()).filter(Boolean);
const need=(values:Payload,key:string,label:string,min=1)=>{const v=(values[key]||'').trim();if(v.length<min)throw new Error(`Enter the ${label}.`);return v;};
/** Returns the normalised values to store, or throws a plain-language message. */
export function validateProvider(provider:ProviderKey,input:Payload):Payload{
  const out:Payload={},v=(key:string)=>(input[key]||'').trim();
  const version=(key:string,pattern:RegExp,example:string)=>{if(v(key)){if(!pattern.test(v(key)))throw new Error(`The API version must look like ${example}.`);out[key]=v(key);}};
  switch(provider){
    case 'meta_social':{
      out.token=need(input,'token','access token',20);
      const pages=list(v('facebook_page_ids')).map(normalizeMetaId),accounts=list(v('instagram_account_ids')).map(normalizeMetaId);
      if(!pages.length&&!accounts.length)throw new Error('Enter at least one Facebook Page ID or Instagram account ID.');
      out.facebook_page_ids=pages.join(',');out.instagram_account_ids=accounts.join(',');version('version',/^v\d+\.\d+$/,'v25.0');return out;}
    case 'meta_ads':{
      out.token=need(input,'token','access token',20);
      const ids=list(v('account_ids')).map(normalizeMetaAccount);if(!ids.length)throw new Error('Enter at least one ad account ID.');out.account_ids=ids.join(',');version('version',/^v\d+\.\d+$/,'v25.0');return out;}
    case 'youtube':{
      out.api_key=need(input,'api_key','API key',20);
      const ids=list(v('channel_ids')).map(normalizeChannelId);if(!ids.length)throw new Error('Enter at least one YouTube channel ID.');out.channel_ids=ids.join(',');return out;}
    case 'google_ads':{
      out.developer_token=need(input,'developer_token','developer token');out.client_id=need(input,'client_id','OAuth client ID');out.client_secret=need(input,'client_secret','OAuth client secret');out.refresh_token=need(input,'refresh_token','refresh token');
      const ids=list(v('customer_ids')).map(normalizeGoogleCustomer);if(!ids.length)throw new Error('Enter at least one customer ID.');out.customer_ids=ids.join(',');
      if(v('login_customer_id'))out.login_customer_id=normalizeGoogleCustomer(v('login_customer_id'));version('api_version',/^v\d+$/,'v25');return out;}
    case 'google_sheets':{
      let parsed:{type?:unknown;client_email?:unknown;private_key?:unknown};
      try{parsed=JSON.parse(need(input,'service_account_json','service account key'));}catch{throw new Error('The service account key must be the JSON file contents.');}
      if(parsed.type!=='service_account'||typeof parsed.client_email!=='string'||!parsed.client_email.endsWith('.iam.gserviceaccount.com')||typeof parsed.private_key!=='string'||!parsed.private_key.includes('PRIVATE KEY'))throw new Error('This is not a Google service account key. Download the JSON key for a service account.');
      out.service_account_json=JSON.stringify({type:'service_account',client_email:parsed.client_email,private_key:parsed.private_key});return out;}
    case 'jira_oauth_app':{
      out.client_id=need(input,'client_id','client ID',5);out.client_secret=need(input,'client_secret','client secret',10);
      if(/\s/.test(out.client_secret)||/^\*+$/.test(out.client_secret))throw new Error('The client secret looks incomplete. Copy the whole value from Atlassian.');return out;}
  }
}
/** Blank secret fields keep the stored value, so a field can be edited without retyping every secret. */
export function mergeSubmitted(spec:ProviderSpec,stored:Payload|null,submitted:Payload):Payload{
  const merged:Payload={};
  for(const field of spec.fields){
    const sent=(submitted[field.key]??'').trim();
    if(field.secret&&!sent&&stored?.[field.key])merged[field.key]=stored[field.key];
    else if(sent)merged[field.key]=sent;
    else if(!field.secret&&field.key in submitted)merged[field.key]='';
    else if(stored?.[field.key])merged[field.key]=stored[field.key];
  }
  return merged;
}
export function hintFor(provider:ProviderKey,values:Payload){
  const count=(key:string)=>list(values[key]||'').length,plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
  switch(provider){
    case 'meta_social':return [count('facebook_page_ids')?plural(count('facebook_page_ids'),'Facebook Page'):'',count('instagram_account_ids')?plural(count('instagram_account_ids'),'Instagram account'):''].filter(Boolean).join(' · ');
    case 'meta_ads':return plural(count('account_ids'),'ad account');
    case 'youtube':return plural(count('channel_ids'),'channel');
    case 'google_ads':return plural(count('customer_ids'),'Google Ads account');
    case 'google_sheets':{try{return `Service account ${JSON.parse(values.service_account_json||'{}').client_email||''}`.trim();}catch{return 'Service account';}}
    case 'jira_oauth_app':return `Client ID ${(values.client_id||'').slice(0,6)}…`;
  }
}
export type PublicIntegration={provider:ProviderKey;source:'stored'|'env'|'file'|'none';hint:string;updatedAt:string|null;values:Payload;has:Record<string,boolean>;accounts:AccountEntry[]};
/** What the browser may see: non-secret values and only a yes/no for each secret. */
export function publicIntegration(spec:ProviderSpec,source:PublicIntegration['source'],payload:Payload|null,updatedAt:string|null,hint=''):PublicIntegration{
  const values:Payload={},has:Record<string,boolean>={};
  for(const field of spec.fields){
    if(field.secret)has[field.key]=Boolean(payload?.[field.key]);
    else if(payload?.[field.key]!==undefined)values[field.key]=payload[field.key];
  }
  return {provider:spec.key,source,hint:hint||(payload?hintFor(spec.key,payload):''),updatedAt,values,has,accounts:payload?accountsOf(spec.key,payload):[]};
}
// ---------- accounts (several Pages / channels / ad accounts per integration) ----------
type AccountKind={field:string;noun:string;normalize:(value:string)=>string;placeholder:string};
type AccountEntry={field:string;id:string;label:string};
export const ACCOUNT_KINDS:Partial<Record<ProviderKey,AccountKind[]>>={
  meta_social:[{field:'facebook_page_ids',noun:'Facebook Page',normalize:normalizeMetaId,placeholder:'Page ID, e.g. 1234567890'},{field:'instagram_account_ids',noun:'Instagram account',normalize:normalizeMetaId,placeholder:'Instagram account ID, e.g. 17841400000000000'}],
  youtube:[{field:'channel_ids',noun:'YouTube channel',normalize:normalizeChannelId,placeholder:'Channel ID starting with UC'}],
  meta_ads:[{field:'account_ids',noun:'ad account',normalize:normalizeMetaAccount,placeholder:'act_1234567890'}],
  google_ads:[{field:'customer_ids',noun:'Google Ads account',normalize:normalizeGoogleCustomer,placeholder:'123-456-7890'}],
};
const MAX_ACCOUNTS=50;
const readLabels=(payload:Payload):Record<string,string>=>{try{const v=JSON.parse(payload.labels||'{}') as unknown;return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([,x])=>typeof x==='string')) as Record<string,string>:{};}catch{return {};}};
export function accountsOf(provider:ProviderKey,payload:Payload):AccountEntry[]{
  const labels=readLabels(payload);
  return (ACCOUNT_KINDS[provider]||[]).flatMap(kind=>list(payload[kind.field]||'').map(id=>({field:kind.field,id,label:labels[kind.field+':'+id]||''})));
}
/** Keeps the account names (client labels) for the accounts that are still listed. */
export function keepLabels(provider:ProviderKey,from:Payload|null,to:Payload):Payload{
  if(!from?.labels)return to;const labels=readLabels(from),kept:Record<string,string>={};
  for(const entry of accountsOf(provider,to)){const label=labels[entry.field+':'+entry.id];if(label)kept[entry.field+':'+entry.id]=label;}
  return Object.keys(kept).length?{...to,labels:JSON.stringify(kept)}:to;
}
/** Adds or removes one account in a payload and returns the new payload. Throws a plain-language message. */
export function changeAccount(provider:ProviderKey,payload:Payload,change:{op:'add'|'remove';field:string;id:string;label?:string}):Payload{
  const kind=(ACCOUNT_KINDS[provider]||[]).find(k=>k.field===change.field);if(!kind)throw new Error('This integration has no accounts to change.');
  const current=list(payload[kind.field]||''),labels=readLabels(payload),key=(id:string)=>kind.field+':'+id;
  if(change.op==='add'){
    const id=kind.normalize(change.id.trim());
    if(current.includes(id))throw new Error('That '+kind.noun+' is already added.');
    if(accountsOf(provider,payload).length>=MAX_ACCOUNTS)throw new Error('You can add up to '+MAX_ACCOUNTS+' accounts.');
    current.push(id);const label=(change.label||'').trim().slice(0,80);if(label)labels[key(id)]=label;
  }else{
    if(!current.includes(change.id))throw new Error('That '+kind.noun+' is not in the list.');
    current.splice(current.indexOf(change.id),1);delete labels[key(change.id)];
  }
  const next:Payload={...payload,[kind.field]:current.join(',')};
  if(Object.keys(labels).length)next.labels=JSON.stringify(labels);else delete next.labels;
  return next;
}

/** Stored values win; when nothing is stored the hosting environment variables are used (so existing setups keep working). */
export function pickValues(spec:ProviderSpec,stored:Payload|null,env:Record<string,string|undefined>):{source:'stored'|'env'|'none';values:Record<string,string|undefined>}{
  if(stored)return {source:'stored',values:Object.fromEntries(Object.keys(spec.env).map(key=>[key,stored[key]||undefined]))};
  const values=Object.fromEntries(Object.entries(spec.env).map(([key,name])=>[key,env[name]?.trim()||undefined]));
  return {source:Object.values(values).some(Boolean)?'env':'none',values};
}
