import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='60000000-0000-4000-8000-000000000001',worker='60000000-0000-4000-8000-000000000002',other='60000000-0000-4000-8000-000000000003';
let org:string,member:string,second:string;
async function role(name:string,user=worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`);}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[other,'other@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060003_employee_password_login.sql','202610060004_owner_updates.sql','202610060005_owner_email_updates.sql','202610060006_jira.sql','202610060007_jira_table_grants.sql','202610060009_time_management.sql','202610060010_jira_time.sql','202610060011_unified_work.sql','202610070012_jira_metadata.sql','202610080015_work_stop_capture.sql','202610080016_flexible_attendance.sql','202610080017_simple_manual_tasks.sql','202610080018_break_task_resume.sql','202610080019_manual_task_restart.sql','202610080020_jira_auto_fetch.sql','202610090021_announcements_continue_work.sql','202610090022_profiles_birthdays_chat.sql','202610090024_chat_group_photos.sql','202610150035_chat_files.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Chat file tests','Owner'])).rows[0].bootstrap_owner;
 await db.query('insert into public.profiles values($1,$2,now())',[worker,'Worker']);
 member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,'worker@example.com','employee') returning id",[org,worker])).rows[0].id;
 await db.query("insert into public.membership_roles values($1,'employee')",[member]);
 await db.query('insert into public.profiles values($1,$2,now())',[other,'Other']);
 second=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,'other@example.com','employee') returning id",[org,other])).rows[0].id;
 await db.query("insert into public.membership_roles values($1,'employee')",[second]);
 await db.query('insert into public.jira_account_links values($1,$2,$3)',[org,member,'jira-worker']);
 await db.query("insert into public.time_attendance(organization_id,membership_id,work_date,shift,clock_in) values($1,$2,(now() at time zone 'Asia/Kolkata')::date,'early',now()-interval '1 hour')",[org,member]);
});
after(()=>db.close());

const uuid=()=>crypto.randomUUID();
const send=(chat:string,text:string,path:string|null,key=uuid())=>db.query('select public.chat_send_file($1,$2,$3,$4,$5,$6,$7,$8)',[org,chat,text,key,path,'plan.pdf','application/pdf',1234]);
async function directChat(){await role('authenticated');return (await db.query<{chat_create:string}>("select public.chat_create($1,'direct','',$2)",[org,[second]])).rows[0].chat_create;}
test('a file message can have no text, is idempotent, and the other person can read it',async()=>{
  const chat=await directChat(),path=`${org}/${chat}/${uuid()}.pdf`,key=uuid();
  const first=(await send(chat,'',path,key)).rows[0] as {chat_send_file:string},again=(await send(chat,'',path,key)).rows[0] as {chat_send_file:string};
  assert.equal(first.chat_send_file,again.chat_send_file,'the same request key never sends twice');
  await role('authenticated',other);
  const rows=(await db.query<{body:string;file_name:string;file_type:string;file_size:number;file_path:string}>('select body,file_name,file_type,file_size,file_path from public.chat_messages where conversation_id=$1',[chat])).rows;
  assert.equal(rows.length,1);assert.deepEqual([rows[0].body,rows[0].file_name,rows[0].file_type,rows[0].file_size,rows[0].file_path],['','plan.pdf','application/pdf',1234,path]);
});
test('a file must sit in this conversation\'s own folder and match the allowed shape',async()=>{
  const chat=await directChat(),other_chat=uuid();
  for(const bad of [`${org}/${other_chat}/${uuid()}.pdf`,`${uuid()}/${chat}/${uuid()}.pdf`,`${org}/${chat}/../${uuid()}.pdf`,`${org}/${chat}/${uuid()}.p/df`,`${org}/${chat}/${uuid()}`,null])
    await assert.rejects(send(chat,'x',bad as string),/Invalid file/,String(bad));
});
test('only members can send a file; a text message still needs text; sizes and names are bounded',async()=>{
  const chat=await directChat(),path=`${org}/${chat}/${uuid()}.png`;
  await role('authenticated',owner);await assert.rejects(send(chat,'hi',path),/denied/);
  await role('authenticated');
  await assert.rejects(db.query('select public.chat_send($1,$2,$3,$4)',[org,chat,'   ',uuid()]),/check|violates/,'plain empty messages are still refused');
  await assert.rejects(db.query('select public.chat_send_file($1,$2,$3,$4,$5,$6,$7,$8)',[org,chat,'',uuid(),path,'big.png','image/png',5242881]),/check|violates/);
  await assert.rejects(db.query('select public.chat_send_file($1,$2,$3,$4,$5,$6,$7,$8)',[org,chat,'',uuid(),path,'','image/png',10]),/check|violates/);
  await assert.rejects(db.query('select public.chat_send_file($1,$2,$3,$4,$5,$6,$7,$8)',[org,chat,'',uuid(),path,'x'.repeat(101),'image/png',10]),/check|violates/);
  await assert.rejects(db.query('select public.chat_send_file($1,$2,$3,$4,$5,$6,$7,$8)',[org,chat,'',uuid(),path,'a.png','image/png',0]),/check|violates/);
});
test('nobody can write file columns directly or call the function while signed out',async()=>{
  const chat=await directChat();
  await assert.rejects(db.query("insert into public.chat_messages(conversation_id,author_id,body,client_id,file_path,file_name,file_type,file_size) values($1,$2,'',gen_random_uuid(),'a/b/c.png','c.png','image/png',1)",[chat,member]),/permission/);
  await db.exec('reset role');await db.exec('set role anon');
  await assert.rejects(db.query('select public.chat_send_file($1,$2,$3,$4,$5,$6,$7,$8)',[org,chat,'',uuid(),'x','x','x',1]),/permission/);
});
