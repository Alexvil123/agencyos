import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,calendarTasks,dayLabel,monthDays,monthEnd,monthStart,rangeLabel,shiftAnchor,taskDay,taskTone,tasksByDay,unscheduledTasks,validIsoDate,weekDays,weekStart,istDay,teamWeek,teamLoad,HEAVY_DAY} from '../src/lib/calendar';
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
test('tasks land on their India due day',()=>{
  assert.equal(taskDay(task({due_at:'2026-10-09T18:30:00Z'})),'2026-10-10');
  assert.equal(istDay('2026-10-09T18:29:00Z'),'2026-10-09');
  assert.equal(taskDay(task({due_at:null})),null);
});
test('tone, filters, grouping and the unscheduled tray',()=>{
  const today='2026-10-10';
  const done=task({id:'a',jira_key:'OCT-1',jira_status_category:'done',due_at:'2026-10-01T00:00:00+05:30'});
  const late=task({id:'b',jira_key:'OCT-2',jira_status_category:'new',due_at:'2026-10-05T00:00:00+05:30'});
  const doing=task({id:'c',jira_key:'OCT-3',jira_status_category:'indeterminate',due_at:'2026-10-10T00:00:00+05:30',membership_id:'m2'});
  const none=task({id:'d',jira_key:'OCT-4',jira_status_category:'new'});
  const manual=task({id:'e',source:'manual',jira_project:null,work_status:'on_hold',work_date:'2026-10-12',due_at:'2026-10-12T00:00:00+05:30'});
  const source=task({id:'f',jira_project:'SOURCE',due_at:'2026-10-10T00:00:00+05:30'});
  const gone=task({id:'g',jira_available:false,due_at:'2026-10-10T00:00:00+05:30'});
  assert.deepEqual([done,late,doing,none].map(t=>taskTone(t,today)),['done','overdue','progress','todo']);
  const all=[done,late,doing,none,manual,source,gone];
  assert.deepEqual(calendarTasks(all,{employee:'all',project:'all',state:'all'},today).map(t=>t.id),['a','b','c','d']);
  assert.deepEqual(calendarTasks(all,{employee:'m2',project:'all',state:'all'},today).map(t=>t.id),['c']);
  assert.ok(!calendarTasks(all,{employee:'all',project:'all',state:'all'},today).some(t=>t.id==='e'),'manual tasks never appear in the Calendar');
  assert.deepEqual(calendarTasks(all,{employee:'all',project:'all',state:'done'},today).map(t=>t.id),['a']);
  assert.deepEqual(calendarTasks(all,{employee:'all',project:'all',state:'open'},today).map(t=>t.id),['b','c','d']);
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

test('team week: a row per person (free people too), an Unassigned row, load, overdue and no-date backlog',()=>{
  const today='2026-10-14',days=weekDays(today),people=[{id:'m2',display_name:'Barath'},{id:'m1',display_name:'Ajith'},{id:'m3',display_name:'Sneha'}];
  const t=(id:string,member:string|null,due:string|null,cat='new')=>task({id,jira_key:'OCT-'+id,membership_id:member as string,jira_status_category:cat,due_at:due?due+'T00:00:00+05:30':null});
  const tasks=[t('1','m1','2026-10-14'),t('2','m1','2026-10-14'),t('3','m1','2026-10-14'),t('4','m1','2026-10-14'),t('5','m1','2026-10-14'),t('6','m1','2026-10-14','done'),
    t('7','m1','2026-09-30'),t('8','m1',null),t('9','m1',null,'done'),t('10','m2','2026-10-15','indeterminate'),t('11',null,'2026-10-16'),t('12','ghost','2026-10-16')];
  const {rows,totals}=teamWeek(tasks,days,people,today);
  assert.deepEqual(rows.map(r=>r.name),['Ajith','Barath','Sneha','Unassigned']);
  const ajith=rows[0];
  assert.equal(ajith.cells[2].tasks.length,6,'a done task still shows on its day');
  assert.equal(ajith.cells[2].open,5);assert.equal(ajith.cells[2].load,'heavy');
  assert.equal(ajith.open,7,'open = 5 today + 1 overdue + 1 without a date; done tasks never count');
  assert.equal(ajith.overdue,1,'overdue counts tasks outside the visible week too');
  assert.deepEqual(ajith.noDate.map(x=>x.id),['8'],'only open tasks without a date');
  assert.equal(rows[1].cells[3].load,'light');assert.equal(rows[2].cells.every(c=>c.load==='none')&&rows[2].open===0,true,'a free person is still listed');
  assert.deepEqual(rows[3].cells[4].tasks.map(x=>x.id),['11','12'],'unassigned and unknown-member tasks share the Unassigned row');
  assert.equal(totals[2],6);assert.equal(totals[3],1);assert.equal(totals[4],2);assert.equal(totals.length,7);
});
test('team week: one employee filter, no Unassigned row, load thresholds and week navigation',()=>{
  const today='2026-10-14',people=[{id:'m1',display_name:'Ajith'},{id:'m2',display_name:'Barath'}];
  const only=teamWeek([task({id:'x',jira_key:'OCT-1',membership_id:'m2',due_at:'2026-10-14T00:00:00+05:30'}),task({id:'y',jira_key:'OCT-2',membership_id:null as unknown as string,due_at:'2026-10-14T00:00:00+05:30'})],weekDays(today),people,today,'m2');
  assert.deepEqual(only.rows.map(r=>r.name),['Barath']);assert.equal(only.rows[0].cells[2].tasks.length,1);
  assert.deepEqual([0,1,2,3,4,5,9].map(teamLoad),['none','light','light','normal','normal','heavy','heavy']);assert.equal(HEAVY_DAY,5);
  assert.equal(shiftAnchor('2026-10-14','team',1),'2026-10-21');assert.equal(shiftAnchor('2026-10-14','team',-1),'2026-10-07');
  assert.equal(rangeLabel('2026-10-14','team'),rangeLabel('2026-10-14','week'));
  assert.deepEqual(teamWeek([],weekDays(today),[],today).rows,[],'no people and no tasks: no rows');
});
