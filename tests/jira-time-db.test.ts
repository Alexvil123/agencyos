import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='40000000-0000-4000-8000-000000000001',worker='40000000-0000-4000-8000-000000000002',other='40000000-0000-4000-8000-000000000003';
let org:string,member:string,task:string,log:string;
async function role(name:string,user=worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`);}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[other,'other@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060006_jira.sql','202610060007_jira_table_grants.sql','202610060009_time_management.sql','202610060010_jira_time.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Jira time tests','Owner'])).rows[0].bootstrap_owner;
 await db.query('insert into public.profiles values($1,$2,now())',[worker,'Worker']);
 member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,'worker@example.com','employee') returning id",[org,worker])).rows[0].id;
 await db.query("insert into public.membership_roles values($1,'employee')",[member]);
 await db.query('insert into public.jira_account_links values($1,$2,$3)',[org,member,'jira-worker']);
 await db.query("insert into public.time_attendance(organization_id,membership_id,work_date,shift,clock_in) values($1,$2,(now() at time zone 'Asia/Kolkata')::date,'early',now()-interval '1 hour')",[org,member]);
});
after(()=>db.close());
test('Jira enrollment is service-only, requires an active linked assignee, and preserves actor audit',async()=>{
 await role('authenticated');await assert.rejects(db.query("select public.time_jira_begin($1,$2,'OCT-1','jira-worker','Task','timer_start')",[org,worker]));
 await role('service_role');await assert.rejects(db.query("select public.time_jira_begin($1,$2,'OCT-1','different-assignee','Task','timer_start')",[org,worker]));
 await assert.rejects(db.query("select public.time_jira_begin($1,$2,'OCT-1','jira-worker','Task','timer_start')",[org,other]));
 task=(await db.query<{time_jira_begin:string}>("select public.time_jira_begin($1,$2,'OCT-1','jira-worker','Task','timer_start')",[org,worker])).rows[0].time_jira_begin;
 log=(await db.query<{id:string}>('select id from public.time_logs')).rows[0].id;
 assert.equal((await db.query<{actor_id:string}>("select actor_id from public.audit_logs where entity_type='time_logs' order by created_at desc limit 1")).rows[0].actor_id,worker);
 await assert.rejects(db.query("select public.time_jira_begin($1,$2,'OCT-2','jira-worker','Second','timer_start')",[org,worker]));
 assert.equal((await db.query('select * from public.time_tasks')).rows.length,1);
});
test('direct Jira resume cannot bypass live verification; breaks pause and exclude task time',async()=>{
 await role('authenticated');await db.query("select public.time_event($1,'break_start',null)",[org]);
 await assert.rejects(db.query("select public.time_event($1,'timer_resume',null)",[org]));
 await role('service_role');await assert.rejects(db.query("select public.time_jira_begin($1,$2,'OCT-1','jira-worker','Task','timer_resume')",[org,worker]));
 await role('authenticated');await db.query("select public.time_event($1,'break_end',null)",[org]);
 await role('service_role');await db.query("select public.time_jira_begin($1,$2,'OCT-1','jira-worker','Renamed task','timer_resume')",[org,worker]);
 assert.equal((await db.query<{title:string}>('select title from public.time_tasks where id=$1',[task])).rows[0].title,'Renamed task');
});
test('End task closes time once, preserves pending status, and rejects other employees',async()=>{
 await role('authenticated',other);await assert.rejects(db.query('select public.time_jira_end($1,$2)',[org,log]));
 await role('authenticated');await db.query('select public.time_jira_end($1,$2)',[org,log]);
 const first=(await db.query<{end_at:string}>('select end_at from public.time_segments order by start_at desc limit 1')).rows[0].end_at;
 await db.query('select public.time_jira_end($1,$2)',[org,log]);
 assert.deepEqual((await db.query<{end_at:string}>('select end_at from public.time_segments order by start_at desc limit 1')).rows[0].end_at,first);
 assert.equal((await db.query<{jira_sync_state:string}>('select jira_sync_state from public.time_logs')).rows[0].jira_sync_state,'awaiting');
 assert.equal((await db.query('select * from public.time_segments where end_at is null')).rows.length,0);
});
test('status lease rejects concurrent sends and stale results; failed Jira writes do not reopen time',async()=>{
 await role('authenticated');await assert.rejects(db.query("select public.time_jira_status_claim($1,$2,$3,'2','In progress')",[org,worker,log]));
 await role('service_role');const attempt=(await db.query<{time_jira_status_claim:string}>("select public.time_jira_status_claim($1,$2,$3,'2','In progress')",[org,worker,log])).rows[0].time_jira_status_claim;
 await assert.rejects(db.query("select public.time_jira_status_claim($1,$2,$3,'2','In progress')",[org,worker,log]));
 await db.query("select public.time_jira_status_result($1,$2,$3,$4,'failed')",[org,worker,log,attempt]);
 const retry=(await db.query<{time_jira_status_claim:string}>("select public.time_jira_status_claim($1,$2,$3,'2','In progress')",[org,worker,log])).rows[0].time_jira_status_claim;
 await assert.rejects(db.query("select public.time_jira_status_result($1,$2,$3,$4,'synced')",[org,worker,log,attempt]));
 await db.query("select public.time_jira_status_result($1,$2,$3,$4,'synced')",[org,worker,log,retry]);
 const result=(await db.query<{state:string;jira_sync_state:string}>('select state,jira_sync_state from public.time_logs')).rows[0];assert.deepEqual(result,{state:'stopped',jira_sync_state:'synced'});
 await role('authenticated');await assert.rejects(db.query("select public.time_event($1,'timer_start',$2)",[org,task]));
});
