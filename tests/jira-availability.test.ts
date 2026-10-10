import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingJiraTasks} from '../src/lib/jira-availability';
import {hydrateJiraMetadata} from '../src/lib/work-jira-sync';
import {jiraClientTotals} from '../src/lib/jira-client-labels';
import type {TimeTask} from '../src/lib/time-types';
test('complete snapshot retirement preserves newer, other-account and manual records and history',()=>{
 const base={source:'jira',jira_project:'OCT',jira_updated_at:'2026-10-08T09:00:00Z',jira_assignee_account_id:'a',jira_metadata:{labels:['NTT']}};
 const tasks=[{...base,id:'missing',jira_key:'OCT-1'},{...base,id:'present',jira_key:'OCT-2'},{...base,id:'newer',jira_key:'OCT-3',jira_updated_at:'2026-10-08T11:00:00Z'},{...base,id:'other',jira_key:'OCT-4',jira_assignee_account_id:'b'},{...base,id:'manual',source:'manual'},{...base,id:'retired',jira_key:'OCT-5',jira_metadata:{available:false}}] as TimeTask[];
 assert.deepEqual(missingJiraTasks(tasks,new Set(['OCT-2']),'2026-10-08T10:00:00Z','a').map(t=>t.id),['missing']);
 assert.equal(hydrateJiraMetadata({...tasks[0],jira_metadata:{...tasks[0].jira_metadata,available:false}}).jira_available,false);
 assert.equal(hydrateJiraMetadata(tasks[0]).jira_available,true);
});
test('label row totals distinguish unique tasks, unlabelled tasks and multi-label assignments',()=>{
 const issues=[{key:'OCT-1',labels:['NTT','NTT','Other']},{key:'OCT-2',labels:[]},{key:'OCT-1',labels:['NTT','Other']}];
 assert.deepEqual(jiraClientTotals(issues),{total:2,labelled:1,unlabelled:1,labelAssignments:2});
});
