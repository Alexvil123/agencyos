import type {TimeTask} from './time-types';
import {taskMatchesClient} from './work-jira-sync';

type TaskFilters={source:string;query:string;status:string;client:string;project:string;sort:string;dateField?:'due'|'created'|'updated';from?:string;to?:string;missingDate?:boolean};
export function filterWorkTasks(tasks:TimeTask[],f:TaskFilters):TimeTask[]{
 return tasks.filter(t=>taskMatchesDate(t,f)&&t.jira_available!==false&&(f.source==='all'||(t.source||'manual')===f.source)
  &&(f.status==='all'||(t.source==='jira'?f.status===`jira:${t.jira_status_id}`:f.status===`manual:${t.work_status||'pending'}`))
  &&taskMatchesClient(t,f.client)&&(f.project==='all'||t.jira_project===f.project)
  &&`${t.title} ${t.jira_key||''} ${t.jira_status||''} ${(t.jira_labels||[]).join(' ')} ${t.jira_assignee_name||''}`.toLowerCase().includes(f.query.trim().toLowerCase()))
 .sort((a,b)=>f.sort==='due'?(Date.parse(a.due_at||'')||Infinity)-(Date.parse(b.due_at||'')||Infinity):Date.parse(b.jira_updated_at||b.updated_at||b.created_at||'')-Date.parse(a.jira_updated_at||a.updated_at||a.created_at||''));
}
export function taskMatchesDate(t:TimeTask,f:TaskFilters){const value=f.dateField==='created'?(t.source==='jira'?t.jira_created_at:t.created_at):f.dateField==='updated'?(t.source==='jira'?t.jira_updated_at:t.updated_at):t.due_at;const date=value?(f.dateField==='due'?value.slice(0,10):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))):'';if(f.missingDate)return !date;if(!f.from&&!f.to)return true;return !!date&&(!f.from||date>=f.from)&&(!f.to||date<=f.to);}
export function taskMatchesPriority(task:TimeTask,value:string){
 if(value==='all')return true;
 if(value.startsWith('jira-priority:'))return task.source==='jira'&&(task.jira_priority_name||'Priority unavailable')===value.slice(14);
 if(value.startsWith('manual-priority:'))return task.source!=='jira'&&(task.priority||'medium')===value.slice(16);
 return task.source!=='jira'&&task.priority===value;
}
export function taskOperationalState(task:TimeTask):string{
 if(task.source==='jira'&&task.jira_status_category){
  return task.jira_status_category==='done'?'completed':task.jira_status_category==='indeterminate'?'in_progress':'pending';
 }
 return task.work_status||'pending';
}
