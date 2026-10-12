import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// The faster work_task_read policy must show every person exactly the tasks the old policy showed.
const ids={owner:'50000000-0000-4000-8000-000000000001',worker:'50000000-0000-4000-8000-000000000002',manager:'50000000-0000-4000-8000-000000000003',peer:'50000000-0000-4000-8000-000000000004',outsider:'50000000-0000-4000-8000-000000000005',ghost:'50000000-0000-4000-8000-000000000006'};
const earlier=['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060006_jira.sql','202610060007_jira_table_grants.sql','202610060009_time_management.sql','202610060010_jira_time.sql','202610060011_unified_work.sql','202610070012_jira_metadata.sql','202610080015_work_stop_capture.sql','202610080016_flexible_attendance.sql','202610080017_simple_manual_tasks.sql','202610080018_break_task_resume.sql','202610080019_manual_task_restart.sql','202610080020_jira_auto_fetch.sql','202610090021_announcements_continue_work.sql'];
const sql=(file:string)=>readFileSync(`supabase/migrations/${file}`,'utf8');

test('the optimised task read policy shows exactly what the old one showed, for every kind of person',{timeout:180000},async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select '{"aal":"aal2"}'::jsonb$$;`);
    for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users values($1,$2)',[id,`${name}@example.com`]);
    for(const file of earlier)await db.exec(sql(file));
    const org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[ids.owner,'Policy test','Owner'])).rows[0].bootstrap_owner;
    const member:Record<string,string>={};
    for(const name of ['worker','manager','peer','ghost']){
      await db.query('insert into public.profiles values($1,$2,now())',[ids[name as keyof typeof ids],name]);
      member[name]=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,$3,'employee') returning id",[org,ids[name as keyof typeof ids],`${name}@example.com`])).rows[0].id;
      await db.query("insert into public.membership_roles values($1,'employee')",[member[name]]);
    }
    await db.query('insert into public.time_managers(organization_id,membership_id) values($1,$2)',[org,member.manager]);
    await db.query('update public.memberships set active=false where id=$1',[member.ghost]);
    const task:Record<string,string>={};
    for(const [name,owner] of [['own-worker',member.worker],['own-manager',member.manager],['own-peer',member.peer],['unassigned',null],['own-ghost',member.ghost]] as const){
      task[name]=(await db.query<{id:string}>('insert into public.time_tasks(organization_id,membership_id,title) values($1,$2,$3) returning id',[org,owner,name])).rows[0].id;
    }
    // A peer who logged time on someone else's task can still see it.
    await db.query("insert into public.time_logs(organization_id,membership_id,task_id,state) values($1,$2,$3,'stopped')",[org,member.peer,task['own-worker']]);

    const visible=async(user:string)=>{
      await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
      const rows=(await db.query<{title:string}>('select title from public.time_tasks order by title')).rows.map(r=>r.title);
      await db.exec('reset role');return rows;
    };
    const people=Object.entries(ids);
    const before:Record<string,string[]>={};
    for(const [name,id] of people)before[name]=await visible(id);
    // Sanity: the old policy behaves as documented, so the comparison below means something.
    assert.deepEqual(before.worker,['own-worker']);
    assert.deepEqual(before.peer,['own-peer','own-worker']);
    assert.equal(before.manager.length,5);assert.equal(before.owner.length,5);
    assert.deepEqual(before.outsider,[]);assert.deepEqual(before.ghost,[]);

    await db.exec(sql('202610120031_task_read_policy_speed.sql'));
    const after:Record<string,string[]>={};
    for(const [name,id] of people)after[name]=await visible(id);
    assert.deepEqual(after,before);
    // No signed-in user means no rows.
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role authenticated');
    assert.equal((await db.query('select 1 from public.time_tasks')).rows.length,0);
  }finally{await db.close();}
});
