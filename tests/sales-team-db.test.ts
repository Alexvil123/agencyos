import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {salesAccess,salesTabAccess} from '../src/lib/sales-sheet';
const db=new PGlite();
const owner='70000000-0000-4000-8000-000000000001',worker='70000000-0000-4000-8000-000000000002';
let org:string,member:string;
async function actor(user:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
async function saved(){await db.exec('reset role');return (await db.query<{members:string[]}>('select members from public.sales_team_access where organization_id=$1',[org])).rows[0]?.members||[];}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
 for(const name of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610100027_sales_team_access.sql'])await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Sales tests','Owner'])).rows[0].bootstrap_owner;
 await db.query('insert into public.profiles values($1,$2,now())',[worker,'Worker']);
 member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,'worker@example.com','employee') returning id",[org,worker])).rows[0].id;
 await db.query("insert into public.membership_roles values($1,'employee')",[member]);
});
after(()=>db.close());
test('Owner grants persist and revoke; all-tab scope follows the grant; each save is audited',async()=>{
 await actor(owner);await db.query('select public.sales_team_save($1,$2)',[org,[member,member]]);
 assert.deepEqual(await saved(),[member]);assert(salesAccess(false,'employee',member,await saved()));
 for(const tab of ['Tracksheet','Leads','Expenses','Timing Report','Future tab'])assert(salesTabAccess(false,tab,'employee',member,await saved()));
 await actor(owner);await db.query('select public.sales_team_save($1,$2)',[org,[]]);
 assert.deepEqual(await saved(),[]);assert(!salesAccess(false,'employee',member,await saved()));
 for(const tab of ['Tracksheet','Expenses','Future tab'])assert(!salesTabAccess(false,tab,'employee',member,await saved()));
 const logs=(await db.query<{old_value:{members:string[]};new_value:{members:string[]}}>("select old_value,new_value from public.audit_logs where action='sales_access_changed' order by created_at")).rows;
 assert.equal(logs.length,2);assert.deepEqual(logs[1].old_value.members,[member]);assert.deepEqual(logs[1].new_value.members,[]);
});
test('employee self-grant/direct write and inactive or foreign IDs fail without partial changes',async()=>{
 await actor(worker);await assert.rejects(db.query('select public.sales_team_save($1,$2)',[org,[member]]),/Owner/);
 await assert.rejects(db.query('insert into public.sales_team_access(organization_id,members) values($1,$2)',[org,[member]]),/permission/);
 assert.equal((await db.query('select * from public.sales_team_access')).rows.length,0);
 await actor(owner);await assert.rejects(db.query('select public.sales_team_save($1,$2)',[org,['70000000-0000-4000-8000-000000000099']]),/active workspace/);
 await assert.rejects(db.query('select public.sales_team_save($1,$2)',[org,[null]]),/active workspace/);
 await db.exec('reset role');await db.query('update public.memberships set active=false where id=$1',[member]);
 await actor(owner);await assert.rejects(db.query('select public.sales_team_save($1,$2)',[org,[member]]),/active workspace/);
 assert.deepEqual(await saved(),[]);
 assert.equal((await db.query("select * from public.audit_logs where action='sales_access_changed'")).rows.length,2);
});
