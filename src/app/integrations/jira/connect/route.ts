import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,createHash} from 'node:crypto';
import {workspaceContext} from '@/lib/access';
import {oauthApp,oauthDb,oauthCallback} from '@/lib/jira-oauth-server';
import {authorizationUrl} from '@/lib/jira-oauth-core';
export async function POST(request:NextRequest) {
 try {
  const ctx=await workspaceContext();
  const callback=oauthCallback();const origin=new URL(callback).origin;
  if(ctx.preview||!ctx.roles.includes('Owner')||request.headers.get('origin')!==origin)return new NextResponse('Owner authorization required.',{status:403});
  const form=await request.formData();if(form.get('confirmed')!=='yes')return new NextResponse('Confirm Jira access before connecting.',{status:400});
  const app=await oauthApp(ctx.organizationId);if(!app)return new NextResponse('Configure the Jira OAuth app first.',{status:503});
  const nonce=randomBytes(32).toString('base64url');const db=oauthDb();
  // A new authorization attempt supersedes this Owner's prior attempts.
  const {error:cleanup}=await db.from('jira_oauth_states').delete().eq('organization_id',ctx.organizationId).eq('owner_actor',ctx.userId);if(cleanup)throw new Error('State cleanup failed');
  const {error}=await db.from('jira_oauth_states').insert({nonce_hash:createHash('sha256').update(nonce).digest('hex'),organization_id:ctx.organizationId,owner_actor:ctx.userId,expires_at:new Date(Date.now()+600000).toISOString()});if(error)throw new Error('State setup failed');
  const response=NextResponse.redirect(authorizationUrl(app.clientId,callback,nonce),303);
  response.cookies.set('jira_oauth_state',nonce,{httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:'),path:'/integrations/jira',maxAge:600});
  response.headers.set('Cache-Control','no-store');return response;
 }catch{return new NextResponse('Jira OAuth setup is incomplete. Check Owner access, app configuration and database migration.',{status:503});}
}
