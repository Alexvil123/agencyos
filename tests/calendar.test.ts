import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,calendarTasks,dayLabel,monthDays,monthEnd,monthStart,rangeLabel,shiftAnchor,taskDay,taskTone,tasksByDay,unscheduledTasks,validIsoDate,weekDays,weekStart,istDay} from '../src/lib/calendar';
import {calendarCreateSchema,calendarUpdateSchema} from '../src/lib/calendar-input';
import {assignIssue,createIssue,createIssueFields,setIssueDueDate,type JiraCall} from '../src/lib/calendar-jira';
import type {TimeTask} from '../src/lib/time-types';
const task=(extra:Partial<TimeTask>):TimeTask=>({id:'t',membership_id:'m1',title:'Task',client_id:null,due_at:null,completed_at:null,source:'jira',jira_project:'OCT',jira_available:true,...extra});
test('month and week grids start on Monday and cover whole weeks',()=>{
  assert.equal(weekStart('2026-10-10'),'2026-10-05');
  assert.deepEqual(weekDays('2026-10-10'),['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']);
  const oct=monthDays('2026-10-17');
  assert.equal(oct.length,35);assert.equal(oct[0],'2026-09-28');assert.equal(oct.at(-1),'2026-11-01');
  assert.equal(monthDays('2027-02-10').length,28);assert.equal(monthDays('2026-02-10').length,35);assert.equal(monthDays('2026-08-10').length,42);
  assert.equal(monthStart('2026-10-17'),'2026-10-01');assert.equal(monthEnd('2026-02-10'),'2026-02-28');assert.equal(monthEnd('2028-02-10'),'2028-02-29');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
});
test('navigation moves by month or week and labels read naturally',()=>{
  assert.equal(shiftAnchor('2026-10-31','month',1),'2026-11-01');assert.equal(shiftAnchor('2026-01-15','month',-1),'2025-12-01');
  assert.equal(shiftAnchor('2026-10-10','week',1),'2026-10-17');
  assert.equal(rangeLabel('2026-10-10','month'),'October 2026');
  assert.equal(rangeLabel('2026-10-10','week'),'5 Oct – 11 Oct 2026');
  assert.match(dayLabel('2026-10-10'),/Saturday/);
  assert.equal(validIsoDate('2026-02-30'),false);assert.equal(validIsoDate('2026-10-10'),true);assert.equal(validIsoDate('10/10/2026'),false);
});
test('tasks land on their India due day, manual tasks on their work date',()=>{
  assert.equal(taskDay(task({due_at:'2026-10-09T18:30:00Z'})),'2026-10-10');
  assert.equal(istDay('2026-10-09T18:29:00Z'),'2026-10-09');
  assert.equal(taskDay(task({source:'manual',work_date:'2026-10-12'})),'2026-10-12');
  assert.equal(taskDay(task({due_at:null})),null);
});
test('tone, filters, grouping and the unscheduled tray',()=>{
  const today='2026-10-10';
  const done=task({id:'a',jira_key:'OCT-1',jira_status_category:'done',due_at:'2026-10-01T00:00:00+05:30'});
  const late=task({id:'b',jira_key:'OCT-2',jira_status_category:'new',due_at:'2026-10-05T00:00:00+05:30'});
  const doing=task({id:'c',jira_key:'OCT-3',jira_status_category:'indeterminate',due_at:'2026-10-10T00:00:00+05:30',membership_id:'m2'});
  const none=task({id:'d',jira_key:'OCT-4',jira_status_category:'new'});
  const manual=task({id:'e',source:'manual',jira_project:null,work_status:'on_hold',work_date:'2026-10-12'});
  const source=task({id:'f',jira_project:'SOURCE',due_at:'2026-10-10T00:00:00+05:30'});
  const gone=task({id:'g',jira_available:false,due_at:'2026-10-10T00:00:00+05:30'});
  assert.deepEqual([done,late,doing,none,manual].map(t=>taskTone(t,today)),['done','overdue','progress','todo','hold']);
  const all=[done,late,doing,none,manual,source,gone];
  assert.deepEqual(calendarTasks(all,{employee:'all',project:'all',state:'all'},today).map(t=>t.id),['a','b','c','d','e']);
  assert.deepEqual(calendarTasks(all,{employee:'m2',project:'all',state:'all'},today).map(t=>t.id),['c']);
  assert.deepEqual(calendarTasks(all,{employee:'all',project:'manual',state:'all'},today).map(t=>t.id),['e']);
  assert.deepEqual(calendarTasks(all,{employee:'all',project:'all',state:'done'},today).map(t=>t.id),['a']);
  assert.deepEqual(calendarTasks(all,{employee:'all',project:'all',state:'open'},today).map(t=>t.id),['b','c','d','e']);
  const days=tasksByDay(all);assert.deepEqual([...days.keys()].sort(),['2026-10-01','2026-10-05','2026-10-10','2026-10-12']);
  assert.deepEqual(unscheduledTasks(all,today).map(t=>t.id),['d']);
});
test('create and update input is validated before anything reaches Jira',()=>{
  const ticket='3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const ok=calendarCreateSchema.parse({project:'OCT',issue_type:'10001',summary:' Reel shoot ',description:'x',label:'Client_Name',due_date:'2026-10-12',assignee:'',ticket,confirmed:'yes'});
  assert.equal(ok.summary,'Reel shoot');
  assert.throws(()=>calendarCreateSchema.parse({project:'SOURCE',issue_type:'1',summary:'a',ticket,confirmed:'yes'}));
  assert.throws(()=>calendarCreateSchema.parse({project:'OCT',issue_type:'abc',summary:'a',ticket,confirmed:'yes'}));
  assert.throws(()=>calendarCreateSchema.parse({project:'OCT',issue_type:'1',summary:'a',label:'two words',ticket,confirmed:'yes'}));
  assert.throws(()=>calendarCreateSchema.parse({project:'OCT',issue_type:'1',summary:'a',due_date:'2026-02-30',ticket,confirmed:'yes'}));
  assert.throws(()=>calendarCreateSchema.parse({project:'OCT',issue_type:'1',summary:'a',ticket,confirmed:'no'}));
  const id='3f2504e0-4f89-41d3-9a0c-0305e82c3302';
  assert.equal(calendarUpdateSchema.parse({task:id,change_due:'yes',due_date:'2026-10-20'}).due_date,'2026-10-20');
  assert.throws(()=>calendarUpdateSchema.parse({task:id}));
});
test('Jira calls: fields, assignment and due date use the documented endpoints',async()=>{
  const calls:{path:string;body:unknown;method?:string}[]=[];
  const call=(async(path:string,body?:unknown,method?:string)=>{calls.push({path,body,method});return path==='/rest/api/3/issue'?{key:'OCT-9'}:undefined;}) as JiraCall;
  const fields=createIssueFields({project:'OCT',issue_type:'10001',summary:'S',description:'a\nb',label:'Client_X',due_date:'2026-10-12'});
  assert.deepEqual(fields.labels,['Client_X']);assert.equal(fields.duedate,'2026-10-12');assert.deepEqual(fields.project,{key:'OCT'});
  assert.equal('labels' in createIssueFields({project:'SEP',issue_type:'1',summary:'S',description:'',label:'',due_date:''}),false);
  assert.throws(()=>createIssueFields({project:'SOURCE',issue_type:'1',summary:'S',description:'',label:'',due_date:''}));
  assert.equal(await createIssue(call,{project:'OCT',issue_type:'10001',summary:'S',description:'',label:'',due_date:''}),'OCT-9');
  await assignIssue(call,'OCT-9','acc-1');await assignIssue(call,'OCT-9',null);await setIssueDueDate(call,'OCT-9','2026-10-20');await setIssueDueDate(call,'OCT-9',null);
  assert.deepEqual(calls.slice(1).map(c=>[c.method,c.path,JSON.stringify(c.body)]),[
    ['PUT','/rest/api/3/issue/OCT-9/assignee','{"accountId":"acc-1"}'],['PUT','/rest/api/3/issue/OCT-9/assignee','{"accountId":null}'],
    ['PUT','/rest/api/3/issue/OCT-9','{"fields":{"duedate":"2026-10-20"}}'],['PUT','/rest/api/3/issue/OCT-9','{"fields":{"duedate":null}}']]);
  await assert.rejects(()=>assignIssue(call,'SOURCE-1','x'));
  await assert.rejects(()=>createIssue((async()=>({})) as JiraCall,{project:'OCT',issue_type:'1',summary:'S',description:'',label:'',due_date:''}));
});
