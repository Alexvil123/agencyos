'use client';
import {useState} from 'react';
import type {WorkData} from '@/lib/work-report';
import {indiaDate} from '@/lib/work-report';
import type {TimeTask} from '@/lib/time-types';
import {saveWorkTask} from '@/app/work-actions';
export function ManualTaskForm({data,task,busy,submit}:{data:WorkData;task?:TimeTask;busy:boolean;submit:(action:(f:FormData)=>Promise<{ok:boolean;message:string}>,f:FormData)=>void}){
 const [choice,setChoice]=useState(task?.manual_client_source==='jira_label'?`jira-label:${task.manual_client_name}`:task?.manual_client_name?'other':'');
 const labels=[...new Set([...data.tasks.filter(t=>t.source==='jira').flatMap(t=>t.jira_labels||[]),...(task?.manual_client_source==='jira_label'&&task.manual_client_name?[task.manual_client_name]:[])])].sort();
 const editable=!task||data.manager||task.membership_id===data.self;
 return <form className="stack work-task-form" action={f=>submit(saveWorkTask,f)}><input type="hidden" name="task_id" value={task?.id||''}/><input type="hidden" name="expected" value={task?.updated_at||''}/><label>Client name<select name="client_choice" value={choice} onChange={e=>setChoice(e.target.value)} required disabled={!editable||busy}><option value="" disabled>Select client</option>{labels.map(label=><option key={label} value={`jira-label:${label}`}>{label}</option>)}<option value="other">Others — new name</option></select></label>{choice==='other'&&<label>New client name<input name="other_client" required maxLength={255} defaultValue={task?.manual_client_source==='other'?task.manual_client_name||'':''} disabled={!editable||busy}/></label>}<label>What work are you doing?<textarea name="title" defaultValue={task?.title||''} required maxLength={255} placeholder="Example: Reel editing" disabled={!editable||busy}/></label><label>Work date<input name="work_date" type="date" defaultValue={task?.work_date||indiaDate(task?.due_at||data.serverNow)} required disabled={!editable||busy}/></label><p className="subtle">This task and its client name are saved in CRM only. Your task timer starts when you click Start.</p>{editable&&<button className="primary" disabled={busy}>{task?'Save task':'Create task'}</button>}</form>;
}
