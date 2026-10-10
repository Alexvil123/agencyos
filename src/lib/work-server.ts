import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {workspaceContext} from './access';
import {serverClient} from './supabase/server';
import {jiraCredentials} from './jira-server';
import {jiraRequest} from './jira-http';
import {type JiraIssue,JIRA_PROJECTS} from './jira-types';
import {workIssue,WORK_JIRA_FIELDS,type RemoteWorkIssue} from './work-jira-sync';
export {workIssue,type RemoteWorkIssue} from './work-jira-sync';
export function workAdmin(){if(!process.env.SUPABASE_SECRET_KEY)throw new Error('Server configuration missing');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function workAccess(){const ctx=await workspaceContext();if(ctx.preview||ctx.kind!=='employee')throw new Error('Active team access required');return {ctx,db:await serverClient()};}
export async function readWorkIssue(org:string,key:string){if(!/^(OCT|SEP|SOURCE)-[1-9][0-9]*$/.test(key))throw new Error('Invalid Jira task');const credentials=await jiraCredentials(org);if(!credentials)throw new Error('Jira connection required');const remote=await jiraRequest<RemoteWorkIssue>(credentials,`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${WORK_JIRA_FIELDS.join(',')}`);if(!JIRA_PROJECTS.includes(remote.fields.project.key as typeof JIRA_PROJECTS[number]))throw new Error('Invalid Jira project');return {issue:workIssue(remote),credentials};}
export async function importWorkIssues(org:string,actor:string,issues:(JiraIssue&{description_text?:string;status_category?:string})[]){const {error}=await workAdmin().rpc('work_import',{org_id:org,actor_user:actor,issues});if(error)throw new Error('Unified task database setup or import failed');}
