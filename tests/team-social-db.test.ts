import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='40000000-0000-4000-8000-000000000001',worker='40000000-0000-4000-8000-000000000002',other='40000000-0000-4000-8000-000000000003';
let org:string,member:string,second:string;
async function role(name:string,user=worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`);}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[other,'other@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060003_employee_password_login.sql','202610060004_owner_updates.sql','202610060005_owner_email_updates.sql','202610060006_jira.sql','202610060007_jira_table_grants.sql','202610060009_time_management.sql','202610060010_jira_time.sql','202610060011_unified_work.sql','202610070012_jira_metadata.sql','202610080015_work_stop_capture.sql','202610080016_flexible_attendance.sql','202610080017_simple_manual_tasks.sql','202610080018_break_task_resume.sql','202610080019_manual_task_restart.sql','202610080020_jira_auto_fetch.sql','202610090021_announcements_continue_work.sql','202610090022_profiles_birthdays_chat.sql','202610090024_chat_group_photos.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Jira time tests','Owner'])).rows[0].bootstrap_owner;
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
test('employee profile extras save atomically; duplicate ID and future birthday reject',async()=>{
 await role('authenticated',owner);
 const payload={display_name:'Profile fixture',email:'profile@example.com',job_title:'Designer',phone:'+91 12345',employee_code:'VP-TEST',birthday:'2000-05-12'};
 const employee=(await db.query<{create_employee:string}>('select public.create_employee($1,$2)',[org,JSON.stringify(payload)])).rows[0].create_employee;
 const row=(await db.query<{phone:string;employee_code:string;birthday:string}>('select phone,employee_code,birthday::text from public.employees where id=$1',[employee])).rows[0];assert.equal(row.phone,payload.phone);assert.equal(row.employee_code,payload.employee_code);assert.equal(row.birthday,payload.birthday);
 await assert.rejects(db.query('select public.create_employee($1,$2)',[org,JSON.stringify({...payload,email:'duplicate@example.com'})]),/unique/);
 assert.equal((await db.query("select id from public.employees where email='duplicate@example.com'")).rows.length,0);
 await assert.rejects(db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'employee',employee,JSON.stringify({...payload,birthday:'2099-01-01'})]),/future/);
 await role('authenticated');await assert.rejects(db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'employee',employee,JSON.stringify(payload)]),/Owner/);
 await assert.rejects(db.query('select public.create_employee_before_profile($1,$2)',[org,JSON.stringify(payload)]),/permission/);
});
test('birthday shares names only and requires today clock-in',async()=>{
 await role('service_role');await db.query("insert into public.employees(organization_id,membership_id,display_name,email,birthday) values($1,$2,'Worker','worker@example.com',(now() at time zone 'Asia/Kolkata')::date-interval '20 years')",[org,member]);
 await role('authenticated',other);assert.equal((await db.query<{display_name:string}>('select * from public.today_birthdays($1)',[org])).rows.length,0);
 await role('authenticated');const people=(await db.query<{display_name:string}>('select * from public.today_birthdays($1)',[org])).rows;assert.equal(people.length,1);assert.equal(people[0].display_name,'Worker');assert.equal('birthday' in people[0],false);
});
test('service login provisioning stores profile fields and restores the calling actor',async()=>{
 const user='40000000-0000-4000-8000-000000000004';await db.exec('reset role');await db.query('insert into auth.users values($1,$2)',[user,'new-employee@example.com']);await role('service_role',owner);
 const employee=(await db.query<{complete_employee_login:string}>('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,user,JSON.stringify({display_name:'New Employee',email:'new-employee@example.com',job_title:'Editor',employee_code:'VP-LOGIN',phone:'+91 98765',birthday:'2001-02-10'})])).rows[0].complete_employee_login;
 const row=(await db.query<{employee_code:string;phone:string;membership_id:string}>('select employee_code,phone,membership_id from public.employees where id=$1',[employee])).rows[0];assert.equal(row.employee_code,'VP-LOGIN');assert.equal(row.phone,'+91 98765');assert(row.membership_id);assert.equal((await db.query<{actor:string}>("select current_setting('request.jwt.claim.sub') actor")).rows[0].actor,owner);
 await role('authenticated');await assert.rejects(db.query('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,user,'{}']),/permission/);
});
test('personal chat deduplicates; outsiders including Owner cannot read or send',async()=>{
 await role('authenticated');const chat=(await db.query<{chat_create:string}>("select public.chat_create($1,'direct','',$2)",[org,[second]])).rows[0].chat_create;
 await role('authenticated',other);assert.equal((await db.query<{chat_create:string}>("select public.chat_create($1,'direct','',$2)",[org,[member]])).rows[0].chat_create,chat);
 const key='50000000-0000-4000-8000-000000000001';await db.query('select public.chat_send($1,$2,$3,$4)',[org,chat,'Hello',key]);await db.query('select public.chat_send($1,$2,$3,$4)',[org,chat,'Hello',key]);assert.equal((await db.query('select * from public.chat_messages where conversation_id=$1',[chat])).rows.length,1);
 await assert.rejects(db.query("insert into public.chat_messages(conversation_id,author_id,body,client_id) values($1,$2,'Bypass',gen_random_uuid())",[chat,second]),/permission/);
 await role('authenticated',owner);assert.equal((await db.query('select * from public.chat_conversations where id=$1',[chat])).rows.length,0);assert.equal((await db.query('select * from public.chat_messages where conversation_id=$1',[chat])).rows.length,0);await assert.rejects(db.query('select public.chat_send($1,$2,$3,gen_random_uuid())',[org,chat,'No access']),/denied/);
});
test('group photos save atomically and only the participating creator can change them',async()=>{
 await role('authenticated');const path=`${org}/groups/example.png`,group=(await db.query<{chat_create_group:string}>("select public.chat_create_group($1,'Photo group',$2,$3)",[org,[second],path])).rows[0].chat_create_group;
 assert.equal((await db.query<{photo_path:string}>('select photo_path from public.chat_conversations where id=$1',[group])).rows[0].photo_path,path);
 await role('authenticated',other);assert.equal((await db.query('select * from public.chat_conversations where id=$1',[group])).rows.length,1);await assert.rejects(db.query('select public.chat_group_photo($1,$2,$3)',[org,group,`${org}/groups/changed.png`]),/creator/);
 await role('authenticated',owner);assert.equal((await db.query('select * from public.chat_conversations where id=$1',[group])).rows.length,0);await assert.rejects(db.query('select public.chat_group_photo($1,$2,$3)',[org,group,path]),/creator/);
 await role('authenticated');await assert.rejects(db.query("select public.chat_create_group($1,'Invalid photo group',$2,$3)",[org,[second],'other-org/groups/photo.png']),/Invalid/);assert.equal((await db.query("select id from public.chat_conversations where name='Invalid photo group'")).rows.length,0);
 await db.query('select public.chat_group_photo($1,$2,$3)',[org,group,`${org}/groups/changed.png`]);
 assert.equal((await db.query<{photo_path:string}>('select photo_path from public.chat_conversations where id=$1',[group])).rows[0].photo_path,`${org}/groups/changed.png`);
});
test('Owner announcements reach every active same-agency employee with independent receipts',async()=>{
 await role('authenticated',owner);await db.query("select public.announcement_publish($1,'Everyone','Agency announcement')",[org]);
 const item=(await db.query<{id:string}>("select id from public.announcements where title='Everyone'")).rows[0].id;
 for(const user of [owner,worker,other,'40000000-0000-4000-8000-000000000004']){await role('authenticated',user);assert.equal((await db.query('select id from public.announcements where id=$1',[item])).rows.length,1);}
 await role('authenticated');await db.query('select public.announcement_read($1,$2)',[org,item]);assert.equal((await db.query('select * from public.announcement_reads where announcement_id=$1',[item])).rows.length,1);
 await role('authenticated',other);assert.equal((await db.query('select * from public.announcement_reads where announcement_id=$1',[item])).rows.length,0);await assert.rejects(db.query("select public.announcement_publish($1,'Forbidden','No')",[org]),/Owner/);
 await role('anon');assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('anon','public.announcements','SELECT') allowed")).rows[0].allowed,false);
});
test('chat unread messages exclude own sends; read watermark leaves later messages unread',async()=>{
 await role('authenticated');const chat=(await db.query<{chat_create:string}>("select public.chat_create($1,'direct','',$2)",[org,[second]])).rows[0].chat_create;
 await role('authenticated',other);await db.query("select public.chat_send($1,$2,'New message',gen_random_uuid())",[org,chat]);
 const shown=(await db.query<{id:string;created_at:string}>("select id,created_at::text from public.chat_messages where conversation_id=$1 order by created_at desc limit 1",[chat])).rows[0];
 await role('authenticated');await db.query("select public.chat_send($1,$2,'My reply',gen_random_uuid())",[org,chat]);
 const unread=await db.query<{count:number}>("select count(*)::int count from public.chat_messages m join public.chat_members cm on cm.conversation_id=m.conversation_id where cm.membership_id=$1 and m.author_id<>$1 and m.created_at>cm.last_read_at",[member]);assert(unread.rows[0].count>=1);
 await role('service_role');await db.query('update public.chat_members set last_read_at=$1 where conversation_id=$2 and membership_id=$3 and last_read_at<$1',[shown.created_at,chat,member]);
 await db.query("insert into public.chat_messages(conversation_id,author_id,body,client_id,created_at) values($1,$2,'Later',gen_random_uuid(),$3::timestamptz+interval '1 second')",[chat,second,shown.created_at]);
 await role('authenticated');assert.equal((await db.query<{body:string}>('select body from public.chat_messages where conversation_id=$1 and author_id<>$2 and created_at>$3',[chat,member,shown.created_at])).rows[0].body,'Later');
 await role('authenticated',owner);assert.equal((await db.query('select * from public.chat_members where conversation_id=$1',[chat])).rows.length,0);
});
test('groups require active same-agency employees and a name',async()=>{
 await role('authenticated');await assert.rejects(db.query("select public.chat_create($1,'group','',$2)",[org,[second]]),/name/);await assert.rejects(db.query("select public.chat_create($1,'group','Team',$2)",[org,['99999999-0000-4000-8000-000000000001']]),/Invalid/);
 const group=(await db.query<{chat_create:string}>("select public.chat_create($1,'group','Design team',$2)",[org,[second]])).rows[0].chat_create;assert.equal((await db.query('select * from public.chat_members where conversation_id=$1',[group])).rows.length,2);await assert.rejects(db.query("select public.chat_send($1,$2,' ',gen_random_uuid())",[org,group]),/check constraint/);
 await role('service_role');await db.query('update public.memberships set active=false where id=$1',[second]);await role('authenticated',other);assert.equal((await db.query('select * from public.chat_messages')).rows.length,0);await assert.rejects(db.query("select public.chat_send($1,$2,'Hello',gen_random_uuid())",[org,group]),/denied/);
 assert.equal((await db.query('select * from public.announcements')).rows.length,0);
});


