import 'server-only';
import {workAdmin} from './work-server';
import {jiraCredentials} from './jira-server';
import {jiraRequest} from './jira-http';
import {WORK_JIRA_FIELDS,type RemoteWorkIssue} from './work-jira-sync';
import {reconcileJiraSnapshot} from './jira-reconciliation';
import {recordSyncHealth} from './sync-health-server';
import {refreshLoop} from './auto-refresh';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {jiraAutoFetch} from './jira-sync-settings-server';
import {reconcileJiraAvailability} from './jira-availability-server';
import type {WorkJiraIssue} from './work-jira-sync';
export async function connectionOrganizations(){const db=workAdmin(),result=await db.from('jira_oauth_connections').select('organization_id');if(result.error)throw new Error('Connection registry unavailable');const orgs=new Set<string>((result.data||[]).map(r=>r.organization_id));if(process.env.JIRA_ORGANIZATION_ID){const org=z.uuid().safeParse(process.env.JIRA_ORGANIZATION_ID);if(org.success)orgs.add(org.data);}if(process.env.NODE_ENV!=='production'){try{const config=JSON.parse(await readFile(join(process.cwd(),'.jira-credentials.local.json'),'utf8'));const org=z.uuid().safeParse(config.organizationId);if(org.success)orgs.add(org.data);}catch{/* Missing legacy configuration is normal. */}}return [...orgs];}
export async function reconcileConnectedJira(org:string){
 if(!(await jiraAutoFetch(org)).enabled)return {ok:true as const,count:0,skipped:true,checkedAt:new Date().toISOString()};
 const db=workAdmin();
 // A disconnected or deactivated authorizing Owner must not retain background access.
 const connection=await db.from('jira_oauth_connections').select('connected_by').eq('organization_id',org).maybeSingle();if(connection.error)throw new Error('Connection registry unavailable');
 let owners=db.from('memberships').select('user_id,membership_roles!inner(role_key)').eq('organization_id',org).eq('kind','employee').eq('active',true).eq('membership_roles.role_key','owner');if(connection.data)owners=owners.eq('user_id',connection.data.connected_by);const authorized=await owners.limit(1);if(authorized.error||!authorized.data?.length){await recordSyncHealth(org,'organization','jira',false);return {ok:false as const,count:0};}
 try{const snapshotStartedAt=new Date().toISOString(),snapshot:WorkJiraIssue[]=[];const credentials=await jiraCredentials(org);if(!credentials)throw new Error('Jira connection required');const result=await reconcileJiraSnapshot(cursor=>jiraRequest<{issues:RemoteWorkIssue[];isLast:boolean;nextPageToken?:string}>(credentials,'/rest/api/3/search/jql',{jql:'project in (OCT, SEP, SOURCE) ORDER BY updated DESC',fields:WORK_JIRA_FIELDS,maxResults:100,...(cursor?{nextPageToken:cursor}:{})}),async issues=>{snapshot.push(...issues);const imported=await db.rpc('work_import',{org_id:org,actor_user:null,issues,system_event:true});if(imported.error)throw new Error('Background import unavailable');});await reconcileJiraAvailability(org,snapshot.map(i=>i.key),snapshotStartedAt,null);await recordSyncHealth(org,'organization','jira',true);return {ok:true as const,...result};}
 catch{await recordSyncHealth(org,'organization','jira',false);return {ok:false as const,count:0};}
}
let worker:ReturnType<typeof refreshLoop>|undefined;
export function startJiraReconciliationWorker(){if(worker)return;worker=refreshLoop({interval:60000,active:()=>!!process.env.SUPABASE_SECRET_KEY,refresh:async()=>{try{let success=true;for(const org of await connectionOrganizations()){const result=await reconcileConnectedJira(org);if(!result.ok)success=false;}return success;}catch{return false;}},schedule:(fn,delay)=>{const timer=setTimeout(fn,delay);timer.unref();return timer;},cancel:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)});worker.wake();}
