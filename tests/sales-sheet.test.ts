import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salesAccess,salesColumn,filterSales,salesInput,salesValue,salesTabAccess,type SalesGrid,type SalesRow} from '../src/lib/sales-sheet';
const cell=(text:string,extra={})=>({text,raw:text,formula:false,choices:[],restricted:false,...extra});
const row:SalesRow={id:'1',number:15,version:'v1',editable:true,cells:[cell('1'),cell('MCS Mart'),cell('Negative',{choices:['Positive','Negative']})]};
const grid:SalesGrid={title:'Business Development',tab:'Tracksheet',headers:['#','Business Name','Status'],rows:[row,{...row,id:'2',number:2,cells:[cell('2'),cell('Hospital'),cell('Positive')]}],fetchedAt:''};
test('Sales permissions require active employee context and explicit membership; Owner access does not open client accounts',()=>{assert.equal(salesAccess(true,'employee','owner',[]),true);assert.equal(salesAccess(false,'employee','sales',['sales']),true);assert.equal(salesAccess(false,'employee','other',['sales']),false);assert.equal(salesAccess(true,'client','owner',[]),false);});
test('Sales grants open every sheet tab while unassigned and client accounts stay denied',()=>{for(const tab of ['Tracksheet','Leads','Expenses','Expenses_1','Timing Report','Bike Track','Deal Closed','Future tab']){assert.equal(salesTabAccess(false,tab,'employee','sales',['sales']),true);assert.equal(salesTabAccess(false,tab,'employee','other',['sales']),false);assert.equal(salesTabAccess(true,tab,'client','owner',[]),false);assert.equal(salesTabAccess(true,tab,'employee','owner',[]),true);}});
test('Sales search and exact filters intersect across every sheet row',()=>{assert.deepEqual(filterSales(grid.rows,'  mart ',2,'Negative').map(r=>r.id),['1']);assert.equal(filterSales(grid.rows,'mart',2,'Positive').length,0);assert.equal(filterSales(grid.rows,'',-1,'').length,2);});
test('Sheet columns are bounded and named like Google Sheets',()=>{assert.equal(salesColumn(26),'AA');assert.equal(salesColumn(33),'AH');assert.equal(salesColumn(119),'DP');assert.throws(()=>salesColumn(256));});
test('Sheet calendar dates and times round-trip as numbers without changing contact strings or accepting impossible dates',()=>{const date=cell('11-Feb-2026',{raw:46064,kind:'date' as const});assert.equal(salesInput(date),'2026-02-11');assert.equal(salesValue(date,'2026-02-11'),46064);assert.throws(()=>salesValue(date,'2026-02-30'));const time=cell('10:30 AM',{raw:.4375,kind:'time' as const});assert.equal(salesInput(time),'10:30:00');assert.equal(salesValue(time,'10:30'),.4375);assert.throws(()=>salesValue(time,'25:30'));assert.equal(salesValue(cell('00123'),'00123'),'00123');assert.equal(salesValue(cell(''), '=not-a-formula'),'=not-a-formula');});

test('a Sales team member has the same sheet access as the Owner on every tab, including tabs added later; outsiders have none',()=>{
  const team=['member-1'];
  for(const tab of ['Tracksheet','Leads','Timing Report','Expenses','Brand New Tab 2026'])for(const [who,owner,kind,id] of [['owner',true,'employee','owner-membership'],['sales member',false,'employee','member-1']] as const)assert.equal(salesTabAccess(owner,tab,kind,id,team),true,`${who} on ${tab}`);
  assert.equal(salesTabAccess(false,'Tracksheet','employee','someone-else',team),false);
  assert.equal(salesTabAccess(false,'Tracksheet','client','member-1',team),false);
});
