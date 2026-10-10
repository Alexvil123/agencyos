import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseManualTask} from '../src/lib/manual-task';
import {taskClientLabel,taskMatchesClient} from '../src/lib/work-jira-sync';
import type {TimeTask} from '../src/lib/time-types';
function form(choice='jira-label:NTT_Textiles',name='',date='2026-10-08'){const f=new FormData();for(const [k,v] of Object.entries({client_choice:choice,other_client:name,title:'Reel editing',work_date:date,task_id:'',expected:''}))f.set(k,v);return f;}
test('simple manual tasks accept exact Jira labels or an Others name with a valid work date',()=>{
 const jira=parseManualTask(form());assert.equal(jira.client_name,'NTT_Textiles');assert.equal(jira.client_source,'jira_label');assert.equal(jira.work_date,'2026-10-08');
 const other=parseManualTask(form('other','  New Client  '));assert.equal(other.client_name,'New Client');assert.equal(other.client_source,'other');
 assert.throws(()=>parseManualTask(form('other','  ')));assert.throws(()=>parseManualTask(form('anything')));assert.throws(()=>parseManualTask(form('other','Test','2026-02-30')));
});
test('manual client names appear and filter correctly without becoming Jira issues or labels',()=>{
 const task={source:'manual',manual_client_name:'NTT_Textiles',manual_client_source:'jira_label'} as TimeTask;
 assert.equal(taskClientLabel(task,[]),'NTT_Textiles');assert(taskMatchesClient(task,'jira-label:NTT_Textiles'));assert(!taskMatchesClient(task,'jira-label:Other'));
 const other={...task,manual_client_source:'other' as const};assert(!taskMatchesClient(other,'jira-label:NTT_Textiles'));assert(taskMatchesClient(other,'manual-client:NTT_Textiles'));
});
