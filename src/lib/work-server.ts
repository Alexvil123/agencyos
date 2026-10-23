import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {workspaceContext} from './access';
import {serverClient} from './supabase/server';
import {jiraCredentials} from './jira-server';
import {jiraRequest} from './jira-http';
import {type JiraIssue,JIRA_KEY,JIRA_PROJECTS} from './jira-types';
import {workIssue,jiraStillOpen,WORK_JIRA_FIELDS,type RemoteWorkIssue} from './work-jira-sync';
export {workIssue,type RemoteWorkIssue} from './work-jira-sync';
export function workAdmin(){if(!process.env.SUPABASE_SECRET_KEY)throw new Error('Server configuration missing');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
// Start on an ended Jira task: End marks the CRM task completed, but Jira decides whether it is really closed. Re-opens it only when Jira still shows it open.
export async function reopenEndedJiraTask(org:string,membership:string,task:string,statusCategory?:string){
  if(!jiraStillOpen(statusCategory))return;
  const {error}=await workAdmin().from('time_tasks').update({work_status:'pending',completed_at:null,updated_at:new Date().toISOString()}).eq('id',task).eq('organization_id',org).eq('membership_id',membership).eq('source','jira').eq('work_status','completed');
  if(error)throw new Error('Task could not be reopened');
}
export async function workAccess(){const ctx=await workspaceContext();if(ctx.preview||ctx.kind!=='employee')throw new Error('Active team access required');return {ctx,db:await serverClient()};}
export async function readWorkIssue(org:string,key:string){if(!JIRA_KEY.test(key))throw new Error('Invalid Jira task');const credentials=await jiraCredentials(org);if(!credentials)throw new Error('Jira connection required');const remote=await jiraRequest<RemoteWorkIssue>(credentials,`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${WORK_JIRA_FIELDS.join(',')}`);if(!JIRA_PROJECTS.includes(remote.fields.project.key as typeof JIRA_PROJECTS[number]))throw new Error('Invalid Jira project');return {issue:workIssue(remote),credentials};}
export async function importWorkIssues(org:string,actor:string,issues:(JiraIssue&{description_text?:string;status_category?:string})[]){const {error}=await workAdmin().rpc('work_import',{org_id:org,actor_user:actor,issues});if(error)throw new Error('Unified task database setup or import failed');}
