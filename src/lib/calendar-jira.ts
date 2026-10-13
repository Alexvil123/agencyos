import {plainDescription} from './jira-types';
import {parseJiraLabels} from './work-jira-sync';
import {CALENDAR_PROJECTS} from './calendar-input';
import {WORK_KEY} from './jira-types';
// Thin Jira Cloud calls used by the Calendar. `call` is jiraRequest bound to the connected site, so tests can inject a fake.
export type JiraCall=<T=unknown>(path:string,body?:unknown,method?:string)=>Promise<T>;
const KEY=WORK_KEY;
export function createIssueFields(input:{project:string;issue_type:string;summary:string;description:string;label:string;due_date:string}){
  if(!(CALENDAR_PROJECTS as readonly string[]).includes(input.project))throw new Error('Invalid project');
  const labels=input.label?parseJiraLabels(input.label):[];
  return {project:{key:input.project},issuetype:{id:input.issue_type},summary:input.summary,description:plainDescription(input.description),...(labels.length?{labels}:{}),...(input.due_date?{duedate:input.due_date}:{})};
}
export async function createIssue(call:JiraCall,input:Parameters<typeof createIssueFields>[0]){
  const created=await call<{key?:string}>('/rest/api/3/issue',{fields:createIssueFields(input)},'POST');
  if(!created?.key||!KEY.test(created.key))throw new Error('Jira did not return a valid issue key');
  return created.key;
}
// Required Jira fields this form cannot fill (anything beyond title, description, labels, due date, assignee and fields Jira defaults).
const SUPPORTED=new Set(['project','issuetype','summary','description','labels','duedate','assignee','reporter','priority']);
export function unsupportedRequiredFields(meta:{fields?:unknown[];values?:unknown[]}){
  const list=(meta.fields||meta.values||[]) as {required?:boolean;hasDefaultValue?:boolean;fieldId?:string;key?:string;name?:string}[];
  return list.filter(f=>f.required&&!f.hasDefaultValue&&!SUPPORTED.has(f.fieldId||f.key||'')).map(f=>f.name||f.fieldId||f.key||'Unknown field');
}
export async function assignIssue(call:JiraCall,key:string,accountId:string|null){
  if(!KEY.test(key))throw new Error('Invalid Jira task');
  await call(`/rest/api/3/issue/${encodeURIComponent(key)}/assignee`,{accountId},'PUT');
}
export async function setIssueDueDate(call:JiraCall,key:string,day:string|null){
  if(!KEY.test(key))throw new Error('Invalid Jira task');
  await call(`/rest/api/3/issue/${encodeURIComponent(key)}`,{fields:{duedate:day}},'PUT');
}
