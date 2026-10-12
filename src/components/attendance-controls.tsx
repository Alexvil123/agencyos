'use client';
import {attendanceTotals,formatDuration,EXPECTED_SECONDS} from '@/lib/time-core';
import Link from 'next/link';
import {Coffee,LogIn,LogOut} from 'lucide-react';
import {clockDuration} from '@/lib/work-report';
import type {TimeData} from '@/lib/time-types';
export function AttendanceControls({data,now,busy,onEvent,compact=false}:{data:TimeData;now:string;busy:boolean;onEvent:(operation:string)=>void;compact?:boolean}){
 const active=data.attendance.find(a=>a.membership_id===data.self&&!a.clock_out),onBreak=data.breaks.some(b=>b.membership_id===data.self&&!b.end_at);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const record=active||data.attendance.find(a=>a.membership_id===data.self&&a.work_date===today);
 const totals=record?attendanceTotals(record.clock_in,record.clock_out,data.breaks.filter(b=>b.attendance_id===record.id).map(b=>({start:b.start_at,end:b.end_at,excluded:b.excluded_from_attendance})),now,'working'):null;
 const canContinue=!!record?.clock_out&&data.corrections.some(r=>r.kind==='continue_work'&&r.target_id===record.id&&r.state==='approved'&&!r.consumed_at&&r.expected_updated===record.updated_at&&record.work_date===today);
 const attendanceNotice=!active&&record?.clock_out?<p className="ov-note">Today’s attendance is completed. For a wrong clock-out, request approval in <Link href="/attendance">Attendance</Link>.</p>:null;
 if(totals&&record?.break_override_seconds!==null){totals.breakSeconds=record!.break_override_seconds;totals.workingSeconds=Math.max(0,totals.combinedSeconds-totals.breakSeconds);totals.overtimeSeconds=Math.max(0,totals.workingSeconds-EXPECTED_SECONDS);}
 if(compact){
  const spent=totals?.combinedSeconds||0,pct=Math.min(100,Math.round(spent/EXPECTED_SECONDS*100)),tone=onBreak?'break':active?'live':'off';
  const since=active?'Working since '+new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}).format(new Date(active.clock_in)):record?.clock_out?'Clocked out at '+new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',timeStyle:'short'}).format(new Date(record.clock_out)):'Ready for your workday';
  return <section className={`panel ov-clock ${tone}`}>
   <header><span className="ov-state"><i/>{active?(onBreak?'On break':'Clocked in'):'Clocked out'}</span><small>Daily target 9h 30m</small></header>
   <div className="ov-clock-main"><strong className="ov-clock-time" aria-label="Time since clock in">{clockDuration(spent)}</strong><span>{since}</span></div>
   <div className="ov-progress" role="progressbar" aria-label="Daily target progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{width:`${pct}%`}}/></div>
   <p className="ov-progress-label"><strong>{pct}%</strong> of the daily target · {spent>=EXPECTED_SECONDS?'target reached':`${clockDuration(EXPECTED_SECONDS-spent)} remaining`}</p>
   <div className="ov-actions">{!active?<button className="dash-action start" disabled={busy||(!canContinue&&data.attendance.some(a=>a.membership_id===data.self&&a.work_date===today))} onClick={()=>onEvent('clock_in')}><LogIn size={16}/>Clock In</button>:<><button className="dash-action break" disabled={busy} onClick={()=>onEvent(onBreak?'break_end':'break_start')}><Coffee size={16}/>{onBreak?'End Break':'Start Break'}</button><button className="dash-action end" disabled={busy} onClick={()=>onEvent('clock_out')}><LogOut size={16}/>Clock Out</button></>}</div>
   {canContinue&&<p role="status" className="ov-note">Request approved. Click Clock In to continue your work.</p>}
   {attendanceNotice}
   {active&&active.work_date!==today&&<p className="ov-note warn">Earlier session still open. Close it and request a correction.</p>}
   <p className="ov-help">A break holds your running task and resumes it when you end the break. Clock Out saves your time and stops task timers.</p>
  </section>;
 }
 return <section className="panel time-panel"><div className="time-heading"><div><span className="eyebrow">TODAY · INDIA TIME</span><h2>My attendance</h2><p>Daily target: <strong>9h 30m from actual Clock In</strong></p></div><span className="neutral-pill">{active?(onBreak?'On break':'Clocked in'):'Clocked out'}</span></div><div className="time-controls"><button className="primary" disabled={busy||Boolean(active)||(!canContinue&&data.attendance.some(a=>a.membership_id===data.self&&a.work_date===today))} onClick={()=>onEvent('clock_in')}>Clock in</button><button className="secondary" disabled={busy||!active} onClick={()=>onEvent('clock_out')}>Clock out</button><button className="secondary" disabled={busy||!active||onBreak} onClick={()=>onEvent('break_start')}>Start break</button><button className="secondary" disabled={busy||!active||!onBreak} onClick={()=>onEvent('break_end')}>End break</button></div>{attendanceNotice}{totals&&<div className="time-stats">{[['Working',totals.workingSeconds],['Break',totals.breakSeconds],['Combined',totals.combinedSeconds]].map(([label,value])=><div key={label}><small>{label}</small><strong>{formatDuration(Number(value))}</strong></div>)}</div>}<p className="subtle">Start break holds your running task. End break resumes that task automatically. Clock out saves time and stops the timer; Jira status changes only when you select and save it.</p><p className="dash-shift-note">Start Break holds your running task. End Break automatically resumes that task. Clock Out saves time and stops task timers.</p>{active&&active.work_date!==today&&<p className="notice">An earlier attendance session is still open. Close it and request a correction for a missed clock-out.</p>}</section>;
}
