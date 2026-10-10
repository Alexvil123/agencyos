import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskMatchesDate} from '../src/lib/task-filters';
test('Jira due, created and updated date filters include India date boundaries and missing dates',()=>{
 const t={source:'jira',due_at:'2026-10-08T23:59:59+05:30',jira_created_at:'2026-10-07T20:00:00Z',jira_updated_at:'2026-10-10T04:00:00Z'} as never;
 const base={source:'all',query:'',status:'all',client:'all',project:'all',sort:'due'};
 assert.equal(taskMatchesDate(t,{...base,dateField:'due',from:'2026-10-08',to:'2026-10-08'}),true);
 assert.equal(taskMatchesDate(t,{...base,dateField:'created',from:'2026-10-08',to:'2026-10-08'}),true);
 assert.equal(taskMatchesDate(t,{...base,dateField:'updated',from:'2026-10-08',to:'2026-10-08'}),false);
 assert.equal(taskMatchesDate({source:'jira',due_at:null} as never,{...base,missingDate:true}),true);
 assert.equal(taskMatchesDate({source:'jira',due_at:null} as never,{...base,from:'2026-10-08'}),false);
});
import type {TimeTask} from '../src/lib/time-types';
import {filterWorkTasks,taskMatchesPriority} from '../src/lib/task-filters';
import {workReport,type WorkData,type WorkFilters} from '../src/lib/work-report';
const tasks=[
 {id:'a',source:'jira',title:'NTT Reel',jira_key:'OCT-1',jira_project:'OCT',jira_status_id:'10',jira_status:'Design Review',jira_status_category:'indeterminate',jira_labels:['NTT'],jira_priority_name:'Highest',priority:'medium',task_type:'Story',work_status:'pending',department_id:'design',membership_id:'arun',assigned_at:'2026-10-07T09:00:00+05:30',updated_at:'2026-10-07T09:00:00+05:30'},
 {id:'b',source:'jira',title:'Poster',jira_key:'SEP-2',jira_project:'SEP',jira_status_id:'20',jira_status:'Published',jira_status_category:'done',jira_labels:['ntt'],jira_priority_name:'Low',work_status:'pending',membership_id:'priya',assigned_at:'2026-10-07T09:00:00+05:30',due_at:'2026-10-06T18:00:00+05:30',updated_at:'2026-10-07T10:00:00+05:30'},
 {id:'c',source:'manual',title:'Internal work',client_id:'client',work_status:'pending',priority:'high',membership_id:'arun',assigned_at:'2026-10-07T09:00:00+05:30',updated_at:'2026-10-07T08:00:00+05:30'},
 {id:'gone',source:'jira',title:'Moved issue',jira_available:false},
] as unknown as TimeTask[];
const board={source:'all',query:'',status:'all',client:'all',project:'all',sort:'updated'};
test('board filters intersect exact project, Jira status, label and trimmed search; manual status stays separate',()=>{
 assert.deepEqual(filterWorkTasks(tasks,{...board,project:'OCT',status:'jira:10',client:'jira-label:NTT',query:'  reel  '}).map(t=>t.id),['a']);
 assert.equal(filterWorkTasks(tasks,{...board,project:'OCT',client:'jira-label:ntt'}).length,0);
 assert.deepEqual(filterWorkTasks(tasks,{...board,status:'manual:pending'}).map(t=>t.id),['c']);
 assert.equal(filterWorkTasks(tasks,board).length,3);
 assert.equal(filterWorkTasks(tasks,{...board,source:'manual',client:'jira-label:NTT'}).length,0);
});
test('new tasks and remote status changes enter and leave active filters without fabricating timer state',()=>{
 const changed=tasks.map(t=>t.id==='a'?{...t,jira_status_id:'20',jira_status:'Published',jira_status_category:'done'}:t);
 assert.equal(filterWorkTasks(changed,{...board,status:'jira:10'}).length,0);
 assert.deepEqual(filterWorkTasks([...changed,{...tasks[0],id:'new',jira_key:'OCT-3'}],{...board,status:'jira:10'}).map(t=>t.id),['new']);
 assert.equal(changed[0].work_status,'pending');
 assert.equal(tasks[0].jira_status_id,'10');
});
test('report Jira status/priority and CRM state are independent; Jira completion prevents false overdue',()=>{
 const data={tasks:tasks.slice(0,3),sessions:[]} as unknown as WorkData;
 const f:WorkFilters={from:'2026-10-07',to:'2026-10-07',employee:'all',department:'all',client:'all',source:'all',project:'all',status:'all',priority:'all',type:'all',includeCancelled:false};
 const now='2026-10-07T11:00:00+05:30';
 const r=workReport(data,f,now);
 assert.equal(r.metrics.completed,1);assert.equal(r.metrics.inProgress,1);assert.equal(r.metrics.pending,1);assert.equal(r.metrics.overdue,0);
 assert.equal(taskMatchesPriority(tasks[0],'manual-priority:medium'),false);
 assert.equal(taskMatchesPriority(tasks[0],'jira-priority:Highest'),true);
 assert.deepEqual(workReport(data,{...f,jiraStatus:'20'},now).rows.map(r=>r.task.id),['b']);
 assert.deepEqual(workReport(data,{...f,priority:'jira-priority:Highest',client:'jira-label:NTT',department:'design',employee:'arun',type:'Story',status:'pending'},now).rows.map(r=>r.task.id),['a']);
 assert.equal(workReport(data,{...f,employee:'priya',project:'OCT'},now).rows.length,0);
});
