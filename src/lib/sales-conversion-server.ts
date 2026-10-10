import 'server-only';
import {oauthDb} from './jira-oauth-server';
import {jiraCredentials} from './jira-server';
import {jiraRequest,JiraError} from './jira-http';
import {salesConfig,readSalesGrid} from './sales-server';
import {conversionCandidates,conversionIdentity,conversionPayload,type ConversionSettings,type ConversionJob} from './sales-conversion-core';
import {readWorkIssue,importWorkIssues} from './work-server';
import {randomUUID} from 'node:crypto';
export async function conversionAudit(org:string,actor:string,action:string,id?:string){const {error}=await oauthDb().from('audit_logs').insert({organization_id:org,actor_id:actor,action,entity_type:'sales_conversion',entity_id:id||null});if(error)throw new Error('Conversion audit unavailable.');}
async function ownerActive(config:ConversionSettings){const {data,error}=await oauthDb().from('memberships').select('membership_roles(role_key)').eq('organization_id',config.organization_id).eq('user_id',config.owner_actor).eq('kind','employee').eq('active',true).maybeSingle();return !error&&data?.membership_roles.some(r=>r.role_key==='owner');}
async function recordState(job:ConversionJob,state:ConversionJob['state'],error:string|null,key=job.jira_key){const result=await oauthDb().from('sales_client_conversions').update({state,error,jira_key:key,updated_at:new Date().toISOString()}).eq('organization_id',job.organization_id).eq('id',job.id);if(result.error)throw new Error('Conversion state unavailable.');}
export async function finishConversion(job:ConversionJob,actor:string,key:string){const {issue}=await readWorkIssue(job.organization_id,key);if(!['OCT','SEP'].includes(issue.project_key)||!issue.labels.includes(job.jira_label))throw new Error('Jira task project or client label does not match.');await importWorkIssues(job.organization_id,actor,[issue]);await recordState(job,'synced',null,key);await conversionAudit(job.organization_id,actor,'sales_client_synced',job.id);}
async function processJob(job:ConversionJob,config:ConversionSettings,candidates:ReturnType<typeof conversionCandidates>){
 const source=candidates.find(r=>r.id===job.source_id);if(!source||conversionIdentity(source.name).client_key!==job.client_key){await recordState(job,'review','The original closed deal changed. Owner review required.');return;}
 const credentials=await jiraCredentials(job.organization_id);if(!credentials)throw new Error('Connect Jira before processing closed deals.');
 const existing=await jiraRequest<{issues:{key:string}[]}>(credentials,'/rest/api/3/search/jql',{jql:`project in (OCT, SEP) AND labels = ${JSON.stringify(job.jira_label)} ORDER BY created ASC`,fields:['key'],maxResults:1});
 if(existing.issues.length){await finishConversion(job,config.owner_actor,existing.issues[0].key);return;}
 const {data,error}=await oauthDb().rpc('sales_conversion_job_claim',{job_id:job.id});if(error)throw new Error('Could not reserve Jira creation.');if(!data?.length)return;
 let sent=false,key:string|undefined;
 try{await conversionAudit(job.organization_id,config.owner_actor,'sales_jira_create_requested',job.id);sent=true;const created=await jiraRequest<{key:string}>(credentials,'/rest/api/3/issue',conversionPayload(job));key=created.key;if(!new RegExp(`^${job.jira_project}-[1-9][0-9]*$`).test(key))throw new Error('Unexpected Jira task.');
  // Persist the key before importing; a later CRM failure must never recreate the issue.
  await recordState(job,'creating',null,key);await finishConversion(job,config.owner_actor,key);
 }catch(e){const safeFailure=!sent||(e instanceof JiraError&&!e.uncertain);await recordState(job,safeFailure?'failed':'review',safeFailure?'Jira rejected the task or audit failed. Review configuration before retrying.':'Jira may have created the task. Review its key before retrying; automatic creation is stopped.',key||null);}
}
export async function runSalesConversions(org:string){
 const db=oauthDb(),{data,error}=await db.rpc('sales_conversion_scan_claim',{org_id:org});if(error||!data?.length)return;const config=data[0] as ConversionSettings;
 try{if(!await ownerActive(config))throw new Error('Automation Owner account is no longer authorized.');const connection=await salesConfig(org);if(!connection)throw new Error('Google server connection unavailable.');const grid=await readSalesGrid(connection,config.source_tab,true),candidates=conversionCandidates(grid,config);
  for(let offset=0;offset<candidates.length;offset+=100){const batch=candidates.slice(offset,offset+100),{data:sources,error:sourceError}=await db.from('sales_conversion_sources').select('source_id').eq('organization_id',org).eq('source_tab',config.source_tab).in('source_id',batch.map(r=>r.id));if(sourceError)throw new Error('Conversion source tracking unavailable.');const known=new Set(sources?.map(s=>s.source_id));
   for(const row of batch.filter(r=>!known.has(r.id))){const identity=conversionIdentity(row.name),summary=config.summary_template.replaceAll('{client}',identity.client_name);if(summary.length>255)throw new Error('Onboarding title is too long; shorten the settings template.');const record={id:randomUUID(),organization_id:org,...identity,source_tab:config.source_tab,source_id:row.id,source_fingerprint:row.fingerprint,jira_project:config.jira_project,issue_type:config.issue_type,summary};const inserted=await db.from('sales_client_conversions').insert(record).select('id').single();let id=inserted.data?.id;
    if(inserted.error){const same=await db.from('sales_client_conversions').select('id,jira_label').eq('organization_id',org).eq('client_key',identity.client_key).maybeSingle();if(same.error||!same.data)throw new Error('Client label collision or conversion storage failure. Owner review required.');id=same.data.id;}
    const linked=await db.from('sales_conversion_sources').insert({organization_id:org,source_tab:config.source_tab,source_id:row.id,client_name:row.name,conversion_id:id});if(linked.error&&linked.error.code!=='23505')throw new Error('Conversion source could not be tracked.');
   }
  }
  // A stopped server or interrupted POST can never trigger an automatic second create.
  await db.from('sales_client_conversions').update({state:'review',error:'Creation was interrupted. Check Jira before linking or retrying.'}).eq('organization_id',org).eq('state','creating').lt('updated_at',new Date(Date.now()-300000).toISOString());
  const pending=await db.from('sales_client_conversions').select('*').eq('organization_id',org).eq('state','pending').order('created_at').limit(3);if(pending.error)throw new Error('Conversion queue unavailable.');for(const job of pending.data||[])await processJob(job as ConversionJob,config,candidates);
  const checked=await db.from('sales_conversion_settings').update({last_checked_at:new Date().toISOString(),last_error:null}).eq('organization_id',org);if(checked.error)throw new Error('Automation check could not be recorded.');
 }catch(e){const known=e instanceof Error?e.message:'';const safe=known.startsWith('Google ')||known.startsWith('Configured ')||known.startsWith('A closed ')||known.startsWith('Client ')||known.startsWith('Onboarding ')||known.startsWith('Automation Owner')||known.startsWith('Connect Jira')?known:'Automation check failed; no unconfirmed Jira creations are retried.';await db.from('sales_conversion_settings').update({last_checked_at:new Date().toISOString(),last_error:safe}).eq('organization_id',org);}
 finally{await db.from('sales_conversion_settings').update({lease_until:null}).eq('organization_id',org);}
}
let running=false,timer:ReturnType<typeof setInterval>|undefined;
export function startSalesConversionWorker(){if(timer)return;const tick=async()=>{if(running||!process.env.SUPABASE_SECRET_KEY)return;running=true;try{const {data,error}=await oauthDb().from('sales_conversion_settings').select('organization_id').eq('enabled',true);if(!error)for(const row of data||[])await runSalesConversions(row.organization_id);}catch{/* No credentials or private sheet data are logged. */}finally{running=false;}};timer=setInterval(()=>void tick(),30000);timer.unref();void tick();}
