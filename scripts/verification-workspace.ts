import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {workAdmin} from '../src/lib/work-server';
const file='test-results/verification-private.json';
const db=workAdmin();
type Fixture={org:string;name:string;users:{id:string;email:string;password:string;membership?:string}[]};
async function seed(){
 try{await readFile(file);throw Error('Verification workspace already exists; clean it first');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await mkdir('test-results',{recursive:true});const f:Fixture={org:randomUUID(),name:`CRM isolated verification ${randomUUID().slice(0,8)}`,users:[]};await writeFile(file,JSON.stringify(f),{mode:0o600,flag:'wx'});
 const org=await db.from('organizations').insert({id:f.org,display_name:f.name,require_mfa:false});assert.ifError(org.error);
 for(const [index,name] of ['Verify Owner','Verify Employee'].entries()){
  const email=`crm-verify-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const user=await db.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(user.error);assert(user.data.user);f.users.push({id:user.data.user.id,email,password});await writeFile(file,JSON.stringify(f),{mode:0o600});
  const profile=await db.from('profiles').insert({id:user.data.user.id,display_name:name});assert.ifError(profile.error);
  const member=await db.from('memberships').insert({organization_id:f.org,user_id:user.data.user.id,email,kind:'employee'}).select('id').single();assert.ifError(member.error);f.users[index].membership=member.data.id;await writeFile(file,JSON.stringify(f),{mode:0o600});
  const role=await db.from('membership_roles').insert({membership_id:member.data.id,role_key:index===0?'owner':'employee'});assert.ifError(role.error);
  const employee=await db.from('employees').insert({organization_id:f.org,membership_id:member.data.id,display_name:name,email,job_title:index===0?'Owner':'Test Designer',employee_code:`VERIFY-${index}`});assert.ifError(employee.error);
 }
 console.log('Isolated verification workspace seeded: 2 temporary accounts. Credentials retained only in ignored private fixture file.');
}
async function cleanup(){
 const f=JSON.parse(await readFile(file,'utf8')) as Fixture;const current=await db.from('organizations').select('display_name').eq('id',f.org).single();assert.equal(current.data?.display_name,f.name,'Refuse cleanup outside the created test workspace');assert(f.name.startsWith('CRM isolated verification '));
 const conversations=await db.from('chat_conversations').select('id,photo_path').eq('organization_id',f.org);assert.ifError(conversations.error);const chatIds=conversations.data.map(c=>c.id);
 const announcements=await db.from('announcements').select('id').eq('organization_id',f.org);assert.ifError(announcements.error);
 const photos=await db.from('employees').select('photo_path').eq('organization_id',f.org);assert.ifError(photos.error);
 for(const table of ['chat_messages','chat_members'])if(chatIds.length){const r=await db.from(table).delete().in('conversation_id',chatIds);assert.ifError(r.error);}
 if(announcements.data.length){const r=await db.from('announcement_reads').delete().in('announcement_id',announcements.data.map(a=>a.id));assert.ifError(r.error);}
 for(const table of ['chat_conversations','announcements','time_corrections','task_work_sessions','time_breaks','time_segments','time_logs','time_tasks','time_attendance','time_managers','time_shifts','employee_manager_assignments','jira_account_links','employees','departments','audit_logs']){const r=await db.from(table).delete().eq('organization_id',f.org);assert.ifError(r.error);}
 const memberIds=f.users.flatMap(u=>u.membership?[u.membership]:[]);if(memberIds.length){const roles=await db.from('membership_roles').delete().in('membership_id',memberIds);assert.ifError(roles.error);}
 const members=await db.from('memberships').delete().eq('organization_id',f.org);assert.ifError(members.error);
 const paths=[...photos.data.map(p=>p.photo_path),...conversations.data.map(c=>c.photo_path)].filter((p):p is string=>Boolean(p));if(paths.length){const removed=await db.storage.from('employee-photos').remove(paths);assert.ifError(removed.error);}
 for(const user of f.users){const p=await db.from('profiles').delete().eq('id',user.id);assert.ifError(p.error);const removed=await db.auth.admin.deleteUser(user.id);if(removed.error?.status!==404)assert.ifError(removed.error);}
 // Membership/account removal is itself audited; clear those new fixture-only records last.
 const finalAudit=await db.from('audit_logs').delete().eq('organization_id',f.org);assert.ifError(finalAudit.error);
 const org=await db.from('organizations').delete().eq('id',f.org);assert.ifError(org.error);await unlink(file);console.log('Created test workspace, accounts, records and uploaded fixtures removed.');
}
(process.argv.includes('--cleanup')?cleanup():seed()).catch(e=>{console.error(e instanceof Error?e.message:'Verification fixture operation failed');process.exitCode=1;});
