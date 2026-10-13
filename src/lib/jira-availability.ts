import type {TimeTask} from './time-types';
import {JIRA_PROJECTS} from './jira-types';
/** Only a completed, validated snapshot may retire cached current-board records. */
export function missingJiraTasks(tasks:TimeTask[],keys:Set<string>,startedAt:string,account:string|null){
 return tasks.filter(t=>t.source==='jira'&&!t.canonical_id&&(JIRA_PROJECTS as readonly string[]).includes(t.jira_project||'')&&t.jira_key&&!keys.has(t.jira_key)&&(!account||t.jira_assignee_account_id===account)&&!!t.jira_updated_at&&Date.parse(t.jira_updated_at)<=Date.parse(startedAt)&&t.jira_metadata?.available!==false);
}
