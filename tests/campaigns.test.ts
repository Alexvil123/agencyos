import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchMeta,fetchGoogle,metaConversions,metaStatus,googleStatus,googleQuery,parseGoogleRows,totalsByCurrency,ctr,cpc,costPerResult,validateRange,normalizeMetaAccount,normalizeGoogleCustomer,CampaignApiError,type CampaignRow} from '../src/lib/campaigns';
const range={from:'2026-10-01',to:'2026-10-10'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('range and account IDs are validated before anything is requested',()=>{
  assert.throws(()=>validateRange({from:'2026-10-10',to:'2026-10-01'}));assert.throws(()=>validateRange({from:'2026-02-30',to:'2026-03-01'}));assert.throws(()=>validateRange({from:'2025-01-01',to:'2026-10-10'}));
  assert.equal(normalizeMetaAccount('1234567890'),'act_1234567890');assert.equal(normalizeMetaAccount('act_1234567890'),'act_1234567890');assert.throws(()=>normalizeMetaAccount('abc'));
  assert.equal(normalizeGoogleCustomer('123-456-7890'),'1234567890');assert.throws(()=>normalizeGoogleCustomer('12345'));
});
test('Meta results are merged with campaign status, follow paging and never put the token in the URL',async()=>{
  const calls:{url:string;auth:string|null}[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    calls.push({url,auth:new Headers(init?.headers).get('authorization')});
    if(url.includes('/campaigns?'))return json({data:[{id:'1',name:'Brand',effective_status:'ACTIVE',objective:'OUTCOME_LEADS'},{id:'2',name:'Idle',effective_status:'CAMPAIGN_PAUSED',objective:'OUTCOME_SALES'}]});
    if(url.includes('after=page2'))return json({data:[{campaign_id:'3',campaign_name:'Deleted',spend:'5.5',impressions:'100',clicks:'4',account_currency:'INR'}]});
    return json({data:[{campaign_id:'1',campaign_name:'Brand',spend:'120.50',impressions:'1000',clicks:'50',account_currency:'INR',actions:[{action_type:'lead',value:'7'},{action_type:'onsite_conversion.lead_grouped',value:'7'},{action_type:'link_click',value:'50'}]}],paging:{next:'https://graph.facebook.com/v25.0/act_1234567890/insights?after=page2'}});
  }) as unknown as typeof fetch;
  const rows=await fetchMeta({token:'secret-token',accounts:['act_1234567890'],version:'v25.0'},range,fetcher);
  assert.deepEqual(rows.map(r=>[r.id,r.status,r.spend,r.conversions,r.currency]),[['1','active',120.5,7,'INR'],['2','paused',0,0,'INR'],['3','other',5.5,0,'INR']]);
  assert.equal(rows[0].objective,'outcome leads');
  assert.ok(calls.every(c=>c.auth==='Bearer secret-token'&&!c.url.includes('secret-token')));
  assert.ok(calls.some(c=>c.url.includes('time_range='+encodeURIComponent('{"since":"2026-10-01","until":"2026-10-10"}'))));
});
test('Meta conversions count each result once and unsafe paging hosts are refused',async()=>{
  assert.equal(metaConversions([{action_type:'lead',value:'3'},{action_type:'offsite_conversion.fb_pixel_lead',value:'3'},{action_type:'omni_purchase',value:'2'},{action_type:'purchase',value:'2'}]),5);
  assert.equal(metaConversions(undefined),0);assert.equal(metaStatus('ADSET_PAUSED'),'paused');assert.equal(metaStatus('ARCHIVED'),'ended');assert.equal(metaStatus('WITH_ISSUES'),'other');
  const evil=(async(url:string)=>url.includes('/campaigns?')?json({data:[],paging:{next:'https://evil.example.com/steal'}}):json({data:[]})) as unknown as typeof fetch;
  await assert.rejects(()=>fetchMeta({token:'t',accounts:['act_1234567890'],version:'v25.0'},range,evil),(e:unknown)=>e instanceof CampaignApiError&&e.status===502);
});
test('Meta errors map to safe messages without credentials',async()=>{
  const denied=(async()=>json({error:{message:'Invalid OAuth access token secret-token'}},401)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchMeta({token:'secret-token',accounts:['act_1234567890'],version:'v25.0'},range,denied),(e:unknown)=>e instanceof CampaignApiError&&!/secret-token/.test(e.message)&&/rejected/.test(e.message));
  const down=(async()=>{throw new Error('socket hang up secret-token');}) as unknown as typeof fetch;
  await assert.rejects(()=>fetchMeta({token:'secret-token',accounts:['act_1234567890'],version:'v25.0'},range,down),(e:unknown)=>e instanceof CampaignApiError&&e.status===0&&!/secret-token/.test(e.message));
});
test('Meta body error codes decide the Campaigns message too',async()=>{
  const expired=(async()=>json({error:{code:190,message:'token secret-token expired'}},400)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchMeta({token:'secret-token',accounts:['act_1234567890'],version:'v25.0'},range,expired),(e:unknown)=>e instanceof CampaignApiError&&e.status===401&&/rejected the saved credentials/.test(e.message)&&!/secret-token/.test(e.message));
  const limited=(async()=>json({error:{code:17}},400)) as unknown as typeof fetch;
  await assert.rejects(()=>fetchMeta({token:'t',accounts:['act_1234567890'],version:'v25.0'},range,limited),(e:unknown)=>e instanceof CampaignApiError&&e.status===429);
});
test('Google Ads refreshes the OAuth token, sends the developer token and parses micros',async()=>{
  const calls:{url:string;headers:Headers;body:string}[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    calls.push({url,headers:new Headers(init?.headers),body:String(init?.body)});
    if(url==='https://oauth2.googleapis.com/token')return json({access_token:'at-1'});
    return calls.filter(c=>c.url.includes('googleAds:search')).length===1?json({results:[{campaign:{id:'11',name:'Search',status:'ENABLED',advertisingChannelType:'SEARCH'},customer:{currencyCode:'INR'},metrics:{costMicros:'2500000',impressions:'900',clicks:'30',conversions:2.5}}],nextPageToken:'p2'}):json({results:[{campaign:{id:'12',name:'Paused',status:'PAUSED',advertisingChannelType:'PERFORMANCE_MAX'},customer:{currencyCode:'INR'},metrics:{}}]});
  }) as unknown as typeof fetch;
  const rows=await fetchGoogle({developerToken:'dev',clientId:'cid',clientSecret:'cs',refreshToken:'rt',customerIds:['1234567890'],loginCustomerId:'9999999999',version:'v25'},range,fetcher);
  assert.deepEqual(rows.map(r=>[r.id,r.status,r.spend,r.clicks,r.conversions]),[['11','active',2.5,30,2.5],['12','paused',0,0,0]]);
  const search=calls.filter(c=>c.url.includes('googleAds:search'));
  assert.equal(search[0].url,'https://googleads.googleapis.com/v25/customers/1234567890/googleAds:search');
  assert.equal(search[0].headers.get('authorization'),'Bearer at-1');assert.equal(search[0].headers.get('developer-token'),'dev');assert.equal(search[0].headers.get('login-customer-id'),'9999999999');
  assert.equal(JSON.parse(search[1].body).pageToken,'p2');
  assert.match(googleQuery(range),/BETWEEN '2026-10-01' AND '2026-10-10'/);
  assert.equal(googleStatus('REMOVED'),'ended');assert.equal(parseGoogleRows('1',[{}]).length,0);
  const bad=(async(url:string)=>url.includes('oauth2')?json({error:'invalid_grant'},400):json({})) as unknown as typeof fetch;
  await assert.rejects(()=>fetchGoogle({developerToken:'dev',clientId:'cid',clientSecret:'cs',refreshToken:'rt',customerIds:['1234567890'],version:'v25'},range,bad),(e:unknown)=>e instanceof CampaignApiError&&e.status===401);
});
test('totals stay per currency and derived rates avoid dividing by zero',()=>{
  const row=(currency:string,spend:number,impressions:number,clicks:number,conversions:number):CampaignRow=>({platform:'meta',account:'a',id:String(spend),name:'n',status:'active',objective:'',currency,spend,impressions,clicks,conversions});
  const totals=totalsByCurrency([row('INR',100,1000,10,2),row('USD',5,100,1,0),row('INR',50,500,5,1)]);
  assert.deepEqual(totals.map(t=>[t.currency,t.spend,t.clicks,t.campaigns]),[['INR',150,15,2],['USD',5,1,1]]);
  assert.equal(ctr(row('INR',1,0,0,0)),null);assert.equal(cpc(row('INR',10,100,4,0)),2.5);assert.equal(costPerResult(row('INR',10,100,4,0)),null);assert.equal(ctr(row('INR',1,200,10,0)),5);
});
