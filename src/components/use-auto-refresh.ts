'use client';
import {useEffect,useRef} from 'react';
import {refreshLoop} from '@/lib/auto-refresh';
const EVENT='crm-data-changed';
export function notifyWorkspaceChange(){
 window.dispatchEvent(new Event(EVENT));
 if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel(EVENT);channel.postMessage('refresh');channel.close();}
}
export function useAutoRefresh(refresh:()=>Promise<boolean|void>,enabled=true,interval=30000){
 const latest=useRef(refresh),allowed=useRef(enabled);
 useEffect(()=>{latest.current=refresh;allowed.current=enabled;},[refresh,enabled]);
 useEffect(()=>{
  const loop=refreshLoop({interval,refresh:()=>latest.current(),active:()=>allowed.current&&!document.hidden&&navigator.onLine!==false,schedule:(fn,delay)=>setTimeout(fn,delay),cancel:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)});
  const wake=()=>loop.wake();
  document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('online',wake);window.addEventListener(EVENT,wake);
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(EVENT):undefined;
  if(channel)channel.onmessage=wake;
  return()=>{loop.stop();channel?.close();document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);window.removeEventListener('online',wake);window.removeEventListener(EVENT,wake);};
 },[interval]);
}
