import test from 'node:test';
import assert from 'node:assert/strict';
import {salesView,salesMatches,salesColumnValues,salesStamp,salesStampShortcut,salesValue,describeSalesFilter,type SalesGrid,type SalesCell,type SalesFilter} from '../src/lib/sales-sheet';
const cell=(text:string,extra:Partial<SalesCell>={}):SalesCell=>({text,raw:text===''?null:text,formula:false,choices:[],restricted:false,...extra});
const day=(iso:string)=>{const c=cell('',{kind:'date'});const raw=salesValue(c,iso) as number;return cell(iso,{kind:'date',raw});};
const grid:SalesGrid={title:'t',tab:'Tracksheet',headers:['Name','Status','Amount','Visit'],fetchedAt:'',rows:[
 {number:2,id:'1',version:'a',editable:true,cells:[cell('Mart One'),cell('Pending'),cell('10',{raw:10}),day('2026-10-01')]},
 {number:3,id:'2',version:'b',editable:true,cells:[cell('mart two'),cell('Complete'),cell('25',{raw:25}),day('2026-10-10')]},
 {number:4,id:'3',version:'c',editable:true,cells:[cell('Hotel Sun'),cell(''),cell('',{raw:null}),cell('',{kind:'date',raw:null})]},
 {number:5,id:'4',version:'d',editable:true,cells:[cell('Cafe'),cell('Pending'),cell('40',{raw:40}),day('2026-10-20')]},
]};
const ids=(filters:SalesFilter[])=>salesView(grid,'',filters,null).map(r=>r.id);
test('text conditions follow Google Sheets: case-insensitive, negatives keep blanks',()=>{
 assert.deepEqual(ids([{column:0,op:'contains',value:'MART'}]),['1','2']);
 assert.deepEqual(ids([{column:0,op:'startswith',value:'mart'}]),['1','2']);
 assert.deepEqual(ids([{column:0,op:'endswith',value:'sun'}]),['3']);
 assert.deepEqual(ids([{column:0,op:'notcontains',value:'mart'}]),['3','4']);
 assert.deepEqual(ids([{column:0,op:'exact',value:' cafe '}]),['4']);
 assert.deepEqual(ids([{column:1,op:'isnot',value:'pending'}]),['2','3']);
 assert.deepEqual(ids([{column:1,op:'empty',value:''}]),['3']);
 assert.deepEqual(ids([{column:1,op:'notempty',value:''}]),['1','2','4']);
});
test('filter by values lists distinct texts with counts and supports blanks',()=>{
 const values=salesColumnValues(grid.rows,1);
 assert.deepEqual(values.map(v=>[v.text,v.count]),[['Complete',1],['Pending',2],['',1]]);
 assert.deepEqual(ids([{column:1,op:'in',value:'',values:['Pending']}]),['1','4']);
 assert.deepEqual(ids([{column:1,op:'in',value:'',values:['']}]),['3']);
 assert.deepEqual(ids([{column:1,op:'in',value:'',values:[]}]),[]);
 assert.deepEqual(ids([{column:1,op:'in',value:'',values:['Pending']},{column:2,op:'gt',value:'20'}]),['4']);
});
test('number and date conditions compare real values; blanks only pass negative conditions',()=>{
 assert.deepEqual(ids([{column:2,op:'gt',value:'10'}]),['2','4']);
 assert.deepEqual(ids([{column:2,op:'lt',value:'25'}]),['1']);
 assert.deepEqual(ids([{column:2,op:'eq',value:'25'}]),['2']);
 assert.deepEqual(ids([{column:2,op:'neq',value:'25'}]),['1','3','4']);
 assert.deepEqual(ids([{column:2,op:'between',value:'10',value2:'30'}]),['1','2']);
 assert.deepEqual(ids([{column:2,op:'notbetween',value:'10',value2:'30'}]),['3','4']);
 assert.deepEqual(ids([{column:3,op:'eq',value:'2026-10-10'}]),['2']);
 assert.deepEqual(ids([{column:3,op:'lt',value:'2026-10-10'}]),['1']);
 assert.deepEqual(ids([{column:3,op:'gt',value:'2026-10-10'}]),['4']);
 assert.deepEqual(ids([{column:3,op:'between',value:'2026-10-02',value2:'2026-10-15'}]),['2']);
 assert.equal(salesMatches(grid.rows[0].cells[2],{column:2,op:'gt',value:'abc'}),false);
 assert.equal(salesMatches(undefined,{column:9,op:'contains',value:'x'}),false);
});
test('filters across columns combine and describe themselves',()=>{
 assert.deepEqual(ids([{column:0,op:'contains',value:'mart'},{column:3,op:'gte',value:'2026-10-05'}]),['2']);
 assert.equal(describeSalesFilter('Status',{column:1,op:'in',value:'',values:['Pending','Complete','']}),'Status: Pending, Complete +1');
 assert.equal(describeSalesFilter('Amount',{column:2,op:'between',value:'1',value2:'5'}),'Amount is between 1 and 5');
});
test('date and time shortcuts write India time in the right format for each cell type',()=>{
 const now=new Date('2026-10-10T08:03:09Z');
 assert.equal(salesStamp({kind:'date',raw:1,choices:[]},'date',now),'2026-10-10');
 assert.equal(salesStamp({kind:'date',raw:1,choices:[]},'time',now),null);
 assert.equal(salesStamp({kind:'time',raw:0.5,choices:[]},'time',now),'13:33:09');
 assert.equal(salesStamp({kind:'datetime-local',raw:1,choices:[]},'datetime',now),'2026-10-10T13:33:09');
 assert.equal(salesStamp({kind:'datetime-local',raw:1,choices:[]},'date',now),'2026-10-10T00:00:00');
 assert.equal(salesStamp({raw:'x',choices:[]},'date',now),'10/10/2026');
 assert.match(salesStamp({raw:null,choices:[]},'time',now)||'',/^1:33:09\s?pm$/i);
 assert.equal(salesStamp({raw:null,choices:[]},'datetime',now)?.startsWith('10/10/2026 '),true);
 assert.equal(salesStamp({raw:5,choices:[]},'date',now),null);
 assert.equal(salesStamp({raw:'Pending',choices:['Pending']},'date',now),null);
 const key=(o:Partial<{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;altKey:boolean;code:string;key:string}>)=>salesStampShortcut({ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,code:'Semicolon',...o});
 assert.equal(key({ctrlKey:true}),'date');assert.equal(key({metaKey:true}),'date');
 assert.equal(key({ctrlKey:true,shiftKey:true}),'time');
 assert.equal(key({ctrlKey:true,shiftKey:true,altKey:true}),'datetime');
 assert.equal(key({code:'',key:';',ctrlKey:true}),'date');assert.equal(key({code:'',key:':',ctrlKey:true,shiftKey:true}),'time');assert.equal(key({}),null);assert.equal(key({ctrlKey:true,code:'KeyA'}),null);assert.equal(key({ctrlKey:true,altKey:true}),null);
});
