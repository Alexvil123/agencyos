'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowDownAZ,ArrowUpAZ,Search} from 'lucide-react';
import {salesColumnValues,type SalesFilter,type SalesFilterOp,type SalesGrid,type SalesRow,type SalesSort} from '@/lib/sales-sheet';

type Kind='date'|'time'|'datetime-local'|'number'|'text';
const TEXT_OPS:[SalesFilterOp,string][]=[['contains','Text contains'],['notcontains','Text does not contain'],['startswith','Text starts with'],['endswith','Text ends with'],['exact','Text is exactly']];
const DATE_OPS:[SalesFilterOp,string][]=[['eq','Date is'],['lt','Date is before'],['gt','Date is after'],['between','Date is between'],['notbetween','Date is not between']];
const NUMBER_OPS:[SalesFilterOp,string][]=[['gt','Greater than'],['gte','Greater than or equal to'],['lt','Less than'],['lte','Less than or equal to'],['eq','Is equal to'],['neq','Is not equal to'],['between','Is between'],['notbetween','Is not between']];
const BASE_OPS:SalesFilterOp[]=['in','is','exact','isnot','contains','notcontains','startswith','endswith','empty','notempty','eq','neq','gt','lt','between','notbetween'];

function columnKind(grid:SalesGrid,column:number):Kind{
  for(const row of grid.rows){const cell=row.cells[column];if(cell?.kind)return cell.kind;}
  return grid.rows.some(row=>typeof row.cells[column]?.raw==='number')?'number':'text';
}

// Google Sheets style column menu: sort, "filter by condition" and "filter by values" for one column.
export function SalesColumnFilter({grid,column,label,rect,filters,rows,sort,onApply,onSort,onClose}:{grid:SalesGrid;column:number;label:string;rect:DOMRect;filters:SalesFilter[];rows:SalesRow[];sort:SalesSort|null;onApply:(next:SalesFilter[])=>void;onSort:(next:SalesSort|null)=>void;onClose:()=>void}){
  const kind=columnKind(grid,column);
  const managed=useMemo<SalesFilterOp[]>(()=>kind==='number'?[...BASE_OPS,'gte','lte']:BASE_OPS,[kind]);
  const conditionOps=kind==='number'?NUMBER_OPS:kind==='text'?TEXT_OPS:DATE_OPS;
  const existing=filters.find(f=>f.column===column&&f.op!=='in'&&managed.includes(f.op)&&conditionOps.some(([op])=>op===f.op)||f.column===column&&(f.op==='empty'||f.op==='notempty'));
  const existingValues=filters.find(f=>f.column===column&&f.op==='in')?.values;
  const entries=useMemo(()=>salesColumnValues(rows,column),[rows,column]);
  const [op,setOp]=useState<SalesFilterOp|'none'>(existing?.op||'none'),[value,setValue]=useState(existing?.value||''),[value2,setValue2]=useState(existing?.value2||'');
  const [selected,setSelected]=useState<Set<string>>(()=>new Set(existingValues??entries.map(e=>e.text))),[search,setSearch]=useState('');
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  const shown=entries.filter(e=>(e.text||'(Blanks)').toLowerCase().includes(search.trim().toLowerCase()));
  const needsValue=op!=='none'&&op!=='empty'&&op!=='notempty',needsSecond=op==='between'||op==='notbetween';
  const inputType=kind==='number'?'number':kind==='text'?'text':kind;
  const left=Math.max(8,Math.min(rect.left,window.innerWidth-336)),top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-480)),maxHeight=Math.max(300,window.innerHeight-top-12);
  const sortDirection=sort?.column===column?sort.direction:null;
  function apply(){
    const next=filters.filter(f=>!(f.column===column&&managed.includes(f.op)));
    if(!entries.every(e=>selected.has(e.text)))next.push({column,op:'in',value:'',values:entries.filter(e=>selected.has(e.text)).map(e=>e.text)});
    if(op==='empty'||op==='notempty')next.push({column,op,value:''});
    else if(op!=='none'&&value&&(!needsSecond||value2))next.push({column,op,value,...(needsSecond?{value2}:{})});
    onApply(next);onClose();
  }
  function clearColumn(){onApply(filters.filter(f=>!(f.column===column&&managed.includes(f.op))));onClose();}
  const active=filters.some(f=>f.column===column&&managed.includes(f.op));
  return <>
    <div className="sales-colfilter-backdrop" onMouseDown={onClose}/>
    <div className="sales-colfilter" role="dialog" aria-label={`Filter ${label}`} style={{left,top,maxHeight}}>
      <strong className="sales-colfilter-title">{label}</strong>
      <div className="sales-colfilter-sort">
        <button className={sortDirection==='asc'?'selected':''} onClick={()=>{onSort({column,direction:'asc'});onClose();}}><ArrowDownAZ size={15}/> Sort A → Z</button>
        <button className={sortDirection==='desc'?'selected':''} onClick={()=>{onSort({column,direction:'desc'});onClose();}}><ArrowUpAZ size={15}/> Sort Z → A</button>
        {sortDirection&&<button onClick={()=>{onSort(null);onClose();}}>Clear sort</button>}
      </div>
      <fieldset className="sales-colfilter-section"><legend>Filter by condition</legend>
        <select aria-label="Condition" value={op} onChange={e=>{setOp(e.target.value as SalesFilterOp|'none');setValue('');setValue2('');}}>
          <option value="none">None</option><option value="empty">Is empty</option><option value="notempty">Is not empty</option>
          {conditionOps.map(([code,text])=><option key={code} value={code}>{text}</option>)}
        </select>
        {needsValue&&<input aria-label="Condition value" type={inputType} step={inputType==='number'?'any':1} value={value} onChange={e=>setValue(e.target.value)} placeholder="Value or text"/>}
        {needsSecond&&<input aria-label="Condition second value" type={inputType} step={inputType==='number'?'any':1} value={value2} onChange={e=>setValue2(e.target.value)} placeholder="And"/>}
      </fieldset>
      <fieldset className="sales-colfilter-section"><legend>Filter by values</legend>
        <div className="sales-colfilter-links"><button onClick={()=>setSelected(previous=>new Set([...previous,...shown.map(e=>e.text)]))}>Select all</button><span>·</span><button onClick={()=>setSelected(previous=>{const next=new Set(previous);for(const e of shown)next.delete(e.text);return next;})}>Clear</button><small>{entries.filter(e=>selected.has(e.text)).length} of {entries.length} selected</small></div>
        <label className="sales-colfilter-search"><Search size={14}/><input aria-label="Search values" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <ul>{shown.map(e=><li key={e.text||'(blank)'}><label><input type="checkbox" checked={selected.has(e.text)} onChange={ev=>setSelected(previous=>{const next=new Set(previous);if(ev.target.checked)next.add(e.text);else next.delete(e.text);return next;})}/><span>{e.text||'(Blanks)'}</span><small>{e.count}</small></label></li>)}{!shown.length&&<li className="sales-colfilter-none">No matching values</li>}</ul>
      </fieldset>
      <div className="sales-colfilter-actions">{active&&<button className="secondary small" onClick={clearColumn}>Clear filter</button>}<span/><button className="secondary small" onClick={onClose}>Cancel</button><button className="primary small" onClick={apply}>OK</button></div>
    </div>
  </>;
}
