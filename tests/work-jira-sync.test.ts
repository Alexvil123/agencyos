import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchWorkJiraSnapshot,mergeWorkJiraSnapshot,workIssue,taskDisplayStatus,taskPriorityLabel,type RemoteWorkIssue} from '../src/lib/work-jira-sync';
import type {TimeTask} from '../src/lib/time-types';
import {hydrateJiraMetadata,taskClientLabel,taskMatchesClient,parseJiraLabels,jiraStillOpen} from '../src/lib/work-jira-sync';
import {statusCategoryFor} from '../src/lib/jira-types';
import {taskOperationalState} from '../src/lib/task-filters';
test('exact Jira labels survive caching and filter without fuzzy client matching',()=>{
 const cached=hydrateJiraMetadata({...task,jira_metadata:{labels:['NTT_Textiles','ntt_textiles'],priority_name:'Highest'}});
 assert.equal(taskClientLabel(cached,[]),'NTT_Textiles · ntt_textiles');
 assert.equal(taskMatchesClient(cached,'jira-label:NTT_Textiles'),true);
 assert.equal(taskMatchesClient(cached,'jira-label:NTT'),false);
 assert.equal(cached.work_status,'pending');
 assert.deepEqual(parseJiraLabels('NTT_Textiles\nntt_textiles\nNTT_Textiles'),['NTT_Textiles','ntt_textiles']);
 assert.deepEqual(parseJiraLabels(''),[]);
 assert.throws(()=>parseJiraLabels('Client Name'),/without spaces/);
});
const remote=(key='OCT-1',updated='2026-10-07T08:00:00Z'):RemoteWorkIssue=>({id:key,key,fields:{project:{key:'OCT'},summary:'Live title',description:{type:'doc',content:[{type:'paragraph',content:[{text:'Actual description'}]}]},status:{id:'22',name:'Client Content Approval',statusCategory:{key:'indeterminate'}},assignee:{accountId:'worker',displayName:'Jira employee'},updated,priority:{id:'1',name:'Highest'},duedate:'2026-10-09',issuetype:{name:'Content'}}});
const task:TimeTask={id:'task',membership_id:'member',source:'jira',jira_key:'OCT-1',title:'Cached title',client_id:null,due_at:null,completed_at:null,work_status:'pending',jira_status:'Old status',jira_updated_at:'2026-10-06T08:00:00Z'};
test('sync follows every Jira page, deduplicates keys and keeps the newest version',async()=>{
 const cursors:(string|undefined)[]=[];const issues=await fetchWorkJiraSnapshot(async cursor=>{cursors.push(cursor);return cursor?{issues:[remote('OCT-1','2026-10-07T09:00:00Z'),remote('OCT-2')],isLast:true}:{issues:[remote()],isLast:false,nextPageToken:'page2'};});
 assert.deepEqual(cursors,[undefined,'page2']);assert.equal(issues.length,2);assert.equal(issues[0].jira_updated,'2026-10-07T09:00:00Z');
});
test('incomplete, cyclic or failed pagination cannot claim a complete snapshot',async()=>{
 await assert.rejects(fetchWorkJiraSnapshot(async()=>({issues:[],isLast:false})),/pagination/);
 await assert.rejects(fetchWorkJiraSnapshot(async()=>({issues:[],isLast:false,nextPageToken:'same'})),/pagination/);
 await assert.rejects(fetchWorkJiraSnapshot(async()=>{throw new Error('rate limited');}),/rate limited/);
});
test('Jira fields and status are exact; merging never fabricates timer or CRM work state',()=>{
 const [merged]=mergeWorkJiraSnapshot([task],[workIssue(remote())]);
 assert.equal(merged.title,'Live title');assert.equal(merged.description,'Actual description');assert.equal(taskDisplayStatus(merged),'Client Content Approval');assert.equal(taskPriorityLabel(merged),'Highest');assert.equal(merged.jira_assignee_name,'Jira employee');assert.equal(merged.due_at,'2026-10-09T23:59:59+05:30');assert.equal(merged.work_status,'pending');assert.equal(task.title,'Cached title');
});
test('tasks removed from a complete visible Jira scope retain CRM history but leave the current board',()=>{
 const manual={...task,id:'manual',source:'manual' as const};const [missing,unchanged]=mergeWorkJiraSnapshot([task,manual],[]);assert.equal(missing.jira_available,false);assert.equal(missing.id,task.id);assert.equal(unchanged,manual);
});
test('delayed Jira search cannot overwrite a newer directly confirmed CRM copy',()=>{
 const newer={...task,jira_updated_at:'2026-10-07T10:00:00Z',jira_status:'Posted',title:'Confirmed edit'};const [merged]=mergeWorkJiraSnapshot([newer],[workIssue(remote())]);assert.equal(merged.title,'Confirmed edit');assert.equal(taskDisplayStatus(merged),'Posted');
});
test('missing Jira priority is explicit and never presented as a fabricated Medium',()=>{
 assert.equal(taskPriorityLabel(task),'Priority unavailable');assert.equal(taskDisplayStatus({...task,source:'manual',work_status:'on_hold'}),'On Hold');
});
test('an ended Jira task can be started again unless Jira itself says Done',()=>{
  assert.equal(jiraStillOpen('indeterminate'),true);assert.equal(jiraStillOpen('new'),true);
  assert.equal(jiraStillOpen('done'),false);assert.equal(jiraStillOpen(undefined),false);assert.equal(jiraStillOpen(''),false);
});
test('OCT pipeline statuses get the categories SEP already has, so a Posted task is closed in every month project',()=>{
  for(const project of ['OCT','SEP','NOV'])for(const name of ['Done','Posted','Client Approved','Design Completed'])assert.equal(statusCategoryFor(project,name,'new'),'done');
  for(const name of ['Design In Progress','Client Sent','Client Content Approval','Design Hold'])assert.equal(statusCategoryFor('OCT',name,'new'),'indeterminate');
  for(const name of ['To Do','Design To Do','Shoot Needed'])assert.equal(statusCategoryFor('OCT',name,undefined),'new');
  assert.equal(statusCategoryFor('OCT','  posted ','new'),'done');
  assert.equal(statusCategoryFor('OCT','Quality Check','indeterminate'),'indeterminate');
  assert.equal(statusCategoryFor('SOURCE','Posted','new'),'new');assert.equal(statusCategoryFor('SOURCE','NTT',undefined),undefined);
  const posted=remote();posted.fields.status={id:'11065',name:'Posted',statusCategory:{key:'new'}};
  assert.equal(workIssue(posted).status_category,'done');
  const cached=hydrateJiraMetadata({...task,jira_project:'OCT',jira_status:'Posted',jira_metadata:{status_category:'new'}});
  assert.equal(cached.jira_status_category,'done');assert.equal(taskOperationalState(cached),'completed');
  const open=hydrateJiraMetadata({...task,jira_project:'OCT',jira_status:'Design In Progress',jira_metadata:{status_category:'new'}});
  assert.equal(taskOperationalState(open),'in_progress');
});
