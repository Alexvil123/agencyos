'use client';
/* eslint-disable @next/next/no-img-element -- Private expiring photo URLs must be rendered directly. */
import {useEffect,useRef,useState} from 'react';
import {birthdayPeople} from '@/app/team-social-actions';
export function BirthdayWishes({self,day,clockedIn}:{self:string;day:string;clockedIn:boolean}){const [people,setPeople]=useState<Awaited<ReturnType<typeof birthdayPeople>>['people']>([]),dialog=useRef<HTMLDialogElement>(null),key=`birthday-wishes:${self}:${day}`;
 useEffect(()=>{if(!clockedIn||!self)return;let cancelled=false;void Promise.resolve().then(async()=>{try{if(localStorage.getItem(key))return;}catch{}const r=await birthdayPeople();if(!cancelled&&r.ok)setPeople(r.people);});return()=>{cancelled=true;};},[key,self,clockedIn]);
 useEffect(()=>{if(people.length&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[people]);function dismiss(){try{localStorage.setItem(key,'seen');}catch{}dialog.current?.close();setPeople([]);}
 return <dialog ref={dialog} className="birthday-dialog" onCancel={dismiss}><div className="birthday-confetti" aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,animationDelay:`${i%6*.18}s`,background:['#8054ff','#ffb743','#f76eab','#30bfa2'][i%4]}}/>)}</div><span className="birthday-cake" aria-hidden="true">🎂</span><h2>Happy Birthday!</h2>{people.map(p=><div key={p.id} className="birthday-person">{p.photo&&<img src={p.photo} alt=""/>}<strong>{p.name}</strong></div>)}<p>Wishing you a wonderful year ahead, from all of us!</p><button className="primary" onClick={dismiss}>Let’s celebrate 🎉</button></dialog>;
}
