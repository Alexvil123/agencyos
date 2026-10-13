import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='50000000-0000-4000-8000-000000000001',worker='50000000-0000-4000-8000-000000000002',finance='50000000-0000-4000-8000-000000000003';
let org:string;
async function as(user:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
type Row={id:string;number:string;status:string;display_status:string;subtotal:number;tax:number;total:number;paid:number;balance:number;items:unknown[];payments:{id:string;voided_at:string|null}[]};
const overview=async()=>(await db.query<{finance_overview:Row[]}>('select public.finance_overview($1)',[org])).rows[0].finance_overview;
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
  for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[finance,'finance@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
  for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060003_employee_password_login.sql','202610060004_owner_updates.sql','202610060005_owner_email_updates.sql','202610060009_time_management.sql','202610100029_finance.sql','202610140033_module_access.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Finance tests','Owner'])).rows[0].bootstrap_owner;
  for(const [user,name,email,role] of [[worker,'Worker','worker@example.com','employee'],[finance,'Finance','finance@example.com','finance']]){
    await db.query('insert into public.profiles values($1,$2,now())',[user,name]);
    const member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,$3,'employee') returning id",[org,user,email])).rows[0].id;
    await db.query('insert into public.membership_roles values($1,$2)',[member,role]);
  }
});
after(()=>db.close());

const mine=async()=>(await db.query<{module_access_mine:string[]}>('select public.module_access_mine($1)',[org])).rows[0].module_access_mine.sort();
const memberOf=async(user:string)=>(await db.query<{id:string}>('select id from public.memberships where user_id=$1',[user])).rows[0].id;
test('employees have no module access until the Owner grants it; the Owner always has all four',async()=>{
  await as(owner);assert.deepEqual(await mine(),['analytics','calendar','campaigns','finance']);
  await as(worker);assert.deepEqual(await mine(),[]);
  await assert.rejects(overview(),/Finance access required/);
});
test('the Owner grants and withdraws access per module; Finance follows the grant',async()=>{
  await as(owner);const w=await memberOf(worker);
  await db.query("select public.module_access_save($1,'finance',$2)",[org,[w]]);
  await db.query("select public.module_access_save($1,'analytics',$2)",[org,[w]]);
  await as(worker);assert.deepEqual(await mine(),['analytics','finance']);
  assert.ok(Array.isArray(await overview()));
  await as(owner);await db.query("select public.module_access_save($1,'finance',$2)",[org,[]]);
  await as(worker);assert.deepEqual(await mine(),['analytics']);await assert.rejects(overview(),/Finance access required/);
  await as(owner);const rows=(await db.query<{module:string}>('select * from public.module_access_list($1)',[org])).rows;assert.deepEqual(rows.map(r=>r.module),['analytics']);
});
test('only the Owner can change access, only to active employees, and every change is audited',async()=>{
  await as(worker);const w=await memberOf(worker);
  await assert.rejects(db.query("select public.module_access_save($1,'campaigns',$2)",[org,[w]]),/Only the Owner/);
  await assert.rejects(db.query('select * from public.module_access_list($1)',[org]),/Only the Owner/);
  await assert.rejects(db.query('select * from public.module_access'),/permission denied/);
  await as(owner);
  await assert.rejects(db.query("select public.module_access_save($1,'campaigns',$2)",[org,['00000000-0000-4000-8000-000000000000']]),/active employees/);
  await assert.rejects(db.query("select public.module_access_save($1,'payroll',$2)",[org,[w]]),/Unknown module/);
  await db.exec('reset role');
  const n=(await db.query<{n:number}>("select count(*)::int n from public.audit_logs where action='module_access_changed'")).rows[0].n;assert.ok(n>=3);
});
