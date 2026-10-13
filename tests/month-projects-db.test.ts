import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {JIRA_KEY,JIRA_PROJECTS,MONTH_PROJECTS,WORK_KEY,acceptedProjects,isMonthProject,projectClause} from '../src/lib/jira-types';

const earlier=['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060006_jira.sql','202610060007_jira_table_grants.sql','202610060009_time_management.sql','202610060010_jira_time.sql','202610060011_unified_work.sql','202610070012_jira_metadata.sql','202610080013_sales_conversion.sql','202610080015_work_stop_capture.sql','202610080016_flexible_attendance.sql','202610080017_simple_manual_tasks.sql','202610080018_break_task_resume.sql','202610080019_manual_task_restart.sql','202610080020_jira_auto_fetch.sql','202610090021_announcements_continue_work.sql'];
const sql=(file:string)=>readFileSync(`supabase/migrations/${file}`,'utf8');

test('the accepted project keys cover every month plus SOURCE, and only those',()=>{
  assert.equal(MONTH_PROJECTS.length,12);assert.deepEqual([...JIRA_PROJECTS],[...MONTH_PROJECTS,'SOURCE']);
  for(const key of ['OCT-1','SEP-250','NOV-3','DEC-99','JAN-10','SOURCE-7'])assert.ok(JIRA_KEY.test(key),key);
  for(const key of ['ZZZ-1','OCT-0','OCT-','oct-1','OCTO-1','NOV-1a','SOURCE'])assert.ok(!JIRA_KEY.test(key),key);
  assert.ok(WORK_KEY.test('NOV-3')&&!WORK_KEY.test('SOURCE-7'));
  assert.ok(isMonthProject('NOV')&&!isMonthProject('SOURCE')&&!isMonthProject('ZZZ'));
});

test('searches name only the projects that exist in Jira, in calendar order, so a new month joins by itself',()=>{
  assert.deepEqual(acceptedProjects(['SOURCE','OCT','OTHER','SEP']),['SEP','OCT','SOURCE']);
  assert.deepEqual(acceptedProjects(['NOV','OCT','SEP','SOURCE','XYZ']),['SEP','OCT','NOV','SOURCE']);
  assert.equal(projectClause(acceptedProjects(['NOV','OCT','SEP','SOURCE'])),'project in (SEP, OCT, NOV, SOURCE)');
  assert.deepEqual(acceptedProjects(['XYZ']),['OCT','SEP','SOURCE'],'never an empty search');
  assert.deepEqual(acceptedProjects([]),['OCT','SEP','SOURCE']);
});

test('the month-projects migration lets a new month in and still rejects unknown projects',{timeout:180000},async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
    const owner='60000000-0000-4000-8000-000000000001';
    await db.query('insert into auth.users values($1,$2)',[owner,'owner@example.com']);
    for(const file of earlier)await db.exec(sql(file));
    const org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Month projects','Owner'])).rows[0].bootstrap_owner;
    let serial=0;
    const importIssue=async(key:string,project:string)=>{
      const id=String(900000+ ++serial);
      try{await db.query('select public.work_import_core($1,$2,$3::jsonb,true)',[org,owner,JSON.stringify([{id,key,project_key:project,summary:'Probe',status_id:'1',status_name:'To Do',assignee_id:null,jira_updated:'2026-11-01T00:00:00Z',status_category:'new'}])]);return 'accepted';}
      catch(error){return (error as Error).message;}
    };
    // Before: only the first three projects the CRM was built for.
    assert.equal(await importIssue('OCT-1','OCT'),'accepted');
    assert.match(await importIssue('NOV-1','NOV'),/Invalid Jira identity/);
    await db.exec(sql('202610130032_month_projects.sql'));
    // After: every month and SOURCE are accepted; anything else is still refused, and so is a key that does not match its project.
    for(const [key,project] of [['NOV-1','NOV'],['DEC-2','DEC'],['JAN-3','JAN'],['OCT-4','OCT'],['SOURCE-5','SOURCE']])assert.equal(await importIssue(key,project),'accepted',key);
    assert.match(await importIssue('ZZZ-1','ZZZ'),/Invalid Jira identity/);
    assert.match(await importIssue('ZZZ-2','NOV'),/Invalid Jira identity/);
    const saved=(await db.query<{jira_key:string;jira_project:string}>("select jira_key,jira_project from public.time_tasks where jira_key in ('NOV-1','DEC-2') order by jira_key")).rows;
    assert.deepEqual(saved,[{jira_key:'DEC-2',jira_project:'DEC'},{jira_key:'NOV-1',jira_project:'NOV'}]);
    // The per-project settings tables accept a month project too.
    const defs=(await db.query<{conname:string;def:string}>("select conname,pg_get_constraintdef(oid) def from pg_constraint where conname in ('work_project_config_jira_project_check','work_workflow_mappings_project_check','jira_issues_project_key_check','time_tasks_jira_key_check','sales_conversion_settings_jira_project_check')")).rows;
    assert.equal(defs.length,5);assert.ok(defs.every(d=>d.def.includes('NOV')),'every project rule includes NOV');
    assert.ok(!defs.find(d=>d.conname==='sales_conversion_settings_jira_project_check')!.def.includes('SOURCE'),'client tasks are never created in SOURCE');
  }finally{await db.close();}
});
