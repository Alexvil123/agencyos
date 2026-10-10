import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PROVIDERS,providerSpec,validateProvider,mergeSubmitted,hintFor,publicIntegration,pickValues,parseMasterKey,sealJson,openJson,sealContext,type Payload,type ProviderKey} from '../src/lib/integrations';
import {verifyProvider} from '../src/lib/integration-verify';
const key=randomBytes(32),json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const SECRET='EAAB'+'x'.repeat(40);
const serviceKey=JSON.stringify({type:'service_account',project_id:'p',client_email:'crm@p.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',extra:'dropped'});

test('secrets are sealed per organization and provider and tampering is detected',()=>{
  const value:Payload={token:SECRET,facebook_page_ids:'123456'};
  const sealed=sealJson(value,key,sealContext('org-1','meta_social'));
  assert.ok(!sealed.includes(SECRET)&&!Buffer.from(sealed,'base64').toString('latin1').includes(SECRET),'ciphertext does not contain the secret');
  assert.deepEqual(openJson(sealed,key,sealContext('org-1','meta_social')),value);
  assert.throws(()=>openJson(sealed,key,sealContext('org-2','meta_social')),'another organization cannot open it');
  assert.throws(()=>openJson(sealed,key,sealContext('org-1','youtube')),'another provider cannot open it');
  assert.throws(()=>openJson(sealed,randomBytes(32),sealContext('org-1','meta_social')),'a different key cannot open it');
  const bytes=Buffer.from(sealed,'base64');bytes[20]^=1;assert.throws(()=>openJson(bytes.toString('base64'),key,sealContext('org-1','meta_social')));
  assert.notEqual(sealJson(value,key,'a'),sealJson(value,key,'a'),'a fresh IV is used every time');
  assert.throws(()=>openJson('c2hvcnQ=',key,'a'));
});
test('the master key comes from the hosting settings, preferring the dedicated name',()=>{
  const a=randomBytes(32).toString('base64'),b=randomBytes(32).toString('base64');
  assert.deepEqual(parseMasterKey({INTEGRATION_ENCRYPTION_KEY:a,JIRA_OAUTH_ENCRYPTION_KEY:b}),Buffer.from(a,'base64'));
  assert.deepEqual(parseMasterKey({JIRA_OAUTH_ENCRYPTION_KEY:b}),Buffer.from(b,'base64'));
  assert.equal(parseMasterKey({}),null);assert.equal(parseMasterKey({INTEGRATION_ENCRYPTION_KEY:'short'}),null);
  assert.deepEqual(parseMasterKey({INTEGRATION_ENCRYPTION_KEY:'short',JIRA_OAUTH_ENCRYPTION_KEY:b}),Buffer.from(b,'base64'));
});
test('every provider validates its own fields with plain messages and normalises IDs',()=>{
  const meta=validateProvider('meta_social',{token:SECRET,facebook_page_ids:' 111111 , 222222 ',instagram_account_ids:'',version:'v25.0'});
  assert.equal(meta.facebook_page_ids,'111111,222222');assert.equal(meta.instagram_account_ids,'');assert.equal(meta.version,'v25.0');
  assert.throws(()=>validateProvider('meta_social',{token:SECRET}),/Page ID or Instagram/);
  assert.throws(()=>validateProvider('meta_social',{token:'short',facebook_page_ids:'111111'}),/access token/);
  assert.throws(()=>validateProvider('meta_social',{token:SECRET,facebook_page_ids:'abc'}),/numbers/);
  assert.throws(()=>validateProvider('meta_social',{token:SECRET,facebook_page_ids:'111111',version:'25'}),/v25\.0/);
  assert.equal(validateProvider('meta_ads',{token:SECRET,account_ids:'1234567890, act_55555'}).account_ids,'act_1234567890,act_55555');
  assert.throws(()=>validateProvider('meta_ads',{token:SECRET,account_ids:''}),/ad account/);
  assert.equal(validateProvider('youtube',{api_key:'AIza'+'y'.repeat(30),channel_ids:'UC'+'a'.repeat(22)}).channel_ids,'UC'+'a'.repeat(22));
  assert.throws(()=>validateProvider('youtube',{api_key:'AIza'+'y'.repeat(30),channel_ids:'nope'}),/UC/);
  const ads=validateProvider('google_ads',{developer_token:'dev',client_id:'cid',client_secret:'cs',refresh_token:'rt',customer_ids:'123-456-7890',login_customer_id:'999-999-9999',api_version:'v25'});
  assert.equal(ads.customer_ids,'1234567890');assert.equal(ads.login_customer_id,'9999999999');
  assert.throws(()=>validateProvider('google_ads',{developer_token:'dev',client_id:'cid',client_secret:'cs',refresh_token:'',customer_ids:'1234567890'}),/refresh token/);
  const sheet=validateProvider('google_sheets',{service_account_json:serviceKey});
  assert.deepEqual(Object.keys(JSON.parse(sheet.service_account_json)).sort(),['client_email','private_key','type'],'only the needed key fields are kept');
  assert.throws(()=>validateProvider('google_sheets',{service_account_json:'not json'}),/JSON/);
  assert.throws(()=>validateProvider('google_sheets',{service_account_json:JSON.stringify({type:'authorized_user'})}),/service account/);
  assert.deepEqual(validateProvider('jira_oauth_app',{client_id:'abcdef123',client_secret:'s'.repeat(30)}),{client_id:'abcdef123',client_secret:'s'.repeat(30)});
  assert.throws(()=>validateProvider('jira_oauth_app',{client_id:'abcdef123',client_secret:'has space inside it'}),/incomplete/);
});
test('blank secret fields keep the stored value; other fields can be cleared or changed',()=>{
  const spec=providerSpec('meta_social')!,stored:Payload={token:SECRET,facebook_page_ids:'111111',instagram_account_ids:'222222',version:'v25.0'};
  assert.deepEqual(mergeSubmitted(spec,stored,{token:'',facebook_page_ids:'333333',instagram_account_ids:'',version:''}),{token:SECRET,facebook_page_ids:'333333',instagram_account_ids:'',version:''});
  assert.equal(mergeSubmitted(spec,stored,{token:'EAAB'+'n'.repeat(30),facebook_page_ids:'111111'}).token,'EAAB'+'n'.repeat(30));
  assert.equal(mergeSubmitted(spec,null,{token:'',facebook_page_ids:'111111'}).token,undefined,'nothing to keep on a first save');
});
test('the browser view never contains secrets, only whether they exist',()=>{
  for(const spec of PROVIDERS){
    const payload=Object.fromEntries(spec.fields.map(f=>[f.key,f.secret?`SECRET-${f.key}-VALUE`:'visible']));
    const view=publicIntegration(spec,'stored',payload,'2026-10-10T10:00:00Z');
    assert.ok(!JSON.stringify(view).includes('SECRET-'),`${spec.key} leaks a secret`);
    for(const f of spec.fields.filter(f=>f.secret))assert.equal(view.has[f.key],true);
    for(const f of spec.fields.filter(f=>!f.secret))assert.equal(view.values[f.key],'visible');
  }
  assert.equal(publicIntegration(providerSpec('youtube')!,'none',null,null).hint,'');
  assert.match(hintFor('meta_social',{facebook_page_ids:'1,2',instagram_account_ids:'3'}),/2 Facebook Pages · 1 Instagram account/);
  assert.match(hintFor('google_sheets',{service_account_json:serviceKey}),/crm@p\.iam\.gserviceaccount\.com/);
  assert.ok(!hintFor('google_sheets',{service_account_json:serviceKey}).includes('PRIVATE KEY'));
});
test('stored credentials win over hosting variables and existing hosting setups keep working',()=>{
  const spec=providerSpec('youtube')!,env={YOUTUBE_API_KEY:'env-key',YOUTUBE_CHANNEL_IDS:'UCenv'};
  assert.deepEqual(pickValues(spec,null,env),{source:'env',values:{api_key:'env-key',channel_ids:'UCenv'}});
  assert.deepEqual(pickValues(spec,{api_key:'stored-key',channel_ids:'UCstored'},env),{source:'stored',values:{api_key:'stored-key',channel_ids:'UCstored'}});
  assert.equal(pickValues(spec,null,{}).source,'none');assert.equal(pickValues(spec,null,{YOUTUBE_API_KEY:'  '}).source,'none');
});
test('live checks accept good credentials, reject bad ones and never echo secrets',async()=>{
  const names=(map:Record<string,unknown>)=>(async(url:string)=>{for(const [part,body] of Object.entries(map))if(url.includes(part))return json(body);return json({error:{code:100}},400);}) as unknown as typeof fetch;
  const ok=await verifyProvider('meta_social',{token:SECRET,facebook_page_ids:'111111',instagram_account_ids:'222222'},names({'/111111':{name:'Dreamdaa'},'/222222':{username:'dreamdaa_official'}}));
  assert.equal(ok.level,'accepted');assert.match(ok.message,/Dreamdaa/);assert.match(ok.message,/dreamdaa_official/);
  const expired=await verifyProvider('meta_social',{token:SECRET,facebook_page_ids:'111111'},(async()=>json({error:{code:190,message:'token '+SECRET}},400)) as unknown as typeof fetch);
  assert.equal(expired.ok,false);assert.ok(!expired.message.includes(SECRET));assert.match(expired.message,/rejected/);
  const blocked=await verifyProvider('meta_ads',{token:SECRET,account_ids:'act_1234567'},(async()=>json({error:{code:200}},403)) as unknown as typeof fetch);
  assert.equal(blocked.ok,false);assert.match(blocked.message,/cannot read/);
  const offline=await verifyProvider('meta_ads',{token:SECRET,account_ids:'act_1234567'},(async()=>{throw new Error('down '+SECRET);}) as unknown as typeof fetch);
  assert.deepEqual([offline.ok,offline.level],[true,'unknown']);assert.ok(!offline.message.includes(SECRET));
  const calls:{url:string;key:string|null}[]=[];
  const yt=await verifyProvider('youtube',{api_key:'AIzaKEY',channel_ids:'UC'+'a'.repeat(22)},(async(url:string,init?:RequestInit)=>{calls.push({url,key:new Headers(init?.headers).get('x-goog-api-key')});return json({items:[{snippet:{title:'Agency channel'}}]});}) as unknown as typeof fetch);
  assert.equal(yt.level,'accepted');assert.match(yt.message,/Agency channel/);assert.equal(calls[0].key,'AIzaKEY');assert.ok(!calls[0].url.includes('AIzaKEY'));
  assert.equal((await verifyProvider('youtube',{api_key:'AIzaKEY',channel_ids:'UC'+'a'.repeat(22)},(async()=>json({items:[]})) as unknown as typeof fetch)).ok,false);
  assert.equal((await verifyProvider('youtube',{api_key:'bad',channel_ids:'UC'+'a'.repeat(22)},(async()=>json({},400)) as unknown as typeof fetch)).ok,false);
  const googleOk=await verifyProvider('google_ads',{developer_token:'d',client_id:'c',client_secret:'s',refresh_token:'r',customer_ids:'1234567890'},(async()=>json({access_token:'at'})) as unknown as typeof fetch);
  assert.equal(googleOk.level,'accepted');
  const googleBad=await verifyProvider('google_ads',{developer_token:'d',client_id:'c',client_secret:'s',refresh_token:'r',customer_ids:'1234567890'},(async()=>json({error:'invalid_grant'},400)) as unknown as typeof fetch);
  assert.equal(googleBad.ok,false);
  for(const provider of ['jira_oauth_app','google_sheets'] as ProviderKey[])assert.equal((await verifyProvider(provider,{},(async()=>{throw new Error('no network expected');}) as unknown as typeof fetch)).ok,true);
});
