'use client';
/* eslint-disable @next/next/no-img-element -- Chat pictures are private files behind short-lived signed links, or a local preview before sending. */
import {useEffect,useState} from 'react';
import {FileSpreadsheet,FileText,FileType,Presentation,X,Download} from 'lucide-react';
import {chatFileIcon,formatChatFileSize} from '@/lib/chat-file';
import type {ChatFile} from '@/lib/chat-history';

const ICONS={pdf:FileType,sheet:FileSpreadsheet,slides:Presentation,doc:FileText,text:FileText,image:FileText} as const;

/** The file chosen in the composer, shown before sending, with a way to remove it. */
export function AttachmentPreview({file,onRemove,disabled}:{file:File;onRemove:()=>void;disabled?:boolean}){
  const [loaded,setLoaded]=useState<{file:File;url:string}>();
  // A data URL (not an object URL) so the preview survives React's development double-mount.
  useEffect(()=>{
    if(!file.type.startsWith('image/'))return;
    const reader=new FileReader();reader.onload=()=>setLoaded({file,url:String(reader.result)});reader.readAsDataURL(file);
    return()=>{reader.onload=null;};
  },[file]);
  const preview=loaded?.file===file?loaded.url:undefined;
  const Icon=ICONS[chatFileIcon(file.type||'')]||FileText;
  return <div className="chat-attachment-preview" role="group" aria-label="Attached file">
    {preview?<img src={preview} alt=""/>:<span className="chat-file-icon" aria-hidden="true"><Icon size={22}/></span>}
    <span className="chat-attachment-name"><strong>{file.name}</strong><small>{formatChatFileSize(file.size)}</small></span>
    <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={onRemove}><X size={16}/></button>
  </div>;
}

/** A file inside a message: pictures show as a thumbnail that opens full size, other files as a download card. */
export function ChatFileView({file}:{file:ChatFile}){
  if(!file.url)return <p className="chat-file-missing">{file.name} · file unavailable. Reopen the chat to refresh it.</p>;
  if(file.type.startsWith('image/'))return <a className="chat-image" href={file.url} target="_blank" rel="noopener noreferrer" title={`${file.name} · ${formatChatFileSize(file.size)}`}><img src={file.url} alt={file.name} loading="lazy"/></a>;
  const Icon=ICONS[chatFileIcon(file.type)]||FileText;
  return <a className="chat-file-card" href={file.url} download={file.name} rel="noopener noreferrer">
    <span className="chat-file-icon" aria-hidden="true"><Icon size={22}/></span>
    <span className="chat-attachment-name"><strong>{file.name}</strong><small>{formatChatFileSize(file.size)} · Download</small></span>
    <Download size={16} aria-hidden="true"/>
  </a>;
}
