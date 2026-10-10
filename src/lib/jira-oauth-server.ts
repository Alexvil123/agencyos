import 'server-only';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {sealTokens,openTokens,type OAuthTokens} from './jira-oauth-core';
import {credentialValues,masterKeyBase64} from './integrations-server';
import type {JiraCredentials} from './jira-http';
export const oauthAppFile=join(process.cwd(),'.jira-oauth-app.local.json');
export type OAuthApp={clientId:string;clientSecret:string;encryptionKey:string;organizationId:string};
export function oauthDb() {
 if(!process.env.SUPABASE_SECRET_KEY)throw new Error('Jira server setup missing');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function oauthCallback() {
 const url=new URL(process.env.APP_URL||'http://127.0.0.1:3000');
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/' || (process.env.NODE_ENV==='production'&&url.protocol!=='https:') || !['http:','https:'].includes(url.protocol))throw new Error('Invalid server APP_URL');
 return new URL('/integrations/jira/callback',url).toString();
}
function validApp(value:OAuthApp) {
 if(!value.clientId||!value.clientSecret||/\s/.test(value.clientSecret)||value.clientSecret==='<redacted>'||/^\*+$/.test(value.clientSecret)||Buffer.from(value.encryptionKey||'','base64').length!==32)throw new Error('OAuth app configuration invalid');return value;
}
export async function oauthApp(organizationId:string):Promise<OAuthApp|null> {
 if(process.env.JIRA_OAUTH_CLIENT_ID&&process.env.JIRA_OAUTH_CLIENT_SECRET&&process.env.JIRA_ORGANIZATION_ID===organizationId) return validApp({clientId:process.env.JIRA_OAUTH_CLIENT_ID,clientSecret:process.env.JIRA_OAUTH_CLIENT_SECRET,encryptionKey:process.env.JIRA_OAUTH_ENCRYPTION_KEY||'',organizationId});
 const stored=await credentialValues(organizationId,'jira_oauth_app');
 if(stored.source==='stored'&&stored.values.client_id&&stored.values.client_secret)return validApp({clientId:stored.values.client_id,clientSecret:stored.values.client_secret,encryptionKey:process.env.JIRA_OAUTH_ENCRYPTION_KEY||masterKeyBase64()||'',organizationId});
 if(process.env.NODE_ENV==='production')return null;
 try {const value=JSON.parse(await readFile(oauthAppFile,'utf8')) as OAuthApp;return value.organizationId===organizationId?validApp(value):null;}catch{return null;}
}
export async function saveLocalOAuthApp(app:OAuthApp) {
 const temporary=`${oauthAppFile}.${randomUUID()}`;
 try{await writeFile(temporary,JSON.stringify(validApp(app)),{encoding:'utf8',mode:0o600,flag:'wx'});await rename(temporary,oauthAppFile);}finally{await unlink(temporary).catch(()=>{});}
}
export async function oauthJson<T>(url:string,body?:unknown,accessToken?:string):Promise<T> {
 if(!['https://auth.atlassian.com/oauth/token','https://api.atlassian.com/oauth/token/accessible-resources'].includes(url))throw new Error('Invalid OAuth endpoint');
 try{
  const response=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Accept:'application/json',...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('OAuth rejected');return await response.json() as T;
 }catch{throw new Error('Jira OAuth could not be completed. Check app settings or reconnect.');}
}
export function validatedTokens(value:unknown,cloudId:string):OAuthTokens {
 const result=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive().max(86400)}).parse(value);
 return {access_token:result.access_token,refresh_token:result.refresh_token,expires_at:Date.now()+result.expires_in*1000,cloud_id:cloudId};
}
export async function saveOAuthConnection(app:OAuthApp,tokens:OAuthTokens,ownerActor:string) {
 const {error}=await oauthDb().from('jira_oauth_connections').upsert({organization_id:app.organizationId,encrypted_tokens:sealTokens(tokens,app.encryptionKey,app.organizationId),connected_by:ownerActor,updated_at:new Date().toISOString(),refresh_lease:null,refresh_lease_until:null});
 if(error)throw new Error('Could not save OAuth connection');
 const {error:auditError}=await oauthDb().rpc('jira_audit',{org_id:app.organizationId,actor:ownerActor,issue_assignee:null,operation:'connection_saved',issue_key:'OAuth OCT,SEP,SOURCE'});
 if(auditError)throw new Error('OAuth connection saved but audit confirmation failed');
}
export async function oauthConfigured(organizationId:string) {
 const {data,error}=await oauthDb().from('jira_oauth_connections').select('organization_id').eq('organization_id',organizationId).maybeSingle();return !error&&Boolean(data);
}
export async function oauthCredentials(organizationId:string):Promise<JiraCredentials|null> {
 const app=await oauthApp(organizationId);if(!app)return null;
 const db=oauthDb();const {data,error}=await db.from('jira_oauth_connections').select('encrypted_tokens').eq('organization_id',organizationId).maybeSingle();
 if(error||!data)return null;
 let tokens=openTokens(data.encrypted_tokens,app.encryptionKey,organizationId);
 if(tokens.expires_at<Date.now()+60000) {
  const lease=randomUUID();const {data:claimed,error:claimError}=await db.rpc('claim_jira_oauth_refresh',{org_id:organizationId,lease});
  if(claimError||!claimed)throw new Error('Jira token refresh in progress. Try again shortly.');
  try {
   tokens=openTokens(claimed,app.encryptionKey,organizationId);
   if(tokens.expires_at<Date.now()+60000) {
    const refreshed=await oauthJson('https://auth.atlassian.com/oauth/token',{grant_type:'refresh_token',client_id:app.clientId,client_secret:app.clientSecret,refresh_token:tokens.refresh_token});
    tokens=validatedTokens(refreshed,tokens.cloud_id);
    const {error:saveError,data:saved}=await db.from('jira_oauth_connections').update({encrypted_tokens:sealTokens(tokens,app.encryptionKey,organizationId),updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('refresh_lease',lease).select('organization_id');
    if(saveError||!saved?.length)throw new Error('Refresh persistence uncertain; reconnect Jira.');
   }
  }finally{await db.from('jira_oauth_connections').update({refresh_lease:null,refresh_lease_until:null}).eq('organization_id',organizationId).eq('refresh_lease',lease);}
 }
 return {email:'',token:tokens.access_token,organizationId,tokenType:'oauth',cloudId:tokens.cloud_id};
}
