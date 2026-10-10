'use client';
import {Pause,Play,Square} from 'lucide-react';
import type {TimeTask,TimeLog} from '@/lib/time-types';
export function TaskTimerControls({task,log,mine,closed,clocked,onBreak,busy,onTimer}:{task:TimeTask;log?:TimeLog;mine:boolean;closed:boolean;clocked:boolean;onBreak:boolean;busy:boolean;onTimer:(task:TimeTask,operation:'start'|'hold'|'resume'|'end')=>void}){
 if(!mine)return <div className="task-timer-controls"><div className="task-timer-buttons"><button className="dash-icon-action start" disabled title="Only the assigned employee can record their work"><Play size={14}/>Start</button><button className="dash-icon-action end" disabled title="Only the assigned employee can end their work"><Square size={13}/>End</button></div><small className="task-control-note">Assigned employee’s login only</small></div>;
 const restartable=task.source==='manual'&&task.work_status==='completed';
 const reason=closed&&!restartable?'Task is closed':!clocked?'Clock in from Overview first':onBreak?'End your break from Overview first':'';
 const running=log?.state==='running',paused=log?.state==='paused';
 return <div className="task-timer-controls"><div className="task-timer-buttons"><button className={`dash-icon-action ${running?'hold':'start'}`} disabled={busy||(!running&&Boolean(reason))} title={running?'Pause recorded work':reason||(restartable?'Start a new session; previous work time is preserved':'Record work time')} onClick={()=>onTimer(task,running?'hold':paused?'resume':'start')}>{running?<Pause size={14}/>:<Play size={14}/>} {running?'Hold':paused?'Resume':'Start'}</button><button className="dash-icon-action end" disabled={busy||!log||log.state==='stopped'} onClick={()=>onTimer(task,'end')}><Square size={13}/>End</button></div>{reason&&!running&&<small className="task-control-note">{reason}</small>}{restartable&&!reason&&<small className="task-control-note">Start again · previous time is preserved</small>}</div>;
}
