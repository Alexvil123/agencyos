'use client';
import '../app/audit.css';
import {useCallback,useEffect,useState,useTransition} from 'react';
import {Download,ShieldCheck} from 'lucide-react';
import {exportAudit,loadAudit,type AuditResult} from '@/app/audit-actions';
import {AUDIT_AREAS,type AuditArea,type AuditLine} from '@/lib/audit-view';

const stamp=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

/** Settings → Audit history: which person did what, with date and time (India time). */
export function AuditHistory({allowed}:{allowed:boolean}){
  const [area,setArea]=useState<AuditArea|'all'>('all'),[actor,setActor]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
  const [lines,setLines]=useState<AuditLine[]>([]),[people,setPeople]=useState<AuditResult['people']>([]),[hasMore,setHasMore]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[loaded,setLoaded]=useState(false);
  const [busy,start]=useTransition();
  const filters=useCallback((offset=0)=>({area,actor,from,to,offset}),[area,actor,from,to]);
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
      <label>Area<select value={area} onChange={e=>setArea(e.target.value as AuditArea|'all')}>{Object.entries(AUDIT_AREAS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Person<select value={actor} onChange={e=>setActor(e.target.value)}><option value="">Everyone</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>From<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
      <label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
      <button className="secondary small" onClick={download} disabled={busy||!lines.length}><Download size={14}/> Export CSV</button>
    </div>
    {error&&<p role="alert" className="form-message error">{error}</p>}
    {note&&<p role="status" className="subtle">{note}</p>}
    {!loaded&&!error&&<p role="status" className="subtle">Loading the audit history…</p>}
    {loaded&&!lines.length&&<div className="audit-empty"><ShieldCheck size={24}/><strong>No activity matches these filters</strong><p>Entries appear here when someone connects Jira, creates or edits a Jira task, edits the Sales sheet, changes access, creates a login, removes a client or changes an integration.</p></div>}
    {lines.length>0&&<ol className="audit-list">{lines.map(l=><li key={l.id}>
      <time dateTime={l.at}>{stamp.format(new Date(l.at))}</time>
      <div className="audit-main"><strong>{l.title}</strong><span><b>{l.who}</b> · {l.area}</span></div>
      {l.details.length>0&&<details><summary>Details</summary><ul>{l.details.map(line=><li key={line}>{line}</li>)}</ul></details>}
    </li>)}</ol>}
    {hasMore&&<button className="secondary" disabled={busy} onClick={()=>load(true,lines.length)}>{busy?'Loading…':'Load more'}</button>}
    <p className="subtle audit-foot">Times are India time. Entries are written by the system and cannot be changed from the app.</p>
  </div>;
}
