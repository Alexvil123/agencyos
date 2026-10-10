'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {MessageSquare,X} from 'lucide-react';
import {loadChatNotifications} from '@/app/team-social-actions';
import {chatNoticeLink,newChatNotices,type ChatNotice} from '@/lib/chat-notifications';
import {useAutoRefresh} from './use-auto-refresh';
import {indiaTimestamp} from '@/lib/display-time';
export function useChatNotifications(enabled:boolean,account:string){
 const [items,setItems]=useState<ChatNotice[]>([]),[toasts,setToasts]=useState<ChatNotice[]>([]);
 const seen=useRef<Record<string,string>|null>(null),active=useRef('');
 const reload=useCallback(async()=>{
  const result=await loadChatNotifications();if(!result.ok)return false;
  const incoming=newChatNotices(result.items,seen.current,active.current);
  seen.current={...seen.current,...Object.fromEntries(result.items.map(i=>[i.conversationId,i.messageId]))};
  try{sessionStorage.setItem(`chat-notices:${account}`,JSON.stringify(seen.current));}catch{/* Notifications also work without browser storage. */}
  setItems(result.items);if(incoming.length)setToasts(previous=>[...previous.filter(t=>!incoming.some(i=>i.conversationId===t.conversationId)),...incoming].slice(-3));return true;
 },[account]);
 useEffect(()=>{
  if(!enabled)return;
  try{const stored=JSON.parse(sessionStorage.getItem(`chat-notices:${account}`)||'null');seen.current=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:null;}catch{seen.current=null;}
  const opened=(e:Event)=>{active.current=(e as CustomEvent<string>).detail;setToasts(previous=>previous.filter(t=>t.conversationId!==active.current));};
  window.addEventListener('crm-chat-open',opened);void Promise.resolve().then(reload);return()=>{window.removeEventListener('crm-chat-open',opened);active.current='';};
 },[enabled,account,reload]);
 useAutoRefresh(reload,enabled,5000);
 const dismiss=useCallback((id:string)=>setToasts(previous=>previous.filter(t=>t.messageId!==id)),[]);
 return {items,toasts,dismiss,unread:items.reduce((sum,item)=>sum+item.unread,0)};
}
function ChatToast({item,dismiss}:{item:ChatNotice;dismiss:(id:string)=>void}){
 useEffect(()=>{const timer=setTimeout(()=>dismiss(item.messageId),10000);return()=>clearTimeout(timer);},[item.messageId,dismiss]);
 return <article className="chat-toast"><Link href={chatNoticeLink(item.conversationId)} onClick={()=>dismiss(item.messageId)}><span className="chat-toast-icon"><MessageSquare size={20}/></span><div><strong>{item.sender}</strong>{item.group&&<small>{item.group}</small>}<p>{item.body}</p><time dateTime={item.createdAt}>{indiaTimestamp(item.createdAt)}</time></div></Link><button aria-label="Dismiss chat notification" onClick={()=>dismiss(item.messageId)}><X size={15}/></button></article>;
}
export function ChatToasts({feed}:{feed:ReturnType<typeof useChatNotifications>}){return <aside className="chat-toast-stack" aria-label="New chat messages" aria-live="polite">{feed.toasts.map(item=><ChatToast key={item.messageId} item={item} dismiss={feed.dismiss}/>)}</aside>;}
