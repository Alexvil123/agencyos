'use client';
import '../app/work-board.css';
import {AlertTriangle,CheckSquare} from 'lucide-react';
import {JIRA_SITE} from '@/lib/jira-types';
import {indiaDate} from '@/lib/work-report';
import type {TimeTask} from '@/lib/time-types';
import {taskDisplayStatus,taskClientLabel} from '@/lib/work-jira-sync';

const rank=(t:TimeTask)=>t.source==='jira'?({new:0,indeterminate:1,done:2} as Record<string,number>)[t.jira_status_category||'indeterminate']??1:({pending:0,in_progress:1,on_hold:1,completed:2,cancelled:2} as Record<string,number>)[t.work_status||'pending']??1;
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase()||'?';
const day=(value:string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));

/** The tasks on screen, laid out like a Jira board: one column per status, a card per task. Opening a card shows its details. */
export function WorkBoard({tasks,now,names,onDetails}:{tasks:TimeTask[];now:string;names:Record<string,string>;onDetails:(task:TimeTask)=>void}){
  const columns=new Map<string,{name:string;rank:number;tasks:TimeTask[]}>();
  for(const task of tasks){const name=taskDisplayStatus(task),column=columns.get(name)||{name,rank:rank(task),tasks:[]};column.tasks.push(task);columns.set(name,column);}
  const ordered=[...columns.values()].sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name)),today=indiaDate(now);
  if(!ordered.length)return <p className="subtle work-board-empty">No tasks match these filters.</p>;
  return <div className="work-board" role="list" aria-label="Task board">{ordered.map(column=><section className="work-board-column" role="listitem" key={column.name} aria-label={`${column.name}, ${column.tasks.length} tasks`}>
    <header><h3>{column.name}</h3><span>{column.tasks.length}</span></header>
    <div className="work-board-cards">{column.tasks.map(task=>{
      const due=task.due_at?indiaDate(task.due_at):'',late=Boolean(due)&&due<today&&rank(task)<2,who=task.jira_assignee_name||names[task.membership_id]||'';
      return <article className="work-board-card" key={task.id}>
        <button className="work-board-title" onClick={()=>onDetails(task)}>{task.title}</button>
        <div className="work-board-labels">{taskClientLabel(task,[]).split(' · ').filter(l=>l&&!l.startsWith('No Jira')).map(l=><span key={l}>{l}</span>)}</div>
        {due&&<p className={late?'late':''}>{day(task.due_at!)}{late&&<AlertTriangle size={13} aria-label="Overdue"/>}</p>}
        <footer><span className="work-board-key"><CheckSquare size={14}/>{task.jira_key?<a href={`${JIRA_SITE}/browse/${encodeURIComponent(task.jira_key)}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${task.jira_key} in Jira`}>{task.jira_key}</a>:'Manual'}</span>{who&&<span className="work-board-avatar" title={who}>{initials(who)}</span>}</footer>
      </article>;})}</div>
  </section>)}</div>;
}
