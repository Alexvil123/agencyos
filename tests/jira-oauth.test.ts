import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {sealTokens,openTokens,matchingState,authorizationUrl,selectedResource,JIRA_OAUTH_SCOPES} from '../src/lib/jira-oauth-core';
import {jiraRequest} from '../src/lib/jira-http';
test('OAuth encryption authenticates ciphertext and binds it to one organization',()=>{
 const key=randomBytes(32).toString('base64');const tokens={access_token:'secret-access',refresh_token:'secret-refresh',expires_at:123,cloud_id:'f60b8e24-9101-423d-b785-d792219922aa'};
 const sealed=sealTokens(tokens,key,'org-a');assert.ok(!sealed.includes('secret'));assert.deepEqual(openTokens(sealed,key,'org-a'),tokens);
 assert.throws(()=>openTokens(sealed,key,'org-b'));const corrupted=Buffer.from(sealed,'base64');corrupted[20]^=1;assert.throws(()=>openTokens(corrupted.toString('base64'),key,'org-a'));
});
test('OAuth state is constant-time compared and rejects malformed or absent values',()=>{
 const state=randomBytes(32).toString('base64url');assert.equal(matchingState(state,state),true);assert.equal(matchingState(state,randomBytes(32).toString('base64url')),false);assert.equal(matchingState(null,state),false);assert.equal(matchingState('é'.repeat(43),'a'.repeat(43)),false);
});
test('OAuth authorization uses the configured callback and requires exact approved tenant and scopes',()=>{
 const url=authorizationUrl('client','http://127.0.0.1:3000/integrations/jira/callback','test-state');assert.equal(url.origin,'https://auth.atlassian.com');assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:3000/integrations/jira/callback');assert.ok(url.searchParams.get('scope')?.includes('offline_access'));
 const site={id:'f60b8e24-9101-423d-b785-d792219922aa',url:'https://vilpowerdigitalmarketing.atlassian.net',scopes:JIRA_OAUTH_SCOPES};
 assert.equal(selectedResource([site])?.id,site.id);assert.equal(selectedResource([{...site,url:'https://other.atlassian.net'}]),undefined);assert.equal(selectedResource([{...site,scopes:['read:jira-work']}]),undefined);
});
test('OAuth Jira requests use Bearer authentication and the validated selected cloud ID',async()=>{
 const fetcher=(async(url,options)=>{assert.equal(url,'https://api.atlassian.com/ex/jira/f60b8e24-9101-423d-b785-d792219922aa/rest/api/3/myself');assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer access');assert.equal(options?.redirect,'error');return Response.json({});}) as typeof fetch;
 await jiraRequest({organizationId:'org',email:'',token:'access',tokenType:'oauth',cloudId:'f60b8e24-9101-423d-b785-d792219922aa'},'/rest/api/3/myself',undefined,'GET',fetcher);
 await assert.rejects(jiraRequest({organizationId:'org',email:'',token:'access',tokenType:'oauth',cloudId:'../evil'},'/rest/api/3/myself',undefined,'GET',fetcher));
});
