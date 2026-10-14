export type ChatFile={name:string;type:string;size:number;url:string|null};
export type ChatMessage={id:string;author_id:string;body:string;created_at:string;file?:ChatFile|null};
export type ChatHistory={ok:boolean;messages:ChatMessage[];more:boolean};
const compare=(a:ChatMessage,b:ChatMessage)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
/** Polling the newest page must not reset the exhausted oldest-page cursor. */
export function mergeChatHistory(previous:ChatHistory|undefined,incoming:ChatHistory,older=false):ChatHistory{
 if(!incoming.ok)return {...incoming,messages:previous?.messages||[],more:previous?.more??incoming.more};
 const seen=new Map((previous?.messages||[]).map(m=>[m.id,m]));
 const messages=[...new Map([...(previous?.messages||[]),...incoming.messages].map(m=>[m.id,m.file&&seen.get(m.id)?.file?.url?{...m,file:{...m.file,url:seen.get(m.id)!.file!.url}}:m])).values()].sort(compare);
 const retainedOlder=previous?.messages[0]&&(!incoming.messages[0]||compare(previous.messages[0],incoming.messages[0])<0);
 return {...incoming,messages,more:older?incoming.more:retainedOlder?previous.more:incoming.more};
}
