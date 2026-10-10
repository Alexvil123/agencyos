import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const {organizationId}=JSON.parse(await readFile('.jira-oauth-app.local.json','utf8'));
const actor='33852255-e6b8-4de4-acd4-e96429fd35fd';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function rows(table,columns='*'){
 const {data,error}=await db.from(table).select(columns).eq('organization_id',organizationId).limit(1000);
 if(error||data.length===1000)throw new Error(`Could not verify complete ${table} scope`);return data;
}
const members=await rows('memberships','id,user_id,membership_roles(roles(name))');
const owner=members.find(m=>m.user_id===actor&&m.membership_roles.some(g=>g.roles.name==='Owner'));
if(!owner)throw new Error('Configured agency Owner could not be verified');
const clients=await rows('clients'),ids=new Set(clients.map(c=>c.id));
const tasks=(await rows('time_tasks','id,client_id,updated_at')).filter(t=>ids.has(t.client_id));
const assignments=(await rows('client_assignments')).filter(a=>ids.has(a.client_id));
const config=(await rows('work_project_config')).filter(c=>ids.has(c.client_id));
console.log(JSON.stringify({manualClients:clients.length,linkedTasks:tasks.length,clientAssignments:assignments.length,legacyProjectMappings:config.length}));
if(!process.argv.includes('--apply')||!clients.length)process.exit(0);
await mkdir('docs/backups',{recursive:true});
await writeFile(`docs/backups/manual-clients-${Date.now()}.json`,JSON.stringify({organizationId,clients,tasks,assignments,config},null,2));
for(const client of clients){
 const {error:auditError}=await db.from('audit_logs').insert({organization_id:organizationId,actor_id:actor,action:'manual_client_removal_requested',entity_type:'clients',entity_id:client.id,old_value:client,new_value:{reason:'Owner requested Jira-only automatic client directory'}});
 if(auditError)throw new Error('Removal audit could not be saved');
 const {error:taskError}=await db.from('time_tasks').update({client_id:null}).eq('organization_id',organizationId).eq('client_id',client.id);
 if(taskError)throw new Error('Task client reference could not be detached');
 for(const table of ['client_assignments','work_project_config']){const {error}=await db.from(table).delete().eq('organization_id',organizationId).eq('client_id',client.id);if(error)throw new Error(`Legacy ${table} reference could not be detached`);}
 const {error}=await db.from('clients').delete().eq('organization_id',organizationId).eq('id',client.id);if(error)throw new Error('Manual client removal could not be confirmed');
 await db.from('audit_logs').insert({organization_id:organizationId,actor_id:actor,action:'manual_client_removed',entity_type:'clients',entity_id:client.id,old_value:client,new_value:{client_source:'jira_labels',task_history_preserved:true}});
}
const remaining=await rows('clients');if(remaining.length)throw new Error('Manual client records remain; review before claiming completion');
console.log(JSON.stringify({removed:clients.length,remaining:remaining.length,taskHistoryPreserved:true}));
