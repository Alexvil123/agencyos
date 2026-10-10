import {jiraCredentials} from '../src/lib/jira-server';
import {jiraRequest} from '../src/lib/jira-http';
import {fetchWorkJiraSnapshot,WORK_JIRA_FIELDS,type RemoteWorkIssue} from '../src/lib/work-jira-sync';
import {jiraClientTotals} from '../src/lib/jira-client-labels';
import {reconcileJiraAvailability} from '../src/lib/jira-availability-server';
import {workAdmin} from '../src/lib/work-server';
async function main(){
 const db=workAdmin(),connections=await db.from('jira_oauth_connections').select('organization_id,connected_by').limit(2);if(connections.error||connections.data?.length!==1)throw new Error('Expected one authorized Jira connection');
 const {organization_id:org,connected_by:actor}=connections.data[0],credentials=await jiraCredentials(org);if(!credentials)throw new Error('Jira connection unavailable');const started=new Date().toISOString();
 const issues=await fetchWorkJiraSnapshot(cursor=>jiraRequest<{issues:RemoteWorkIssue[];nextPageToken?:string;isLast:boolean}>(credentials,'/rest/api/3/search/jql',{jql:'project in (OCT, SEP, SOURCE) ORDER BY updated DESC',fields:WORK_JIRA_FIELDS,maxResults:100,...(cursor?{nextPageToken:cursor}:{})}));
 for(let n=0;n<issues.length;n+=100){const r=await db.rpc('work_import',{org_id:org,actor_user:actor,issues:issues.slice(n,n+100)});if(r.error)throw new Error('Import failed');}
 await reconcileJiraAvailability(org,issues.map(i=>i.key),started,null);
 const saved=await db.from('time_tasks').select('jira_key,jira_project,jira_metadata').eq('organization_id',org).eq('source','jira').is('canonical_id',null).limit(2000);if(saved.error)throw new Error('Saved snapshot unavailable');
 const current=saved.data.filter(t=>t.jira_project!=='SOURCE'&&t.jira_metadata?.available!==false).map(t=>({key:t.jira_key,labels:t.jira_metadata?.labels||[]}));
 const remote=jiraClientTotals(issues.filter(i=>i.project_key!=='SOURCE')),cached=jiraClientTotals(current);console.log(JSON.stringify({remote,cached,equal:JSON.stringify(remote)===JSON.stringify(cached),retainedUnavailable:saved.data.filter(t=>t.jira_metadata?.available===false).length}));if(JSON.stringify(remote)!==JSON.stringify(cached))throw new Error('Counts differ');
}
main().catch(()=>{console.error('Client snapshot verification failed');process.exitCode=1;});
