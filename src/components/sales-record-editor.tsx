'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {X} from 'lucide-react';
import {mutateSalesRow} from '@/app/sales-actions';
import {salesInput,type SalesGrid,type SalesRow} from '@/lib/sales-sheet';
export type SalesEditor={mode:'edit'|'add'|'delete';row:SalesRow;column?:number;ticket:string};
export function SalesRecordEditor({grid,editor,onClose,onResult}:{grid:SalesGrid;editor:SalesEditor;onClose:()=>void;onResult:(result:Awaited<ReturnType<typeof mutateSalesRow>>)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[busy,start]=useTransition(),[feedback,setFeedback]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 const name=editor.mode==='delete'?'Delete row':editor.mode==='add'?'Add row':'Edit record';
 const summary=editor.row.cells.filter((c,i)=>i!==grid.identityColumn&&c.text).slice(0,3).map(c=>c.text).join(' · ');
 return <dialog ref={dialog} className="modal sales-record-modal" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}>
  <div className="modal-head"><div><h2>{name}</h2><p className="subtle">{grid.tab} · Sheet row {editor.row.number}{editor.mode==='add'?' · New row inserted immediately below':''}</p></div><button className="icon-button" disabled={busy} aria-label="Close record editor" onClick={onClose}><X size={20}/></button></div>
  <form action={form=>start(async()=>{const result=await mutateSalesRow(form);setFeedback(result.message);onResult(result);})}>
   <input type="hidden" name="operation" value={editor.mode}/><input type="hidden" name="tab" value={grid.tab}/><input type="hidden" name="id" value={editor.row.id}/><input type="hidden" name="rowVersion" value={editor.row.version}/><input type="hidden" name="gridVersion" value={grid.version||''}/><input type="hidden" name="ticket" value={editor.ticket}/>
   {editor.mode==='delete'?<div className="sales-delete-review"><p><strong>{summary||'Selected row'}</strong></p><p>This deletes the complete row from Google Sheets, including columns hidden in this view. Formula references adjust using Google’s native row deletion.</p><p className="subtle">A server backup is kept. Avoid sorting or moving this row in Google Sheets while confirming.</p><label className="checkbox-label"><input type="checkbox" name="confirmed" value="yes" required/>Delete this row from Google Sheets.</label></div>:<div className="sales-edit-fields">{grid.headers.map((header,i)=>{
    if(editor.column!==undefined&&editor.column!==i)return null;
    const cell=editor.row.cells[i],locked=cell.formula||cell.restricted||grid.identityColumn===i,initial=editor.mode==='add'?'':salesInput(cell),options=cell.choices;
    return <label key={i} className={locked?'sales-field-locked':''}><span>{header}<small>{locked?cell.formula?'Calculated':grid.identityColumn===i?'Automatic ID':'Protected':''}</small></span>{locked?<input value={editor.mode==='add'?cell.formula?'Formula copied from template':'Automatic / protected':cell.text} disabled/>:options.length?<select name={'cell.'+i} defaultValue={initial}><option value="">Empty</option>{initial&&!options.includes(initial)&&<option value={initial}>{initial} (current)</option>}{options.map(v=><option value={v} key={v}>{v}</option>)}</select>:cell.kind?<input name={'cell.'+i} type={cell.kind} step={1} defaultValue={initial}/>:typeof cell.raw==='boolean'?<select name={'cell.'+i} defaultValue={initial}><option value="">Empty</option><option value="true">Yes</option><option value="false">No</option></select>:/remarks|address|details|task/i.test(header)?<textarea name={'cell.'+i} defaultValue={initial} maxLength={10000} rows={3}/>:<input name={'cell.'+i} inputMode={typeof cell.raw==='number'?'decimal':undefined} defaultValue={initial} maxLength={10000}/>}</label>;
   })}</div>}
   {feedback&&<p className="notice" role="status">{feedback}</p>}<div className="sales-editor-footer"><p className="subtle">Saved directly to Google Sheets. Refresh pauses while this editor is open.</p><button className="secondary" disabled={busy} type="button" onClick={onClose}>Cancel</button><button className={editor.mode==='delete'?'danger':'primary'} disabled={busy}>{busy?'Saving & verifying…':editor.mode==='delete'?'Delete from sheet':editor.mode==='add'?'Add to sheet':'Save changes'}</button></div>
  </form>
 </dialog>;
}
