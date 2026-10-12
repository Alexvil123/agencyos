'use server';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID,randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { workspaceContext } from '@/lib/access';
import { serverClient } from '@/lib/supabase/server';
import { jiraCredentials, legacyJiraCredentials, credentialFile } from '@/lib/jira-server';
import {oauthApp,oauthConfigured,oauthCallback,oauthDb,saveLocalOAuthApp} from '@/lib/jira-oauth-server';
import { jiraRequest, JiraError, verifyJiraCredentials } from '@/lib/jira-http';
import {WORK_JIRA_FIELDS,workIssue,parseJiraLabels,type RemoteWorkIssue} from '@/lib/work-jira-sync';
import { JIRA_PROJECTS, plainDescription, type JiraTransition } from '@/lib/jira-types';
import {retireJiraTask} from '@/lib/jira-availability-server';
type RemoteIssue=RemoteWorkIssue;
const issueData=workIssue;

function admin() {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error('Server configuration missing');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
function message(error: unknown) { return error instanceof JiraError && error.status === 404 ? 'This task no longer exists in Jira, so it was removed from the CRM lists. Recorded work time is kept.' : error instanceof JiraError ? error.message : 'Jira setup or operation could not be confirmed. Check connection and database setup.'; }
async function access(ownerOnly = false) {
  const ctx = await workspaceContext();
  if (ctx.preview || (!ctx.roles.includes('Owner') && (ownerOnly || ctx.kind !== 'employee' || !ctx.roles.includes('Employee')))) throw new Error('Not authorized');
  return ctx;
}
async function accountId(organizationId: string, membershipId: string) {
  const db=await serverClient();
  const { data,error }=await db.from('jira_account_links').select('account_id').eq('organization_id',organizationId).eq('membership_id',membershipId).maybeSingle();
  if(error || !data) throw new Error('Jira employee mapping required');
  return data.account_id as string;
}
async function audit(ctx: Awaited<ReturnType<typeof access>>, assignee: string|null, operation: string, key: string) {
  const {error}=await admin().rpc('jira_audit',{org_id:ctx.organizationId,actor:ctx.userId,issue_assignee:assignee,operation,issue_key:key});
  if(error) throw new Error('Audit authorization failed');
}
export async function connectJira(form: FormData) {
  try {
    const ctx=await access(true);
    if (process.env.NODE_ENV === 'production') return {ok:false,message:'Configure JIRA_EMAIL, JIRA_API_TOKEN and JIRA_ORGANIZATION_ID in managed server hosting settings.'};
    const input=z.object({email:z.string().trim().pipe(z.email()),token:z.string().trim().min(10).max(4096),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));
    const credentials=await verifyJiraCredentials({email:input.email,token:input.token,organizationId:ctx.organizationId});
    // Validate the audited database setup before persisting a credential.
    await audit(ctx,null,'connection_requested','OCT,SEP,SOURCE');
    const temporary=`${credentialFile}.${randomUUID()}`;
    try { await writeFile(temporary,JSON.stringify(credentials),{encoding:'utf8',mode:0o600,flag:'wx'}); await rename(temporary,credentialFile); }
    finally { await unlink(temporary).catch(()=>{}); }
    await audit(ctx,null,'connection_saved','OCT,SEP,SOURCE');
    return {ok:true,message:`Jira account verified (${credentials.tokenType} token). Server credential saved locally. Open Work and refresh tasks.`};
  } catch(error) { return {ok:false,message:message(error)}; }
}
export async function jiraConnectionState() {
  try {
    const ctx=await access();
    const app=await oauthApp(ctx.organizationId);
    const oauthConnected=app ? await oauthConfigured(ctx.organizationId) : false;
    const credentials=await legacyJiraCredentials(ctx.organizationId);
    const db=await serverClient();
    const {error}=await db.from('jira_account_links').select('membership_id').limit(1);
    return {ok:true,configured:oauthConnected||Boolean(credentials),databaseReady:!error,owner:ctx.roles.includes('Owner'),oauthAppReady:Boolean(app),oauthConnected,callback:oauthCallback(),message:''};
  } catch { return {ok:false,configured:false,databaseReady:false,owner:false,message:'Jira access requires an active Owner or Employee account.'}; }
}
export async function configureJiraOAuthApp(form:FormData) {
 try {
  const ctx=await access(true);
  if(process.env.NODE_ENV==='production')return {ok:false,message:'Configure OAuth client ID, secret and encryption key in managed server hosting settings.'};
  const input=z.object({client_id:z.string().trim().min(1).max(512),client_secret:z.string().trim().min(10).max(4096),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));
  const existing=await oauthApp(ctx.organizationId);
  if(existing&&await oauthConfigured(ctx.organizationId))return {ok:false,message:'An OAuth connection already exists. Keep its existing app configuration.'};
  const {error}=await oauthDb().from('jira_oauth_states').select('nonce_hash').limit(1);if(error)throw new Error('OAuth migration required');
  await audit(ctx,null,'connection_requested','OAuth app setup');
  await saveLocalOAuthApp({clientId:input.client_id,clientSecret:input.client_secret,organizationId:ctx.organizationId,encryptionKey:existing?.encryptionKey||randomBytes(32).toString('base64')});
  return {ok:true,message:'OAuth app saved server-side. Set the matching callback URL and Jira scopes in Atlassian, then Connect Jira.'};
 }catch{return {ok:false,message:'Could not configure the OAuth app. Check Owner access and apply the OAuth database migration.'};}
}
async function authorizedIssue(key: string) {
  const ctx=await access(); z.string().regex(/^(OCT|SEP|SOURCE)-[1-9][0-9]*$/).parse(key);
  const credentials=await jiraCredentials(ctx.organizationId); if(!credentials) throw new Error('Missing connection');
  const remote=await jiraRequest<RemoteIssue>(credentials,`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${[...WORK_JIRA_FIELDS,"attachment"].join(',')}`).catch(async error=>{if(error instanceof JiraError&&error.status===404)await retireJiraTask(ctx.organizationId,key).catch(()=>undefined);throw error;});
  const issue=issueData(remote);
  if(!JIRA_PROJECTS.includes(issue.project_key as typeof JIRA_PROJECTS[number]) || (!ctx.roles.includes('Owner') && issue.assignee_id!==await accountId(ctx.organizationId,ctx.membershipId))) throw new Error('Not assigned');
  return {ctx,credentials,issue};
}
export async function jiraTaskDetails(key: string) {
  try {
    const {credentials,issue}=await authorizedIssue(key);
    const {transitions}=await jiraRequest<{transitions:JiraTransition[]}>(credentials,`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
    return {ok:true,message:'',issue,transitions};
  } catch(error) { return {ok:false,message:message(error),transitions:[] as JiraTransition[]}; }
}
export async function editJiraTask(form: FormData) {
  let requested: Awaited<ReturnType<typeof authorizedIssue>>|undefined;
  try {
    const input=z.object({key:z.string(),expected:z.string(),summary:z.string().trim().min(1).max(255),description:z.string().max(20000),change_description:z.enum(['yes','no']),transition:z.string().max(100),labels:z.string().max(25600).default(''),change_labels:z.enum(['yes','no']).default('no'),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));
    const current=await authorizedIssue(input.key);
    if(current.issue.jira_updated!==input.expected) return {ok:false,message:'This task changed in Jira. Reopen it to review the latest version before saving.'};
    if(input.transition) {
      const {transitions}=await jiraRequest<{transitions:JiraTransition[]}>(current.credentials,`/rest/api/3/issue/${encodeURIComponent(input.key)}/transitions`);
      if(!transitions.some(t=>t.id===input.transition)) return {ok:false,message:'This status transition is no longer available. Reopen the task.'};
    }
    if(input.change_labels==='yes'&&!current.ctx.roles.includes('Owner'))throw new Error('Only Owner changes Jira labels');
    const labels=input.change_labels==='yes'?parseJiraLabels(input.labels):undefined;
    await audit(current.ctx,current.issue.assignee_id,'edit_requested',input.key); requested=current;
    const fields:Record<string,unknown>={summary:input.summary};
    if(input.change_description==='yes') fields.description=plainDescription(input.description);
    if(labels)fields.labels=labels;
    await jiraRequest(current.credentials,`/rest/api/3/issue/${encodeURIComponent(input.key)}`,{fields},'PUT');
    if(input.transition) await jiraRequest(current.credentials,`/rest/api/3/issue/${encodeURIComponent(input.key)}/transitions`,{transition:{id:input.transition}});
    const updated=await authorizedIssue(input.key);
    const {error:saveError}=await admin().rpc('jira_sync_batch',{org_id:current.ctx.organizationId,owner_actor:current.ctx.userId,issues:[updated.issue]});
    if(saveError) throw new Error('CRM persistence failed');
    await audit(current.ctx,current.issue.assignee_id,'edit_completed',input.key);
    return {ok:true,message:'Jira confirmed the update and the latest task was saved in the CRM database.'};
  } catch(error) {
    if(requested) await audit(requested.ctx,requested.issue.assignee_id,'edit_uncertain',requested.issue.key).catch(()=>{});
    return {ok:false,message:requested ? 'One or more updates may have reached Jira. Refresh and inspect the task before retrying.' : message(error)};
  }
}
export async function linkJiraEmployee(form:FormData) {
  try {
    const ctx=await access(true);
    const input=z.object({membership:z.uuid(),account:z.string().min(1).max(200),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));
    const credentials=await jiraCredentials(ctx.organizationId);if(!credentials) throw new Error('Missing connection');
    const user=await jiraRequest<{accountId:string;active:boolean}>(credentials,`/rest/api/3/user?accountId=${encodeURIComponent(input.account)}`);
    if(!user.active || user.accountId!==input.account) throw new Error('Inactive Jira account');
    const db=await serverClient();const {error}=await db.rpc('link_jira_account',{org_id:ctx.organizationId,target:input.membership,jira_account:input.account});
    if(error) throw new Error('Mapping denied');
    return {ok:true,message:'Employee linked to this verified Jira account. Assigned task access is enabled.'};
  } catch(error) {return {ok:false,message:message(error)};}
}
