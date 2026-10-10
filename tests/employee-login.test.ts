import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { employeeLoginSchema } from '../src/lib/validation';
import { passwordSchema } from '../src/lib/validation';
import { provisionEmployeeLogin } from '../src/lib/employee-provisioning';
const db=new PGlite();
const owner='10000000-0000-4000-8000-000000000001';
const user='10000000-0000-4000-8000-000000000002';
const unlinked='10000000-0000-4000-8000-000000000003';
const failed='10000000-0000-4000-8000-000000000004';
let org:string;
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true))$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[user,'new@example.com'],[unlinked,'unlinked@example.com'],[failed,'failed@example.com']]) await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const name of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060003_employee_password_login.sql','202610060004_owner_updates.sql','202610060005_owner_email_updates.sql']) await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Test agency','Owner'])).rows[0].bootstrap_owner;
});
after(async()=>{await db.close();});
const details=(email:string)=>({display_name:'New employee',email,job_title:'Designer',department_id:''});
test('only service-role completion may provision a login; identity/Owner/payload must match',async()=>{
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,user,details('new@example.com')]));await db.exec('reset role');}
 await db.exec('set role service_role');
 await assert.rejects(db.query('select public.complete_employee_login($1,$2,$3,$4)',[org,user,user,details('new@example.com')]));
 await assert.rejects(db.query('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,user,details('wrong@example.com')]));
 await assert.rejects(db.query('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,user,{...details('new@example.com'),password:'never store this'}]));
});
test('provisioning persists linked profile/membership/Employee role and Owner-attributed password-free audits',async()=>{
 const result=await db.query<{complete_employee_login:string}>('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,user,details('new@example.com')]);
 const record=await db.query<{role_key:string;membership_id:string}>(`select mr.role_key,e.membership_id from public.employees e join public.membership_roles mr on mr.membership_id=e.membership_id where e.id=$1`,[result.rows[0].complete_employee_login]);
 assert.equal(record.rows.length,1);assert.equal(record.rows[0].role_key,'employee');
 const logs=await db.query<{actor_id:string;new_value:Record<string,unknown>}>(`select actor_id,new_value from public.audit_logs where entity_id in ($1,$2)`,[result.rows[0].complete_employee_login,record.rows[0].membership_id]);
 assert.ok(logs.rows.length>=4);assert.ok(logs.rows.every(l=>l.actor_id===owner));assert.ok(logs.rows.every(l=>!Object.hasOwn(l.new_value,'password')));
 await assert.rejects(db.query('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,user,details('new@example.com')]));
});
test('existing directory profile is linked once and failed provisioning commits no partial memberships',async()=>{
 const saved=await db.query<{id:string}>('insert into public.employees(organization_id,display_name,email) values($1,$2,$3) returning id',[org,'Existing employee','unlinked@example.com']);
 const result=await db.query<{complete_employee_login:string}>('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,unlinked,details('unlinked@example.com')]);assert.equal(result.rows[0].complete_employee_login,saved.rows[0].id);
 await assert.rejects(db.query('select public.complete_employee_login($1,$2,$3,$4)',[org,owner,failed,{...details('failed@example.com'),department_id:'10000000-0000-4000-8000-000000000099'}]));
 assert.equal((await db.query('select id from public.memberships where user_id=$1',[failed])).rows.length,0);
 assert.equal((await db.query('select id from public.profiles where id=$1',[failed])).rows.length,0);
});
test('auth orchestration confirms success, rejects existing accounts and cleans up only newly created accounts',async()=>{
 let cleaned='';
 const success=await provisionEmployeeLogin({createAuth:async()=>({id:'new'}),completeDirectory:async()=> 'employee',removeNewAuth:async id=>{cleaned=id;}});assert.equal(success.loginCreated,true);assert.equal(cleaned,'');
 const duplicate=await provisionEmployeeLogin({createAuth:async()=>({}),completeDirectory:async()=>{throw Error();},removeNewAuth:async()=>{throw Error();}});assert.equal(duplicate.ok,false);
 const rollback=await provisionEmployeeLogin({createAuth:async()=>({id:'new-only'}),completeDirectory:async()=>{throw Error();},removeNewAuth:async id=>{cleaned=id;}});assert.equal(rollback.ok,false);assert.equal(cleaned,'new-only');
 const uncertain=await provisionEmployeeLogin({createAuth:async()=>({id:'uncertain'}),completeDirectory:async()=>{throw Error();},removeNewAuth:async()=>{throw Error();}});assert.match(uncertain.message,/Owner review/);
});
test('login requires an explicit Employee grant confirmation and sufficiently long password',()=>{
 assert.equal(passwordSchema.safeParse('abcdef').success,true);
 assert.equal(passwordSchema.safeParse('123456').success,true);
 assert.equal(passwordSchema.safeParse('!!!!!!').success,true);
 assert.equal(passwordSchema.safeParse('12345').success,false);
 assert.equal(passwordSchema.safeParse('a'.repeat(72)).success,true);
 assert.equal(passwordSchema.safeParse('a'.repeat(73)).success,false);
 assert.equal(passwordSchema.safeParse('é'.repeat(36)).success,true);
 assert.equal(passwordSchema.safeParse('é'.repeat(37)).success,false);
 assert.equal(employeeLoginSchema.safeParse({...details('new@example.com'),password:'123',login_confirmed:'yes'}).success,false);
 assert.equal(employeeLoginSchema.safeParse({...details('new@example.com'),password:'LongPassword123!'}).success,false);
 assert.equal(employeeLoginSchema.safeParse({...details('new@example.com'),password:'LongPassword123!',login_confirmed:'yes'}).success,true);
});
test('Owner updates persist and audit employee/client/department records; employee and foreign-organization edits are denied',async()=>{
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 const department=(await db.query<{create_department:string}>('select public.create_department($1,$2)',[org,'Design'])).rows[0].create_department;
 await db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'department',department,{name:'Graphic Designer'}]);
 assert.equal((await db.query<{name:string}>('select name from public.departments where id=$1',[department])).rows[0].name,'Graphic Designer');
 const employee=(await db.query<{id:string}>('select id from public.employees where email=$1',['new@example.com'])).rows[0].id;
 await db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'employee',employee,{...details('new@example.com'),display_name:'Updated employee',department_id:department}]);
 assert.equal((await db.query<{department_id:string}>('select department_id from public.employees where id=$1',[employee])).rows[0].department_id,department);
 assert.equal((await db.query<{display_name:string}>('select display_name from public.profiles where id=$1',[user])).rows[0].display_name,'Updated employee');
 await assert.rejects(db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'employee',employee,details('other@example.com')]));
 const client=(await db.query<{create_client:string}>('select public.create_client($1,$2)',[org,'Original client'])).rows[0].create_client;
 await db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'client',client,{display_name:'Updated client'}]);
 assert.equal((await db.query("select id from public.audit_logs where entity_id=$1 and action='update_clients'",[client])).rows.length,1);
 await assert.rejects(db.query('select public.update_directory_record($1,$2,$3,$4)',[failed,'client',client,{display_name:'Wrong workspace'}]));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 await assert.rejects(db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'department',department,{name:'Unauthorized'}]));
});
test('password changes require confirmed Owner scope and service-only completion, and audits contain no credentials',async()=>{
 await db.exec('reset role');const target=(await db.query<{id:string}>('select id from public.memberships where user_id=$1',[user])).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 await assert.rejects(db.query('select public.request_password_change($1,$2,false)',[org,target]));
 await assert.rejects(db.query('select public.request_password_change($1,$2,true)',[failed,target]));
 const request=(await db.query<{request_password_change:string}>('select public.request_password_change($1,$2,true)',[org,target])).rows[0].request_password_change;
 await assert.rejects(db.query('select public.complete_password_change($1,true)',[request]));
 await db.exec('reset role');await db.exec('set role service_role');await db.query('select public.complete_password_change($1,true)',[request]);
 await assert.rejects(db.query('select public.complete_password_change($1,true)',[request]));
 const audit=(await db.query<{actor_id:string;new_value:Record<string,unknown>}>("select actor_id,new_value from public.audit_logs where action='password_changed'")).rows[0];assert.equal(audit.actor_id,owner);assert.deepEqual(audit.new_value,{request_id:request});
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');await assert.rejects(db.query('select public.request_password_change($1,$2,true)',[org,target]));
});
test('linked email changes require matching Auth identity and synchronize membership/directory with audits',async()=>{
 await db.exec('reset role');const employee=(await db.query<{id:string}>('select id from public.employees where email=$1',['new@example.com'])).rows[0].id;
 await db.query('update auth.users set email=$1 where id=$2',['updated@example.com',user]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 await db.query('select public.update_directory_record($1,$2,$3,$4)',[org,'employee',employee,details('updated@example.com')]);
 assert.equal((await db.query<{email:string}>('select email from public.employees where id=$1',[employee])).rows[0].email,'updated@example.com');
 assert.equal((await db.query<{email:string}>('select email from public.memberships where user_id=$1',[user])).rows[0].email,'updated@example.com');
 assert.equal((await db.query("select id from public.audit_logs where action='update_memberships' and new_value->>'email'=$1",['updated@example.com'])).rows.length,1);
});
