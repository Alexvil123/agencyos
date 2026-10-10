'use client';
import {TaskTimerControls} from './task-timer-controls';
import {clockDuration,closedSeconds,indiaDate,rangeBounds,type WorkData} from '@/lib/work-report';
import type {TimeTask} from '@/lib/time-types';
import {taskOperationalState} from '@/lib/task-filters';
export function TaskQuickWork({task,data,now,busy,onTimer}:{task:TimeTask;data:WorkData;now:string;busy:boolean;onTimer:(t:TimeTask,o:'start'|'hold'|'resume'|'end')=>void}){
 const mine=task.membership_id===data.self,log=data.logs.find(l=>l.task_id===task.id&&l.membership_id===data.self&&l.state!=='stopped'),bounds=rangeBounds(indiaDate(now),indiaDate(now));const sessions=data.sessions.filter(s=>s.task_id===task.id&&s.employee_id===task.membership_id);const seconds=(daily=false)=>sessions.reduce((sum,s)=>sum+(s.ended_at?closedSeconds(s,daily?bounds.start:undefined,daily?bounds.end:undefined):Math.max(0,(Date.parse(now)-Math.max(Date.parse(s.started_at),daily?bounds.start:0))/1000)),0);
 return <section className="task-quick-work"><div><small>Today / total task work</small><strong>{clockDuration(seconds(true))} / {clockDuration(seconds())}</strong><p>Held gaps excluded · Active time is provisional</p></div><TaskTimerControls task={task} log={log} mine={mine} closed={['completed','cancelled'].includes(taskOperationalState(task))} clocked={data.attendance.some(a=>a.membership_id===data.self&&!a.clock_out)} onBreak={data.breaks.some(b=>b.membership_id===data.self&&!b.end_at)} busy={busy} onTimer={onTimer}/></section>;
}
