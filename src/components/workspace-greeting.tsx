'use client';
import {useEffect,useState} from 'react';
import {Hand} from 'lucide-react';
import {indiaGreeting} from '@/lib/greeting';
export function WorkspaceGreeting({name}:{name:string}){
 const [greeting,setGreeting]=useState('Hello');
 useEffect(()=>{const update=()=>setGreeting(indiaGreeting(new Date()));void Promise.resolve().then(update);const timer=setInterval(update,30000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[]);
 return <><span className="overview-greeting">{greeting}, </span><strong>{name.split(' ')[0]}</strong><Hand className="overview-greeting-hand" size={29} aria-hidden="true"/></>;
}
