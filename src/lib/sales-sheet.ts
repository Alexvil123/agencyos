export const SALES_SPREADSHEET_ID='1-4r9F5klbkqpgM4f8iy74UjSuipfwEkNICXAkGLNEI8';
export const SALES_SHEET_URL=`https://docs.google.com/spreadsheets/d/${SALES_SPREADSHEET_ID}/edit`;
export const SALES_TABS=['Tracksheet','Leads'] as const;
export type SalesCell={text:string; raw:string|number|boolean|null; formula:boolean; choices:string[]; restricted:boolean;kind?:'date'|'time'|'datetime-local';formulaText?:string;background?:string;color?:string;bold?:boolean;computed?:boolean;effective?:string|number|boolean|null};
export type SalesRow={number:number; id:string; cells:SalesCell[]; version:string; editable:boolean;deletable?:boolean};
export type SalesGrid={title:string; tab:string; headers:string[]; rows:SalesRow[]; fetchedAt:string;readOnly?:boolean;sheetId?:number;headerRows?:number;identityColumn?:number;version?:string;columnCount?:number;rowCount?:number;hidden?:boolean};
export type SalesFilterOp='is'|'contains'|'empty'|'notempty'|'gte'|'lte'|'in'|'isnot'|'notcontains'|'startswith'|'endswith'|'exact'|'eq'|'neq'|'gt'|'lt'|'between'|'notbetween';
export type SalesFilter={column:number;op:SalesFilterOp;value:string;value2?:string;values?:string[]};
export type SalesSort={column:number;direction:'asc'|'desc'};
// Sheet cells report white as their background and black as their text colour when nothing was set. Those defaults must follow the app theme (dark mode), so only real colours are kept.
const hexLuminance=(hex:string)=>{const h=hex.replace('#','');if(!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h))return null;const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));return (0.299*r+0.587*g+0.114*b)/255;};
export const sheetBackground=(value?:string)=>{const l=value?hexLuminance(value):null;return value&&l!==null&&l<0.985?value:undefined;};
export const sheetTextColor=(value?:string)=>{const l=value?hexLuminance(value):null;return value&&l!==null&&l>0.16&&l<0.985?value:undefined;};
export function salesTabAccess(owner:boolean,tab:string,kind:string,membership:string,allowed:string[]){return tab.length>0&&tab.length<=150&&salesAccess(owner,kind,membership,allowed);}
export function salesAccess(owner:boolean,kind:string,membership:string,allowed:string[]){return kind==='employee'&&(owner||allowed.includes(membership));}
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
export function salesColumn(index:number){if(!Number.isInteger(index)||index<0||index>255)throw new Error('Invalid column.');let result='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
function salesCellEmpty(c:SalesCell){const effective=c.raw??c.effective??null;return (effective===null||effective==='')&&c.text==='';}
// Negative of the sign of (cell - input) for ordered comparisons; null when the input cannot be compared with this cell.
function salesOrder(c:SalesCell,input:string):number|null{
 const effective=c.raw??c.effective??null;let value:string|number|boolean;
 try{value=salesValue({...c,raw:effective},input);}catch{return null;}
 const a=typeof effective==='number'?effective:c.text;
 if(typeof a==='number'&&typeof value==='number')return a-value;
 return String(a).toLowerCase().localeCompare(String(value).toLowerCase(),undefined,{numeric:true});
}
// One filter condition, following Google Sheets: text conditions ignore case, negative conditions keep blank cells.
export function salesMatches(c:SalesCell|undefined,f:SalesFilter):boolean{
 if(!c)return false;
 const empty=salesCellEmpty(c),text=c.text.toLowerCase(),needle=f.value.trim().toLowerCase();
 switch(f.op){
  case 'empty':return empty;
  case 'notempty':return !empty;
  case 'in':return !f.values||f.values.includes(c.text);
  case 'is':return !f.value||c.text===f.value;
  case 'exact':return !needle||text.trim()===needle;
  case 'isnot':return !needle||text.trim()!==needle;
  case 'contains':return !needle||text.includes(needle);
  case 'notcontains':return !needle||!text.includes(needle);
  case 'startswith':return !needle||text.startsWith(needle);
  case 'endswith':return !needle||text.endsWith(needle);
  case 'gte':case 'lte':{if(!f.value)return true;if(empty)return false;const n=salesOrder(c,f.value);return n!==null&&(f.op==='gte'?n>=0:n<=0);}
  case 'gt':case 'lt':case 'eq':{if(!f.value)return true;if(empty)return false;const n=salesOrder(c,f.value);return n!==null&&(f.op==='gt'?n>0:f.op==='lt'?n<0:n===0);}
  case 'neq':{if(!f.value)return true;if(empty)return true;const n=salesOrder(c,f.value);return n===null||n!==0;}
  case 'between':case 'notbetween':{
   if(!f.value||!f.value2)return true;
   if(empty)return f.op==='notbetween';
   const low=salesOrder(c,f.value),high=salesOrder(c,f.value2);
   if(low===null||high===null)return f.op==='notbetween';
   const inside=low>=0&&high<=0;return f.op==='between'?inside:!inside;
  }
 }
}
export function salesView(grid:SalesGrid,query:string,filters:SalesFilter[],sort:SalesSort|null){
 const found=filterSales(grid.rows,query,-1,'').filter(row=>filters.every(f=>salesMatches(row.cells[f.column],f)));
 if(!sort)return found;return [...found].sort((a,b)=>{const x=a.cells[sort.column],y=b.cells[sort.column];const xr=x?.raw??x?.effective,yr=y?.raw??y?.effective;const n=typeof xr==='number'&&typeof yr==='number'?xr-yr:(x?.text||'').localeCompare(y?.text||'',undefined,{numeric:true});return (sort.direction==='asc'?n:-n)||a.number-b.number;});
}
// Values offered by a column's "Filter by values" list: one entry per distinct displayed text, with row counts.
export function salesColumnValues(rows:SalesRow[],column:number){
 const counts=new Map<string,{text:string;count:number;order:number|string}>();
 for(const row of rows){const c=row.cells[column];const text=c?.text||'';const key=text;const entry=counts.get(key);const raw=c?.raw??c?.effective;if(entry)entry.count++;else counts.set(key,{text,count:1,order:typeof raw==='number'?raw:text.toLowerCase()});}
 return [...counts.values()].sort((a,b)=>(a.text===''?1:0)-(b.text===''?1:0)||(typeof a.order==='number'&&typeof b.order==='number'?a.order-b.order:String(a.order).localeCompare(String(b.order),undefined,{numeric:true})));
}
const SALES_FILTER_LABELS:Record<SalesFilterOp,string>={is:'is',contains:'contains',empty:'is empty',notempty:'is not empty',gte:'on or after',lte:'on or before',in:'is one of',isnot:'is not',notcontains:'does not contain',startswith:'starts with',endswith:'ends with',exact:'is exactly',eq:'is',neq:'is not',gt:'is after / greater than',lt:'is before / less than',between:'is between',notbetween:'is not between'};
export function describeSalesFilter(header:string,f:SalesFilter){
 if(f.op==='in'){const values=f.values||[];const shown=values.slice(0,2).map(v=>v||'(Blanks)').join(', ');return `${header}: ${shown}${values.length>2?` +${values.length-2}`:''}`;}
 const label=SALES_FILTER_LABELS[f.op];
 if(f.op==='empty'||f.op==='notempty')return `${header} ${label}`;
 if(f.op==='between'||f.op==='notbetween')return `${header} ${label} ${f.value} and ${f.value2||''}`;
 return `${header} ${label} ${f.value}`;
}
// Google Sheets shortcuts: Ctrl+; date, Ctrl+Shift+; time, Ctrl+Alt+Shift+; date and time (Cmd on Mac).
type SalesStamp='date'|'time'|'datetime';
export function salesStampShortcut(e:{ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;altKey:boolean;code:string;key?:string}):SalesStamp|null{
 if(!(e.ctrlKey||e.metaKey)||!(e.code==='Semicolon'||e.key===';'||e.key===':'))return null;
 if(e.altKey&&e.shiftKey)return 'datetime';
 if(e.shiftKey&&!e.altKey)return 'time';
 return e.altKey?null:'date';
}
// The value a stamp shortcut writes into a cell, in India time. null when the cell cannot hold that kind of value.
export function salesStamp(cell:Pick<SalesCell,'kind'|'raw'|'choices'>,which:SalesStamp,now=new Date()):string|null{
 if(cell.choices.length||typeof cell.raw==='boolean')return null;
 if(!cell.kind&&typeof cell.raw==='number')return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const date=`${parts.year}-${parts.month}-${parts.day}`,time=`${parts.hour}:${parts.minute}:${parts.second}`;
 if(cell.kind==='date')return which==='time'?null:date;
 if(cell.kind==='time')return which==='date'?null:time;
 if(cell.kind==='datetime-local')return which==='time'?null:`${date}T${which==='date'?'00:00:00':time}`;
 const day=`${parts.day}/${parts.month}/${parts.year}`,clock=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}).format(now);
 return which==='date'?day:which==='time'?clock:`${day} ${clock}`;
}
export function filterSales(rows:SalesRow[],query:string,column:number,value:string){const q=query.trim().toLowerCase();return rows.filter(row=>(!q||row.cells.some(cell=>cell.text.toLowerCase().includes(q)))&&(!value||row.cells[column]?.text===value));}

