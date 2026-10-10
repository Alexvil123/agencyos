import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {exportWorkReport} from '../src/lib/work-export';
import type {WorkData,WorkFilters} from '../src/lib/work-report';
test('CSV, Excel and PDF produce valid downloadable artifacts with matching filtered rows',async()=>{
 const oldDocument=globalThis.document,oldCreate=URL.createObjectURL;let captured:Blob|undefined;let appended=false,clicked=false;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{body:{appendChild:()=>{appended=true;}},createElement:()=>({click:()=>{assert.equal(appended,true);clicked=true;},remove:()=>{}})}});
 URL.createObjectURL=blob=>{captured=blob as Blob;return 'blob:test';};
 try{
 const data={people:[{id:'me',display_name:'Worker'}],departments:[],clients:[],sessions:[],tasks:[{id:'task',title:'=Example',source:'manual',membership_id:'me',assigned_at:'2026-10-08T04:00:00Z',work_status:'pending'}]} as unknown as WorkData;
 const filters={from:'2026-10-08',to:'2026-10-08',employee:'all',department:'all',client:'all',source:'all',project:'all',status:'all',priority:'all',type:'all',includeCancelled:false} as WorkFilters;
 for(const format of ['csv','xlsx','pdf'] as const){appended=false;clicked=false;captured=undefined;const result=await exportWorkReport(data,filters,'2026-10-08T10:00:00Z',format);assert.equal(clicked,true);assert.equal(result.url,'blob:test');assert.ok(result.name.endsWith('.'+format));assert.ok(captured);const bytes=Buffer.from(await (captured as unknown as Blob).arrayBuffer());assert.ok(bytes.length>100);
 if(format==='csv')assert.match(bytes.toString(),/'=Example/);
 if(format==='xlsx'){const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as never);assert.equal(book.getWorksheet('Tasks')?.rowCount,2);assert.equal(book.getWorksheet('Tasks')?.getCell('B2').value,'=Example');assert.ok(book.getWorksheet('Summary'));}
 if(format==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 }
 }finally{URL.createObjectURL=oldCreate;Object.defineProperty(globalThis,'document',{configurable:true,value:oldDocument});}
});
