'use client';
/* eslint-disable @next/next/no-img-element -- Chat photos use private, expiring signed URLs. */
import {useCallback,useEffect,useRef,useState,useTransition} from 'react';
import {changeGroupPhoto,createChat,loadChats,loadChatMessages,sendChat,sendChatFile,markChatRead} from '@/app/team-social-actions';
import {Paperclip,Smile} from 'lucide-react';
import '../app/chat-media.css';
import {CHAT_FILE_ACCEPT,MAX_CHAT_FILE_BYTES} from '@/lib/chat-file';
import {insertAtCaret} from '@/lib/emoji-data';
import {EmojiPicker} from './chat-emoji-picker';
import {AttachmentPreview,ChatFileView} from './chat-attachment';
import {useAutoRefresh,notifyWorkspaceChange} from './use-auto-refresh';
import {useSearchParams} from 'next/navigation';
import type {ChatNotice} from '@/lib/chat-notifications';
import {indiaTimestamp} from '@/lib/display-time';
import {personalChatList,memberGroups} from '@/lib/chat-list';
import {mergeChatHistory,type ChatHistory} from '@/lib/chat-history';
import {GroupPhotoField} from './group-photo-field';

export function TeamChat({unread=[]}:{unread?:ChatNotice[]}){
 const linkedConversation=useSearchParams().get('conversation')||'';
 const [data,setData]=useState<Awaited<ReturnType<typeof loadChats>>>(),[selected,setSelected]=useState(''),[personId,setPersonId]=useState(''),[messages,setMessages]=useState<ChatHistory>(),[file,setFile]=useState<File|null>(null),[emojiOpen,setEmojiOpen]=useState(false),[dropping,setDropping]=useState(false),[text,setText]=useState(''),[notice,setNotice]=useState(''),[groupOpen,setGroupOpen]=useState(false),[busy,start]=useTransition();
 const request=useRef<{id:string;body:string;key:string}|null>(null),active=useRef(''),dialog=useRef<HTMLDialogElement>(null);
 const readMessages=useRef<Record<string,string>>({}),composer=useRef<HTMLTextAreaElement>(null),fileInput=useRef<HTMLInputElement>(null),refocus=useRef(false);
 useEffect(()=>{if(!busy&&refocus.current){refocus.current=false;composer.current?.focus();}},[busy]);
 const openedLink=useRef('');
 useEffect(()=>{window.dispatchEvent(new CustomEvent('crm-chat-open',{detail:selected}));return()=>{window.dispatchEvent(new CustomEvent('crm-chat-open',{detail:''}));};},[selected]);
 useEffect(()=>{
  const latest=messages?.ok?messages.messages.at(-1):undefined;if(!selected||!latest)return;
  const acknowledge=async()=>{if(document.hidden||active.current!==selected||readMessages.current[selected]===latest.id)return;if(await markChatRead(selected,latest.id)){readMessages.current[selected]=latest.id;notifyWorkspaceChange();}};
  void acknowledge();document.addEventListener('visibilitychange',acknowledge);return()=>document.removeEventListener('visibilitychange',acknowledge);
 },[selected,messages]);
 useEffect(()=>{active.current=selected;},[selected]);
 useEffect(()=>{if(groupOpen)dialog.current?.showModal();else dialog.current?.close();},[groupOpen]);
 const reload=useCallback(async()=>{
  const result=await loadChats();setData(result);
  if(selected){const r=await loadChatMessages(selected);if(active.current===selected)setMessages(previous=>mergeChatHistory(previous,r));}
  return result.ok;
 },[selected]);
 useEffect(()=>{void Promise.resolve().then(reload);},[reload]);useAutoRefresh(reload,true);
 useAutoRefresh(async()=>{if(!selected)return true;const result=await loadChatMessages(selected);if(active.current===selected)setMessages(previous=>mergeChatHistory(previous,result));return result.ok;},Boolean(selected),5000);
 useEffect(()=>{
  if(!linkedConversation){openedLink.current='';return;}if(!data?.ok||openedLink.current===linkedConversation)return;
  const chat=data.chats.find(c=>c.id===linkedConversation);if(!chat)return;
  openedLink.current=linkedConversation;
  if(active.current===chat.id)return;
  const person=chat.kind==='direct'?data.members.find(m=>m.conversation_id===chat.id&&m.membership_id!==data.self)?.membership_id||'':'';
  active.current=chat.id;start(()=>{setMessages(undefined);setText('');setFile(null);setEmojiOpen(false);setNotice('');setPersonId(person);setSelected(chat.id);});
 },[linkedConversation,data]);
 const personal=data?personalChatList(data):[],groups=data?memberGroups(data):[],current=data?.chats.find(c=>c.id===selected),personalPhoto=data?.people.find(p=>p.id===personId)?.photo_url,conversationPhoto=current?.kind==='group'?current.photo_url:personalPhoto,name=current?.kind==='group'?current.name:data?.people.find(p=>p.id===personId)?.display_name||'Personal chat';
 function pickFile(next:File|undefined|null){
  if(!next)return;
  if(next.size>MAX_CHAT_FILE_BYTES){setNotice('Files must be 5 MB or smaller.');return;}
  if(!next.size){setNotice('That file is empty.');return;}
  setNotice('');setFile(next);composer.current?.focus();
 }
 function addEmoji(emoji:string){
  const box=composer.current,start=box?.selectionStart??text.length,end=box?.selectionEnd??start,next=insertAtCaret(text,emoji,start,end);
  if(!next){setNotice('This message is at its length limit.');return;}
  setText(next.text);requestAnimationFrame(()=>{box?.focus();box?.setSelectionRange(next.caret,next.caret);});
 }
 function choose(id:string,person=''){if(active.current===id)return;setMessages(undefined);setText('');setFile(null);setEmojiOpen(false);setNotice('');setPersonId(person);active.current=id;setSelected(id);}
 function openPersonal(person:string,chat?:string){if(chat){choose(chat,person);return;}start(async()=>{const form=new FormData();form.set('kind','direct');form.append('people',person);const r=await createChat(form);if(!r.ok){setNotice(r.message);return;}choose(r.id,person);await reload();});}
 return <section className="panel team-chat">
  <div className="time-heading"><div><h2>Team chat</h2><small>Personal chats with your teammates · Groups visible to members only</small></div><button className="primary" disabled={busy||!data?.ok} onClick={()=>setGroupOpen(true)}>+ New Group</button></div>
  {!data&&<p role="status">Loading your teammates…</p>}{data&&!data.ok&&<p role="alert">Chat could not load. Check your connection and refresh.</p>}{notice&&<p role="status">{notice}</p>}
  <div className="chat-layout"><nav aria-label="Conversations">
   <h3>Personal chats <small>{personal.length}</small></h3>
   {personal.map(({person,chat})=><button key={person.id} disabled={busy} className={personId===person.id?'selected':''} onClick={()=>openPersonal(person.id,chat?.id)}><span className="chat-avatar">{person.photo_url?<img src={person.photo_url} alt=""/>:person.display_name.slice(0,1).toUpperCase()}</span><span>{person.display_name}<small>Personal chat</small></span>{chat&&unread.find(i=>i.conversationId===chat.id)&&<span className="chat-unread-badge">{unread.find(i=>i.conversationId===chat.id)!.unread}</span>}</button>)}
   {data?.ok&&!personal.length&&<p>No other active employees yet.</p>}
   <h3 className="chat-group-label">Your groups <small>{groups.length}</small></h3>
   {groups.map(c=><button key={c.id} disabled={busy} className={selected===c.id?'selected':''} onClick={()=>choose(c.id)}><span className="chat-avatar">{c.photo_url?<img src={c.photo_url} alt=""/>:c.name.slice(0,1).toUpperCase()}</span><span>{c.name}<small>Group</small></span>{unread.find(i=>i.conversationId===c.id)&&<span className="chat-unread-badge">{unread.find(i=>i.conversationId===c.id)!.unread}</span>}</button>)}
   {data?.ok&&!groups.length&&<p>No groups yet. Create a group or join when a teammate adds you.</p>}
  </nav><div className="chat-content">{selected?<>
   <div className="chat-conversation-heading">{conversationPhoto&&<img src={conversationPhoto} alt={`${name} profile image`}/>}<div><h3>{name}</h3>{current?.kind==='group'&&<small>{data?.members.filter(m=>m.conversation_id===selected).length} members</small>}</div></div>
   {current?.kind==='group'&&current.created_by===data?.self&&<details className="group-photo-edit"><summary>Change group image</summary><form className="stack" action={form=>start(async()=>{const r=await changeGroupPhoto(form);setNotice(r.message);if(r.ok)await reload();})}><input type="hidden" name="chat" value={selected}/><GroupPhotoField key={selected} url={current.photo_url}/><button className="secondary small" disabled={busy}>Save group image</button></form></details>}
   {!messages&&<p role="status">Loading messages…</p>}
   {messages?.more&&<button className="secondary small" disabled={busy} onClick={()=>start(async()=>{const id=selected,r=await loadChatMessages(id,messages.messages[0]?.created_at,messages.messages[0]?.id);if(active.current===id&&r.ok)setMessages(previous=>mergeChatHistory(previous,r,true));})}>Load earlier messages</button>}
   <div className="chat-messages" role="log" aria-label="Messages">{messages&&!messages.ok&&<p role="alert">Messages could not be loaded.</p>}{messages?.messages.map(m=><article key={m.id} className={m.author_id===data?.self?'mine':''}><strong>{data?.people.find(p=>p.id===m.author_id)?.display_name||'Team member'}</strong>{m.file&&<ChatFileView file={m.file}/>}{m.body&&<p>{m.body}</p>}<time dateTime={m.created_at}>{indiaTimestamp(m.created_at)}</time></article>)}{messages?.ok&&!messages.messages.length&&<p>Say hello to {name}.</p>}</div>
   {file&&<AttachmentPreview file={file} disabled={busy} onRemove={()=>{setFile(null);if(fileInput.current)fileInput.current.value='';}}/>}
   <div className={`chat-compose-wrap${dropping?' dropping':''}`} onDragOver={e=>{if(messages?.ok&&e.dataTransfer.types.includes('Files')){e.preventDefault();setDropping(true);}}} onDragLeave={()=>setDropping(false)} onDrop={e=>{e.preventDefault();setDropping(false);if(messages?.ok&&!busy)pickFile(e.dataTransfer.files[0]);}}>
   {emojiOpen&&<EmojiPicker onPick={addEmoji} onClose={()=>setEmojiOpen(false)}/>}
   <form className="chat-compose" onSubmit={e=>{e.preventDefault();const id=selected,body=text.trim(),attached=file;if((!body&&!attached)||busy||!messages?.ok)return;const signature=body+(attached?`\u0000${attached.name}:${attached.size}:${attached.lastModified}`:'');if(request.current?.id!==id||request.current.body!==signature)request.current={id,body:signature,key:crypto.randomUUID()};const key=request.current.key;setEmojiOpen(false);start(async()=>{let r:{ok:boolean;message:string};if(attached){const form=new FormData();form.set('chat',id);form.set('key',key);form.set('text',body);form.set('file',attached);r=await sendChatFile(form);}else r=await sendChat(id,body,key);setNotice(r.message);if(r.ok){request.current=null;refocus.current=true;if(active.current===id){setText('');setFile(null);if(fileInput.current)fileInput.current.value='';}await reload();}});}}><label>Message<textarea ref={composer} disabled={busy||!messages?.ok} value={text} onChange={e=>setText(e.target.value)} onPaste={e=>{const picture=[...e.clipboardData.files].find(f=>f.type.startsWith('image/'));if(picture){e.preventDefault();pickFile(picture);}}} onKeyDown={e=>{if(e.key!=='Enter'||e.shiftKey||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;e.preventDefault();if(!busy&&messages?.ok&&(text.trim()||file))e.currentTarget.form?.requestSubmit();}} placeholder={file?'Add a message (optional)…':'Type a message…'} aria-describedby="chat-compose-help" required={!file} maxLength={4000} rows={2}/></label><div className="chat-compose-tools"><input ref={fileInput} type="file" hidden accept={CHAT_FILE_ACCEPT} onChange={e=>{pickFile(e.target.files?.[0]);e.target.value='';}}/><button type="button" className="icon-button" aria-label="Attach a file or picture" title="Attach a file or picture" disabled={busy||!messages?.ok} onClick={()=>fileInput.current?.click()}><Paperclip size={18}/></button><button type="button" className="icon-button" data-emoji-toggle aria-label="Emoji" title="Emoji" aria-expanded={emojiOpen} disabled={busy||!messages?.ok} onClick={()=>setEmojiOpen(open=>!open)}><Smile size={18}/></button></div><button className="primary" disabled={busy||!messages?.ok}>{busy?'Please wait…':'Send'}</button></form></div><small id="chat-compose-help" className="chat-compose-help">Enter to send · Shift + Enter for a new line · Attach files up to 5 MB, paste or drop a picture</small>
  </>:<div className="chat-welcome"><span aria-hidden="true">💬</span><h3>Your team, one conversation away.</h3><p>Choose a teammate on the left to chat. Use New Group for a team conversation.</p></div>}</div></div>
  <dialog ref={dialog} className="modal chat-group-dialog" aria-label="Create group" onCancel={()=>setGroupOpen(false)}>{groupOpen&&<><div className="modal-head"><h2>Create Group</h2><button className="icon-button" aria-label="Close group form" disabled={busy} onClick={()=>setGroupOpen(false)}>✕</button></div><form className="stack" action={form=>start(async()=>{const r=await createChat(form);setNotice(r.message);if(r.ok){choose(r.id);setGroupOpen(false);await reload();}})}><input type="hidden" name="kind" value="group"/><fieldset disabled={busy} className="employee-fields"><label>Group name<input name="name" required maxLength={100} placeholder="e.g. Design team"/></label><GroupPhotoField/><fieldset className="chat-people"><legend>Select employees</legend>{data?.people.filter(p=>p.id!==data.self).map(p=><label key={p.id}><input type="checkbox" name="people" value={p.id}/>{p.display_name}</label>)}</fieldset><small>You are added automatically. Only you and selected employees will see this group.</small></fieldset>{notice&&<p role="status">{notice}</p>}<button className="primary" disabled={busy}>{busy?'Creating…':'Create Group'}</button></form></>}</dialog>
 </section>;
}
