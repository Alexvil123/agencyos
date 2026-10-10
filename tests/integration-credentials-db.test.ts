import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),owner='60000000-0000-4000-8000-000000000001',worker='60000000-0000-4000-8000-000000000002';
let org:string;
async function as(role:'authenticated'|'service_role'|'anon',user=owner){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${role}`);}
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
  for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
  for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060003_employee_password_login.sql','202610060004_owner_updates.sql','202610060005_owner_email_updates.sql','202610100030_integration_credentials.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Integration tests','Owner'])).rows[0].bootstrap_owner;
});
after(()=>db.close());
const sealed='A'.repeat(60);
test('only the server can read or write integration credentials; users and visitors cannot',async()=>{
  await as('service_role');
  await db.query("insert into public.integration_credentials(organization_id,provider,encrypted,hint,updated_by) values($1,'youtube',$2,'1 channel',$3)",[org,sealed,owner]);
  assert.equal((await db.query('select * from public.integration_credentials')).rows.length,1);
  for(const role of ['authenticated','anon'] as const){
    await as(role,owner);
    await assert.rejects(db.query('select * from public.integration_credentials'),/permission denied/,`${role} read`);
    await assert.rejects(db.query("insert into public.integration_credentials(organization_id,provider,encrypted,updated_by) values($1,'meta_ads',$2,$3)",[org,sealed,owner]),/permission denied/,`${role} write`);
    await assert.rejects(db.query('delete from public.integration_credentials'),/permission denied/,`${role} delete`);
  }
});
test('one row per organization and provider, only known providers, and sane ciphertext sizes',async()=>{
  await as('service_role');
  await assert.rejects(db.query("insert into public.integration_credentials(organization_id,provider,encrypted,updated_by) values($1,'youtube',$2,$3)",[org,sealed,owner]),/duplicate key|unique/);
  await assert.rejects(db.query("insert into public.integration_credentials(organization_id,provider,encrypted,updated_by) values($1,'tiktok',$2,$3)",[org,sealed,owner]),/check/);
  await assert.rejects(db.query("insert into public.integration_credentials(organization_id,provider,encrypted,updated_by) values($1,'meta_ads','short',$2)",[org,owner]),/check/);
  await db.query("insert into public.integration_credentials as c(organization_id,provider,encrypted,hint,updated_by) values($1,'youtube',$2,'2 channels',$3) on conflict(organization_id,provider) do update set encrypted=excluded.encrypted,hint=excluded.hint,updated_at=now()",[org,'B'.repeat(60),owner]);
  const row=(await db.query<{hint:string;encrypted:string}>("select hint,encrypted from public.integration_credentials where provider='youtube'")).rows;
  assert.equal(row.length,1);assert.equal(row[0].hint,'2 channels');assert.equal(row[0].encrypted,'B'.repeat(60));
  await db.query("delete from public.integration_credentials where provider='youtube'");
  assert.equal((await db.query('select * from public.integration_credentials')).rows.length,0);
});
