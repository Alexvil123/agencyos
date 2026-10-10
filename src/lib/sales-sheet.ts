export const SALES_SPREADSHEET_ID='1-4r9F5klbkqpgM4f8iy74UjSuipfwEkNICXAkGLNEI8';
export const SALES_SHEET_URL=`https://docs.google.com/spreadsheets/d/${SALES_SPREADSHEET_ID}/edit`;
export const SALES_TABS=['Tracksheet','Leads'] as const;
export type SalesTab=typeof SALES_TABS[number];
export type SalesCell={text:string; raw:string|number|boolean|null; formula:boolean; choices:string[]; restricted:boolean;kind?:'date'|'time'|'datetime-local';formulaText?:string;background?:string;color?:string;bold?:boolean;computed?:boolean;effective?:string|number|boolean|null};
export type SalesRow={number:number; id:string; cells:SalesCell[]; version:string; editable:boolean;deletable?:boolean};
export type SalesGrid={title:string; tab:string; headers:string[]; rows:SalesRow[]; fetchedAt:string;readOnly?:boolean;sheetId?:number;headerRows?:number;identityColumn?:number;version?:string;columnCount?:number;rowCount?:number;hidden?:boolean};
export type SalesFilter={column:number;op:'is'|'contains'|'empty'|'notempty'|'gte'|'lte';value:string};
export type SalesSort={column:number;direction:'asc'|'desc'};
export function salesTabAccess(owner:boolean,tab:string,kind:string,membership:string,allowed:string[]){return tab.length>0&&tab.length<=150&&salesAccess(owner,kind,membership,allowed);}
export function salesAccess(owner:boolean,kind:string,membership:string,allowed:string[]){return kind==='employee'&&(owner||allowed.includes(membership));}
export function editableSalesRow(grid:SalesGrid,id:string,version:string,column:number,value:string){const matches=grid.rows.filter(r=>r.id===id);if(matches.length!==1||matches[0].version!==version)throw new Error('This record changed in Google Sheets. Close the editor, refresh and review before saving.');assertSalesEdit(matches[0],column,value);return matches[0];}
const SHEET_EPOCH=Date.UTC(1899,11,30),DAY=86400000;
export function salesInput(cell:SalesCell){if(cell.raw===null)return '';if(!cell.kind||typeof cell.raw!=='number')return String(cell.raw);if(cell.kind==='time'){const seconds=Math.round((cell.raw%1)*86400);return `${String(Math.floor(seconds/3600)%24).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}const iso=new Date(SHEET_EPOCH+Math.round(cell.raw*DAY)).toISOString();return cell.kind==='date'?iso.slice(0,10):iso.slice(0,19);}
export function salesValue(cell:SalesCell,input:string):string|number|boolean{
 if(input==='')return '';
 if(cell.kind==='time'){if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(input))throw new Error('Enter a valid time.');const [h,m,s=0]=input.split(':').map(Number);return (h*3600+m*60+s)/86400;}
 if(cell.kind==='date'||cell.kind==='datetime-local'){const date=cell.kind==='date';if(!(date?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/).test(input))throw new Error('Enter a valid date.');const millis=Date.parse(date?`${input}T00:00:00Z`:`${input}Z`);if(!Number.isFinite(millis)||!new Date(millis).toISOString().startsWith(input))throw new Error('Enter a valid calendar date.');return (millis-SHEET_EPOCH)/DAY;}
 if(typeof cell.raw==='number'){const value=Number(input);if(!Number.isFinite(value)||!input.trim())throw new Error('Enter a valid number.');return value;}
 if(typeof cell.raw==='boolean'){if(!['true','false'].includes(input))throw new Error('Enter true or false.');return input==='true';}
 return input;
}
export function salesTab(value:string):SalesTab{if(!SALES_TABS.includes(value as SalesTab))throw new Error('This sheet tab is not enabled for Sales.');return value as SalesTab;}
export function salesColumn(index:number){if(!Number.isInteger(index)||index<0||index>255)throw new Error('Invalid column.');let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
export function salesView(grid:SalesGrid,query:string,filters:SalesFilter[],sort:SalesSort|null){
 const found=filterSales(grid.rows,query,-1,'').filter(row=>filters.every(f=>{const c=row.cells[f.column];if(!c)return false;const effective=c.raw??c.effective??null,empty=(effective===null||effective==='')&&c.text==='';if(f.op==='empty')return empty;if(f.op==='notempty')return !empty;if(!f.value)return true;if(f.op==='is')return c.text===f.value;if(f.op==='contains')return c.text.toLowerCase().includes(f.value.toLowerCase());if(empty)return false;let value:string|number|boolean;try{value=salesValue({...c,raw:effective},f.value);}catch{return false;}const a=typeof effective==='number'?effective:c.text,b=value;return f.op==='gte'?a>=b:a<=b;}));
 if(!sort)return found;return [...found].sort((a,b)=>{const x=a.cells[sort.column],y=b.cells[sort.column];const xr=x?.raw??x?.effective,yr=y?.raw??y?.effective;const n=typeof xr==='number'&&typeof yr==='number'?xr-yr:(x?.text||'').localeCompare(y?.text||'',undefined,{numeric:true});return (sort.direction==='asc'?n:-n)||a.number-b.number;});
}
export function filterSales(rows:SalesRow[],query:string,column:number,value:string){const q=query.trim().toLowerCase();return rows.filter(row=>(!q||row.cells.some(cell=>cell.text.toLowerCase().includes(q)))&&(!value||row.cells[column]?.text===value));}
export function assertSalesEdit(row:SalesRow,column:number,value:string){if(!row.editable||column===0||!Number.isInteger(column)||column<0||column>=row.cells.length)throw new Error('This row or column cannot be edited safely.');const cell=row.cells[column];if(cell.formula||cell.restricted)throw new Error('Formula or unsupported validation: edit this cell in Google Sheets.');if(value.length>10000)throw new Error('Cell value is too long.');if(cell.choices.length&&value&&!cell.choices.includes(value))throw new Error('Choose a value from the existing sheet dropdown.');}
