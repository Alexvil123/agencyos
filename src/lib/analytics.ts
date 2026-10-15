import {closedSeconds,indiaDate,rangeBounds,workReport,type WorkData,type WorkFilters} from './work-report';
import {taskClientLabel} from './work-jira-sync';
import {taskOperationalState} from './task-filters';
import {workRecordScope} from './work-record-scope';
import type {TimeTask} from './time-types';

// Operational analytics. Every figure is derived from recorded work sessions and task records, never estimated.
// Days are India calendar days (YYYY-MM-DD). SOURCE reference records are never counted as work.
export type AnalyticsPreset='7d'|'30d'|'90d'|'month'|'last_month';
export type AnalyticsRange={from:string;to:string};
export const ANALYTICS_PRESETS:{key:AnalyticsPreset;label:string}[]=[{key:'7d',label:'Last 7 days'},{key:'30d',label:'Last 30 days'},{key:'90d',label:'Last 90 days'},{key:'month',label:'This month'},{key:'last_month',label:'Last month'}];
const DAY=86400000;
const utc=(day:string)=>Date.parse(`${day}T00:00:00Z`);
const iso=(ms:number)=>new Date(ms).toISOString().slice(0,10);

export function analyticsRange(preset:AnalyticsPreset,today:string):AnalyticsRange{
  if(preset==='7d'||preset==='30d'||preset==='90d'){const length=preset==='7d'?7:preset==='30d'?30:90;return {from:iso(utc(today)-(length-1)*DAY),to:today};}
  const d=new Date(utc(today)),year=d.getUTCFullYear(),month=d.getUTCMonth()+(preset==='last_month'?-1:0);
  return {from:iso(Date.UTC(year,month,1)),to:iso(Date.UTC(year,month+1,0))};
}
export function analyticsDays(range:AnalyticsRange){
  rangeBounds(range.from,range.to);
  const days:string[]=[];for(let ms=utc(range.from);ms<=utc(range.to)&&days.length<400;ms+=DAY)days.push(iso(ms));
  return days;
}
function workTasks(data:WorkData){return workRecordScope(data.tasks,false).filter(t=>t.jira_available!==false);}
// End is the start of the next day (exclusive) so a session crossing midnight loses no second.
const dayBounds=(day:string)=>{const {start}=rangeBounds(day,day);return {start,end:start+DAY};};

/** Closed work-session seconds per day. A session that crosses midnight is split between the days it covers. */
export function trackedByDay(data:WorkData,range:AnalyticsRange,employee='all'){
  const ids=new Set(workTasks(data).map(t=>t.id)),days=analyticsDays(range);
  const totals=new Map<string,number>(days.map(day=>[day,0]));
  for(const session of data.sessions){
    if(!session.ended_at||!ids.has(session.task_id)||(employee!=='all'&&session.employee_id!==employee))continue;
    const first=indiaDate(session.started_at),last=indiaDate(session.ended_at);
    for(const day of days){
      if(day<first||day>last)continue;
      const {start,end}=dayBounds(day);
      totals.set(day,(totals.get(day)||0)+closedSeconds(session,start,end));
    }
  }
  return days.map(day=>({day,seconds:totals.get(day)||0}));
}

const completedAt=(t:TimeTask)=>t.source==='jira'?(t.jira_resolved_at||t.completed_at):t.completed_at;
/** Tasks that reached a completed state, counted on the day Jira (or the CRM for manual tasks) recorded completion. */
export function completedByDay(data:WorkData,range:AnalyticsRange,employee='all'){
  const counts=new Map<string,number>(analyticsDays(range).map(day=>[day,0]));
  for(const task of workTasks(data)){
    if(taskOperationalState(task)!=='completed'||(employee!=='all'&&task.membership_id!==employee))continue;
    const at=completedAt(task);if(!at)continue;
    const day=indiaDate(at);if(counts.has(day))counts.set(day,(counts.get(day)||0)+1);
  }
  return [...counts.entries()].map(([day,count])=>({day,count}));
}

export type Breakdown={key:string;label:string;seconds:number;tasks:number};
/** Closed work-session seconds grouped by client label, employee or Jira project. */
export function trackedBy(data:WorkData,range:AnalyticsRange,by:'client'|'employee'|'project',employee='all'):Breakdown[]{
  const {start,end:lastMs}=rangeBounds(range.from,range.to),end=lastMs+1,byId=new Map(workTasks(data).map(t=>[t.id,t]));
  const rows=new Map<string,{label:string;seconds:number;tasks:Set<string>}>();
  for(const session of data.sessions){
    const task=byId.get(session.task_id);
    if(!task||!session.ended_at||(employee!=='all'&&session.employee_id!==employee))continue;
    const seconds=closedSeconds(session,start,end);if(!seconds)continue;
    const key=by==='employee'?session.employee_id:by==='project'?(task.jira_project||'Manual'):taskClientLabel(task,data.clients)||'No client';
    const label=by==='employee'?(data.people.find(p=>p.id===session.employee_id)?.display_name||'Team member'):key;
    const row=rows.get(key)||{label,seconds:0,tasks:new Set<string>()};
    row.seconds+=seconds;row.tasks.add(task.id);rows.set(key,row);
  }
  return [...rows.entries()].map(([key,row])=>({key,label:row.label,seconds:row.seconds,tasks:row.tasks.size})).sort((a,b)=>b.seconds-a.seconds||a.label.localeCompare(b.label));
}

type OpenMix={pending:number;in_progress:number;on_hold:number;overdue:number};
/** Open work right now, with overdue split out (a task is overdue when its due date has passed and it is not finished). */
export function openMix(data:WorkData,now:string,employee='all'):OpenMix{
  const mix:OpenMix={pending:0,in_progress:0,on_hold:0,overdue:0};
  for(const task of workTasks(data)){
    if(employee!=='all'&&task.membership_id!==employee)continue;
    const state=taskOperationalState(task);if(state==='completed'||state==='cancelled')continue;
    if(task.due_at&&Date.parse(task.due_at)<Date.parse(now)){mix.overdue++;continue;}
    if(state==='in_progress'||state==='on_hold'||state==='pending')mix[state]++;
  }
  return mix;
}

export function analyticsSummary(data:WorkData,range:AnalyticsRange,now:string,employee='all'){
  const scoped:WorkData={...data,tasks:workTasks(data)};
  const filters:WorkFilters={from:range.from,to:range.to,employee,department:'all',client:'all',source:'all',project:'all',status:'all',priority:'all',type:'all',includeCancelled:false};
  const report=workReport(scoped,filters,now),{start,end}=rangeBounds(range.from,range.to);
  const people=new Set(report.sessions.filter(s=>s.ended_at&&closedSeconds(s,start,end)>0).map(s=>s.employee_id));
  return {...report.metrics,activeEmployees:people.size,days:analyticsDays(range).length};
}
