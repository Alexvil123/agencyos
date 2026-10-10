import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {taskQueue,orderedTasks,moveQueuedTask} from '../src/lib/task-order';
const db=new PGlite();
const owner='50000000-0000-4000-8000-000000000001',worker='50000000-0000-4000-8000-000000000002',other='50000000-0000-4000-8000-000000000003';
let org:string,member:string,otherMember:string,task:string,second:string,foreignTask:string;
async function role(user:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[other,'other@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060006_jira.sql','202610060007_jira_table_grants.sql','202610060009_time_management.sql','202610060010_jira_time.sql','202610060011_unified_work.sql','202610070012_jira_metadata.sql','202610100028_work_task_order.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Queue tests','Owner'])).rows[0].bootstrap_owner;
 for(const user of [worker,other]){await db.query('insert into public.profiles values($1,$2,now())',[user,'Worker']);const id=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,$3,'employee') returning id",[org,user,`${user}@example.com`])).rows[0].id;await db.query("insert into public.membership_roles values($1,'employee')",[id]);if(user===worker)member=id;else otherMember=id;}
 async function add(assignee:string,title:string){return (await db.query<{id:string}>('insert into public.time_tasks(organization_id,membership_id,title) values($1,$2,$3) returning id',[org,assignee,title])).rows[0].id;}
 task=await add(member,'First');second=await add(member,'Second');foreignTask=await add(otherMember,'Other employee');
});
after(()=>db.close());
test('queue movement preserves hidden rows and fetched additions without mutating inputs',()=>{
 const queue=['a','hidden','b','c'];assert.deepEqual(moveQueuedTask(queue,'a','b'),['hidden','b','a','c']);assert.deepEqual(moveQueuedTask(queue,'c','a'),['c','a','hidden','b']);assert.deepEqual(queue,['a','hidden','b','c']);assert.deepEqual(taskQueue(['b','a','new'],['deleted','a','b','a']),['a','b','new']);assert.deepEqual(orderedTasks([{id:'b'},{id:'a'}],['a','b']).map(t=>t.id),['a','b']);
});
test('employee persists own order; Owner can replace it; stale edits cannot overwrite',async()=>{
 await role(worker);assert.equal((await db.query<{revision:number}>('select public.work_task_order_save($1,$2,$3,0) revision',[org,member,[second,task]])).rows[0].revision,1);
 await role(owner);assert.equal((await db.query<{revision:number}>('select public.work_task_order_save($1,$2,$3,1) revision',[org,member,[task,second]])).rows[0].revision,2);
 await assert.rejects(db.query('select public.work_task_order_save($1,$2,$3,1)',[org,member,[second,task]]),/Task order changed/);
 const row=(await db.query<{task_ids:string[];revision:number}>('select task_ids,revision from public.work_task_orders where membership_id=$1',[member])).rows[0];assert.deepEqual(row.task_ids,[task,second]);assert.equal(row.revision,2);
 assert.equal((await db.query("select * from public.audit_logs where action='work_task_order_changed'")).rows.length,2);
 assert.equal((await db.query('select * from public.task_work_sessions')).rows.length,0);
});
test('other employees cannot read or change queue; invalid assignments and direct writes fail',async()=>{
 await role(other);assert.equal((await db.query('select * from public.work_task_orders')).rows.length,0);await assert.rejects(db.query('select public.work_task_order_save($1,$2,$3,2)',[org,member,[second,task]]),/Own task order or Owner/);
 await role(worker);await assert.rejects(db.query('update public.work_task_orders set revision=99'),/permission denied/);await assert.rejects(db.query('select public.work_task_order_save($1,$2,$3,2)',[org,member,[foreignTask]]),/Task assignment changed/);await assert.rejects(db.query('select public.work_task_order_save($1,$2,$3,2)',[org,member,[task,task]]),/Invalid task order/);
 assert.equal((await db.query<{revision:number}>('select revision from public.work_task_orders')).rows[0].revision,2);
});
test('missing revisions, inactive employees and unavailable Jira tasks are rejected',async()=>{
 await role(worker);await assert.rejects(db.query('select public.work_task_order_save($1,$2,$3,null)',[org,member,[task,second]]),/Invalid task order/);
 await db.exec('reset role');await db.query("update public.time_tasks set jira_metadata='{"+ '"available":false' +"}'::jsonb where id=$1",[second]);
 await role(worker);await assert.rejects(db.query('select public.work_task_order_save($1,$2,$3,2)',[org,member,[second,task]]),/Task assignment changed/);
 await db.exec('reset role');await db.query('update public.memberships set active=false where id=$1',[member]);
 await role(owner);await assert.rejects(db.query('select public.work_task_order_save($1,$2,$3,2)',[org,member,[task]]),/Active employee required/);
});
