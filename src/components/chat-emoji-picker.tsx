'use client';
import {useEffect,useRef,useState} from 'react';
import {EMOJI_GROUPS,readRecentEmoji,rememberEmoji,saveRecentEmoji} from '@/lib/emoji-data';

/** A pop-up emoji keyboard: recent first, then groups. Stays open for several picks; Esc or a click outside closes it. */
export function EmojiPicker({onPick,onClose}:{onPick:(emoji:string)=>void;onClose:()=>void}){
  const [recent,setRecent]=useState<string[]>(readRecentEmoji),[group,setGroup]=useState(()=>recent.length?'recent':'smileys'),root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node)&&!(event.target as Element).closest?.('[data-emoji-toggle]'))onClose();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
  },[onClose]);
  const tabs=[...(recent.length?[{id:'recent',label:'Recently used',icon:'🕘',emojis:recent}]:[]),...EMOJI_GROUPS];
  const current=tabs.find(t=>t.id===group)||tabs[0];
  function pick(emoji:string){const next=rememberEmoji(recent,emoji);setRecent(next);saveRecentEmoji(next);onPick(emoji);}
  return <div className="emoji-picker" role="dialog" aria-label="Emoji picker" ref={root}>
    <div className="emoji-tabs" role="tablist" aria-label="Emoji groups">{tabs.map(t=><button key={t.id} type="button" role="tab" aria-selected={t.id===current.id} aria-label={t.label} title={t.label} className={t.id===current.id?'selected':''} onClick={()=>setGroup(t.id)}>{t.icon}</button>)}</div>
    <p className="emoji-title">{current.label}</p>
    <div className="emoji-grid" role="group" aria-label={current.label}>{current.emojis.map(e=><button key={e} type="button" aria-label={e} onClick={()=>pick(e)}>{e}</button>)}</div>
  </div>;
}
