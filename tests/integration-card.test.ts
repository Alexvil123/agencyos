import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {IntegrationCard,statusLabel,type IntegrationItem} from '../src/components/integration-card';
import {providerSpec,publicIntegration} from '../src/lib/integrations';
const spec=providerSpec('meta_social')!;
const item=(source:'stored'|'env'|'none',extra:Partial<IntegrationItem>={}):IntegrationItem=>({...publicIntegration(spec,source,source==='none'?null:{token:'SECRET-TOKEN-VALUE',facebook_page_ids:'111111',instagram_account_ids:'222222'},source==='stored'?'2026-10-10T10:00:00Z':null),unreadable:false,...extra});
const render=(i:IntegrationItem,props:Partial<Parameters<typeof IntegrationCard>[0]>={})=>renderToStaticMarkup(createElement(IntegrationCard,{spec,item:i,busy:false,onSave:()=>undefined,onRemove:()=>undefined,...props}));
test('status labels distinguish saved, hosting-setting and missing credentials',()=>{
  assert.equal(statusLabel(item('stored')),'Active');assert.equal(statusLabel(item('env')),'Active · hosting settings');assert.equal(statusLabel(item('none')),'Not set up');
  assert.equal(statusLabel({source:'none',unreadable:true}),'Needs attention');assert.equal(statusLabel({source:'stored',unreadable:true}),'Active');
});
test('a saved integration shows its summary and a Remove option, never the secret',()=>{
  const html=render(item('stored'));
  assert.match(html,/Active/);assert.match(html,/1 Facebook Page · 1 Instagram account/);assert.match(html,/Remove/);assert.match(html,/Edit/);
  assert.doesNotMatch(html,/SECRET-TOKEN-VALUE/);
});
test('an unconfigured integration offers Set up and no Remove; hosting-setting values explain the override',()=>{
  const none=render(item('none'));assert.match(none,/Not set up/);assert.match(none,/Set up/);assert.doesNotMatch(none,/Remove/);
  const env=render(item('env'));assert.match(env,/hosting settings/);assert.match(env,/Saving here replaces them/);assert.doesNotMatch(env,/>Remove</);assert.doesNotMatch(env,/SECRET-TOKEN-VALUE/);
});
test('accounts are listed with client names, each removable, and a server-file setup counts as active',()=>{
  const stored=item('stored',{accounts:[{field:'facebook_page_ids',id:'111111',label:'Acme Dental'},{field:'instagram_account_ids',id:'222222',label:''}]});
  const html=render(stored);
  assert.match(html,/Acme Dental/);assert.match(html,/aria-label="Remove Facebook Page Acme Dental"/);assert.match(html,/aria-label="Remove Instagram account 222222"/);assert.match(html,/Client name \(optional\)/);
  assert.doesNotMatch(render(item('none')),/Client name/);
  const file=render(item('none',{source:'file',hint:'Service account x@y.iam.gserviceaccount.com'}));
  assert.match(file,/Active · server file/);assert.match(file,/already configured on the server/);
});
test('messages and unreadable credentials are announced',()=>{
  assert.match(render(item('stored'),{note:{ok:true,message:'Saved and active.'}}),/role="status"[^>]*>Saved and active\./);
  assert.match(render(item('none'),{note:{ok:false,message:'Meta rejected this access token.'}}),/role="alert"[^>]*>Meta rejected this access token\./);
  assert.match(render(item('none',{unreadable:true})),/could not be opened/);
});
