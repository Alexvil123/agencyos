import type {Payload,ProviderKey} from './integrations';
// Light live checks run when the Owner saves an integration. They prove the credentials are accepted before they replace working ones.
// 'rejected' blocks the save; 'unknown' (network trouble) still saves with a warning. Messages never contain secrets or raw API text.
type VerifyResult={ok:boolean;level:'accepted'|'rejected'|'unknown';message:string};
type Fetcher=typeof fetch;
const list=(value:string|undefined)=>(value||'').split(',').map(v=>v.trim()).filter(Boolean);
const accepted=(message:string):VerifyResult=>({ok:true,level:'accepted',message});
const rejected=(message:string):VerifyResult=>({ok:false,level:'rejected',message});
const unknown=(message:string):VerifyResult=>({ok:true,level:'unknown',message});

async function call(fetcher:Fetcher,url:string,init:RequestInit):Promise<{status:number;body:unknown}|null>{
  try{
    const response=await fetcher(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    let body:unknown=null;try{body=await response.json();}catch{/* not JSON */}
    return {status:response.status,body};
  }catch{return null;}
}
const metaCode=(body:unknown)=>{const code=(body as {error?:{code?:unknown}}|null)?.error?.code;return typeof code==='number'?code:null;};
const badToken=(r:{status:number;body:unknown})=>r.status===401||metaCode(r.body)===190;

async function metaNames(fetcher:Fetcher,token:string,version:string,ids:string[],field:string,what:string):Promise<VerifyResult>{
  const names:string[]=[],problems:string[]=[];
  for(const id of ids.slice(0,10)){
    const r=await call(fetcher,`https://graph.facebook.com/${version}/${id}?fields=${field}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
    if(!r)return unknown('Meta could not be reached, so the credentials were saved without a live check.');
    if(badToken(r))return rejected('Meta rejected this access token. Create a new token and try again.');
    const body=r.body as Record<string,string>|null;
    if(r.status>=200&&r.status<300&&body)names.push(body[field]||id);else problems.push(id);
  }
  if(!names.length)return rejected(`The token is valid but cannot read ${what}. Check the IDs and that the system user is assigned to them.`);
  return accepted(`Connected to ${names.join(', ')}.${problems.length?` Could not read: ${problems.join(', ')}.`:''}`);
}

export async function verifyProvider(provider:ProviderKey,values:Payload,fetcher:Fetcher=fetch):Promise<VerifyResult>{
  switch(provider){
    case 'meta_social':{
      const version=values.version||'v25.0',pages=list(values.facebook_page_ids),accounts=list(values.instagram_account_ids);
      const checks:VerifyResult[]=[];
      if(pages.length)checks.push(await metaNames(fetcher,values.token,version,pages,'name','that Facebook Page'));
      if(accounts.length)checks.push(await metaNames(fetcher,values.token,version,accounts,'username','that Instagram account'));
      const bad=checks.find(c=>c.level==='rejected');if(bad)return bad;
      const unsure=checks.find(c=>c.level==='unknown');if(unsure)return unsure;
      return accepted(checks.map(c=>c.message).join(' '));
    }
    case 'meta_ads':return metaNames(fetcher,values.token,values.version||'v25.0',list(values.account_ids),'name','that ad account');
    case 'youtube':{
      const ids=list(values.channel_ids).slice(0,50),url=new URL('https://www.googleapis.com/youtube/v3/channels');url.searchParams.set('part','snippet');url.searchParams.set('id',ids.join(','));
      const r=await call(fetcher,url.toString(),{headers:{'x-goog-api-key':values.api_key,Accept:'application/json'}});
      if(!r)return unknown('YouTube could not be reached, so the credentials were saved without a live check.');
      if(r.status===400||r.status===401)return rejected('YouTube rejected this API key. Check the key and that YouTube Data API v3 is enabled for it.');
      if(r.status===403)return rejected('YouTube denied the request. Enable YouTube Data API v3 for this key and check its quota and restrictions.');
      if(r.status<200||r.status>=300)return unknown(`YouTube answered with HTTP ${r.status}, so the credentials were saved without a live check.`);
      const items=((r.body as {items?:{snippet?:{title?:string}}[]}|null)?.items)||[];
      if(!items.length)return rejected('No channel was found for these IDs. Channel IDs start with UC.');
      return accepted(`Connected to ${items.map(i=>i.snippet?.title||'channel').join(', ')}.${items.length<ids.length?` ${ids.length-items.length} ID(s) were not found.`:''}`);
    }
    case 'google_ads':{
      const r=await call(fetcher,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:values.client_id,client_secret:values.client_secret,refresh_token:values.refresh_token})});
      if(!r)return unknown('Google could not be reached, so the credentials were saved without a live check.');
      if(r.status>=400&&r.status<500)return rejected('Google rejected the OAuth client or refresh token. Check the client ID, client secret and refresh token.');
      if(r.status<200||r.status>=300)return unknown(`Google answered with HTTP ${r.status}, so the credentials were saved without a live check.`);
      return accepted('Google accepted the OAuth credentials. Customer access is checked when Campaigns loads.');
    }
    case 'jira_oauth_app':return accepted('Saved. Choose Connect Jira below and approve the access in Atlassian.');
    case 'google_sheets':return accepted('Key format accepted.');
  }
}
