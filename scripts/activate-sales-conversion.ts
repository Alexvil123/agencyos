import {readFile} from 'node:fs/promises';
import {oauthDb} from '../src/lib/jira-oauth-server';
import {salesConfig,readSalesGrid} from '../src/lib/sales-server';
import {jiraCredentials} from '../src/lib/jira-server';
import {jiraRequest} from '../src/lib/jira-http';
import {conversionCandidates,type ConversionConfig} from '../src/lib/sales-conversion-core';
async function main(){
 const email=process.argv[2];if(!email)throw new Error('Owner email required.');const local=JSON.parse(await readFile('.sales-google.local.json','utf8')),org=local.organizationId,db=oauthDb();
 const owner=await db.from('memberships').select('user_id,membership_roles(role_key)').eq('organization_id',org).eq('email',email).eq('kind','employee').eq('active',true).single();if(owner.error||!owner.data.membership_roles.some(r=>r.role_key==='owner'))throw new Error('Active Owner required.');
 const previous=await db.from('sales_conversion_settings').select('organization_id').eq('organization_id',org).maybeSingle();if(previous.error)throw new Error('Apply database migration first.');if(previous.data)throw new Error('Already configured. Use Owner automation settings rather than replacing them.');
 const credentials=await jiraCredentials(org),connection=await salesConfig(org);if(!credentials||!connection)throw new Error('Connect Google and Jira first.');const types=await jiraRequest<{issueTypes:{id:string;name:string;subtask:boolean}[]}>(credentials,'/rest/api/3/issue/createmeta/OCT/issuetypes?maxResults=100'),type=types.issueTypes.find(t=>t.name==='Task'&&!t.subtask);if(!type)throw new Error('Actual Jira Task type unavailable.');const fields=await jiraRequest<{fields:{fieldId:string;required:boolean;hasDefaultValue?:boolean;defaultValue?:unknown}[];total:number}>(credentials,`/rest/api/3/issue/createmeta/OCT/issuetypes/${type.id}?maxResults=100`);if(!fields.fields.length||fields.total>fields.fields.length||!fields.fields.some(f=>f.fieldId==='labels')||fields.fields.some(f=>f.required&&!f.hasDefaultValue&&f.defaultValue===undefined&&!['project','issuetype','summary','description','labels'].includes(f.fieldId)))throw new Error('Actual Jira creation requirements unsupported.');
 const config:ConversionConfig={enabled:true,source_tab:'Tracksheet',name_column:'Business Name',status_column:'Status',won_value:'Deal Closed',jira_project:'OCT',issue_type:type.id,summary_template:'Client onboarding — {client}'},baseline=conversionCandidates(await readSalesGrid(connection,config.source_tab,true),config);
 // Keep automation disabled until baseline and audit writes are confirmed.
 const staged=await db.from('sales_conversion_settings').insert({...config,organization_id:org,owner_actor:owner.data.user_id,enabled:false});if(staged.error)throw new Error('Could not stage settings.');
 if(baseline.length){const excluded=await db.from('sales_conversion_sources').insert(baseline.map(row=>({organization_id:org,source_tab:config.source_tab,source_id:row.id,client_name:row.name,suppressed:true})));if(excluded.error)throw new Error('Historical baseline failed; automation remains disabled.');}
 const audit=await db.from('audit_logs').insert({organization_id:org,actor_id:owner.data.user_id,action:'sales_conversion_configured',entity_type:'sales_conversion',new_value:{...config,excluded_old_deals:baseline.length}});if(audit.error)throw new Error('Audit failed; automation remains disabled.');
 const enabled=await db.from('sales_conversion_settings').update({enabled:true,updated_at:new Date().toISOString()}).eq('organization_id',org).eq('enabled',false);if(enabled.error)throw new Error('Activation failed.');
 console.log(JSON.stringify({enabled:true,sourceTab:config.source_tab,wonValue:config.won_value,project:config.jira_project,issueType:type.name,excludedOldDeals:baseline.length}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Activation failed; check settings.');process.exitCode=1;});
