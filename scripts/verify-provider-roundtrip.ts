import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {workAdmin,importWorkIssues} from '../src/lib/work-server';
import {jiraCredentials} from '../src/lib/jira-server';
import {jiraRequest} from '../src/lib/jira-http';
import {jiraCreateFields} from '../src/lib/jira-create';
import {workIssue} from '../src/lib/work-jira-sync';
import {sheetsRequest,readNativeSales,invalidateSales,type SalesConfig} from '../src/lib/sales-server';
const marker=`CRM Verification ${randomUUID()}`;
const report:{marker:string;checks:string[];cleanup:string[];failures:string[]}={marker,checks:[],cleanup:[],failures:[]};
async function main(){
 const db=workAdmin();const config=JSON.parse(await readFile('.sales-google.local.json','utf8')) as SalesConfig;
 const organizationId=config.organizationId;
 const {data:owners,error}=await db.from('memberships').select('user_id,membership_roles(role_key)').eq('organization_id',organizationId).eq('active',true);if(error)throw error;
 const owner=owners.find(o=>(o.membership_roles as {role_key:string}[]).some(r=>r.role_key==='owner'));assert(owner);
 // Only a newly created scratch sheet is mutated. Business tabs/formulas are untouched.
 let sheetId:number|undefined;const tab=`CRM_VERIFY_${randomUUID().slice(0,8)}`;
 if(!process.argv.includes('--jira-only'))try{
  const made=await sheetsRequest<{replies:{addSheet:{properties:{sheetId:number}}}[]}>(config,':batchUpdate',{requests:[{addSheet:{properties:{title:tab,gridProperties:{rowCount:20,columnCount:3}}}}]});sheetId=made.replies[0].addSheet.properties.sheetId;
  await sheetsRequest(config,':batchUpdate',{requests:[{updateCells:{range:{sheetId,startRowIndex:0,endRowIndex:3,startColumnIndex:0,endColumnIndex:3},rows:[{values:['ID','Name','Status'].map(stringValue=>({userEnteredValue:{stringValue}}))},{values:['VERIFY-1',marker,'Open'].map(stringValue=>({userEnteredValue:{stringValue}}))},{values:['VERIFY-2','Delete fixture','Open'].map(stringValue=>({userEnteredValue:{stringValue}}))}],fields:'userEnteredValue'}}]});invalidateSales(config);
  let read=await readNativeSales(config,tab,true);assert(read.grid.rows.some(r=>r.cells.some(c=>c.raw===marker)));report.checks.push('Google create scratch tab + CRM parser read-back');
  await sheetsRequest(config,':batchUpdate',{requests:[{updateCells:{range:{sheetId,startRowIndex:1,endRowIndex:2,startColumnIndex:1,endColumnIndex:2},rows:[{values:[{userEnteredValue:{stringValue:marker+' edited'}}]}],fields:'userEnteredValue'}}]});invalidateSales(config);
  read=await readNativeSales(config,tab,true);assert(read.grid.rows.some(r=>r.cells.some(c=>c.raw===marker+' edited')));report.checks.push('Google edit + fresh CRM read-back');
  await sheetsRequest(config,':batchUpdate',{requests:[{insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:3,endIndex:4}}},{updateCells:{range:{sheetId,startRowIndex:3,endRowIndex:4,startColumnIndex:0,endColumnIndex:3},rows:[{values:['VERIFY-3','Added fixture','Open'].map(stringValue=>({userEnteredValue:{stringValue}}))}],fields:'userEnteredValue'}}]});invalidateSales(config);
  read=await readNativeSales(config,tab,true);assert(read.grid.rows.some(r=>r.cells.some(c=>c.raw==='Added fixture')));report.checks.push('Google add row + CRM parser read-back');
  await sheetsRequest(config,':batchUpdate',{requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:2,endIndex:3}}}]});invalidateSales(config);
  read=await readNativeSales(config,tab,true);assert(!read.grid.rows.some(r=>r.cells.some(c=>c.raw==='Delete fixture')));report.checks.push('Google delete fixture row + fresh CRM read-back');
 }catch(e){report.failures.push(`Google round-trip: ${e instanceof Error?e.message:'unavailable'}`);}finally{if(sheetId!==undefined){await sheetsRequest(config,':batchUpdate',{requests:[{deleteSheet:{sheetId}}]});invalidateSales(config);report.cleanup.push('Scratch Google tab removed');}}
 if(process.argv.includes('--google-only'))return;
 const credentials=await jiraCredentials(organizationId);assert(credentials);let key:string|undefined,stage='issue types';
 try{
  const types=await jiraRequest<{issueTypes:{id:string;subtask:boolean;name:string}[]}>(credentials,'/rest/api/3/issue/createmeta/OCT/issuetypes?maxResults=100');const type=types.issueTypes.find(t=>!t.subtask&&t.name==='Task')||types.issueTypes.find(t=>!t.subtask);assert(type);
  const existing=await db.from('time_tasks').select('jira_metadata').eq('organization_id',organizationId).eq('source','jira').eq('jira_project','OCT').limit(1000);const clientLabel=existing.data?.flatMap(t=>t.jira_metadata?.labels||[])[0];assert(clientLabel,'Existing client label required for fixture');stage='create issue';const diagnosticFetch:typeof fetch=async(input,init)=>{const response=await fetch(input,init);if(response.status===400){const body=await response.clone().json() as {errors?:Record<string,string>;errorMessages?:string[]};report.failures.push('Jira required-field errors: '+JSON.stringify(body.errors||{}));}return response;};const created=await jiraRequest<{key:string}>(credentials,'/rest/api/3/issue',{fields:jiraCreateFields({project:'OCT',issue_type:type.id,summary:marker,description:'Temporary CRM verification fixture; no employee assignment.',labels:clientLabel})},'POST',diagnosticFetch);key=created.key;assert(/^OCT-\d+$/.test(key));
  const fetchIssue=()=>jiraRequest<Parameters<typeof workIssue>[0]>(credentials,`/rest/api/3/issue/${key}?fields=summary,description,status,project,assignee,priority,labels,created,updated,duedate,issuetype`);
  let remote=await fetchIssue();assert.equal(remote.fields.summary,marker);await importWorkIssues(organizationId,owner.user_id,[workIssue(remote)]);report.checks.push('Jira create test issue → real CRM importer/cache');
  await jiraRequest(credentials,`/rest/api/3/issue/${key}?notifyUsers=false`,{fields:{summary:marker+' edited'}},'PUT');remote=await fetchIssue();assert.equal(remote.fields.summary,marker+' edited');await importWorkIssues(organizationId,owner.user_id,[workIssue(remote)]);
  const saved=await db.from('time_tasks').select('id,title,jira_status_id').eq('organization_id',organizationId).eq('jira_key',key).single();assert.ifError(saved.error);assert.equal(saved.data.title,marker+' edited');report.checks.push('Jira edit → authoritative read-back → updated CRM cache');
  const {transitions}=await jiraRequest<{transitions:{id:string;to:{id:string}}[]}>(credentials,`/rest/api/3/issue/${key}/transitions`);const transition=transitions.find(t=>t.to.id!==saved.data.jira_status_id);assert(transition,'No allowed alternate transition for verification fixture');
  await jiraRequest(credentials,`/rest/api/3/issue/${key}/transitions`,{transition:{id:transition.id}});remote=await fetchIssue();assert.equal(remote.fields.status.id,transition.to.id);await importWorkIssues(organizationId,owner.user_id,[workIssue(remote)]);
  const latest=await db.from('time_tasks').select('jira_status_id').eq('organization_id',organizationId).eq('jira_key',key).single();assert.equal(latest.data?.jira_status_id,transition.to.id);report.checks.push('Jira allowed status transition → verified remote + CRM status');
 }catch(e){report.failures.push(`Jira ${stage}: ${e instanceof Error?e.message:'unavailable'} (status ${(e as {status?:number}).status||'unknown'})`);}finally{
  if(key){const issue=await jiraRequest<{fields:{summary:string}}>(credentials,`/rest/api/3/issue/${key}?fields=summary`);assert(issue.fields.summary.startsWith(marker),'Refuse cleanup of non-fixture issue');await jiraRequest(credentials,`/rest/api/3/issue/${key}?deleteSubtasks=false`,undefined,'DELETE');report.cleanup.push('Created Jira test issue removed');
   const tasks=await db.from('time_tasks').select('id').eq('organization_id',organizationId).eq('jira_key',key);assert.ifError(tasks.error);for(const t of tasks.data){const removed=await db.from('time_tasks').delete().eq('id',t.id).eq('organization_id',organizationId);assert.ifError(removed.error);}report.cleanup.push('Created fixture cache rows removed');}
 }
}
main().catch(e=>report.failures.push(e instanceof Error?e.message:'Verification failed')).finally(async()=>{await mkdir('test-results/provider-roundtrip',{recursive:true});await writeFile(`test-results/provider-roundtrip/${process.argv.includes('--jira-only')?'jira-report':process.argv.includes('--google-only')?'google-report':'report'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;});
