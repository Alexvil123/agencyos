'use client';
import {useEffect,useState,useTransition} from 'react';
import {ShieldCheck} from 'lucide-react';
import {loadAudit} from '@/app/audit-actions';
import type {AuditLine} from '@/lib/audit-view';

const stamp=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

/** Settings → Audit history: what was done, by whom, and when (India time). */
export function AuditHistory({allowed}:{allowed:boolean}){
  const [lines,setLines]=useState<AuditLine[]>(),[error,setError]=useState(''),[,start]=useTransition();
  useEffect(()=>{if(allowed)start(async()=>{try{const r=await loadAudit();if(r.ok)setLines(r.lines);else setError(r.message);}catch{setError('The audit history could not be loaded. Check your connection and try again.');}});},[allowed]);
  if(!allowed)return <p className="subtle">Only people with audit access can view the history.</p>;
  if(error)return <p role="alert" className="form-message error">{error}</p>;
  if(!lines)return <p role="status" className="subtle">Loading the audit history…</p>;
  if(!lines.length)return <div className="empty-state"><div className="empty-icon"><ShieldCheck size={25}/></div><h3>A clear record of every action</h3><p>Jira changes, Sales edits, access changes and similar actions appear here with who did them and when. Audit logs cannot be edited through the application.</p></div>;
  return <div className="table-scroll"><table><thead><tr><th>Action</th><th>Done by</th><th>Date &amp; time (IST)</th></tr></thead><tbody>{lines.map(l=><tr key={l.id}><td>{l.title}</td><td>{l.who}</td><td>{stamp.format(new Date(l.at))}</td></tr>)}</tbody></table></div>;
}
