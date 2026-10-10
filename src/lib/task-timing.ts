import type {WorkSession} from './work-report';
import type {TimeLog} from './time-types';

export function taskTiming(task:string,sessions:WorkSession[],logs:TimeLog[],now:string,employee?:string){
 const rows=sessions.filter(s=>s.task_id===task&&(!employee||s.employee_id===employee)).sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at));
 const open=logs.filter(l=>l.task_id===task&&(!employee||l.membership_id===employee)&&l.state!=='stopped');
 const last=rows.at(-1),lastHold=rows.filter(s=>s.paused_at).at(-1)?.paused_at;
 const stoppedAt=logs.find(l=>l.id===last?.log_id&&l.state==='stopped')?.stopped_at;
 const seconds=rows.reduce((sum,s)=>sum+Math.max(0,Math.floor((Date.parse(s.ended_at||now)-Date.parse(s.started_at))/1000)),0);
 return {rows,seconds,startedAt:rows[0]?.started_at,heldAt:lastHold,endedAt:!open.length&&rows.length?(stoppedAt||last?.ended_at):undefined,endCaptured:!!stoppedAt,state:open.some(l=>l.state==='running')?'running':open.some(l=>l.state==='paused')?'paused':rows.length?'ended':'not_started'};
}
