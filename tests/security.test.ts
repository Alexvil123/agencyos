import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const ids = { owner: '00000000-0000-4000-8000-000000000001', admin: '00000000-0000-4000-8000-000000000002', employee: '00000000-0000-4000-8000-000000000003', manager: '00000000-0000-4000-8000-000000000004', finance: '00000000-0000-4000-8000-000000000005', client: '00000000-0000-4000-8000-000000000006', outsider: '00000000-0000-4000-8000-000000000007', invited: '00000000-0000-4000-8000-000000000008' };
let org: string; let otherOrg: string; const members: Record<string,string> = {};
async function signIn(name: keyof typeof ids) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name]]);
  await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
  await db.exec('set role authenticated');
}
async function denied(query: string, values: unknown[] = []) { await assert.rejects(db.query(query, values)); }
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true)) $$;
    grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
  for (const [name,id] of Object.entries(ids)) await db.query('insert into auth.users values($1,$2)', [id,`${name}@example.com`]);
  await db.exec(readFileSync('supabase/migrations/202610060001_foundation.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/202610060002_password_login_clients.sql','utf8'));
  const boot = await db.query<{ bootstrap_owner: string }>('select public.bootstrap_owner($1,$2,$3)',[ids.owner,'Test agency','Alex']);
  org=boot.rows[0].bootstrap_owner;
  const second = await db.query<{id: string}>('insert into public.organizations(display_name) values($1) returning id',['Other agency']); otherOrg=second.rows[0].id;
  for (const [name,id] of Object.entries(ids)) {
    if (name === 'owner' || name === 'invited') continue;
    await db.query('insert into public.profiles(id,display_name) values($1,$2)',[id,name]);
    await db.query('insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,$3,$4)',[name==='outsider'?otherOrg:org,id,`${name}@example.com`,name==='client'?'client':'employee']);
  }
  const rows=await db.query<{id:string;email:string}>('select id,email from public.memberships');
  for (const row of rows.rows) members[row.email.split('@')[0]]=row.id;
  for (const [name,role] of [['admin','system_admin'],['employee','employee'],['manager','department_manager'],['finance','finance_admin'],['client','client']] ) await db.query('insert into public.membership_roles values($1,$2)',[members[name],role]);
  const employee=await db.query<{id:string}>('insert into public.employees(organization_id,membership_id,display_name,email) values($1,$2,$3,$4) returning id',[org,members.employee,'Employee','employee@example.com']);
  await db.query('insert into public.employee_manager_assignments values($1,$2,$3)',[org,employee.rows[0].id,members.manager]);
  await db.query('insert into public.employees(organization_id,membership_id,display_name,email) values($1,$2,$3,$4)',[otherOrg,members.outsider,'Outsider','outsider@example.com']);
});
after(async () => { await db.close(); });

