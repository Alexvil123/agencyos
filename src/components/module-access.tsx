'use client';
import '../app/module-access.css';
import {useEffect,useState,useTransition} from 'react';
import {loadModuleAccess,saveModuleAccess,type AccessPerson} from '@/app/module-access-actions';

const MODULES=[
  {key:'sales',name:'Sales',note:'Google Sheet leads, visits and follow-ups'},
  {key:'calendar',name:'Calendar',note:'Tasks by due date'},
  {key:'campaigns',name:'Campaigns',note:'Meta and Google Ads spend'},
  {key:'finance',name:'Finance',note:'Invoices and payments'},
  {key:'analytics',name:'Analytics',note:'Instagram, Facebook and YouTube results'},
];
/** Settings → Module access: the Owner picks which employees can open each of these menus. Everyone else does not see them. */
export function ModuleAccess({owner}:{owner:boolean}){
  const [people,setPeople]=useState<AccessPerson[]>(),[granted,setGranted]=useState<Record<string,string[]>>({}),[error,setError]=useState(''),[note,setNote]=useState<{key:string;ok:boolean;text:string}>(),[busy,start]=useTransition();
  useEffect(()=>{if(owner)start(async()=>{const r=await loadModuleAccess();if(r.ok){setPeople(r.people);setGranted(r.granted);}else setError(r.message);});},[owner]);
  if(!owner)return <p className="subtle">Only the Owner can manage module access.</p>;
  if(error)return <p role="alert" className="form-message error">{error}</p>;
  if(!people)return <p role="status" className="subtle">Loading module access…</p>;
  function toggle(module:string,id:string){
    const before=granted[module]||[],next=before.includes(id)?before.filter(x=>x!==id):[...before,id];
    setGranted({...granted,[module]:next});setNote(undefined);
    start(async()=>{const r=await saveModuleAccess({module,members:next});if(!r.ok)setGranted(g=>({...g,[module]:before}));setNote({key:module,ok:r.ok,text:r.message});});
  }
  return <div className="module-access">
    <p className="subtle">The Owner always has access. Employees see these menus only after you tick their name. Changes save straight away.</p>
    {!people.length&&<p className="subtle">No employees yet. Add employees in Team first.</p>}
    <div className="module-access-grid">{MODULES.map(m=><section key={m.key} className="module-access-card" aria-label={m.name}>
      <header><h4>{m.name}</h4><span>{m.note}</span><b>{(granted[m.key]||[]).length} of {people.length}</b></header>
      <ul>{people.map(p=><li key={p.membershipId}><label className="checkbox-label"><input type="checkbox" disabled={busy} checked={(granted[m.key]||[]).includes(p.membershipId)} onChange={()=>toggle(m.key,p.membershipId)}/>{p.name}</label></li>)}</ul>
      {note?.key===m.key&&<p role="status" className={`form-message ${note.ok?'success':'error'}`}>{note.text}</p>}
    </section>)}</div>
  </div>;
}
