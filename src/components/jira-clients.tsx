'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Building2,RefreshCw,Search,ArrowRight} from 'lucide-react';
import {loadWorkData,syncWorkJira} from '@/app/work-actions';
import type {WorkJiraIssue} from '@/lib/work-jira-sync';
import {jiraClientTotals,jiraClientLabels} from '@/lib/jira-client-labels';
import {useAutoRefresh} from './use-auto-refresh';
import {jiraSyncSetting} from '@/app/jira-sync-actions';

export function JiraClients({preview}:{preview:boolean}){
 const [issues,setIssues]=useState<Pick<WorkJiraIssue,'key'|'labels'|'status_category'|'project_key'>[]>(),[query,setQuery]=useState(''),[error,setError]=useState(''),[at,setAt]=useState<string>(),[busy,setBusy]=useState(false);
 const lock=useRef(false);
 const sync=useCallback(async(automatic=false)=>{
  if(lock.current||preview)return;lock.current=true;setBusy(true);
  try{const setting=await jiraSyncSetting();if(automatic&&!setting.enabled){const cached=await loadWorkData();if(cached.ok&&cached.data)setIssues(cached.data.tasks.filter(t=>t.source==='jira'&&t.jira_project!=='SOURCE'&&t.jira_available!==false).map(t=>({key:t.jira_key!,labels:t.jira_labels||[],status_category:t.jira_status_category,project_key:t.jira_project!})));return cached.ok;}const r=await syncWorkJira(automatic);if(r.ok&&r.issues){setIssues(r.issues.filter(i=>i.project_key!=='SOURCE'));setAt(r.syncedAt);setError('');}else setError(r.message);return r.ok;}catch{setError('Jira labels could not be refreshed. Showing the last verified view, if available.');return false;}finally{lock.current=false;setBusy(false);}
 },[preview]);
 useEffect(()=>{void Promise.resolve().then(()=>sync(true));},[sync]);
 useAutoRefresh(()=>sync(true),!preview);
 const totals=jiraClientTotals(issues||[]),groups=jiraClientLabels(issues||[]),visible=groups.filter(g=>g.label.toLowerCase().includes(query.trim().toLowerCase()));
 return <><section className="team-hero jira-client-hero"><div><span className="eyebrow">CLIENTS FROM JIRA</span><h2>Your clients. Their Jira work.</h2><p>Exact Jira labels from your month projects. SOURCE records are in the Source menu. Your permitted task scope applies.</p></div><div className="team-hero-stats"><div><Building2 size={20}/><strong>{issues?groups.length:'—'}</strong><span>Jira labels</span></div><div><strong>{issues?.length??'—'}</strong><span>Jira tasks</span></div></div></section>
 <section className="panel"><div className="panel-title"><div><h2>Jira client labels</h2><p>{at?`Last verified ${new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}).format(new Date(at))}`:preview?'Sign in to load Jira data':issues?'Saved Jira snapshot · use Refresh Jira for a current check':'Loading Jira records…'}</p></div><button className="secondary small" disabled={busy||preview} onClick={()=>void sync()}><RefreshCw size={14} className={busy?'sync-spinning':''}/>Refresh Jira</button></div>
 {issues&&<p className="notice">{totals.total} unique Jira tasks = {totals.labelled} with client labels + {totals.unlabelled} without labels. Label rows contain {totals.labelAssignments} label assignments; a task with multiple labels appears in each label row.</p>}{error&&<p className="form-message error" role="alert">{error}</p>}<div className="jira-client-search"><Search size={16}/><input aria-label="Search Jira clients" placeholder="Search client labels…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 <div className="table-scroll"><table><thead><tr><th>Client / Jira label</th><th>Projects</th><th>Tasks</th><th>Done</th><th>In progress</th><th>Manage work</th></tr></thead><tbody>{visible.map(g=><tr key={g.label}><td><strong>{g.label}</strong></td><td>{g.projects.join(' · ')}</td><td>{g.tasks}</td><td>{g.done}</td><td>{g.inProgress}</td><td><Link className="jira-client-link" href={`/work?jira_label=${encodeURIComponent(g.label)}`}>View &amp; edit tasks <ArrowRight size={14}/></Link></td></tr>)}</tbody></table></div>
 {issues&&!visible.length&&<div className="empty-state"><h3>{query?'No matching Jira labels':'No Jira labels in your task scope'}</h3><p>Labels are taken directly from Jira issues.</p></div>}<p className="jira-client-note">Labels retain exact spelling and case. One issue may belong to multiple labels.{issues&&` ${issues.filter(i=>!i.labels.length).length} tasks have no label.`} Update a task’s labels in its CRM editor to update Jira.</p></section></>;
}
