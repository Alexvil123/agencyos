'use client';
import {useEffect} from 'react';
// Sends uncaught browser errors to /api/client-error so problems employees hit show up in the hosting log.
export function ClientErrorReporter(){
  useEffect(()=>{
    const sent=new Set<string>();
    const send=(kind:string,message:string,stack?:string)=>{
      const key=`${kind}:${message}`;if(!message||sent.has(key)||sent.size>=10)return;sent.add(key);
      try{void fetch('/api/client-error',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,message,stack,page:location.pathname})}).catch(()=>undefined);}catch{/* Reporting must never break the page. */}
    };
    const onError=(e:ErrorEvent)=>send('error',e.message,e.error?.stack);
    const onRejection=(e:PromiseRejectionEvent)=>send('rejection',e.reason instanceof Error?e.reason.message:String(e.reason),e.reason instanceof Error?e.reason.stack:undefined);
    window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onRejection);
    return()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection);};
  },[]);
  return null;
}
