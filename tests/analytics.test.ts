import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsRange,analyticsDays,trackedByDay,completedByDay,trackedBy,openMix,analyticsSummary} from '../src/lib/analytics';
import type {WorkData,WorkSession} from '../src/lib/work-report';
const session=(id:string,task:string,employee:string,start:string,end:string|null):WorkSession=>({id,task_id:task,employee_id:employee,log_id:'l',started_at:start,paused_at:null,ended_at:end,duration_seconds:0,status:end?'completed':'active',organization_id:'o',updated_at:start});
const data={
  people:[{id:'a',display_name:'Asha',email:'a@x'},{id:'b',display_name:'Bala',email:'b@x'}],clients:[],
  tasks:[
    {id:'t1',membership_id:'a',source:'jira',jira_project:'OCT',jira_key:'OCT-1',title:'One',jira_labels:['NTT'],jira_status_category:'done',jira_resolved_at:'2026-10-07T12:00:00+05:30',assigned_at:'2026-10-05T09:00:00+05:30',due_at:'2026-10-09',work_status:'completed'},
    {id:'t2',membership_id:'b',source:'jira',jira_project:'SEP',jira_key:'SEP-2',title:'Two',jira_labels:['Dreamdaa'],jira_status_category:'indeterminate',assigned_at:'2026-10-06T09:00:00+05:30',due_at:'2026-10-08'},
    {id:'t3',membership_id:'a',source:'manual',title:'Manual',work_status:'pending',assigned_at:'2026-10-06T09:00:00+05:30',manual_client_name:'Walk-in'},
    {id:'src',membership_id:'a',source:'jira',jira_project:'SOURCE',jira_key:'SOURCE-1',title:'Reference',jira_status_category:'new',assigned_at:'2026-10-06T09:00:00+05:30'},
  ],
  sessions:[
    session('s1','t1','a','2026-10-06T10:00:00+05:30','2026-10-06T12:00:00+05:30'),
    session('s2','t1','a','2026-10-06T23:00:00+05:30','2026-10-07T01:00:00+05:30'),
    session('s3','t2','b','2026-10-07T10:00:00+05:30','2026-10-07T10:30:00+05:30'),
    session('s4','src','a','2026-10-07T10:00:00+05:30','2026-10-07T18:00:00+05:30'),
    session('s5','t3','a','2026-10-07T14:00:00+05:30',null),
  ],
} as unknown as WorkData;
const range={from:'2026-10-05',to:'2026-10-08'};
test('presets and day lists use whole India calendar days',()=>{
  assert.deepEqual(analyticsRange('7d','2026-10-10'),{from:'2026-10-04',to:'2026-10-10'});
  assert.deepEqual(analyticsRange('month','2026-10-10'),{from:'2026-10-01',to:'2026-10-31'});
  assert.deepEqual(analyticsRange('last_month','2026-01-15'),{from:'2025-12-01',to:'2025-12-31'});
  assert.deepEqual(analyticsDays(range),['2026-10-05','2026-10-06','2026-10-07','2026-10-08']);
  assert.throws(()=>analyticsDays({from:'2026-10-09',to:'2026-10-01'}));
});
test('tracked time is split across midnight, ignores SOURCE and open sessions',()=>{
  const days=Object.fromEntries(trackedByDay(data,range).map(d=>[d.day,d.seconds]));
  assert.equal(days['2026-10-05'],0);
  assert.equal(days['2026-10-06'],2*3600+3600);
  assert.equal(days['2026-10-07'],3600+1800);
  assert.equal(trackedByDay(data,range,'b').reduce((sum,d)=>sum+d.seconds,0),1800);
});
test('breakdowns group by client label, employee and project',()=>{
  const clients=trackedBy(data,range,'client');
  assert.deepEqual(clients.map(c=>[c.label,c.seconds,c.tasks]),[['NTT',3*3600+3600,1],['Dreamdaa',1800,1]].map(([l,s,t])=>[l,s===3*3600+3600?4*3600:s,t]));
  assert.deepEqual(trackedBy(data,range,'employee').map(e=>e.label),['Asha','Bala']);
  assert.deepEqual(trackedBy(data,range,'project').map(p=>p.key),['OCT','SEP']);
  assert.deepEqual(trackedBy(data,range,'employee','b').map(e=>e.label),['Bala']);
});
test('completed tasks are counted on their completion day and open work is split with overdue',()=>{
  const done=Object.fromEntries(completedByDay(data,range).map(d=>[d.day,d.count]));
  assert.equal(done['2026-10-07'],1);assert.equal(done['2026-10-06'],0);
  assert.equal(completedByDay(data,range,'b').reduce((sum,d)=>sum+d.count,0),0);
  assert.deepEqual(openMix(data,'2026-10-10T10:00:00+05:30'),{pending:1,in_progress:0,on_hold:0,overdue:1});
  assert.deepEqual(openMix(data,'2026-10-07T10:00:00+05:30'),{pending:1,in_progress:1,on_hold:0,overdue:0});
});
test('summary reuses the report rules and counts only people with closed work',()=>{
  const summary=analyticsSummary(data,range,'2026-10-10T10:00:00+05:30');
  assert.equal(summary.trackedSeconds,4*3600+1800);
  assert.equal(summary.completed,1);
  assert.equal(summary.activeEmployees,2);
  assert.equal(summary.days,4);
  assert.equal(analyticsSummary(data,range,'2026-10-10T10:00:00+05:30','b').trackedSeconds,1800);
});
