import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jiraRequest,JiraError,verifyJiraCredentials,JIRA_GATEWAY} from '../src/lib/jira-http';
import {descriptionText,plainDescription} from '../src/lib/jira-types';
const credentials={email:'test@example.com',token:'test-token-not-real',organizationId:'test'};
test('Jira requests constrain destination and forbid credential-bearing redirects',async()=>{
  let observed:RequestInit|undefined;
  const fetcher=(async(url,options)=>{assert.equal(url,'https://vilpowerdigitalmarketing.atlassian.net/rest/api/3/myself');observed=options;return Response.json({accountId:'test'});}) as typeof fetch;
  assert.deepEqual(await jiraRequest(credentials,'/rest/api/3/myself',undefined,'GET',fetcher),{accountId:'test'});
  assert.equal(observed?.redirect,'error');assert.equal(observed?.cache,'no-store');
  await assert.rejects(jiraRequest(credentials,'https://other.example/steal',undefined,'GET',fetcher));
  await assert.rejects(jiraRequest(credentials,'/rest/api/3/../../other',undefined,'GET',fetcher));
});
test('Jira failed writes distinguish unknown outcomes and never expose raw secrets/errors',async()=>{
  const failure=(async()=>{throw new Error('token=test-token-not-real');}) as typeof fetch;
  await assert.rejects(jiraRequest(credentials,'/rest/api/3/issue',{},'POST',failure),(error:unknown)=>error instanceof JiraError && error.uncertain && !error.message.includes(credentials.token));
  const denied=(async()=>new Response('private Jira error and secret',{status:403})) as typeof fetch;
  await assert.rejects(jiraRequest(credentials,'/rest/api/3/issue',{},'POST',denied),(error:unknown)=>error instanceof JiraError && !error.uncertain && !error.message.includes('private'));
});
test('Jira descriptions round-trip plain text without generating HTML',()=>{
  assert.equal(descriptionText(plainDescription('First line\n<script>text</script>')),'First line\n<script>text</script>');
});
test('scoped tokens are verified through the fixed tenant gateway and used there for writes',async()=>{
  const calls:string[]=[];
  const fetcher=(async(url,options)=>{calls.push(String(url));assert.equal(options?.redirect,'error');return String(url).startsWith(JIRA_GATEWAY)?Response.json({accountId:'test'}):new Response('',{status:401});}) as typeof fetch;
  const verified=await verifyJiraCredentials(credentials,fetcher);assert.equal(verified.tokenType,'scoped');assert.equal(calls.length,2);
  await jiraRequest(verified,'/rest/api/3/issue',{},'POST',fetcher);
  assert.equal(calls.at(-1),`${JIRA_GATEWAY}/rest/api/3/issue`);
});
test('classic tokens use one probe; network failures and writes never trigger automatic auth fallback',async()=>{
  let calls=0;const success=(async()=>{calls++;return Response.json({accountId:'test'});}) as typeof fetch;
  assert.equal((await verifyJiraCredentials(credentials,success)).tokenType,'classic');assert.equal(calls,1);
  calls=0;const failure=(async()=>{calls++;throw new Error('network');}) as typeof fetch;
  await assert.rejects(verifyJiraCredentials(credentials,failure));assert.equal(calls,1);
  calls=0;const denied=(async()=>{calls++;return new Response('',{status:401});}) as typeof fetch;
  await assert.rejects(jiraRequest({...credentials,tokenType:'scoped'},'/rest/api/3/issue',{},'POST',denied));assert.equal(calls,1);
});
