import {fetchWorkJiraSnapshot,type RemoteWorkIssue,type WorkJiraIssue} from './work-jira-sync';
import {JIRA_PROJECTS} from './jira-types';
type Page={issues:RemoteWorkIssue[];isLast:boolean;nextPageToken?:string};
/** Read every page before importing. Partial snapshots never count as successful reconciliation. */
export async function reconcileJiraSnapshot(fetchPage:(cursor?:string)=>Promise<Page>,importBatch:(issues:WorkJiraIssue[])=>Promise<void>){
 const issues=await fetchWorkJiraSnapshot(fetchPage);
 if(issues.some(i=>!JIRA_PROJECTS.includes(i.project_key as typeof JIRA_PROJECTS[number])||!new RegExp(`^${i.project_key}-[1-9][0-9]*$`).test(i.key)))throw new Error('Unexpected Jira project scope');
 for(let offset=0;offset<issues.length;offset+=100)await importBatch(issues.slice(offset,offset+100));
 return {count:issues.length,checkedAt:new Date().toISOString()};
}