test('row-level policies isolate organization, own employee record, and direct reports', async () => {
  await signIn('owner'); assert.equal((await db.query('select * from public.employees')).rows.length,2);
  await signIn('employee'); const employee=(await db.query<{display_name:string}>('select * from public.employees')).rows; assert.equal(employee.length,1);assert.equal(employee[0].display_name,'Employee');
  await signIn('manager'); assert.equal((await db.query('select * from public.employees')).rows.length,1);
  await signIn('client'); assert.equal((await db.query('select * from public.employees')).rows.length,0);assert.equal((await db.query('select * from public.audit_logs')).rows.length,0);
  await signIn('outsider'); assert.equal((await db.query('select * from public.employees')).rows.length,0);assert.equal((await db.query('select * from public.organizations')).rows.length,1);
});
test('employee cannot write directly, call admin RPCs, mutate audit history or bootstrap', async () => {
  await signIn('employee');
  await denied('insert into public.membership_roles values($1,$2)',[members.employee,'owner']);
  await denied('delete from public.audit_logs');
  await denied('select public.create_department($1,$2)',[org,'Unauthorized']);
  await denied('select public.bootstrap_owner($1,$2,$3)',[ids.employee,'New org','Employee']);
  await denied('select public.complete_invitation($1,$2)',[ids.owner,ids.employee]);
  await denied('select public.list_workspace_members($1)',[org]);
});
test('saving an employee persists normalized details and an audit entry; duplicate saves do not create extra records', async () => {
  await signIn('owner');
  const saved = await db.query<{create_employee: string}>('select public.create_employee($1,$2)', [org, { display_name: 'New teammate', email: 'NEW.TEAMMATE@example.com', job_title: 'Designer', department_id: null }]);
  const id = saved.rows[0].create_employee;
  await signIn('owner'); // Fresh session and fresh read, rather than client-side state.
  const persisted = await db.query<{display_name:string;email:string;job_title:string}>('select display_name,email,job_title from public.employees where id=$1', [id]);
  assert.deepEqual(persisted.rows[0], { display_name: 'New teammate', email: 'new.teammate@example.com', job_title: 'Designer' });
  const audit = await db.query<{actor_id:string}>("select actor_id from public.audit_logs where entity_id=$1 and action='insert_employees'", [id]);
  assert.equal(audit.rows.length, 1); assert.equal(audit.rows[0].actor_id, ids.owner);
  await denied('select public.create_employee($1,$2)', [org, { display_name: 'Duplicate teammate', email: 'new.teammate@example.com', job_title: '', department_id: null }]);
  assert.equal((await db.query('select id from public.employees where email=$1', ['new.teammate@example.com'])).rows.length, 1);
});
test('employee creation links an existing same-organization internal membership without granting roles', async () => {
  await signIn('owner');
  const roleCount = (await db.query('select role_key from public.membership_roles where membership_id=$1', [members.manager])).rows.length;
  const saved = await db.query<{create_employee:string}>('select public.create_employee($1,$2)', [org, {display_name:'Manager profile',email:'manager@example.com',job_title:'Manager',department_id:null}]);
  const linked = await db.query<{membership_id:string}>('select membership_id from public.employees where id=$1', [saved.rows[0].create_employee]);
  assert.equal(linked.rows[0].membership_id, members.manager);
  assert.equal((await db.query('select role_key from public.membership_roles where membership_id=$1', [members.manager])).rows.length, roleCount);
});
test('sensitive roles need MFA at the database boundary',async () => {
 await db.exec('reset role');await db.query('update public.organizations set require_mfa=true where id=$1',[org]);
 await signIn('owner');await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
 assert.equal((await db.query('select * from public.employees')).rows.length,0);
 await denied('select public.create_department($1,$2)',[org,'Blocked without MFA']);
 await denied('select public.reserve_invitation($1,$2,$3)',[org,'nomfa@example.com','employee']);
 await db.exec('reset role');await db.query('update public.organizations set require_mfa=false where id=$1',[org]);
});
test('email/password Owner can save employees and clients with audit history; other users cannot create clients',async () => {
 await signIn('owner');await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
 const employee=await db.query<{create_employee:string}>('select public.create_employee($1,$2)',[org,{display_name:'Password teammate',email:'password@example.com',job_title:'',department_id:null}]);
 assert.equal((await db.query('select id from public.employees where id=$1',[employee.rows[0].create_employee])).rows.length,1);
 const saved=await db.query<{create_client:string}>('select public.create_client($1,$2)',[org,'  Client Company  ']);const id=saved.rows[0].create_client;
 assert.equal((await db.query<{display_name:string}>('select display_name from public.clients where id=$1',[id])).rows[0].display_name,'Client Company');
 assert.equal((await db.query("select id from public.audit_logs where entity_id=$1 and action='insert_clients'",[id])).rows.length,1);
 await denied('select public.create_client($1,$2)',[org,'client company']);
 await denied('select public.create_client($1,$2)',[otherOrg,'Wrong agency']);
 await denied('select public.create_client($1,$2)',[org,' ']);
 await denied('insert into public.clients(organization_id,display_name) values($1,$2)',[org,'Direct bypass']);
 for(const name of ['admin','employee','client','outsider'] as const){await signIn(name);await denied('select public.create_client($1,$2)',[org,'Unauthorized']);}
 await db.exec('reset role');await db.exec('set role anon');await denied('select public.create_client($1,$2)',[org,'Anonymous']);
});
test('system administrator cannot grant sensitive roles, assign owner, change own role or deactivate owner', async () => {
  await signIn('admin');
  for (const role of ['owner','finance','finance_admin','hr','hr_admin','system_admin']) await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.employee,'grant',role]);
  await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.owner,'deactivate',null]);
  await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.admin,'grant','owner']);
  await denied('select public.change_member_access($1,$2,$3,$4,true)',[otherOrg,members.outsider,'deactivate',null]);
  await db.query('select public.change_member_access($1,$2,$3,$4,true)',[org,members.employee,'grant','sales']);
});
test('owner changes require confirmation and produce atomic audit records', async () => {
  await signIn('owner');
  await denied('select public.change_member_access($1,$2,$3,$4,false)',[org,members.employee,'grant','finance']);
  await db.query('select public.change_member_access($1,$2,$3,$4,true)',[org,members.employee,'grant','finance']);
  const logs=await db.query<{new_value:{role_key:string}}>("select new_value from public.audit_logs where action='insert_membership_roles' and entity_id=$1 order by created_at desc",[members.employee]);
  assert.ok(logs.rows.some(r => r.new_value.role_key==='finance'));
  await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.client,'grant','owner']);
});
test('delegated finance administrator can grant finance but cannot delegate grant authority or manage normal activation',async () => {
  await signIn('finance');
  await db.query('select public.change_member_access($1,$2,$3,$4,true)',[org,members.manager,'grant','finance']);
  await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.manager,'grant','finance_admin']);
  await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.manager,'grant','hr']);
  await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.employee,'deactivate',null]);
  await denied('select public.reserve_invitation($1,$2,$3)',[org,'blocked@example.com','employee']);
});
test('department linkage cannot cross organizations; failed transaction does not leave audit entries',async () => {
  await db.exec('reset role');
  const department=await db.query<{id:string}>('insert into public.departments(organization_id,name) values($1,$2) returning id',[otherOrg,'Foreign department']);
  await signIn('owner');const before=(await db.query('select * from public.audit_logs')).rows.length;
  await denied('select public.create_employee($1,$2)',[org,{display_name:'Invalid Employee',email:'invalid@example.com',department_id:department.rows[0].id,job_title:''}]);
  assert.equal((await db.query('select * from public.audit_logs')).rows.length,before);
});
test('invitation is rate-limited, audited, identity-checked and grants no roles',async () => {
  await signIn('owner');
  const reservation=await db.query<{reserve_invitation:string}>('select public.reserve_invitation($1,$2,$3)',[org,'invited@example.com','employee']);
  await denied('select public.reserve_invitation($1,$2,$3)',[org,'invited@example.com','employee']);
  for(let i=0;i<4;i++) await db.query('select public.reserve_invitation($1,$2,$3)',[org,`limited${i}@example.com`,'employee']);
  await denied('select public.reserve_invitation($1,$2,$3)',[org,'limited5@example.com','employee']);
  await db.exec('reset role');
  await denied('select public.complete_invitation($1,$2)',[reservation.rows[0].reserve_invitation,ids.employee]);
  await db.query('select public.complete_invitation($1,$2)',[reservation.rows[0].reserve_invitation,ids.invited]);
  const granted=await db.query('select mr.* from public.membership_roles mr join public.memberships m on m.id=mr.membership_id where m.user_id=$1',[ids.invited]); assert.equal(granted.rows.length,0);
});
test('deactivation immediately removes effective access and administrator cannot modify privileged targets',async () => {
  await signIn('owner');await db.query('select public.change_member_access($1,$2,$3,$4,true)',[org,members.manager,'deactivate',null]);
  await signIn('manager');assert.equal((await db.query('select * from public.employees')).rows.length,0);assert.equal((await db.query('select * from public.organizations')).rows.length,0);
  await signIn('admin'); await denied('select public.change_member_access($1,$2,$3,$4,true)',[org,members.employee,'deactivate',null]);
});
test('ownership transfer preserves an active owner and removes previous owner authority',async () => {
  await signIn('owner');
  await db.query('select public.change_member_access($1,$2,$3,$4,true)',[org,members.admin,'transfer',null]);
  await denied('select public.create_department($1,$2)',[org,'Old owner cannot manage']);
  await signIn('admin');
  const rows=await db.query<{owner_count:number}>("select count(*)::int owner_count from public.membership_roles where role_key='owner'");assert.equal(rows.rows[0].owner_count,1);
  await db.query('select public.create_department($1,$2)',[org,'Authorized department']);
  await db.exec('reset role');await denied('select public.bootstrap_owner($1,$2,$3)',[ids.owner,'Duplicate','Alex']);
});
