'use client';
import {useEffect,useState} from 'react';
import {Hand} from 'lucide-react';
import {greetings,indiaGreetingPeriod,type GreetingPeriod} from '@/lib/greeting';
export function WorkspaceGreeting({name}:{name:string}){
 const [period,setPeriod]=useState<GreetingPeriod|null>(null);
 useEffect(()=>{const update=()=>setPeriod(indiaGreetingPeriod(new Date()));void Promise.resolve().then(update);const timer=setInterval(update,30000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[]);
 return <><span className="overview-greeting" data-daypart={period??undefined}>{period?greetings[period]:'Hello'}, </span><strong>{name.split(' ')[0]}</strong><Hand className="overview-greeting-hand" size={29} aria-hidden="true"/></>;
}
