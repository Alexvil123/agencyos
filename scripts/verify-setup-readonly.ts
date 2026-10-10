import {workAdmin} from '../src/lib/work-server';
import {jiraCredentials} from '../src/lib/jira-server';
import {jiraRequest} from '../src/lib/jira-http';
import {fetchWorkJiraSnapshot,WORK_JIRA_FIELDS,type RemoteWorkIssue} from '../src/lib/work-jira-sync';
import {jiraClientTotals} from '../src/lib/jira-client-labels';
import {jiraAutoFetch} from '../src/lib/jira-sync-settings-server';
import {writeFile} from 'node:fs/promises';
async function main(){
 const db=workAdmin(),{data:orgs,error}=await db.from('organizations').select('id,require_mfa').limit(2);if(error||orgs?.length!==1)throw Error('Workspace unavailable');const org=orgs[0].id;
 const summary:Record<string,unknown>={emailPasswordOnly:orgs[0].require_mfa===false};
 for(const [table,columns] of [['employees','id,membership_id,phone,employee_code,birthday,photo_path'],['time_attendance','id'],['time_breaks','id'],['task_work_sessions','id'],['time_corrections','id'],['announcements','id'],['chat_conversations','id,photo_path'],['chat_members','conversation_id'],['chat_messages','id'],['jira_account_links','membership_id']]){const r=await db.from(table).select(columns,{count:'exact',head:true}).eq(table==='chat_members'||table==='chat_messages'?'conversation_id':'organization_id',table==='chat_members'||table==='chat_messages'?'00000000-0000-0000-0000-000000000000':org);summary[table]={ready:!r.error,...(table==='chat_members'||table==='chat_messages'?{}:{count:r.count}),errorCode:r.error?.code};}
 const employees=await db.from('employees').select('birthday,employee_code,phone,photo_path').eq('organization_id',org);if(employees.error)throw Error('Profiles unavailable');summary.profileCompletion={employees:employees.data.length,birthdays:employees.data.filter(e=>e.birthday).length,employeeIDs:employees.data.filter(e=>e.employee_code).length,phones:employees.data.filter(e=>e.phone).length,photos:employees.data.filter(e=>e.photo_path).length};
 const bucket=await db.storage.getBucket('employee-photos');summary.photos={ready:!bucket.error,private:bucket.data?.public===false};summary.jiraAutoFetch=await jiraAutoFetch(org);
 const credentials=await jiraCredentials(org);if(!credentials)throw Error('Jira connection unavailable');
 const issues=await fetchWorkJiraSnapshot(cursor=>jiraRequest<{issues:RemoteWorkIssue[];nextPageToken?:string;isLast:boolean}>(credentials,'/rest/api/3/search/jql',{jql:'project in (OCT, SEP, SOURCE) ORDER BY updated DESC',fields:WORK_JIRA_FIELDS,maxResults:100,...(cursor?{nextPageToken:cursor}:{})}));
 const saved=await db.from('time_tasks').select('jira_key,jira_project,jira_metadata').eq('organization_id',org).eq('source','jira').is('canonical_id',null).limit(2000);if(saved.error)throw Error('Jira cache unavailable');const current=saved.data.filter(t=>t.jira_project!=='SOURCE'&&t.jira_metadata?.available!==false).map(t=>({key:t.jira_key,labels:t.jira_metadata?.labels||[]}));summary.jira={connection:true,fetched:issues.length,projects:Object.fromEntries(['OCT','SEP','SOURCE'].map(key=>[key,issues.filter(i=>i.project_key===key).length])),remoteWork:jiraClientTotals(issues.filter(i=>i.project_key!=='SOURCE')),cachedWork:jiraClientTotals(current),missingFromCache:issues.filter(i=>!saved.data.some(t=>t.jira_key===i.key)).length};
 summary.workflows=await Promise.all(['OCT','SEP','SOURCE'].map(async project=>{
  const types=await jiraRequest<{id:string;name:string;statuses:{id:string;name:string}[]}[]>(credentials,`/rest/api/3/project/${project}/statuses`);
  return {project,issueTypes:types.length,statuses:[...new Map(types.flatMap(t=>t.statuses).map(s=>[s.id,{id:s.id,name:s.name}])).values()]};
 }));
 await writeFile('test-results/full-verification-2026-10-10/live-setup.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
}
main().catch(()=>{console.error('Read-only setup verification could not finish. No task, attendance, chat or provider records were edited.');process.exitCode=1;});


