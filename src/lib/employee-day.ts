import type {WorkData} from './work-report';
import {closedSeconds,indiaDate,rangeBounds} from './work-report';
import {teamDay} from './day-insights';
import {EXPECTED_SECONDS,attendanceTotals} from './time-core';
export function employeeDay(data:WorkData,now:string){const day=teamDay(data,now).find(p=>p.id===data.self),bounds=rangeBounds(indiaDate(now),indiaDate(now));
 // Task work only counts while the person is clocked in today. A timer left running overnight is not today's work before the clock-in.
 const windows=data.attendance.filter(r=>r.membership_id===data.self&&r.work_date===indiaDate(now)).map(r=>({start:Math.max(Date.parse(r.clock_in),bounds.start),end:Math.min(r.clock_out?Date.parse(r.clock_out):Date.parse(now),bounds.end)}));
 const rows=new Map<string,{id:string;title:string;seconds:number;active:boolean}>();for(const s of data.sessions.filter(s=>s.employee_id===data.self)){const from=Date.parse(s.started_at),to=s.ended_at?Date.parse(s.ended_at):Date.parse(now);const seconds=windows.reduce((n,w)=>n+Math.max(0,Math.floor((Math.min(to,w.end)-Math.max(from,w.start))/1000)),0);if(!seconds)continue;const row=rows.get(s.task_id)||{id:s.task_id,title:data.tasks.find(t=>t.id===s.task_id)?.title||'Recorded task',seconds:0,active:false};row.seconds+=seconds;row.active ||= !s.ended_at;rows.set(s.task_id,row);}const tracked=[...rows.values()].reduce((n,r)=>n+r.seconds,0);return {day,rows:[...rows.values()],tracked,remaining:Math.max(0,EXPECTED_SECONDS-(day?.combined||0)),unallocated:Math.max(0,(day?.working||0)-tracked)};}
export function sourceLinks(value:unknown):string[]{const links=new Set<string>();function visit(node:unknown){if(!node||typeof node!=='object')return;const n=node as {attrs?:{href?:string;url?:string};marks?:unknown[];content?:unknown[]};for(const url of [n.attrs?.href,n.attrs?.url]){if(url&&/^https?:\/\//i.test(url))links.add(url);}n.marks?.forEach(visit);n.content?.forEach(visit);}visit(value);return [...links];}
/** The last seven India days of the signed-in person's attendance: working and break seconds per day, oldest first. */
export type WeekDay={date:string;label:string;working:number;breaks:number;today:boolean};
export function weekHours(data:WorkData,now:string):WeekDay[]{
 const today=indiaDate(now),base=new Date(today+'T00:00:00Z');
 return Array.from({length:7},(_,i)=>{
  const d=new Date(base);d.setUTCDate(d.getUTCDate()+i-6);const date=d.toISOString().slice(0,10);
  let working=0,breaks=0;
  for(const record of data.attendance.filter(a=>a.membership_id===data.self&&a.work_date===date)){
   const spans=data.breaks.filter(b=>b.attendance_id===record.id).map(b=>({start:b.start_at,end:b.end_at,excluded:b.excluded_from_attendance}));
   const totals=attendanceTotals(record.clock_in,record.clock_out,spans,now,'working');
   const breakSeconds=Math.min(totals.combinedSeconds,record.break_override_seconds??totals.breakSeconds);
   breaks+=breakSeconds;working+=totals.combinedSeconds-breakSeconds;
  }
  return {date,label:new Intl.DateTimeFormat('en-IN',{weekday:'short',timeZone:'UTC'}).format(d),working,breaks,today:date===today};
 });
}
