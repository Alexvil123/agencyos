import {descriptionText, statusCategoryFor, type JiraIssue} from './jira-types';
import type {TimeTask} from './time-types';

export const WORK_JIRA_FIELDS=['project','summary','description','status','assignee','updated','issuetype','duedate','priority','labels','components','created','resolutiondate','parent'] as const;
export type RemoteWorkIssue={id:string;key:string;fields:{project:{key:string;name?:string};summary:string;description:unknown;status:{id:string;name:string;statusCategory?:{key:string}};assignee:{accountId:string;displayName:string}|null;updated:string;issuetype?:{name:string};duedate?:string|null;priority?:{id:string;name:string}|null;labels?:string[];components?:{id:string;name:string}[];created?:string;resolutiondate?:string|null;attachment?:{id:string;filename:string;content:string}[];parent?:{key:string}|null}};
export type WorkJiraIssue=JiraIssue & {attachments?:{id:string;filename:string;content:string}[];description_text:string;status_category?:string;task_type:string;due_date:string|null;priority_name:string|null;priority_id:string|null;labels:string[];components:string[];project_name:string;created_at:string|null;resolved_at:string|null;parent_key:string|null};
export function workIssue(i:RemoteWorkIssue):WorkJiraIssue{return {id:i.id,key:i.key,project_key:i.fields.project.key,project_name:i.fields.project.name||i.fields.project.key,summary:i.fields.summary,description:i.fields.description,description_text:descriptionText(i.fields.description),attachments:(i.fields.attachment||[]).filter(a=>/^https:\/\//i.test(a.content)),status_id:i.fields.status.id,status_name:i.fields.status.name,status_category:statusCategoryFor(i.fields.project.key,i.fields.status.name,i.fields.status.statusCategory?.key),assignee_id:i.fields.assignee?.accountId||null,assignee_name:i.fields.assignee?.displayName||null,jira_updated:i.fields.updated,task_type:i.fields.issuetype?.name||'General',due_date:i.fields.duedate||null,priority_name:i.fields.priority?.name||null,priority_id:i.fields.priority?.id||null,labels:i.fields.labels||[],components:(i.fields.components||[]).map(c=>c.name),created_at:i.fields.created||null,resolved_at:i.fields.resolutiondate||null,parent_key:i.fields.parent?.key||null};}
type Page={issues:RemoteWorkIssue[];nextPageToken?:string;isLast:boolean};
// A missing/repeating cursor must never be presented as a complete Jira snapshot.
export async function fetchWorkJiraSnapshot(fetchPage:(cursor?:string)=>Promise<Page>){
 const issues=new Map<string,WorkJiraIssue>(),seen=new Set<string>();let cursor:string|undefined;
 for(let page=0;page<50;page++){
  const result=await fetchPage(cursor);
  for(const remote of result.issues){const issue=workIssue(remote),previous=issues.get(issue.key);if(!previous||Date.parse(issue.jira_updated)>=Date.parse(previous.jira_updated))issues.set(issue.key,issue);}
  if(result.isLast)return [...issues.values()];
  if(!result.nextPageToken||seen.has(result.nextPageToken))throw new Error('Jira pagination did not complete');
  cursor=result.nextPageToken;seen.add(cursor);
 }
 throw new Error('Jira snapshot limit reached');
}
export function mergeWorkJiraSnapshot(tasks:TimeTask[],issues:WorkJiraIssue[]):TimeTask[]{
 const byKey=new Map(issues.map(i=>[i.key,i]));
 return tasks.map(task=>{
  if(task.source!=='jira')return task;
  const issue=byKey.get(task.jira_key||'');
  if(!issue)return {...task,jira_available:false}; // Keep recorded history, omit from current Jira board.
  if(task.jira_updated_at&&Date.parse(task.jira_updated_at)>Date.parse(issue.jira_updated))return {...task,jira_available:true};
  return {...task,jira_available:true,title:issue.summary,description:issue.description_text,jira_status:issue.status_name,jira_status_id:issue.status_id,jira_updated_at:issue.jira_updated,jira_assignee_account_id:issue.assignee_id,jira_assignee_name:issue.assignee_name,jira_priority_name:issue.priority_name,jira_status_category:issue.status_category,jira_labels:issue.labels,jira_components:issue.components,jira_project_name:issue.project_name,jira_created_at:issue.created_at,jira_resolved_at:issue.resolved_at,jira_parent_key:issue.parent_key,task_type:issue.task_type,due_at:issue.due_date?`${issue.due_date}T23:59:59+05:30`:null};
 });
}
export const taskDisplayStatus=(task:TimeTask)=>task.source==='jira'?task.jira_status||'Jira status unavailable':({pending:'To Do',in_progress:'In Progress',on_hold:'On Hold',completed:'Completed',cancelled:'Cancelled'}[task.work_status||'pending']||task.work_status||'To Do');
export const taskPriorityLabel=(task:TimeTask)=>task.source==='jira'?task.jira_priority_name||'Priority unavailable':task.priority||'medium';
export const taskClientLabel=(task:TimeTask,clients:{id:string;display_name:string}[])=>{void clients;return task.source==='jira'?(task.jira_labels?.join(' · ')||'No Jira labels'):task.manual_client_name||'Internal / CRM manual task';};
export const taskMatchesClient=(task:TimeTask,value:string)=>value==='all'||(value.startsWith('jira-label:')?(task.source==='jira'?Boolean(task.jira_labels?.includes(value.slice(11))):task.manual_client_source==='jira_label'&&task.manual_client_name===value.slice(11)):value.startsWith('manual-client:')?task.source==='manual'&&task.manual_client_name===value.slice(14):task.client_id===value);
export function hydrateJiraMetadata(task:TimeTask):TimeTask{
 const m=task.jira_metadata;if(task.source!=='jira'||!m)return task;
 return {...task,jira_available:m.available!==false,jira_labels:m.labels,jira_components:m.components,jira_project_name:m.project_name,jira_created_at:m.created_at,jira_resolved_at:m.resolved_at,jira_parent_key:m.parent_key,jira_priority_name:m.priority_name,jira_status_category:statusCategoryFor(task.jira_project||'',task.jira_status||'',m.status_category),jira_assignee_name:m.assignee_name};
}
// Ending a Jira task only closes the employee's session. The task itself is closed when Jira says Done, so an ended task that is still open in Jira can be started again.
export const jiraStillOpen=(statusCategory?:string)=>Boolean(statusCategory)&&statusCategory!=='done';
export function parseJiraLabels(value:string):string[]{
 const labels=value.split(/\r?\n/).filter(label=>label!=='');
 if(labels.length>100||labels.some(label=>label.length>255||/\s/u.test(label)))throw new Error('Use one Jira label per line without spaces');
 return [...new Set(labels)];
}
