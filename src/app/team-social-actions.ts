'use server';
import {z} from 'zod';
import {workspaceContext} from '@/lib/access';
import {serverClient} from '@/lib/supabase/server';
import {workAdmin} from '@/lib/work-server';
import {profilePhotoUrl,uploadProfilePhoto,discardUnreferencedPhoto} from '@/lib/profile-photo-server';
import type {ChatNotice} from '@/lib/chat-notifications';
import {inspectChatFile,MAX_CHAT_FILE_BYTES} from '@/lib/chat-file';
import type {ChatFile} from '@/lib/chat-history';
async function context(){const ctx=await workspaceContext();if(ctx.preview||ctx.kind!=='employee')throw Error('Employee account required');return ctx;}
export async function loadChatNotifications():Promise<{ok:boolean;items:ChatNotice[]}>{
 try{
  const ctx=await context(),db=await serverClient();
  const [members,people]=await Promise.all([db.from('chat_members').select('conversation_id,last_read_at').eq('membership_id',ctx.membershipId),db.rpc('chat_people',{org_id:ctx.organizationId})]);
  if(members.error||people.error)throw Error();
  if(!members.data.length)return {ok:true,items:[]};
  const chats=await db.from('chat_conversations').select('id,kind,name').eq('organization_id',ctx.organizationId).in('id',members.data.map(m=>m.conversation_id));if(chats.error)throw Error();
  const names=new Map((people.data as {id:string;display_name:string}[]).map(p=>[p.id,p.display_name]));
  const items=await Promise.all(chats.data.map(async chat=>{
   const watermark=members.data.find(m=>m.conversation_id===chat.id)!.last_read_at;
   let query=db.from('chat_messages').select('id,author_id,body,created_at,file_name',{count:'exact'}).eq('conversation_id',chat.id).neq('author_id',ctx.membershipId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);
   if(watermark!=='-infinity')query=query.gt('created_at',watermark);
   const r=await query;if(r.error)throw Error();const message=r.data[0];
   return message?{conversationId:chat.id,messageId:message.id,sender:names.get(message.author_id)||'Team member',group:chat.kind==='group'?chat.name:null,body:(message.body||`📎 ${message.file_name||'File'}`).slice(0,160),createdAt:message.created_at,unread:r.count||0}:null;
  }));return {ok:true,items:items.filter((item):item is ChatNotice=>item!==null)};
 }catch{return {ok:false,items:[]};}
}
export async function markChatRead(chat:string,message:string){
 try{
  const ctx=await context(),db=await serverClient();z.uuid().parse(chat);z.uuid().parse(message);
  // Validate through the employee's RLS before updating only their receipt.
  const [conversation,shown]=await Promise.all([db.from('chat_conversations').select('id').eq('id',chat).eq('organization_id',ctx.organizationId).maybeSingle(),db.from('chat_messages').select('created_at').eq('id',message).eq('conversation_id',chat).maybeSingle()]);
  if(conversation.error||shown.error||!conversation.data||!shown.data)throw Error();
  const {error}=await workAdmin().from('chat_members').update({last_read_at:shown.data.created_at}).eq('conversation_id',chat).eq('membership_id',ctx.membershipId).lt('last_read_at',shown.data.created_at);if(error)throw error;return true;
 }catch{return false;}
}
export async function birthdayPeople(){try{const ctx=await context(),db=await serverClient();const {data,error}=await db.rpc('today_birthdays',{org_id:ctx.organizationId});if(error)throw error;return {ok:true,people:await Promise.all((data as {id:string;display_name:string;photo_path:string|null}[]).map(async p=>({id:p.id,name:p.display_name,photo:await profilePhotoUrl(p.photo_path)})))};}catch{return {ok:false,people:[]};}}
export async function loadChats(){try{const ctx=await context(),db=await serverClient();const [chats,people,members]=await Promise.all([db.from('chat_conversations').select('id,kind,name,created_at,created_by,photo_path').eq('organization_id',ctx.organizationId).order('created_at',{ascending:false}),db.rpc('chat_people',{org_id:ctx.organizationId}),db.from('chat_members').select('conversation_id,membership_id')]);if(chats.error||people.error||members.error)throw Error();const teammates=people.data as {id:string;display_name:string}[];const photos=teammates.length?await workAdmin().from('employees').select('membership_id,photo_path').eq('organization_id',ctx.organizationId).in('membership_id',teammates.map(p=>p.id)):{data:[],error:null};if(photos.error)throw photos.error;const photoPaths=new Map(photos.data.map(p=>[p.membership_id,p.photo_path]));return {ok:true,self:ctx.membershipId,chats:await Promise.all(chats.data.map(async c=>({...c,photo_url:await profilePhotoUrl(c.photo_path)}))),people:await Promise.all(teammates.map(async p=>({...p,photo_url:await profilePhotoUrl(photoPaths.get(p.id))}))),members:members.data};}catch{return {ok:false,self:'',chats:[],people:[],members:[]};}}
export async function loadChatMessages(id:string,before?:string,beforeId?:string){try{await context();z.uuid().parse(id);if(before){z.iso.datetime({offset:true}).parse(before);z.uuid().parse(beforeId);}const db=await serverClient();let query=db.from('chat_messages').select('id,author_id,body,created_at,file_path,file_name,file_type,file_size').eq('conversation_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);if(before)query=query.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`);const {data,error}=await query;if(error)throw error;return {ok:true,messages:await withFileLinks(data.reverse()),more:data.length===100};}catch{return {ok:false,messages:[],more:false};}}
export async function createChat(form:FormData){try{const ctx=await context(),db=await serverClient();const kind=z.enum(['direct','group']).parse(form.get('kind')),name=z.string().trim().max(100).parse(form.get('name')||''),people=z.array(z.uuid()).min(1).max(49).parse(form.getAll('people'));if(kind==='group'&&!name)throw Error();const photo=kind==='group'?await uploadProfilePhoto(form,ctx.organizationId,'groups'):null;const result=kind==='group'?await db.rpc('chat_create_group',{org_id:ctx.organizationId,chat_name:name,people,path:photo}):await db.rpc('chat_create',{org_id:ctx.organizationId,chat_kind:kind,chat_name:name,people});if(result.error){await discardUnreferencedPhoto(photo);throw result.error;}return {ok:true,id:result.data as string,message:''};}catch{return {ok:false,id:'',message:'Chat could not be opened. Choose active teammates; group photos must be PNG, JPEG or WebP, up to 2 MB.'};}}
export async function changeGroupPhoto(form:FormData){try{const ctx=await context(),id=z.uuid().parse(form.get('chat')),db=await serverClient();const {data,error}=await db.from('chat_conversations').select('id,created_by,kind').eq('id',id).eq('organization_id',ctx.organizationId).maybeSingle();if(error||!data||data.created_by!==ctx.membershipId||data.kind!=='group')throw Error();const photo=await uploadProfilePhoto(form,ctx.organizationId,'groups');if(!photo)return {ok:false,message:'Choose a photo first.'};const saved=await db.rpc('chat_group_photo',{org_id:ctx.organizationId,chat:id,path:photo});if(saved.error){await discardUnreferencedPhoto(photo);throw saved.error;}return {ok:true,message:'Group image saved.'};}catch{return {ok:false,message:'Only the group creator can change its image. Choose PNG, JPEG or WebP, up to 2 MB.'};}}
export async function sendChat(id:string,body:string,key:string){try{const ctx=await context(),db=await serverClient();const {error}=await db.rpc('chat_send',{org_id:ctx.organizationId,chat:z.uuid().parse(id),message:z.string().trim().min(1).max(4000).parse(body),request_key:z.uuid().parse(key)});if(error)throw error;return {ok:true,message:''};}catch{return {ok:false,message:'Message not confirmed. Retry to send safely; check your connection or wait a minute.'};}}

// Files sit in a private bucket. A person gets a signed link only for messages the database already let them read.
const FILE_LINK_SECONDS=6*3600;
type StoredMessage={id:string;author_id:string;body:string;created_at:string;file_path:string|null;file_name:string|null;file_type:string|null;file_size:number|null};
async function withFileLinks(rows:StoredMessage[]){
 const admin=rows.some(r=>r.file_path)?workAdmin():null;
 return Promise.all(rows.map(async ({file_path,file_name,file_type,file_size,...message}):Promise<{id:string;author_id:string;body:string;created_at:string;file:ChatFile|null}>=>{
  if(!file_path||!admin)return {...message,file:null};
  const image=Boolean(file_type?.startsWith('image/')),{data}=await admin.storage.from('chat-files').createSignedUrl(file_path,FILE_LINK_SECONDS,image?undefined:{download:file_name||true});
  return {...message,file:{name:file_name||'file',type:file_type||'application/octet-stream',size:file_size||0,url:data?.signedUrl||null}};
 }));
}
/** Send one file (with an optional message). The type is checked from the file's own bytes before it is stored. */
export async function sendChatFile(form:FormData){
  try{
  const ctx=await context(),db=await serverClient();
  const chat=z.uuid().parse(form.get('chat')),key=z.uuid().parse(form.get('key')),text=z.string().trim().max(4000).parse(form.get('text')||''),file=form.get('file');
  if(!(file instanceof File)||!file.size)return {ok:false,message:'Choose a file first.'};
  if(file.size>MAX_CHAT_FILE_BYTES)return {ok:false,message:'Files must be 5 MB or smaller.'};
  // Row-level security lets only members of the conversation see it, so this doubles as the membership check before anything is stored.
  const {data:conversation,error:conversationError}=await db.from('chat_conversations').select('id').eq('id',chat).eq('organization_id',ctx.organizationId).maybeSingle();
  if(conversationError||!conversation)return {ok:false,message:'You are not part of this chat.'};
  const bytes=new Uint8Array(await file.arrayBuffer()),info=inspectChatFile(file.name,bytes);
  if(!info.ok)return {ok:false,message:info.message};
  const path=`${ctx.organizationId}/${chat}/${crypto.randomUUID()}.${info.extension}`,admin=workAdmin();
  const upload=await admin.storage.from('chat-files').upload(path,bytes,{contentType:info.contentType,upsert:false});
  if(upload.error)return {ok:false,message:'The file could not be uploaded. Try again.'};
  const {error}=await db.rpc('chat_send_file',{org_id:ctx.organizationId,chat,message:text,request_key:key,f_path:path,f_name:info.name,f_type:info.contentType,f_size:bytes.length});
  if(error){await admin.storage.from('chat-files').remove([path]);throw error;}
  return {ok:true,message:''};
 }catch{
  // No cleanup here: if the connection dropped after the database saved the message, removing the file would break that message.
  // A leftover private file is harmless; an explicit database refusal is cleaned up above.
  return {ok:false,message:'File not sent. Check your connection and try again.'};
 }
}
