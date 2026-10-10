import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='20000000-0000-4000-8000-000000000001',employee='20000000-0000-4000-8000-000000000002';
let org:string,member:string;
const issue={id:'10001',key:'OCT-1',project_key:'OCT',summary:'Existing production task',description:null,status_id:'1',status_name:'Design To Do',assignee_id:'jira-employee',assignee_name:'Employee',jira_updated:'2026-10-06T10:00:00Z'};
async function signed(user:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 await db.query('insert into auth.users values($1,$2),($3,$4)',[owner,'owner@example.com',employee,'employee@example.com']);
 for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060006_jira.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 await db.exec('grant all on public.jira_account_links,public.jira_issues to authenticated,anon');
 await db.exec(readFileSync('supabase/migrations/202610060007_jira_table_grants.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/202610060008_jira_oauth.sql','utf8'));
 org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Test agency','Owner'])).rows[0].bootstrap_owner;
 await db.query('insert into public.profiles values($1,$2,now())',[employee,'Employee']);
 member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,$3,'employee') returning id",[org,employee,'employee@example.com'])).rows[0].id;
 await db.query("insert into public.membership_roles values($1,'employee')",[member]);
});
after(async()=>db.close());
test('only Owner can link employee identities and direct Jira writes are denied',async()=>{
 await signed(employee);await assert.rejects(db.query('select public.link_jira_account($1,$2,$3)',[org,member,'jira-employee']));
 await assert.rejects(db.query('insert into public.jira_account_links values($1,$2,$3)',[org,member,'jira-employee']));
 await assert.rejects(db.query('truncate public.jira_issues'));
 await signed(owner);await db.query('select public.link_jira_account($1,$2,$3)',[org,member,'jira-employee']);
 await assert.rejects(db.query('select public.jira_sync_batch($1,$2,$3)',[org,owner,[issue]]));
});
test('service synchronization persists tasks idempotently and never regresses newer versions',async()=>{
 await db.exec('reset role;set role service_role');
 await db.query('select public.jira_sync_batch($1,$2,$3)',[org,owner,[issue]]);
 await db.query('select public.jira_sync_batch($1,$2,$3)',[org,owner,[{...issue,summary:'New title',jira_updated:'2026-10-06T11:00:00Z'}]]);
 await db.query('select public.jira_sync_batch($1,$2,$3)',[org,owner,[issue]]);
 await signed(owner);const rows=await db.query<{summary:string}>('select summary from public.jira_issues');assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].summary,'New title');
});
test('employee cannot read stale cached assignments or synchronize someone else’s task',async()=>{
 await signed(employee);assert.equal((await db.query('select * from public.jira_issues')).rows.length,0);
 await db.exec('reset role;set role service_role');
 await assert.rejects(db.query('select public.jira_sync_batch($1,$2,$3)',[org,employee,[{...issue,assignee_id:'someone-else'}]]));
 await assert.rejects(db.query('select public.jira_sync_batch($1,$2,$3)',[org,employee,[issue,{...issue,id:'2'}]]));
 await db.query('select public.jira_sync_batch($1,$2,$3)',[org,employee,[{...issue,jira_updated:'2026-10-06T12:00:00Z'}]]);
 await assert.rejects(db.query('select public.jira_audit($1,$2,$3,$4,$5)',[org,employee,'jira-employee','create_requested','OCT']));
 await db.query('select public.jira_audit($1,$2,$3,$4,$5)',[org,employee,'jira-employee','edit_requested','OCT-1']);
});
test('invalid project or deactivated employee cannot receive scoped Jira access',async()=>{
 await db.exec('reset role;set role service_role');
 await assert.rejects(db.query('select public.jira_sync_batch($1,$2,$3)',[org,owner,[{...issue,project_key:'FOREIGN'}]]));
 await db.exec('reset role');await db.query('update public.memberships set active=false where id=$1',[member]);
 await db.exec('set role service_role');await assert.rejects(db.query('select public.jira_sync_batch($1,$2,$3)',[org,employee,[issue]]));
});
test('OAuth token/state tables are server-only and consent state is user-bound, expiring and single-use',async()=>{
 await signed(owner);await assert.rejects(db.query('select * from public.jira_oauth_connections'));await assert.rejects(db.query('truncate public.jira_oauth_connections'));await assert.rejects(db.query('select public.consume_jira_oauth_state($1,$2,$3)',['nonce',org,owner]));
 await db.exec('reset role;set role service_role');
 await db.query("insert into public.jira_oauth_states values($1,$2,$3,now()+interval '10 minutes')",['nonce',org,owner]);
 await assert.rejects(db.query('select public.consume_jira_oauth_state($1,$2,$3)',['nonce',org,employee]));
 assert.equal((await db.query<{consume_jira_oauth_state:boolean}>('select public.consume_jira_oauth_state($1,$2,$3)',['nonce',org,owner])).rows[0].consume_jira_oauth_state,true);
 assert.equal((await db.query<{consume_jira_oauth_state:boolean}>('select public.consume_jira_oauth_state($1,$2,$3)',['nonce',org,owner])).rows[0].consume_jira_oauth_state,false);
 await db.query("insert into public.jira_oauth_states values($1,$2,$3,now()-interval '1 minute')",['expired',org,owner]);
 assert.equal((await db.query<{consume_jira_oauth_state:boolean}>('select public.consume_jira_oauth_state($1,$2,$3)',['expired',org,owner])).rows[0].consume_jira_oauth_state,false);
});
test('rotating refresh tokens are protected by a database lease across server instances',async()=>{
 await db.exec('reset role;set role service_role');
 await db.query('insert into public.jira_oauth_connections(organization_id,encrypted_tokens,connected_by) values($1,$2,$3)',[org,'encrypted-test-token',owner]);
 const lease='20000000-0000-4000-8000-000000000010';const other='20000000-0000-4000-8000-000000000011';
 assert.equal((await db.query<{claim_jira_oauth_refresh:string}>('select public.claim_jira_oauth_refresh($1,$2)',[org,lease])).rows[0].claim_jira_oauth_refresh,'encrypted-test-token');
 assert.equal((await db.query<{claim_jira_oauth_refresh:string|null}>('select public.claim_jira_oauth_refresh($1,$2)',[org,other])).rows[0].claim_jira_oauth_refresh,null);
 assert.equal((await db.query('update public.jira_oauth_connections set encrypted_tokens=$1 where organization_id=$2 and refresh_lease=$3 returning organization_id',['wrong-token',org,other])).rows.length,0);
});
