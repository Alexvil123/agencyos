import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryRead,transientReadError} from '../src/lib/read-retry';
import {sourceLinks,employeeDay,weekHours} from '../src/lib/employee-day';
import {workAlerts} from '../src/lib/day-insights';
import type {WorkData} from '../src/lib/work-report';
const now='2026-10-08T12:00:00+05:30';
const fixture=():WorkData=>({self:'me',owner:false,manager:false,serverNow:now,people:[{id:'me',display_name:'Me',email:''}],clients:[],shifts:[],managers:[],attendance:[],breaks:[],tasks:[],logs:[],segments:[],corrections:[],departments:[],projectConfig:[],mappings:[],sessions:[],limited:false});
test('transient reads retry once; permission errors fail immediately and repeated failures stay bounded',async()=>{let calls=0;assert.equal(await retryRead(async()=>{if(++calls===1)throw {response:{status:503}};return 7;},transientReadError),7);assert.equal(calls,2);calls=0;await assert.rejects(retryRead(async()=>{calls++;throw new Error('Forbidden');},transientReadError));assert.equal(calls,1);calls=0;await assert.rejects(retryRead(async()=>{calls++;throw {code:'ECONNRESET'};},transientReadError));assert.equal(calls,2);assert(!transientReadError({response:{status:401}}));assert(!transientReadError({response:{status:403}}));});
test('source links include ADF links/cards and reject executable schemes',()=>{assert.deepEqual(sourceLinks({content:[{marks:[{attrs:{href:'https://example.com/source'}}]},{attrs:{url:'https://example.com/source'}},{attrs:{href:'javascript:alert(1)'}},{attrs:{url:'https://example.com/brief'}}]}),['https://example.com/source','https://example.com/brief']);});
test('employee day clips midnight, excludes other employees, keeps held gaps out and calculates combined target',()=>{const d=fixture();d.attendance=[{id:'a',membership_id:'me',work_date:'2026-10-08',shift:'flexible',clock_in:'2026-10-08T09:00:00+05:30',clock_out:null,break_override_seconds:1800,updated_at:now}];d.sessions=[{id:'1',employee_id:'me',task_id:'t',started_at:'2026-10-07T23:30:00+05:30',ended_at:'2026-10-08T00:30:00+05:30'},{id:'2',employee_id:'me',task_id:'t',started_at:'2026-10-08T10:00:00+05:30',ended_at:'2026-10-08T10:30:00+05:30'},{id:'3',employee_id:'other',task_id:'t',started_at:'2026-10-08T09:00:00+05:30',ended_at:now}] as WorkData['sessions'];const s=employeeDay(d,now);assert.equal(s.tracked,3600);assert.equal(s.remaining,23400);assert.equal(s.unallocated,5400);assert.equal(s.rows.length,1);});
test('employee assignment alerts are scoped, expire after one day and deep-link the task; reviewed corrections stay personal',()=>{const d=fixture();d.tasks=[{id:'a',membership_id:'me',title:'Assigned',assigned_at:'2026-10-08T10:00:00+05:30'},{id:'b',membership_id:'other',title:'Other',assigned_at:now},{id:'old',membership_id:'me',title:'Old',assigned_at:'2026-10-06T10:00:00+05:30'}] as WorkData['tasks'];d.corrections=[{id:'c',membership_id:'me',kind:'attendance',state:'approved'},{id:'private',membership_id:'other',kind:'attendance',state:'rejected'}] as WorkData['corrections'];const a=workAlerts(d,now);assert.equal(a.filter(a=>a.category==='assignment').length,1);assert.equal(a.find(a=>a.category==='assignment')?.href,'/work?task=a');assert(a.some(a=>a.id==='reviewed:c:approved'));assert(!a.some(a=>a.id.includes('private')));});

test('Jira Retry-After blocks repeated provider calls including writes without replaying them',async()=>{const {jiraRequest,JiraError,jiraRetryDelay}=await import('../src/lib/jira-http');let calls=0;const fetcher=(async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}});}) as typeof fetch;const credentials={organizationId:'cooldown-test',email:'test@example.com',token:'test'};await assert.rejects(jiraRequest(credentials,'/rest/api/3/myself',undefined,'GET',fetcher),JiraError);await assert.rejects(jiraRequest(credentials,'/rest/api/3/myself',undefined,'GET',fetcher),JiraError);await assert.rejects(jiraRequest(credentials,'/rest/api/3/issue/OCT-1/transitions',{transition:{id:'1'}},'POST',fetcher),JiraError);assert.equal(calls,1);assert.equal(jiraRetryDelay('120'),120000);assert.equal(jiraRetryDelay(null),60000);assert.equal(jiraRetryDelay('not a date'),60000);assert.equal(jiraRetryDelay('Thu, 08 Oct 2026 12:01:00 GMT',Date.parse('2026-10-08T12:00:00Z')),60000);});
test('week chart covers seven India days, oldest first, with breaks split out and other people excluded',()=>{
  const d=fixture();
  d.attendance=[
    {id:'a1',membership_id:'me',work_date:'2026-10-08',clock_in:'2026-10-08T09:30:00+05:30',clock_out:null,break_override_seconds:null},
    {id:'a0',membership_id:'me',work_date:'2026-10-05',clock_in:'2026-10-05T09:00:00+05:30',clock_out:'2026-10-05T18:00:00+05:30',break_override_seconds:3600},
    {id:'x',membership_id:'other',work_date:'2026-10-07',clock_in:'2026-10-07T09:00:00+05:30',clock_out:'2026-10-07T17:00:00+05:30',break_override_seconds:null},
  ] as unknown as WorkData['attendance'];
  d.breaks=[{id:'b1',attendance_id:'a1',membership_id:'me',start_at:'2026-10-08T11:00:00+05:30',end_at:'2026-10-08T11:30:00+05:30'}] as unknown as WorkData['breaks'];
  const week=weekHours(d,now);
  assert.equal(week.length,7);assert.equal(week[0].date,'2026-10-02');assert.equal(week[6].date,'2026-10-08');assert.equal(week[6].today,true);
  assert.deepEqual(week.map(w=>w.label),['Fri','Sat','Sun','Mon','Tue','Wed','Thu']);
  const today=week[6],monday=week[3];
  assert.equal(today.breaks,1800);assert.equal(today.working,2.5*3600-1800);
  assert.equal(monday.breaks,3600);assert.equal(monday.working,8*3600);
  assert.equal(week[5].working+week[5].breaks,0);
});
