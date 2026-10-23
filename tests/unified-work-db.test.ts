import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='40000000-0000-4000-8000-000000000001',worker='40000000-0000-4000-8000-000000000002',other='40000000-0000-4000-8000-000000000003';
let org:string,member:string,task:string,second:string,log:string;
async function role(name:string,user=worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`);}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[other,'other@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060006_jira.sql','202610060007_jira_table_grants.sql','202610060009_time_management.sql','202610060010_jira_time.sql','202610060011_unified_work.sql','202610070012_jira_metadata.sql','202610080015_work_stop_capture.sql','202610080016_flexible_attendance.sql','202610080017_simple_manual_tasks.sql','202610080018_break_task_resume.sql','202610080019_manual_task_restart.sql','202610080020_jira_auto_fetch.sql','202610090021_announcements_continue_work.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Jira time tests','Owner'])).rows[0].bootstrap_owner;
 await db.query('insert into public.profiles values($1,$2,now())',[worker,'Worker']);
 member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,'worker@example.com','employee') returning id",[org,worker])).rows[0].id;
 await db.query("insert into public.membership_roles values($1,'employee')",[member]);
 await db.query('insert into public.jira_account_links values($1,$2,$3)',[org,member,'jira-worker']);
 await db.query("insert into public.time_attendance(organization_id,membership_id,work_date,shift,clock_in) values($1,$2,(now() at time zone 'Asia/Kolkata')::date,'early',now()-interval '1 hour')",[org,member]);
});
after(()=>db.close());
test('simple manual creation stores client and date; rejects invented Jira labels and cross-employee edits',async()=>{
 await role('service_role');await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([{id:'simple-client',key:'OCT-99999',project_key:'OCT',summary:'Client label fixture',status_id:'1',status_name:'To Do',assignee_id:'jira-worker',jira_updated:new Date().toISOString(),labels:['NTT_Textiles']}])]);
 await role('authenticated');
 await assert.rejects(db.query("select public.work_manual_save($1,'Test','Invented_Label','jira_label','2026-10-08')",[org]),/Select an available Jira client label/);
 const id=(await db.query<{work_manual_save:string}>("select public.work_manual_save($1,'Reel editing','New Client','other','2026-10-08')",[org])).rows[0].work_manual_save;
 const row=(await db.query<{source:string;manual_client_name:string;work_date:string;jira_key:null;updated_at:string}>('select source,manual_client_name,work_date::text,jira_key,updated_at::text from public.time_tasks where id=$1',[id])).rows[0];
 assert.equal(row.source,'manual');assert.equal(row.manual_client_name,'New Client');assert.equal(row.work_date,'2026-10-08');assert.equal(row.jira_key,null);
 const labelled=(await db.query<{work_manual_save:string}>("select public.work_manual_save($1,'Poster design','NTT_Textiles','jira_label','2026-10-08')",[org])).rows[0].work_manual_save;
 assert.equal((await db.query<{manual_client_name:string}>('select manual_client_name from public.time_tasks where id=$1',[labelled])).rows[0].manual_client_name,'NTT_Textiles');
 await role('authenticated',owner);await db.query("select public.work_manual_save($1,'Updated work','New Client','other','2026-10-09',$2,$3)",[org,id,row.updated_at]);
 await role('authenticated',other);await assert.rejects(db.query("select public.work_manual_save($1,'Wrong edit','Other','other','2026-10-09',$2,$3)",[org,id,row.updated_at]));
 await role('authenticated');assert.equal((await db.query('select * from public.task_work_sessions where task_id=$1',[id])).rows.length,0);
});
test('flexible clock-in uses server time without assigned shifts and retains duplicate and access checks',async()=>{
 await role('authenticated',owner);
 const self=(await db.query<{id:string}>('select id from public.memberships where user_id=$1',[owner])).rows[0].id;
 assert.equal((await db.query('select * from public.time_shifts where membership_id=$1',[self])).rows.length,0);
 await db.query('select public.time_owner_setup($1,$2,null,false)',[org,self]);
 assert.equal((await db.query('select * from public.time_shifts where membership_id=$1',[self])).rows.length,0);
 await assert.rejects(db.query('select public.time_owner_setup($1,$2,null,true)',[org,self]),/Cannot increase own permissions/);
 const before=Date.now();await db.query("select public.time_event($1,'clock_in',null)",[org]);
 const row=(await db.query<{shift:string;clock_in:Date;clock_out:Date|null}>('select shift,clock_in,clock_out from public.time_attendance where membership_id=$1',[self])).rows[0];
 assert.equal(row.shift,'flexible');assert.equal(row.clock_out,null);assert(Math.abs(new Date(row.clock_in).getTime()-before)<10000);
 await assert.rejects(db.query("select public.time_event($1,'clock_in',null)",[org]),/Already clocked in/);
 await db.query("select public.time_event($1,'break_start',null)",[org]);
 await db.query("select public.time_event($1,'break_end',null)",[org]);
 await db.query("select public.time_event($1,'clock_out',null)",[org]);
 await role('authenticated');assert.equal((await db.query('select * from public.time_attendance where membership_id=$1',[self])).rows.length,0);
});
test('metadata import preserves exact labels, rejects stale copies and creates no timer sessions',async()=>{
 await role('service_role');
 const issue={id:'metadata',key:'SOURCE-99',project_key:'SOURCE',summary:'Metadata test',status_id:'2',status_name:'Design Hold',assignee_id:'jira-worker',jira_updated:'2026-10-07T08:00:00Z',labels:['Client_Name'],components:['Design'],priority_name:'Highest'};
 const count=(await db.query('select * from public.task_work_sessions')).rows.length;
 await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([issue])]);
 await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([{...issue,labels:['Changed_Client'],jira_updated:'2026-10-07T09:00:00Z'}])]);
 await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([issue])]);
 const saved=(await db.query<{jira_metadata:{labels:string[];priority_name:string}}>("select jira_metadata from public.time_tasks where jira_key='SOURCE-99'")).rows[0].jira_metadata;
 assert.deepEqual(saved.labels,['Changed_Client']);assert.equal(saved.priority_name,'Highest');
 assert.equal((await db.query('select * from public.task_work_sessions')).rows.length,count);
 await role('authenticated');
 assert.equal((await db.query("select * from public.time_tasks where jira_key='SOURCE-99'")).rows.length,1);
 await assert.rejects(db.query('select public.work_import($1,$2,$3)',[org,worker,'[]']));
 await assert.rejects(db.query('select public.work_import_core($1,$2,$3)',[org,worker,'[]']));
});
test('employees create own manual tasks; cannot assign another person or edit unassigned history',async()=>{
 await role('authenticated');
 task=(await db.query<{work_task_save:string}>("select public.work_task_save($1,$2,'Manual task','Description',null,null,'high',null,3600,'Design',null,null)",[org,member])).rows[0].work_task_save;
 second=(await db.query<{work_task_save:string}>("select public.work_task_save($1,$2,'Second task','',null,null,'medium',null,null,'General',null,null)",[org,member])).rows[0].work_task_save;
 await assert.rejects(db.query("select public.work_task_save($1,$2,'Other task','',null,null,'medium',null,null,'General',null,null)",[org,'40000000-0000-4000-8000-000000000099']));
 await role('authenticated',other);await assert.rejects(db.query("select public.work_event($1,'start',$2,false)",[org,task]));
});
test('single running timer requires an explicit switch; hold preserves completed segment seconds',async()=>{
 await role('authenticated');log=(await db.query<{work_event:string}>("select public.work_event($1,'start',$2,false)",[org,task])).rows[0].work_event;
 await db.exec('reset role');await db.query("update public.task_work_sessions set started_at=started_at-interval '5 minutes' where log_id=$1",[log]);
 await role('authenticated');await assert.rejects(db.query("select public.work_event($1,'start',$2,false)",[org,second]),/You already have an active task/);
 await db.query("select public.work_event($1,'start',$2,true,$3)",[org,second,task]);
 const held=(await db.query<{duration_seconds:number;status:string}>('select duration_seconds::int,status from public.task_work_sessions where log_id=$1',[log])).rows[0];assert.ok(held.duration_seconds>=300);assert.equal(held.status,'paused');
 assert.equal((await db.query("select * from public.time_logs where state='running'")).rows.length,1);
 await db.query("select public.work_event($1,'hold',$2,false)",[org,second]);await db.query("select public.work_event($1,'resume',$2,false)",[org,task]);await db.query("select public.work_event($1,'end',$2,false)",[org,task]);assert.ok((await db.query<{stopped_at:string}>('select stopped_at from public.time_logs where id=$1',[log])).rows[0].stopped_at);
 assert.equal((await db.query<{work_status:string}>('select work_status from public.time_tasks where id=$1',[task])).rows[0].work_status,'completed');
 assert.equal((await db.query('select * from public.task_work_sessions where log_id=$1',[log])).rows.length,2);
});
test('Jira import is canonical and idempotent; status refresh never invents session timestamps',async()=>{
 const issue={id:'1001',key:'OCT-1',project_key:'OCT',summary:'Jira task',description_text:'Imported',status_id:'2',status_name:'In progress',assignee_id:'jira-worker',jira_updated:'2026-10-06T08:00:00Z',status_category:'indeterminate'};
 await role('service_role');await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([issue])]);await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([issue])]);
 assert.equal((await db.query("select * from public.time_tasks where jira_key='OCT-1'")).rows.length,1);
 const before=(await db.query('select * from public.task_work_sessions')).rows.length;
 await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([{...issue,status_name:'Done',status_category:'done',jira_updated:'2026-10-06T09:00:00Z'}])]);
 assert.equal((await db.query('select * from public.task_work_sessions')).rows.length,before);
 await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([issue])]);
 assert.equal((await db.query<{jira_status:string}>("select jira_status from public.time_tasks where jira_key='OCT-1'")).rows[0].jira_status,'Done');
});
test('closed session corrections require another approver and preserve original, new and reason',async()=>{
 await role('authenticated');const s=(await db.query<{id:string;started_at:Date;ended_at:Date}>('select id,started_at,ended_at from public.task_work_sessions where log_id=$1 order by started_at limit 1',[log])).rows[0];
 await db.query("select public.work_correction_request($1,$2,$3,$4,'Correct missing minute')",[org,s.id,new Date(s.started_at.getTime()+1000),s.ended_at]);
 const request=(await db.query<{id:string}>("select id from public.time_corrections where kind='work_session'")).rows[0].id;
 await assert.rejects(db.query('select public.time_correction_review($1,$2,true)',[org,request]));
 await role('authenticated',owner);await db.query('select public.time_correction_review($1,$2,true)',[org,request]);
 const audit=(await db.query<{old_value:unknown;new_value:{reason:string};actor_id:string}>("select old_value,new_value,actor_id from public.audit_logs where action='work_session_corrected'")).rows[0];assert.ok(audit.old_value);assert.equal(audit.new_value.reason,'Correct missing minute');assert.equal(audit.actor_id,owner);
 await assert.rejects(db.query('select public.time_correction_review($1,$2,true)',[org,request]));
});
test('server webhook imports metadata with no impersonated actor and no timer activity',async()=>{
 await role('service_role');const count=(await db.query('select * from public.task_work_sessions')).rows.length;
 await db.query('select public.work_import($1,null,$2,true)',[org,JSON.stringify([{id:'1002',key:'SEP-2',project_key:'SEP',summary:'Signed webhook metadata',status_id:'3',status_name:'To Do',assignee_id:null,jira_updated:'2026-10-06T10:00:00Z',status_category:'new',task_type:'Task',due_date:'2026-10-07'}])]);
 assert.equal((await db.query('select * from public.task_work_sessions')).rows.length,count);
 const t=(await db.query<{task_type:string;due_at:Date;membership_id:string|null}>("select task_type,due_at,membership_id from public.time_tasks where jira_key='SEP-2'")).rows[0];assert.equal(t.task_type,'Task');assert.equal(t.membership_id,null);assert.equal(t.due_at.toISOString(),'2026-10-07T18:29:59.000Z');
 await role('authenticated');await assert.rejects(db.query('select public.work_import($1,null,$2,true)',[org,'[]']));
});


test('clock-out captures a held timer stop using server time without extending recorded work through its held gap',async()=>{
 // Declared after the fixture is prepared; this test creates independent work and closes its attendance.
 await role('authenticated');
 const id=(await db.query<{work_task_save:string}>("select public.work_task_save($1,$2,'Clock-out capture','',null,null,'medium',null,null,'General',null,null)",[org,member])).rows[0].work_task_save;
 const timer=(await db.query<{work_event:string}>("select public.work_event($1,'start',$2,false)",[org,id])).rows[0].work_event;
 await db.exec('reset role');await db.query("update public.task_work_sessions set started_at=started_at-interval '5 minutes' where log_id=$1",[timer]);await role('authenticated');await db.query("select public.work_event($1,'hold',$2,false)",[org,id]);
 const before=(await db.query<{seconds:number}>('select sum(duration_seconds)::int seconds from public.task_work_sessions where log_id=$1',[timer])).rows[0].seconds;
 await db.query("select public.time_event($1,'clock_out')",[org]);
 const capture=(await db.query<{same:boolean;seconds:number}>("select l.stopped_at=a.clock_out same,(select sum(duration_seconds)::int from public.task_work_sessions where log_id=l.id) seconds from public.time_logs l join public.time_attendance a on a.membership_id=l.membership_id where l.id=$1",[timer])).rows[0];assert.equal(capture.same,true);assert.equal(capture.seconds,before);
 // Reopen only the isolated fixture so subsequent tests retain their original precondition.
 await db.exec('reset role');await db.query('update public.time_attendance set clock_out=null where membership_id=$1',[member]);
});

test('break resumes only its running task, excludes break gaps and never resumes a pre-held task',async()=>{
 await role('authenticated');
 const id=(await db.query<{work_manual_save:string}>("select public.work_manual_save($1,'Break task','Test','other','2026-10-08')",[org])).rows[0].work_manual_save;
 const timer=(await db.query<{work_event:string}>("select public.work_event($1,'start',$2,false)",[org,id])).rows[0].work_event;
 await db.exec('reset role');await db.query("update public.task_work_sessions set started_at=started_at-interval '5 minutes' where log_id=$1",[timer]);
 await role('authenticated');await db.query("select public.time_event($1,'break_start')",[org]);
 assert.equal((await db.query<{state:string}>('select state from public.time_logs where id=$1',[timer])).rows[0].state,'paused');
 const br=(await db.query<{id:string;paused_log_id:string}>('select id,paused_log_id from public.time_breaks where membership_id=$1 and end_at is null',[member])).rows[0];assert.equal(br.paused_log_id,timer);
 await assert.rejects(db.query("select public.time_event($1,'break_start')",[org]),/Break already started/);
 await db.exec('reset role');await db.query("update public.time_breaks set start_at=start_at-interval '10 minutes' where id=$1",[br.id]);await role('authenticated');
 await db.query("select public.time_event($1,'break_end')",[org]);
 assert.equal((await db.query<{state:string}>('select state from public.time_logs where id=$1',[timer])).rows[0].state,'running');
 assert.equal((await db.query('select * from public.task_work_sessions where log_id=$1',[timer])).rows.length,2);
 const seconds=(await db.query<{seconds:number}>('select sum(duration_seconds)::int seconds from public.task_work_sessions where log_id=$1 and ended_at is not null',[timer])).rows[0].seconds;assert(seconds>=300&&seconds<310);
 await assert.rejects(db.query("select public.time_event($1,'break_end')",[org]),/No active break/);
 await db.query("select public.work_event($1,'hold',$2,false)",[org,id]);
 await db.query("select public.time_event($1,'break_start')",[org]);await db.query("select public.time_event($1,'break_end')",[org]);
 assert.equal((await db.query<{state:string}>('select state from public.time_logs where id=$1',[timer])).rows[0].state,'paused');
 await db.query("select public.work_event($1,'end',$2,false)",[org,id]);
});
test('Jira break resume requires server verification; duplicate end and stopped logs cannot restart',async()=>{
 await role('service_role');await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([{id:'break-jira',key:'OCT-88888',project_key:'OCT',summary:'Jira break',status_id:'1',status_name:'To Do',assignee_id:'jira-worker',jira_updated:new Date().toISOString()}])]);
 const id=(await db.query<{id:string}>("select id from public.time_tasks where jira_key='OCT-88888'")).rows[0].id;
 const timer=(await db.query<{work_jira_event:string}>("select public.work_jira_event($1,$2,'start',$3,'jira-worker',false,null)",[org,worker,id])).rows[0].work_jira_event;
 await role('authenticated');await db.query("select public.time_event($1,'break_start')",[org]);
 const br=(await db.query<{id:string}>('select id from public.time_breaks where membership_id=$1 and end_at is null',[member])).rows[0].id;
 await assert.rejects(db.query('select public.work_break_end($1,$2,$3,$4)',[org,worker,br,timer]),/permission denied/);
 await role('service_role');assert.equal((await db.query<{work_break_end:boolean}>('select public.work_break_end($1,$2,$3,$4)',[org,worker,br,timer])).rows[0].work_break_end,true);
 await assert.rejects(db.query('select public.work_break_end($1,$2,$3,$4)',[org,worker,br,timer]),/No active break/);
 await role('authenticated');await db.query("select public.time_event($1,'break_start')",[org]);await db.query("select public.time_event($1,'break_end')",[org]);
 assert.equal((await db.query<{state:string}>('select state from public.time_logs where id=$1',[timer])).rows[0].state,'paused');
 await db.query("select public.work_event($1,'end',$2,false)",[org,id]);
 await db.query("select public.time_event($1,'break_start')",[org]);await db.query("select public.time_event($1,'clock_out')",[org]);
 await assert.rejects(db.query("select public.time_event($1,'break_end')",[org]),/Clock in first/);
 assert.equal((await db.query<{state:string}>('select state from public.time_logs where id=$1',[timer])).rows[0].state,'stopped');
});
test('completed manual Start creates a fresh log, retains old time and enforces assignment, attendance and cancellation guards',async()=>{
 await db.exec('reset role');await db.query("update public.time_attendance set clock_in=now(),clock_out=null where organization_id=$1 and membership_id=$2 and work_date=(now() at time zone 'Asia/Kolkata')::date",[org,member]);
 await role('authenticated');
 const id=(await db.query<{work_manual_save:string}>("select public.work_manual_save($1,'Restart work','Internal','other','2026-10-08')",[org])).rows[0].work_manual_save;
 const first=(await db.query<{work_event:string}>("select public.work_event($1,'start',$2,false)",[org,id])).rows[0].work_event;
 await db.exec('reset role');await db.query("update public.task_work_sessions set started_at=started_at-interval '3 minutes' where log_id=$1",[first]);await role('authenticated');
 await db.query("select public.work_event($1,'end',$2,false)",[org,id]);
 const original=(await db.query('select * from public.task_work_sessions where log_id=$1',[first])).rows;
 await role('authenticated',other);await assert.rejects(db.query("select public.work_event($1,'start',$2,false)",[org,id]),/Active employee|Assigned task/);
 await role('authenticated');await assert.rejects(db.query("select public.work_event($1,'resume',$2,false)",[org,id]),/Task is closed/);
 const next=(await db.query<{work_event:string}>("select public.work_event($1,'start',$2,false)",[org,id])).rows[0].work_event;
 assert.notEqual(next,first);assert.deepEqual((await db.query('select * from public.task_work_sessions where log_id=$1',[first])).rows,original);
 assert.deepEqual((await db.query('select work_status,completed_at from public.time_tasks where id=$1',[id])).rows[0],{work_status:'in_progress',completed_at:null});
 await assert.rejects(db.query("select public.work_event($1,'start',$2,false)",[org,id]),/active task/);
 await db.query("select public.work_event($1,'end',$2,false)",[org,id]);
 await db.query("select public.time_event($1,'break_start')",[org]);await assert.rejects(db.query("select public.work_event($1,'start',$2,false)",[org,id]),/End break/);await db.query("select public.time_event($1,'break_end')",[org]);
 await db.exec('reset role');await db.query("update public.time_tasks set work_status='cancelled' where id=$1",[id]);await role('authenticated');await assert.rejects(db.query("select public.work_event($1,'start',$2,false)",[org,id]),/Task is closed/);
});

test('an ended Jira task that Jira still shows open is re-opened for Start; old sessions stay untouched',async()=>{
 await role('service_role');await db.query('select public.work_import($1,$2,$3)',[org,owner,JSON.stringify([{id:'restart-jira',key:'OCT-77777',project_key:'OCT',summary:'Jira restart',status_id:'7',status_name:'Design In Progress',status_category:'indeterminate',assignee_id:'jira-worker',jira_updated:new Date().toISOString()}])]);
 const id=(await db.query<{id:string}>("select id from public.time_tasks where jira_key='OCT-77777'")).rows[0].id;
 await db.query("update public.time_attendance set clock_in=now(),clock_out=null where organization_id=$1 and membership_id=$2 and work_date=(now() at time zone 'Asia/Kolkata')::date",[org,member]);
 const first=(await db.query<{work_jira_event:string}>("select public.work_jira_event($1,$2,'start',$3,'jira-worker',false,null)",[org,worker,id])).rows[0].work_jira_event;
 await role('authenticated');await db.query("select public.work_event($1,'end',$2,false)",[org,id]);
 const original=(await db.query('select * from public.task_work_sessions where log_id=$1',[first])).rows;
 assert.equal((await db.query<{work_status:string}>('select work_status from public.time_tasks where id=$1',[id])).rows[0].work_status,'completed');
 await role('service_role');
 await assert.rejects(db.query("select public.work_jira_event($1,$2,'start',$3,'jira-worker',false,null)",[org,worker,id]),/Task is closed/);
 // The same guarded update reopenEndedJiraTask runs when the live Jira status is still open.
 await db.query("update public.time_tasks set work_status='pending',completed_at=null,updated_at=now() where id=$1 and organization_id=$2 and membership_id=$3 and source='jira' and work_status='completed'",[id,org,member]);
 const next=(await db.query<{work_jira_event:string}>("select public.work_jira_event($1,$2,'start',$3,'jira-worker',false,null)",[org,worker,id])).rows[0].work_jira_event;
 assert.notEqual(next,first);assert.deepEqual((await db.query('select * from public.task_work_sessions where log_id=$1',[first])).rows,original);
 assert.deepEqual((await db.query('select work_status,completed_at from public.time_tasks where id=$1',[id])).rows[0],{work_status:'in_progress',completed_at:null});
});
test('only Owner may persist automatic fetch; employees read the organization flag and changes are audited',async()=>{
 await role('authenticated',owner);
 await db.query('select public.jira_auto_fetch_save($1,false)',[org]);
 assert.equal((await db.query<{auto_fetch:boolean}>('select auto_fetch from public.jira_sync_settings where organization_id=$1',[org])).rows[0].auto_fetch,false);
 await role('authenticated');
 assert.equal((await db.query<{auto_fetch:boolean}>('select auto_fetch from public.jira_sync_settings where organization_id=$1',[org])).rows[0].auto_fetch,false);
 await assert.rejects(db.query('select public.jira_auto_fetch_save($1,true)',[org]),/Owner required/);
 await assert.rejects(db.query('update public.jira_sync_settings set auto_fetch=true where organization_id=$1',[org]));
 await role('authenticated',owner);
 await assert.rejects(db.query('select public.jira_auto_fetch_save($1,true)',['99999999-0000-4000-8000-000000000001']),/Owner required/);
 await db.query('select public.jira_auto_fetch_save($1,true)',[org]);
 assert.equal((await db.query<{auto_fetch:boolean}>('select auto_fetch from public.jira_sync_settings where organization_id=$1',[org])).rows[0].auto_fetch,true);
 assert.equal((await db.query("select * from public.audit_logs where action='jira_auto_fetch_changed'")).rows.length,2);
});

test('date-only continue request requires another approver, is single-use and excludes off-clock gaps',async()=>{
 await role('service_role');
 await db.query("update public.time_attendance set clock_in=now()-interval '1 hour',clock_out=now()-interval '10 minutes',updated_at=now() where membership_id=$1 and work_date=(now() at time zone 'Asia/Kolkata')::date",[member]);
 await role('authenticated');
 await assert.rejects(db.query("select public.time_event($1,'clock_in',null)",[org]),/Approved continue request required/);
 await db.query("select public.time_continue_request($1,(now() at time zone 'Asia/Kolkata')::date)",[org]);
 await assert.rejects(db.query("select public.time_continue_request($1,(now() at time zone 'Asia/Kolkata')::date)",[org]));
 const request=(await db.query<{id:string}>("select id from public.time_corrections where kind='continue_work' and state='pending'")).rows[0].id;
 await role('authenticated',owner);await db.query('select public.time_owner_setup($1,$2,null,true)',[org,member]);
 await role('authenticated');await assert.rejects(db.query('select public.time_correction_review($1,$2,true)',[org,request]),/Cannot approve own request/);
 await assert.rejects(db.query('select public.time_correction_review_before_continue($1,$2,true)',[org,request]));
 await role('authenticated',owner);await db.query('select public.time_correction_review($1,$2,true)',[org,request]);
 assert.ok((await db.query<{clock_out:string|null}>("select clock_out from public.time_attendance where membership_id=$1 and work_date=(now() at time zone 'Asia/Kolkata')::date",[member])).rows[0].clock_out);
 await role('authenticated');await db.query("select public.time_event($1,'clock_in',null)",[org]);
 assert.equal((await db.query<{clock_out:string|null}>("select clock_out from public.time_attendance where membership_id=$1 and work_date=(now() at time zone 'Asia/Kolkata')::date",[member])).rows[0].clock_out,null);
 assert.equal((await db.query('select excluded_from_attendance from public.time_breaks where membership_id=$1 and excluded_from_attendance',[member])).rows.length,1);
 assert.ok((await db.query<{consumed_at:string|null}>('select consumed_at from public.time_corrections where id=$1',[request])).rows[0].consumed_at);
 await db.query("select public.time_event($1,'clock_out',null)",[org]);
 await assert.rejects(db.query("select public.time_event($1,'clock_in',null)",[org]),/Approved continue request required/);
});
test('announcements allow Owner publication, employee reads and personal read receipts only',async()=>{
 await role('authenticated');await assert.rejects(db.query("select public.announcement_publish($1,'Notice','Team notice')",[org]));
 await role('authenticated',owner);await db.query("select public.announcement_publish($1,'Notice','Team notice')",[org]);
 const id=(await db.query<{id:string}>('select id from public.announcements')).rows[0].id;
 await role('authenticated');assert.equal((await db.query('select title from public.announcements')).rows.length,1);
 await assert.rejects(db.query("insert into public.announcements(organization_id,title,message,created_by) values($1,'Bad','Bad',$2)",[org,worker]));
 await db.query('select public.announcement_read($1,$2)',[org,id]);await db.query('select public.announcement_read($1,$2)',[org,id]);
 assert.equal((await db.query('select * from public.announcement_reads')).rows.length,1);
 await role('authenticated',other);assert.equal((await db.query('select * from public.announcements')).rows.length,0);
 await assert.rejects(db.query('select public.announcement_read($1,$2)',[org,id]));
 await role('authenticated',owner);assert.equal((await db.query('select * from public.announcement_reads')).rows.length,0);
});
