'use client';
import {useEffect,useRef,type ReactNode} from 'react';

/** Native modal semantics keep keyboard focus in the task editor. */
export function WorkDrawer({label,busy,onClose,children}:{label:string;busy:boolean;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const dialog=ref.current;
  const previous=document.body.style.overflow;
  dialog?.showModal();document.body.style.overflow='hidden';
  return()=>{dialog?.close();document.body.style.overflow=previous;};
 },[]);
 return <dialog ref={ref} className="work-drawer" aria-label={label} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(event.target===ref.current&&!busy)onClose();}}>{children}</dialog>;
}
