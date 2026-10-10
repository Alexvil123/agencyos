import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {workspaceContext} from '@/lib/access';
import {matchingState,selectedResource} from '@/lib/jira-oauth-core';
import {oauthApp,oauthDb,oauthCallback,oauthJson,validatedTokens,saveOAuthConnection} from '@/lib/jira-oauth-server';
import {jiraRequest} from '@/lib/jira-http';
export async function GET(request:NextRequest) {
 let outcome='failed';let stage='session';
 try {
  const ctx=await workspaceContext();const state=request.nextUrl.searchParams.get('state');
  if(ctx.preview||!ctx.roles.includes('Owner')||!matchingState(state,request.cookies.get('jira_oauth_state')?.value))throw new Error('Invalid state');
  stage='state';
  const db=oauthDb();const {data:consumed,error}=await db.rpc('consume_jira_oauth_state',{nonce:createHash('sha256').update(state!).digest('hex'),org_id:ctx.organizationId,actor:ctx.userId});
  if(error||consumed!==true)throw new Error('Expired or replayed state');
  if(request.nextUrl.searchParams.has('error')) {outcome='denied';throw new Error('User denied');}
  const code=request.nextUrl.searchParams.get('code');if(!code||code.length>4096)throw new Error('Missing code');
  const app=await oauthApp(ctx.organizationId);if(!app)throw new Error('Missing app');
  stage='exchange';
  const raw=await oauthJson<{access_token:string}>('https://auth.atlassian.com/oauth/token',{grant_type:'authorization_code',client_id:app.clientId,client_secret:app.clientSecret,code,redirect_uri:oauthCallback()});
  if(typeof raw.access_token!=='string')throw new Error('Invalid access token');
  stage='resources';
  const resources=await oauthJson<{id:string;url:string;scopes:string[]}[]>('https://api.atlassian.com/oauth/token/accessible-resources',undefined,raw.access_token);
  const resource=selectedResource(resources);if(!resource){outcome='site_or_scopes';throw new Error('Wrong site or scopes');}
  stage='token_format';
  const tokens=validatedTokens(raw,resource.id);
  stage='jira_identity';
  await jiraRequest({email:'',token:tokens.access_token,organizationId:ctx.organizationId,tokenType:'oauth',cloudId:resource.id},'/rest/api/3/myself');
  stage='persistence';
  await saveOAuthConnection(app,tokens,ctx.userId);outcome='connected';
 }catch{ if(outcome==='failed') console.warn('Jira OAuth failed at stage:',stage); /* Only fixed stage labels; never codes, tokens or provider errors. */ }
 const response=NextResponse.redirect(new URL(`/settings?jira_oauth=${outcome}`,new URL(oauthCallback()).origin),303);
 response.cookies.set('jira_oauth_state','',{httpOnly:true,sameSite:'lax',secure:new URL(oauthCallback()).protocol==='https:',path:'/integrations/jira',maxAge:0});
 response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
}
