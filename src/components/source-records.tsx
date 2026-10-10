'use client';
import {useState} from 'react';
import {Search,Library} from 'lucide-react';
import {JIRA_SITE} from '@/lib/jira-types';
import {taskClientLabel,taskDisplayStatus,taskPriorityLabel} from '@/lib/work-jira-sync';
import type {WorkData} from '@/lib/work-report';
import type {TimeTask} from '@/lib/time-types';
import {filterWorkTasks} from '@/lib/task-filters';

export function SourceRecords({data,busy,onDetails}:{data:WorkData;busy:boolean;onDetails:(task:TimeTask)=>void}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[limit,setLimit]=useState(25);
 const records=data.tasks.filter(t=>t.source==='jira'&&t.jira_project==='SOURCE'&&t.jira_available!==false&&(data.owner||t.membership_id===data.self));
 const visible=filterWorkTasks(records,{source:'jira',status:status==='all'?'all':`jira:${status}`,client:'all',project:'SOURCE',query,sort:'updated'});
 return <section className="panel source-library"><div className="panel-title"><div><span className="eyebrow">JIRA SOURCE PROJECT</span><h2><Library size={20}/> Source library</h2><p>{records.length} records · Reference material, separate from work tasks and timers.</p></div></div>
 <div className="dash-filters source-filters"><label className="dash-search"><Search size={15}/><input aria-label="Search source records" placeholder="Search sources, labels, people…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(25);}}/></label><select aria-label="Filter source status" value={status} onChange={e=>{setStatus(e.target.value);setLimit(25);}}><option value="all">All Jira statuses</option>{status!=='all'&&!records.some(t=>t.jira_status_id===status)&&<option value={status}>Selected Jira status · no matches</option>}{[...new Map(records.map(t=>[t.jira_status_id,t.jira_status])).entries()].map(([id,name])=><option key={id} value={id!}>{name}</option>)}</select><button className="secondary small" onClick={()=>{setQuery('');setStatus('all');setLimit(25);}}>Clear filters</button></div>
 <div className="table-scroll"><table><thead><tr><th>Source record</th><th>Labels</th><th>Assignee</th><th>Jira status</th><th>Priority</th><th>Actions</th></tr></thead><tbody>{visible.slice(0,limit).map(t=><tr key={t.id}><td><a className="dash-title-link" href={`${JIRA_SITE}/browse/${encodeURIComponent(t.jira_key!)}`} target="_blank" rel="noopener noreferrer">{t.title}</a><small className="block">{t.jira_key} ↗</small></td><td>{taskClientLabel(t,data.clients)}</td><td>{t.jira_assignee_name||'Unassigned'}</td><td>{taskDisplayStatus(t)}</td><td>{taskPriorityLabel(t)}</td><td><button className="secondary small" disabled={busy} onClick={()=>onDetails(t)}>Edit in CRM</button></td></tr>)}</tbody></table></div>
 {!visible.length&&<div className="empty-state"><h3>No source records in this view</h3><p>{query||status!=='all'?'Try another filter.':'Your Jira assignment and account permissions determine which records appear.'}</p></div>}
 <div className="dash-table-foot"><span>{Math.min(limit,visible.length)} of {visible.length} source records</span>{visible.length>limit&&<button onClick={()=>setLimit(n=>n+25)}>Show more</button>}</div></section>;
}
