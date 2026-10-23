'use server';
import {z} from 'zod';
import {readTimeData} from '@/lib/time-data-server';
import {workAccess,workAdmin,readWorkIssue,importWorkIssues,reopenEndedJiraTask,type RemoteWorkIssue} from '@/lib/work-server';
import {jiraCredentials} from '@/lib/jira-server';
import {jiraRequest,JiraError} from '@/lib/jira-http';
import {JIRA_KEY,JIRA_PROJECTS} from '@/lib/jira-types';

import {jiraTaskDetails,editJiraTask} from './jira-actions';
import {fetchWorkJiraSnapshot,hydrateJiraMetadata,WORK_JIRA_FIELDS} from '@/lib/work-jira-sync';
import {recordSyncHealth} from '@/lib/sync-health-server';
import {parseManualTask} from '@/lib/manual-task';
import {taskOperationalState} from '@/lib/task-filters';
import {jiraProjectKeys} from '@/lib/jira-projects-server';
import {projectClause} from '@/lib/jira-types';
import type {TimeTask} from '@/lib/time-types';
import {jiraAutoFetch} from '@/lib/jira-sync-settings-server';
import {reconcileJiraAvailability} from '@/lib/jira-availability-server';

const optional=z.preprocess(v=>v===''?null:v,z.uuid().nullable());
function errorMessage(e:unknown){const m=e instanceof Error?e.message:'';const safe=['You already have an active task.','Active task changed; review again','Clock in first','End break before starting work','Assigned task required','Task is closed','No held work session','No open work session','Task already on hold','Own task or authorized manager required','Task changed or is Jira-synced','Hold the task before editing','Client scope denied','Current Jira assignment required','Session changed; request again','Work session overlap','Closed session and valid times required'];return safe.find(x=>m.includes(x))||'Could not confirm this operation. Refresh the workspace and review the current record.';}
// scope 'overview' is for the landing page: it only needs open work, so finished and removed tasks (unless a timer or session still refers to them) stay out of the response.
function workTasks<T extends {id:string;jira_available?:boolean}&Parameters<typeof taskOperationalState>[0]>(tasks:T[],scope:'full'|'overview',logs:{task_id:string}[],sessions:Record<string,unknown>[]){
 if(scope!=='overview')return tasks;
 const referenced=new Set<string>([...logs.map(l=>l.task_id),...sessions.map(s=>String(s.task_id))]);
 return tasks.filter(t=>referenced.has(t.id)||(t.jira_available!==false&&!['completed','cancelled'].includes(taskOperationalState(t))));
}
export async function loadWorkData(scope:'full'|'overview'='full'){
 try{
  const {ctx,db}=await workAccess();
  const sessionRead=async()=>{let rows:Record<string,unknown>[]=[];let limited=false;for(let page=0;page<20;page++){const r=await db.from('task_work_sessions').select('*').eq('organization_id',ctx.organizationId).order('started_at',{ascending:false}).order('id').range(page*1000,page*1000+999);if(r.error)throw new Error('Sessions unavailable');rows=rows.concat(r.data);if(r.data.length<1000)break;if(page===19)limited=true;}return {rows,limited};};
  // All independent reads share one verified user context and start together.
  const [base,departments,config,mappings,sessions,autoFetch,orders,employees]=await Promise.all([
   readTimeData(ctx,db,{openTasksOnly:scope==='overview'}),db.rpc('work_departments',{org_id:ctx.organizationId}),
   db.from('work_project_config').select('*').eq('organization_id',ctx.organizationId),
   db.from('work_workflow_mappings').select('*').eq('organization_id',ctx.organizationId),
   sessionRead(),jiraAutoFetch(ctx.organizationId),db.from('work_task_orders').select('membership_id,task_ids,revision').eq('organization_id',ctx.organizationId),
   db.from('employees').select('membership_id,department_id').eq('organization_id',ctx.organizationId).not('membership_id','is',null)
  ]);
  if(!base.ok||!base.data||departments.error||config.error||mappings.error||orders.error||employees.error)throw new Error('Unified task database setup required');
  if(scope==='overview'){
   // Finished tasks stay out of the query, except those a timer or recorded session still points at.
   const present=new Set(base.data.tasks.map(t=>t.id)),missing=[...new Set<string>([...base.data.logs.map(l=>l.task_id),...sessions.rows.map(s=>String(s.task_id))])].filter(id=>id&&!present.has(id));
   for(let index=0;index<missing.length;index+=100){const extra=await db.from('time_tasks').select('*').eq('organization_id',ctx.organizationId).in('id',missing.slice(index,index+100));if(extra.error)throw new Error('Referenced tasks unavailable');base.data.tasks.push(...extra.data.map(t=>hydrateJiraMetadata(t as unknown as TimeTask)));}
  }
  return {ok:true,message:'',autoFetch,data:{...base.data,taskOrders:orders.data as {membership_id:string;task_ids:string[];revision:number}[],tasks:workTasks(base.data.tasks.filter(t=>!t.canonical_id),scope,base.data.logs,sessions.rows),departments:departments.data as {id:string;name:string}[],employeeDepartments:employees.data as {membership_id:string;department_id:string|null}[],projectConfig:config.data as {client_id:string;jira_project:string;issue_type_id:string}[],mappings:mappings.data as {project:string;start_status:string;hold_status:string|null;end_status:string;enabled:boolean}[],sessions:sessions.rows,limited:base.data.limited||sessions.limited}};
 }catch{return {ok:false,message:'Unified Work Tracking database setup is not ready, or team access could not be verified.',data:undefined,autoFetch:{ready:false,enabled:false}};}
}
export async function saveWorkTaskOrder(target:string,ids:string[],revision:number){
 try{
  const {ctx,db}=await workAccess();
  const input=z.object({target:z.uuid(),ids:z.array(z.uuid()).max(20000),revision:z.number().int().min(0)}).parse({target,ids,revision});
  const {data,error}=await db.rpc('work_task_order_save',{org_id:ctx.organizationId,target:input.target,ordered_ids:input.ids,expected_revision:input.revision});
  if(error)return {ok:false,message:'Order was not saved. Tasks or their order may have changed; refresh and try again.',revision};
  return {ok:true,message:'Task order saved.',revision:data as number};
 }catch{return {ok:false,message:'Task order could not be saved. Check your access and retry.',revision};}
}
export async function syncWorkJira(automatic=false){
 let healthScope:{org:string;member:string}|undefined;
 try{
  const {ctx,db}=await workAccess();if(automatic&&!(await jiraAutoFetch(ctx.organizationId)).enabled)return {ok:true,message:'Automatic Jira fetch is Off.',issues:undefined,syncedAt:undefined};healthScope={org:ctx.organizationId,member:ctx.membershipId};let account:string|null=null;
  if(!ctx.roles.includes('Owner')){const {data,error}=await db.from('jira_account_links').select('account_id').eq('membership_id',ctx.membershipId).eq('organization_id',ctx.organizationId).maybeSingle();if(error||!data)throw new Error('Jira account link required');account=data.account_id;}
  const credentials=await jiraCredentials(ctx.organizationId);if(!credentials)throw new Error('Jira connection required');
  const snapshotStartedAt=new Date().toISOString();
  const projects=await jiraProjectKeys(credentials,true);
  const issues=await fetchWorkJiraSnapshot(cursor=>jiraRequest<{issues:RemoteWorkIssue[];nextPageToken?:string;isLast:boolean}>(credentials,'/rest/api/3/search/jql',{jql:`${projectClause(projects)}${account?` AND assignee = ${JSON.stringify(account)}`:''} ORDER BY updated DESC`,maxResults:100,fields:WORK_JIRA_FIELDS,...(cursor?{nextPageToken:cursor}:{})}));
  // Reject an unexpected tenant/scope result before persisting or returning any records.
  if(issues.some(i=>!JIRA_PROJECTS.includes(i.project_key as typeof JIRA_PROJECTS[number])||(account&&i.assignee_id!==account)))throw new Error('Unexpected Jira scope');
  for(let index=0;index<issues.length;index+=100)await importWorkIssues(ctx.organizationId,ctx.userId,issues.slice(index,index+100));
  await reconcileJiraAvailability(ctx.organizationId,issues.map(i=>i.key),snapshotStartedAt,account);
  await recordSyncHealth(ctx.organizationId,ctx.membershipId,'jira',true);
  return {ok:true,message:`${issues.length} Jira tasks synced across all pages.`,issues,syncedAt:new Date().toISOString()};
 }catch(e){if(healthScope)await recordSyncHealth(healthScope.org,healthScope.member,'jira',false);return {ok:false,message:e instanceof JiraError?e.message:e instanceof Error&&e.message==='Jira account link required'?'Owner must link your Jira account before assigned tasks can sync.':'Jira sync is incomplete. Showing saved data; refresh to retry.',issues:undefined,syncedAt:undefined};}
}
export async function editWorkJiraTask(form:FormData){
 let lease:{org:string;actor:string;task:string;token:string}|undefined;
 try{
  const {ctx,db}=await workAccess();const p=z.object({task:z.uuid(),expected:z.string().min(1),summary:z.string().trim().min(1).max(255),description:z.string().max(20000),change_description:z.enum(['yes','no']),labels:z.string().max(25600).default(''),change_labels:z.enum(['yes','no']).default('no'),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));
  const {data:task}=await db.from('time_tasks').select('jira_key').eq('organization_id',ctx.organizationId).eq('id',p.task).single();if(!task?.jira_key)throw new Error('Jira task required');
  const {data:token,error}=await workAdmin().rpc('work_transition_claim',{org_id:ctx.organizationId,actor_user:ctx.userId,task:p.task});if(error||!token)throw new Error('Jira edit in progress');lease={org:ctx.organizationId,actor:ctx.userId,task:p.task,token:token as string};
  const edit=new FormData();for(const [key,value] of Object.entries({...p,key:task.jira_key,transition:''}))edit.set(key,value);
  const result=await editJiraTask(edit);if(!result.ok){await workAdmin().rpc('work_transition_result',{org_id:lease.org,actor_user:lease.actor,task:lease.task,token:lease.token,warning:'review_required'});return result;}
  const latest=await readWorkIssue(ctx.organizationId,task.jira_key);await importWorkIssues(ctx.organizationId,ctx.userId,[latest.issue]);await workAdmin().rpc('work_transition_result',{org_id:lease.org,actor_user:lease.actor,task:lease.task,token:lease.token,warning:null});
  return {ok:true,message:'Jira confirmed the edit. CRM now shows the authoritative Jira task; recorded work is preserved.',issue:latest.issue};
 }catch{if(lease)await workAdmin().rpc('work_transition_result',{org_id:lease.org,actor_user:lease.actor,task:lease.task,token:lease.token,warning:'uncertain'});return {ok:false,message:'Jira edit could not be confirmed. Refresh task details before retrying.'};}
}
export async function saveWorkTask(form:FormData){
 try{const {ctx,db}=await workAccess();const input=parseManualTask(form);
 const {error}=await db.rpc('work_manual_save',{org_id:ctx.organizationId,title_value:input.title,client_name:input.client_name,client_source:input.client_source,work_day:input.work_date,task_id:input.task_id||null,expected:input.expected||null});if(error)throw new Error(error.message);
 return {ok:true,message:input.task_id?'Manual CRM task updated with audit history.':'Manual task saved in CRM only. No Jira issue was created.'};
 }catch(e){return {ok:false,message:errorMessage(e)};}
}
export async function workTimer(form:FormData){
 try{const {ctx,db}=await workAccess();const p=z.object({task:z.uuid(),operation:z.enum(['start','hold','resume','end']),switch_current:z.enum(['yes','no']).default('no'),expected_active:optional.optional()}).parse(Object.fromEntries(form));const {data:task}=await db.from('time_tasks').select('*').eq('organization_id',ctx.organizationId).eq('id',p.task).eq('membership_id',ctx.membershipId).single();if(!task)throw new Error('Assigned task required');let rpc='work_event',args:Record<string,unknown>={org_id:ctx.organizationId,operation:p.operation,task:p.task,switch_current:p.switch_current==='yes',expected_active:p.expected_active||null};
 if(task.source==='jira'&&['start','resume'].includes(p.operation)){const {issue}=await readWorkIssue(ctx.organizationId,task.jira_key);if(issue.status_category==='done')throw new Error('Task is closed');const {data:link}=await db.from('jira_account_links').select('account_id').eq('organization_id',ctx.organizationId).eq('membership_id',ctx.membershipId).maybeSingle();if(!link||issue.assignee_id!==link.account_id)throw new Error('Current Jira assignment required');await importWorkIssues(ctx.organizationId,ctx.userId,[issue]);await reopenEndedJiraTask(ctx.organizationId,ctx.membershipId,task.id,issue.status_category);rpc='work_jira_event';args={...args,actor_user:ctx.userId,issue_assignee:issue.assignee_id};}
 const result=await (rpc==='work_event'?db:workAdmin()).rpc(rpc,args);if(result.error)throw new Error(result.error.message);
 let warning='';if(p.switch_current==='yes'&&p.expected_active)warning=await mappedTransition(p.expected_active,'hold');
 if(task.source==='jira'&&p.operation!=='end')warning+=await mappedTransition(p.task,p.operation); return {ok:true,message:`${p.operation==='end'?'Task ended and work time saved.':p.operation==='hold'?'Task held; recorded work time is preserved.':'Work session started.'}${warning}`,logId:result.data as string};
 }catch(e){return {ok:false,message:errorMessage(e),logId:undefined};}
}
export async function workSessionCorrection(form:FormData){try{const {ctx,db}=await workAccess();const p=z.object({session:z.uuid(),start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),reason:z.string().trim().min(5).max(1000),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));const {error}=await db.rpc('work_correction_request',{org_id:ctx.organizationId,session_id:p.session,start_value:p.start,end_value:p.end,reason_value:p.reason});if(error)throw new Error(error.message);return {ok:true,message:'Correction submitted for audited approval. Recorded work time has not changed.'};}catch(e){return {ok:false,message:errorMessage(e)};}}
export async function changeWorkStatus(form:FormData){try{const {ctx,db}=await workAccess();const p=z.object({task:z.uuid(),reason:z.string().trim().min(5).max(1000),reopen:z.enum(['yes','no']),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));const {error}=await db.rpc('work_cancel',{org_id:ctx.organizationId,task:p.task,reason:p.reason,reopen:p.reopen==='yes'});if(error)throw new Error(error.message);return {ok:true,message:'Manual task workflow updated and audited.'};}catch(e){return {ok:false,message:errorMessage(e)};}}
export async function jiraWorkStatuses(){
 try{const {ctx}=await workAccess();if(!ctx.roles.includes('Owner'))throw new Error('Owner required');const credentials=await jiraCredentials(ctx.organizationId);if(!credentials)throw new Error('Connect Jira');const projects=await Promise.all((await jiraProjectKeys(credentials,true)).map(async project=>{const types=await jiraRequest<{id:string;name:string;statuses:{id:string;name:string}[]}[]>(credentials,`/rest/api/3/project/${project}/statuses`);return {project,types,statuses:[...new Map(types.flatMap(t=>t.statuses).map(s=>[s.id,s])).values()]};}));return {ok:true,message:'Actual Jira statuses fetched. Automatic mappings remain disabled until you explicitly confirm and enable each project.',projects};}catch(e){return {ok:false,message:e instanceof JiraError?e.message:'Could not fetch actual project workflows. Check Jira connection and project access.',projects:[]};}
}
async function mappedTransition(taskId:string,operation:string){
 try{const {ctx,db}=await workAccess();const {data:task}=await db.from('time_tasks').select('jira_project').eq('id',taskId).eq('organization_id',ctx.organizationId).single();if(!task?.jira_project)return '';const {data:mapping}=await db.from('work_workflow_mappings').select('*').eq('organization_id',ctx.organizationId).eq('project',task.jira_project).maybeSingle();if(!mapping?.enabled)return '';const target=operation==='hold'?mapping.hold_status:operation==='end'?mapping.end_status:mapping.start_status;if(!target)return '';const details=await workJiraDetails(taskId);if(!details.ok||!details.issue)return ' Jira mapping/configuration warning: current workflow could not be verified.';if(details.issue.status_id===target)return '';const transition=details.transitions.find(t=>t.to.id===target);if(!transition)return ' Jira mapping/configuration warning: no direct transition to the configured status is available.';const f=new FormData();f.set('task',taskId);f.set('expected',details.issue.jira_updated);f.set('transition',transition.id);f.set('confirmed','yes');const result=await setWorkJiraStatus(f);return result.ok?'':` ${result.message}`;}catch{return ' Jira mapping/configuration warning. Recorded work time is preserved.';}
}
export async function saveWorkMapping(form:FormData){try{const {ctx,db}=await workAccess();const p=z.object({project:z.enum(JIRA_PROJECTS),start:z.string().min(1),hold:z.string(),end:z.string().min(1),enable:z.enum(['yes','no']),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));const actual=await jiraWorkStatuses(),project=actual.projects.find(x=>x.project===p.project);if(!actual.ok||!project||[p.start,p.end,...(p.hold?[p.hold]:[])].some(id=>!project.statuses.some(s=>s.id===id)))throw new Error('Invalid actual status');const {error}=await db.rpc('work_mapping_save',{org_id:ctx.organizationId,project_key:p.project,start_value:p.start,hold_value:p.hold,end_value:p.end,enable:p.enable==='yes'});if(error)throw new Error(error.message);return {ok:true,message:p.enable==='yes'?`${p.project} mapping confirmed and enabled.`:`${p.project} draft saved; automatic transitions disabled.`};}catch{return {ok:false,message:'Mapping was not saved. Owner must select actual Jira statuses and explicitly confirm.'};}}
export async function attachExistingWorkJira(form:FormData){try{const {ctx}=await workAccess();if(!ctx.roles.includes('Owner'))throw new Error('Owner required');const p=z.object({task:z.uuid(),key:z.string().regex(JIRA_KEY),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));const current=await readWorkIssue(ctx.organizationId,p.key);const {error}=await workAdmin().rpc('work_jira_attach',{org_id:ctx.organizationId,actor_user:ctx.userId,task:p.task,issue:current.issue});if(error)throw new Error(error.message);return {ok:true,message:`Existing Jira ${p.key} linked. No new Jira issue was created.`};}catch{return {ok:false,message:'Could not link that issue. Owner must verify its project and current assignee; duplicate Jira tasks are rejected.'};}}
export async function workJiraDetails(taskId:string){try{const {ctx,db}=await workAccess();const {data}=await db.from('time_tasks').select('jira_key').eq('id',z.uuid().parse(taskId)).eq('organization_id',ctx.organizationId).single();if(!data?.jira_key)throw new Error('Jira task required');return await jiraTaskDetails(data.jira_key);}catch{return {ok:false,message:'Jira status choices are unavailable for this task.',issue:undefined,transitions:[]};}}
export async function setWorkJiraStatus(form:FormData){
 let sent=false;let lease:{org:string;actor:string;task:string;token:string}|undefined;try{const {ctx,db}=await workAccess();const p=z.object({task:z.uuid(),expected:z.string(),transition:z.string(),confirmed:z.literal('yes')}).parse(Object.fromEntries(form));const {data:task}=await db.from('time_tasks').select('*').eq('organization_id',ctx.organizationId).eq('id',p.task).single();if(!task?.jira_key)throw new Error('Jira task required');const current=await jiraTaskDetails(task.jira_key);if(!current.ok||!current.issue)throw new Error('Jira access denied');if(current.issue.jira_updated!==p.expected)return {ok:false,message:'Task changed in Jira. Refresh status choices before saving. Recorded work is preserved.'};const transition=current.transitions.find(t=>t.id===p.transition);if(p.transition&&!transition)return {ok:false,message:'Requested transition is unavailable. Jira workflow rules were not bypassed.'};const credentials=await jiraCredentials(ctx.organizationId);if(!credentials)throw new Error('Connect Jira');const {data:token,error:leaseError}=await workAdmin().rpc('work_transition_claim',{org_id:ctx.organizationId,actor_user:ctx.userId,task:p.task});if(leaseError)throw new Error('Status update in progress');lease={org:ctx.organizationId,actor:ctx.userId,task:p.task,token:token as string};if(transition){const {error}=await workAdmin().rpc('jira_audit',{org_id:ctx.organizationId,actor:ctx.userId,issue_assignee:current.issue.assignee_id,operation:'edit_requested',issue_key:task.jira_key});if(error)throw new Error('Audit denied');sent=true;await jiraRequest(credentials,`/rest/api/3/issue/${encodeURIComponent(task.jira_key)}/transitions`,{transition:{id:transition.id}});}
 const latest=await readWorkIssue(ctx.organizationId,task.jira_key);await importWorkIssues(ctx.organizationId,ctx.userId,[latest.issue]);await workAdmin().rpc('work_transition_result',{org_id:ctx.organizationId,actor_user:ctx.userId,task:p.task,token,warning:transition&&latest.issue.status_id!==transition.to.id?'conflict':null});if(transition&&latest.issue.status_id!==transition.to.id)return {ok:false,message:'Jira now has a different status. Refresh and review the task; timer activity was preserved.'};if(transition)await workAdmin().rpc('jira_audit',{org_id:ctx.organizationId,actor:ctx.userId,issue_assignee:latest.issue.assignee_id||null,operation:'edit_completed',issue_key:`${task.jira_key} → ${latest.issue.status_name}`});return {ok:true,message:`Jira confirmed ${task.jira_key}: ${latest.issue.status_name}. No timer activity was created by this status change.`,issue:latest.issue};}catch(e){if(lease)await workAdmin().rpc('work_transition_result',{org_id:lease.org,actor_user:lease.actor,task:lease.task,token:lease.token,warning:sent?'uncertain':'failed'});return {ok:false,message:sent?'Jira status outcome is uncertain. Refresh before retrying. Work sessions remain saved.':errorMessage(e)};}
}
