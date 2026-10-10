import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNativeSales,freshSalesRow,salesUpdateRequests,salesInsertRequests,salesDeleteRequest,assertSalesStructure,type NativeCell,type NativeWorkbook} from '../src/lib/sales-native';
import {salesView} from '../src/lib/sales-sheet';
const text=(s:string):NativeCell=>({formattedValue:s,userEnteredValue:{stringValue:s}});
const num=(n:number):NativeCell=>({formattedValue:String(n),userEnteredValue:{numberValue:n}});
function workbook(rows:NativeCell[][],frozenRowCount=1):NativeWorkbook{return {properties:{title:'Test'},sheets:[{properties:{title:'Tracksheet',sheetId:7,gridProperties:{rowCount:100,columnCount:120,frozenRowCount}},data:[{rowData:rows.map(values=>({values}))}]}]};}
function example(){return parseNativeSales(workbook([[text('#'),text('Company'),text('Status'),text('Total')],[num(1),text('Business'),{...text('Approved'),dataValidation:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:'Approved'},{userEnteredValue:'Hold'}]}}},{formattedValue:'0',userEnteredValue:{formulaValue:'=A2*0'},effectiveValue:{numberValue:0}}],[num(2),text('Other'),text('Hold'),num(10)]]),'Tracksheet').grid;}
test('Native parser preserves multi-row headers, wide sheets, formula results and row coordinates',()=>{
 const wide=Array.from({length:120},(_,i)=>text('Column '+i));const {grid}=parseNativeSales(workbook([wide,[...wide.map(()=>text('')),num(1)]],1),'Tracksheet');assert.equal(grid.headers.length,121);assert.equal(grid.identityColumn,-1);assert.equal(grid.rows[0].id,'row:2');
 const expense=parseNativeSales(workbook([[text('Expenses')],[text('#'),text('Date')],[num(1),num(46064)]],2),'Tracksheet').grid;assert.deepEqual(expense.headers,['Expenses / #','Date']);assert.equal(expense.rows[0].number,3);assert.equal(expense.identityColumn,0);
});
test('Formula effective zero is not empty and participates in numeric filters and sorting',()=>{
 const grid=example();assert.deepEqual(salesView(grid,'',[{column:3,op:'empty',value:''}],null),[]);assert.deepEqual(salesView(grid,'',[{column:3,op:'lte',value:'1'}],null).map(r=>r.id),['1']);assert.deepEqual(salesView(grid,'',[{column:2,op:'is',value:'Hold'},{column:3,op:'gte',value:'5'}],null).map(r=>r.id),['2']);assert.deepEqual(salesView(grid,'',[],{column:3,direction:'desc'}).map(r=>r.id),['2','1']);
});
test('Fresh edits use unique IDs and reject changed rows, duplicate IDs and structural changes',()=>{
 const grid=example(),row=grid.rows[0];assert.equal(freshSalesRow(grid,row.id,row.version).number,2);assert.throws(()=>freshSalesRow(grid,row.id,'stale'));assert.throws(()=>freshSalesRow({...grid,rows:[row,row]},row.id,row.version));assert.throws(()=>assertSalesStructure(grid,'stale'));assert.doesNotThrow(()=>assertSalesStructure(grid,grid.version!));
});
test('Cell writes preserve formulas and formats, enforce dropdowns and save literal strings safely',()=>{
 const grid=example(),row=grid.rows[0];assert.throws(()=>salesUpdateRequests(grid,row,{'0':'3'}));assert.throws(()=>salesUpdateRequests(grid,row,{'3':'5'}));assert.throws(()=>salesUpdateRequests(grid,row,{'2':'Unknown'}));assert.equal(salesUpdateRequests(grid,row,{'1':'Business'}).length,0);
 const request=salesUpdateRequests(grid,row,{'1':'=IMPORTXML("x")'})[0];assert.equal(request.updateCells.fields,'userEnteredValue');assert.deepEqual(request.updateCells.rows[0].values,[{userEnteredValue:{stringValue:'=IMPORTXML("x")'}}]);assert.deepEqual(salesUpdateRequests(grid,row,{'1':''})[0].updateCells.rows[0].values,[{}]);
});
test('Insert copies native formatting, validation and relative formulas without copying business literals',()=>{
 const grid=example(),plan=salesInsertRequests(grid,2,{'1':'Business','2':'Hold'});assert.equal(plan.number,3);assert.deepEqual(plan.requests[0],{insertDimension:{range:{sheetId:7,dimension:'ROWS',startIndex:2,endIndex:3},inheritFromBefore:true}});
 const encoded=JSON.stringify(plan.requests);assert.match(encoded,/PASTE_FORMAT/);assert.match(encoded,/PASTE_DATA_VALIDATION/);assert.match(encoded,/PASTE_FORMULA/);assert.doesNotMatch(encoded,/PASTE_NORMAL/);assert.match(encoded,/"numberValue":3/);assert.match(encoded,/"stringValue":"Business"/);assert.throws(()=>salesInsertRequests(grid,2,{}));
});
test('Merged, protected and spilled output rows cannot be deleted or used as insertion templates',()=>{
 for(const change of ['merge','protected','spill']){const body=workbook([[text('#'),text('Company')],[num(1),text('Business')]]),sheet=body.sheets[0];if(change==='merge')sheet.merges=[{startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:2}];if(change==='protected')sheet.protectedRanges=[{range:{startRowIndex:1,endRowIndex:2}}];if(change==='spill')sheet.data![0].rowData![1].values![1]={formattedValue:'Computed',effectiveValue:{stringValue:'Computed'}};const grid=parseNativeSales(body,'Tracksheet').grid;assert.equal(grid.rows[0].deletable,false);assert.throws(()=>salesDeleteRequest(grid,grid.rows[0]));assert.throws(()=>salesInsertRequests(grid,2,{'1':'New'}));}
 const grid=example();assert.deepEqual(salesDeleteRequest(grid,grid.rows[0]),{deleteDimension:{range:{sheetId:7,dimension:'ROWS',startIndex:1,endIndex:2}}});
});
