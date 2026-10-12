'use client';
import '../app/audit.css';
import {useCallback,useEffect,useState,useTransition} from 'react';
import {Download,ShieldCheck} from 'lucide-react';
import {exportAudit,loadAudit,type AuditResult} from '@/app/audit-actions';
import {AUDIT_CATEGORIES,type AuditCategory,type AuditLine} from '@/lib/audit-view';

const when=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const year=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',year:'numeric'});

/** Settings → Audit history: who did what and when, with filters, change details and CSV export. Jira sync noise is hidden by default. */
export function AuditHistory({allowed}:{allowed:boolean}){
  const [category,setCategory]=useState<AuditCategory>('all'),[actor,setActor]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[system,setSystem]=useState(false);
  const [lines,setLines]=useState<AuditLine[]>([]),[people,setPeople]=useState<AuditResult['people']>([]),[hasMore,setHasMore]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[loaded,setLoaded]=useState(false);
  const [busy,start]=useTransition();
  const filters=useCallback((offset=0)=>({category,actor,from,to,system,offset}),[category,actor,from,to,system]);
  const load=useCallback((append=false,offset=0)=>start(async()=>{
    try{
      const r=await loadAudit(filters(offset));
      if(!r.ok){setError(r.message);return;}
      setError('');setLines(previous=>append?[...previous,...r.lines]:r.lines);setHasMore(r.hasMore);if(r.people.length)setPeople(r.people);setLoaded(true);
    }catch{setError('The audit history could not be loaded. Check your connection and try again.');}
  }),[filters]);
  useEffect(()=>{if(allowed)load(false,0);},[allowed,load]);
  if(!allowed)return <p className="subtle">Only people with audit access can view the history.</p>;
  const download=()=>start(async()=>{
    try{
      const r=await exportAudit(filters(0));setNote(r.message);if(!r.ok)return;
      const url=URL.createObjectURL(new Blob(['﻿'+r.csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
      a.href=url;a.download=`audit-history-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
    }catch{setNote('The export could not be created. Try again.');}
  });
  return <div className="audit">
    <div className="audit-filters" role="group" aria-label="Audit filters">
      <label>Area<select value={category} onChange={e=>setCategory(e.target.value as AuditCategory)}>{Object.entries(AUDIT_CATEGORIES).map(([key,c])=><option key={key} value={key}>{c.label}</option>)}</select></label>
      <label>Person<select value={actor} onChange={e=>setActor(e.target.value)}><option value="">Everyone</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>From<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
      <label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
      <label className="audit-check"><input type="checkbox" checked={system} onChange={e=>setSystem(e.target.checked)}/>Include Jira sync changes</label>
      <button className="secondary small" onClick={download} disabled={busy||!lines.length}><Download size={14}/> Export CSV</button>
    </div>
    {error&&<p role="alert" className="form-message error">{error}</p>}
    {note&&<p role="status" className="subtle">{note}</p>}
    {!loaded&&!error&&<p role="status" className="subtle">Loading the audit history…</p>}
    {loaded&&!lines.length&&<div className="audit-empty"><ShieldCheck size={24}/><strong>Nothing matches these filters</strong><p>Audit entries cannot be edited or deleted through the application. Try a wider date range{!system?' or include Jira sync changes':''}.</p></div>}
    {lines.length>0&&<ol className="audit-list">{lines.map(l=>{const d=new Date(l.at);return <li key={l.id} className={l.system?'system':undefined}>
      <time dateTime={l.at}>{when.format(d)}<small>{year.format(d)}</small></time>
      <div className="audit-main"><strong>{l.title}</strong><span>{l.who}{l.system?' · Jira sync':''}</span></div>
      {l.details.length>0&&<details><summary>Details</summary><ul>{l.details.map(line=><li key={line}>{line}</li>)}</ul></details>}
    </li>;})}</ol>}
    {hasMore&&<button className="secondary" disabled={busy} onClick={()=>load(true,lines.length)}>{busy?'Loading…':'Load more'}</button>}
    <p className="subtle audit-foot">Times are India time. Entries are written by the database itself and cannot be changed from the app.</p>
  </div>;
}
