import type {TimeTask} from './time-types';
// Pure calendar helpers. All days are India calendar days written as YYYY-MM-DD.
export type CalendarView='month'|'week'|'team';
export type CalendarTone='done'|'progress'|'hold'|'overdue'|'todo';
const DAY=86400000;
const utc=(iso:string)=>Date.parse(`${iso}T00:00:00Z`);
const iso=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export function validIsoDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(utc(value))&&iso(utc(value))===value;}
export function istDay(value:string|Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(typeof value==='string'?new Date(value):value);}
export function addDays(day:string,days:number){return iso(utc(day)+days*DAY);}
export function weekStart(day:string){return addDays(day,-((new Date(utc(day)).getUTCDay()+6)%7));}
export function weekDays(day:string){const start=weekStart(day);return Array.from({length:7},(_,i)=>addDays(start,i));}
export function monthStart(day:string){return `${day.slice(0,8)}01`;}
export function monthEnd(day:string){const d=new Date(utc(monthStart(day)));return iso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));}
// Whole weeks (Monday first) that cover the month containing `day`.
export function monthDays(day:string){const start=weekStart(monthStart(day)),end=monthEnd(day),weeks=Math.ceil(((utc(end)-utc(start))/DAY+1)/7);return Array.from({length:weeks*7},(_,i)=>addDays(start,i));}
export function shiftAnchor(day:string,view:CalendarView,delta:number){
  if(view!=='month')return addDays(day,delta*7);
  const d=new Date(utc(monthStart(day)));return iso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+delta,1));
}
export function rangeLabel(day:string,view:CalendarView){
  const f=(value:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',...options}).format(new Date(utc(value)));
  if(view==='month')return f(day,{month:'long',year:'numeric'});
  const days=weekDays(day);return `${f(days[0],{day:'numeric',month:'short'})} – ${f(days[6],{day:'numeric',month:'short',year:'numeric'})}`;
}
export function dayLabel(day:string){return new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(utc(day)));}
// The Calendar shows Jira tasks only, each on its Jira due date. Manual CRM tasks live in Work.
export function taskDay(task:Pick<TimeTask,'due_at'>):string|null{return task.due_at?istDay(task.due_at):null;}
const isDone=(task:TimeTask)=>task.jira_status_category==='done';
export function taskTone(task:TimeTask,today:string):CalendarTone{
  if(isDone(task))return 'done';
  const day=taskDay(task);if(day&&day<today)return 'overdue';
  if(task.jira_status_category==='indeterminate')return 'progress';
  if(task.work_status==='on_hold')return 'hold';
  return 'todo';
}
export type CalendarFilters={employee:string;project:string;state:'all'|'open'|'done'};
export function calendarTasks(tasks:TimeTask[],filters:CalendarFilters,today:string){
  return tasks.filter(task=>task.source==='jira'&&task.jira_available!==false&&task.jira_project!=='SOURCE'
    &&(filters.employee==='all'||task.membership_id===filters.employee)
    &&(filters.project==='all'||task.jira_project===filters.project)
    &&(filters.state==='all'||(filters.state==='done')===(taskTone(task,today)==='done')));
}
export function tasksByDay(tasks:TimeTask[]){
  const days=new Map<string,TimeTask[]>();
  for(const task of tasks){const day=taskDay(task);if(!day)continue;const list=days.get(day);if(list)list.push(task);else days.set(day,[task]);}
  for(const list of days.values())list.sort((a,b)=>(a.jira_key||a.title).localeCompare(b.jira_key||b.title,undefined,{numeric:true}));
  return days;
}
// Open Jira tasks with no due date can be dragged onto a day to schedule them.
export function unscheduledTasks(tasks:TimeTask[],today:string){return tasks.filter(t=>t.source==='jira'&&!taskDay(t)&&taskTone(t,today)!=='done');}

// Team week: one row per person, one column per day, so the Owner can see who has what and who is free.
// Rows come from the people list (a person with no tasks is still shown: free capacity matters), plus an Unassigned row.
export const HEAVY_DAY=5;
export type TeamLoad='none'|'light'|'normal'|'heavy';
export type TeamCell={day:string;tasks:TimeTask[];open:number;load:TeamLoad};
export type TeamRow={id:string|null;name:string;cells:TeamCell[];open:number;overdue:number;noDate:TimeTask[]};
export const teamLoad=(open:number):TeamLoad=>open<=0?'none':open<=2?'light':open<HEAVY_DAY?'normal':'heavy';
const byKey=(a:TimeTask,b:TimeTask)=>(a.jira_key||a.title).localeCompare(b.jira_key||b.title,undefined,{numeric:true});
export function teamWeek(tasks:TimeTask[],days:string[],people:{id:string;display_name:string}[],today:string,employee='all'){
  const mine=new Map<string,TimeTask[]>(),known=new Set(people.map(p=>p.id));
  for(const task of tasks){const key=task.membership_id&&known.has(task.membership_id)?task.membership_id:'';const list=mine.get(key);if(list)list.push(task);else mine.set(key,[task]);}
  const row=(id:string|null,name:string):TeamRow=>{
    const list=mine.get(id||'')||[];
    const cells=days.map(day=>{const dayTasks=list.filter(t=>taskDay(t)===day).sort(byKey),open=dayTasks.filter(t=>taskTone(t,today)!=='done').length;return {day,tasks:dayTasks,open,load:teamLoad(open)};});
    const noDate=list.filter(t=>!taskDay(t)&&taskTone(t,today)!=='done').sort(byKey);
    return {id,name,cells,open:list.filter(t=>taskTone(t,today)!=='done').length,overdue:list.filter(t=>taskTone(t,today)==='overdue').length,noDate};
  };
  const chosen=employee==='all'?people:people.filter(p=>p.id===employee);
  const rows=[...chosen].sort((a,b)=>a.display_name.localeCompare(b.display_name)).map(p=>row(p.id,p.display_name));
  if(employee==='all'&&(mine.get('')||[]).length)rows.push(row(null,'Unassigned'));
  const totals=days.map((_,i)=>rows.reduce((n,r)=>n+r.cells[i].tasks.length,0));
  return {rows,totals};
}
