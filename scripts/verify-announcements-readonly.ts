import {workAdmin} from '../src/lib/work-server';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
async function main(){
 const db=workAdmin(),config=JSON.parse(await readFile('.sales-google.local.json','utf8')),org=config.organizationId;
 const [members,announcements]=await Promise.all([db.from('memberships').select('id,active,kind').eq('organization_id',org),db.from('announcements').select('id,created_at').eq('organization_id',org).order('created_at',{ascending:false})]);
 if(members.error||announcements.error)throw Error('Announcement read check failed');
 const active=members.data.filter(m=>m.active&&m.kind==='employee');
 const receipts=announcements.data.length?await db.from('announcement_reads').select('announcement_id,membership_id').in('announcement_id',announcements.data.map(a=>a.id)):{data:[],error:null};if(receipts.error)throw Error('Receipt read check failed');
 const report={checkedAt:new Date().toISOString(),activeEmployeeAccounts:active.length,existingAnnouncements:announcements.data.length,latestPublishedAt:announcements.data[0]?.created_at||null,employeesWithUnreadAnnouncement:active.filter(m=>announcements.data.some(a=>!receipts.data.some(r=>r.membership_id===m.id&&r.announcement_id===a.id))).length,scope:'Read-only live metadata; all-employee RLS and receipt isolation verified separately in local database tests. No announcement sent or marked read.'};
 const owners=await db.from('membership_roles').select('membership_id').eq('role_key','owner').in('membership_id',active.map(m=>m.id));if(owners.error)throw Error('Owner read check failed');
 const own=owners.data[0]?.membership_id;
 if(own){
  const chats=await db.from('chat_members').select('conversation_id,last_read_at').eq('membership_id',own);if(chats.error)throw Error('Chat read check failed');
  let unread=0;for(const chat of chats.data){let query=db.from('chat_messages').select('id',{count:'exact'}).eq('conversation_id',chat.conversation_id).neq('author_id',own).limit(1);if(chat.last_read_at!=='-infinity')query=query.gt('created_at',chat.last_read_at);const messages=await query;if(messages.error)throw Error('Unread query failed');unread+=messages.count||0;}
  console.log(JSON.stringify({ownerConversations:chats.data.length,ownerUnreadChatMessages:unread,unreadQueryVerified:true}));
 }
 await mkdir('test-results/chat-announcements-2026-10-10',{recursive:true});await writeFile('test-results/chat-announcements-2026-10-10/live-announcements.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(()=>{console.error('Read-only verification failed; no live data changed.');process.exitCode=1;});
