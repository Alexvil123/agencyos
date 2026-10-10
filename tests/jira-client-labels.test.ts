import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jiraClientLabels} from '../src/lib/jira-client-labels';
import type {WorkJiraIssue} from '../src/lib/work-jira-sync';
import {taskClientLabel} from '../src/lib/work-jira-sync';
import type {TimeTask} from '../src/lib/time-types';
test('client labels preserve case, deduplicate issues and labels, and count actual Jira categories',()=>{
 const a={key:'OCT-1',labels:['NTT','NTT','General'],project_key:'OCT',status_category:'done'} as WorkJiraIssue;
 const b={key:'SEP-2',labels:['ntt','NTT'],project_key:'SEP',status_category:'indeterminate'} as WorkJiraIssue;
 const groups=jiraClientLabels([a,a,b,{...a,key:'OCT-3',labels:[]}]);
 assert.equal(groups.length,3);
 assert.deepEqual(groups.find(g=>g.label==='NTT'),{label:'NTT',tasks:2,done:1,inProgress:1,projects:['OCT','SEP']});
 assert.equal(groups.find(g=>g.label==='ntt')?.tasks,1);
 assert.deepEqual(jiraClientLabels([]),[]);
});

test('legacy manual client names cannot appear in task/report client output',()=>{
 const legacy=[{id:'manual-client',display_name:'Old manually entered name'}];
 assert.equal(taskClientLabel({source:'manual',client_id:'manual-client'} as TimeTask,legacy),'Internal / CRM manual task');
 assert.equal(taskClientLabel({source:'jira',jira_labels:['Actual_Jira_Client']} as TimeTask,legacy),'Actual_Jira_Client');
});
