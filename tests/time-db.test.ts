import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='30000000-0000-4000-8000-000000000001',worker='30000000-0000-4000-8000-000000000002',manager='30000000-0000-4000-8000-000000000003',outsider='30000000-0000-4000-8000-000000000004';
let org:string,employee:string,managerMember:string,other:string,task:string,attendance:string;
async function signed(user:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[manager,'manager@example.com'],[outsider,'other@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060009_time_management.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Time agency','Owner'])).rows[0].bootstrap_owner;
 for(const [id,email,name] of [[worker,'worker@example.com','Worker'],[manager,'manager@example.com','Manager'],[outsider,'other@example.com','Other']]){
 await db.query('insert into public.profiles values($1,$2,now())',[id,name]);
 const member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,$3,'employee') returning id",[org,id,email])).rows[0].id;
 await db.query("insert into public.membership_roles values($1,'employee')",[member]);if(id===worker)employee=member;if(id===manager)managerMember=member;if(id===outsider)other=member;
 }
});
after(async()=>db.close());
test('only Owner assigns shifts and grants all-team time management; direct writes and truncate denied',async()=>{
 await signed(worker);await assert.rejects(db.query("select public.time_owner_setup($1,$2,'early',true)",[org,employee]));
 await assert.rejects(db.query('truncate public.time_attendance'));await assert.rejects(db.query('insert into public.time_managers values($1,$2)',[org,employee]));
 await signed(owner);await db.query("select public.time_owner_setup($1,$2,'early',false)",[org,employee]);await db.query("select public.time_owner_setup($1,$2,'late',true)",[org,managerMember]);
 await db.query('select public.time_task_save($1,$2,$3,null,null)',[org,employee,'Test assignment']);
 task=(await db.query<{id:string}>('select id from public.time_tasks')).rows[0].id;
});
test('server clocks require a shift, reject duplicate attendance and restrict task assignment',async()=>{
 await signed(outsider);await assert.rejects(db.query("select public.time_event($1,'clock_in',null)",[org]));
 await signed(worker);await db.query("select public.time_event($1,'clock_in',null)",[org]);
 attendance=(await db.query<{id:string}>('select id from public.time_attendance')).rows[0].id;
 await assert.rejects(db.query("select public.time_event($1,'clock_in',null)",[org]));
 await db.query("select public.time_event($1,'timer_start',$2)",[org,task]);
 await assert.rejects(db.query("select public.time_event($1,'timer_start',$2)",[org,task]));
 await assert.rejects(db.query('select public.time_task_complete($1,$2)',[org,task]));
});
test('break pauses the task; resume on break denied; clock out closes active segments',async()=>{
 await signed(worker);await db.query("select public.time_event($1,'break_start',null)",[org]);
 assert.equal((await db.query<{state:string}>('select state from public.time_logs')).rows[0].state,'paused');
 await assert.rejects(db.query("select public.time_event($1,'timer_resume',null)",[org]));
 await db.query("select public.time_event($1,'break_end',null)",[org]);await db.query("select public.time_event($1,'timer_resume',null)",[org]);await db.query("select public.time_event($1,'clock_out',null)",[org]);
 assert.equal((await db.query<{count:number}>('select count(*)::int from public.time_segments where end_at is null')).rows[0].count,0);
 assert.equal((await db.query<{state:string}>('select state from public.time_logs')).rows[0].state,'stopped');
});
test('employees see only their own time; time managers see team data without role grant powers',async()=>{
 await signed(outsider);assert.equal((await db.query('select * from public.time_attendance')).rows.length,0);
 assert.equal((await db.query('select * from public.time_tasks')).rows.length,0);
 await signed(manager);assert.equal((await db.query('select * from public.time_attendance')).rows.length,1);
 await assert.rejects(db.query("select public.time_owner_setup($1,$2,'late',true)",[org,other]));
 assert.equal((await db.query('select * from public.time_people($1)',[org])).rows.length,4);
});
test('manual task entries remain pending, cannot self approve, and cannot overlap approved time',async()=>{
 await signed(worker);
 await db.query("select public.time_correction_request($1,'manual_task',$2,now()-interval '2 hours',now()-interval '1 hour',0,'Missed task timer')",[org,task]);
 const id=(await db.query<{id:string}>('select id from public.time_corrections')).rows[0].id;
 await assert.rejects(db.query('select public.time_correction_review($1,$2,true)',[org,id]));
 await signed(manager);await db.query('select public.time_correction_review($1,$2,true)',[org,id]);
 assert.equal((await db.query<{state:string}>('select state from public.time_corrections where id=$1',[id])).rows[0].state,'approved');
 await assert.rejects(db.query('select public.time_correction_review($1,$2,true)',[org,id]));
 await signed(worker);await db.query("select public.time_correction_request($1,'manual_task',$2,now()-interval '2 hours',now()-interval '1 hour',0,'Duplicate correction')",[org,task]);
 const duplicate=(await db.query<{id:string}>("select id from public.time_corrections where state='pending'")).rows[0].id;
 await signed(manager);await assert.rejects(db.query('select public.time_correction_review($1,$2,true)',[org,duplicate]));
});
test('attendance approval rejects stale corrections and records Owner audit attribution',async()=>{
 await signed(worker);await db.query("select public.time_correction_request($1,'attendance',$2,now()-interval '4 hours',now()-interval '3 hours',600,'Correct missed attendance')",[org,attendance]);
 const id=(await db.query<{id:string}>("select id from public.time_corrections where kind='attendance'")).rows[0].id;
 await db.exec('reset role');await db.query("update public.time_attendance set updated_at=updated_at+interval '1 second' where id=$1",[attendance]);
 await signed(manager);await assert.rejects(db.query('select public.time_correction_review($1,$2,true)',[org,id]));
 await signed(owner);assert.equal((await db.query("select * from public.audit_logs where action='time_access_configured' and actor_id=$1",[owner])).rows.length,2);
});

test('Owner can assign their own shift and clock in without granting time-manager access',async()=>{
 await signed(owner);
 const self=(await db.query<{id:string}>('select id from public.memberships where user_id=$1',[owner])).rows[0].id;
 await assert.rejects(db.query("select public.time_event($1,'clock_in',null)",[org]),/Owner must assign a shift/);
 await db.query("select public.time_owner_setup($1,$2,'late',false)",[org,self]);
 assert.equal((await db.query('select * from public.time_managers where membership_id=$1',[self])).rows.length,0);
 await db.query("select public.time_event($1,'clock_in',null)",[org]);
 const record=(await db.query<{shift:string;clock_out:string|null}>('select shift,clock_out from public.time_attendance where membership_id=$1',[self])).rows[0];
 assert.equal(record.shift,'late');assert.equal(record.clock_out,null);
 await db.query("select public.time_event($1,'clock_out',null)",[org]);
});
