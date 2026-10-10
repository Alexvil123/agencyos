'use client';
import {useState} from 'react';
import {CheckCircle2,KeyRound,Trash2} from 'lucide-react';
import type {PublicIntegration,ProviderSpec} from '@/lib/integrations';
import type {Overview} from '@/lib/integrations-server';

export type IntegrationItem=Overview['items'][number];
export type IntegrationNote={ok:boolean;message:string};
type Item=IntegrationItem;
type Note=IntegrationNote;
const when=(iso:string|null)=>iso?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'';
export const statusLabel=(item:Pick<PublicIntegration,'source'>&{unreadable?:boolean})=>item.unreadable&&item.source!=='stored'?'Needs attention':item.source==='stored'?'Active':item.source==='env'?'Active · hosting settings':'Not set up';

/** One integration: its status, the fields it needs, Save (switches it on) and Remove (switches it off). Secrets are never shown. */
export function IntegrationCard({spec,item,busy,note,onSave,onRemove}:{spec:ProviderSpec;item:Item;busy:boolean;note?:Note;onSave:(form:FormData)=>void;onRemove:(provider:string)=>void}){
  const [open,setOpen]=useState(false);
  const tone=item.unreadable&&item.source!=='stored'?'bad':item.source==='none'?'off':'on';
  return <article className={`integ-card ${tone}`} aria-label={spec.title}>
    <header>
      <div><h3>{spec.title}</h3><p className="subtle">{spec.description}</p></div>
      <span className={`integ-status ${tone}`}>{tone==='on'&&<CheckCircle2 size={13}/>}{statusLabel(item)}</span>
    </header>
    {item.hint&&<p className="integ-hint">{item.hint}{item.updatedAt&&<> · saved {when(item.updatedAt)}</>}</p>}
    {item.source==='env'&&<p className="integ-note">These values come from the hosting settings. Saving here replaces them; removing the saved values later switches back to the hosting settings.</p>}
    {item.unreadable&&<p role="alert" className="integ-note bad">The saved credentials could not be opened (the encryption key changed). Enter them again and save.</p>}
    <div className="integ-actions">
      <button className="secondary small" aria-expanded={open} onClick={()=>setOpen(!open)}><KeyRound size={14}/> {item.source==='none'?'Set up':'Edit'}</button>
      {item.source==='stored'&&<button className="secondary small danger" disabled={busy} onClick={()=>{if(window.confirm(`Remove ${spec.title}? It is switched off until you save it again.`))onRemove(spec.key);}}><Trash2 size={14}/> Remove</button>}
    </div>
    {note&&<p role={note.ok?'status':'alert'} className={`form-message ${note.ok?'success':'error'}`}>{note.message}</p>}
    {open&&<form className="integ-form" key={item.updatedAt||item.source} autoComplete="off" onSubmit={e=>{e.preventDefault();onSave(new FormData(e.currentTarget));}}>
      <input type="hidden" name="provider" value={spec.key}/>
      {spec.fields.map(field=>{
        const saved=Boolean(item.has[field.key]);
        return <label key={field.key} className={field.multiline?'wide':undefined}>{field.label}{field.required&&<b aria-hidden="true"> *</b>}
          {field.multiline
            ?<textarea name={field.key} rows={5} spellCheck={false} autoComplete="off" placeholder={saved?'Saved. Leave blank to keep it, or paste a new key to replace it.':field.placeholder} required={field.required&&!saved}/>
            :<input name={field.key} type={field.secret?'password':'text'} autoComplete={field.secret?'new-password':'off'} spellCheck={false} placeholder={field.secret&&saved?'•••••••• saved — leave blank to keep':field.placeholder} defaultValue={field.secret?'':item.values[field.key]??''} required={field.required&&(!field.secret||!saved)}/>}
          {field.help&&<small>{field.help}</small>}
        </label>;
      })}
      <p className="integ-guide">Where to find these: {spec.guide}</p>
      <button className="primary" disabled={busy}>{busy?'Checking and saving…':'Save and activate'}</button>
    </form>}
  </article>;
}

