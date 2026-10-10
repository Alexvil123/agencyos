'use client';
import '../app/analytics.css';
import '../app/finance.css';
import {useCallback,useEffect,useMemo,useState,useTransition} from 'react';
import {Download,FilePlus2,Plus,RefreshCw,Trash2} from 'lucide-react';
import {loadFinance,saveInvoice,setInvoiceStatus,recordPayment,voidPayment} from '@/app/finance-actions';
import type {loadWorkData} from '@/app/work-actions';
import {conditionalReader} from '@/lib/conditional-read';
import {PAYMENT_METHODS,financeSummary,formatMoney,invoiceTotals,nextDueDate,pdfMoney,type FinanceInvoice,type FinanceItem,type InvoiceStatus} from '@/lib/finance';
import {csvCell,indiaDate} from '@/lib/work-report';
import {WorkDrawer} from './work-drawer';

const STATUS_TEXT:Record<InvoiceStatus,string>={draft:'Draft',sent:'Sent',partial:'Partly paid',overdue:'Overdue',paid:'Paid',void:'Void'};
const FILTERS:('all'|InvoiceStatus)[]=['all','draft','sent','partial','overdue','paid','void'];
const CURRENCIES=['INR','USD','EUR','GBP','AED','SGD'];
const dateText=(day:string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${day}T00:00:00Z`));
type Draft={id:string;client_name:string;client_email:string;issue_date:string;due_date:string;currency:string;tax_percent:string;discount:string;notes:string;items:{description:string;quantity:string;unit_price:string}[]};
const blankItem=()=>({description:'',quantity:'1',unit_price:''});
const blankDraft=(today:string):Draft=>({id:'',client_name:'',client_email:'',issue_date:today,due_date:nextDueDate(today),currency:'INR',tax_percent:'0',discount:'0',notes:'',items:[blankItem()]});
const fromInvoice=(i:FinanceInvoice):Draft=>({id:i.id,client_name:i.client_name,client_email:i.client_email||'',issue_date:i.issue_date,due_date:i.due_date,currency:i.currency,tax_percent:String(i.tax_percent),discount:String(i.discount),notes:i.notes||'',items:i.items.map(x=>({description:x.description,quantity:String(x.quantity),unit_price:String(x.unit_price)}))});
const numbers=(items:Draft['items']):FinanceItem[]=>items.map(i=>({description:i.description,quantity:Number(i.quantity)||0,unit_price:Number(i.unit_price)||0}));

async function downloadPdf(invoice:FinanceInvoice,company:string){
  const [{jsPDF},{autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
  const doc=new jsPDF({unit:'mm',format:'a4'});
  doc.setFontSize(20);doc.text('INVOICE',14,20);doc.setFontSize(10);doc.text(company,14,27);
  doc.text(`Invoice no: ${invoice.number}`,140,20);doc.text(`Issued: ${dateText(invoice.issue_date)}`,140,26);doc.text(`Due: ${dateText(invoice.due_date)}`,140,32);doc.text(`Status: ${STATUS_TEXT[invoice.display_status]}`,140,38);
  doc.setFontSize(11);doc.text('Bill to',14,42);doc.setFontSize(10);doc.text(invoice.client_name,14,48);if(invoice.client_email)doc.text(invoice.client_email,14,54);
  autoTable(doc,{startY:62,head:[['Description','Qty','Unit price','Amount']],body:invoice.items.map(i=>[i.description,String(i.quantity),pdfMoney(i.unit_price,invoice.currency),pdfMoney(Math.round(i.quantity*i.unit_price*100)/100,invoice.currency)]),styles:{fontSize:9},columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'}}});
  const end=(doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+8;
  const lines:[string,string][]=[['Subtotal',pdfMoney(invoice.subtotal,invoice.currency)],...(invoice.discount?[['Discount',`- ${pdfMoney(invoice.discount,invoice.currency)}`] as [string,string]]:[]),[`Tax (${invoice.tax_percent}%)`,pdfMoney(invoice.tax,invoice.currency)],['Total',pdfMoney(invoice.total,invoice.currency)],['Paid',pdfMoney(invoice.paid,invoice.currency)],['Balance due',pdfMoney(invoice.balance,invoice.currency)]];
  lines.forEach(([label,value],index)=>{doc.setFont('helvetica',index>=3?'bold':'normal');doc.text(label,130,end+index*6);doc.text(value,196,end+index*6,{align:'right'});});
  if(invoice.notes){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(doc.splitTextToSize(`Notes: ${invoice.notes}`,180),14,end+lines.length*6+8);}
  doc.save(`${invoice.number}.pdf`);
}

export function FinancePanel({preview=false,company='Agency'}:{preview?:boolean;company?:string}){
  const [state,setState]=useState<Awaited<ReturnType<typeof loadFinance>>>(),[filter,setFilter]=useState<'all'|InvoiceStatus>('all'),[query,setQuery]=useState(''),[busy,start]=useTransition(),[notice,setNotice]=useState<{ok:boolean;message:string}>();
  const [editing,setEditing]=useState<Draft>(),[openId,setOpenId]=useState(''),[labels,setLabels]=useState<string[]>([]),[reverse,setReverse]=useState<{id:string;reason:string}>();
  const today=indiaDate(new Date().toISOString());
  const reload=useCallback(()=>start(async()=>{try{setState(await loadFinance());}catch{setState({ok:false,message:'Finance could not be loaded. Check your connection and retry.',setupRequired:false,invoices:[]});}}),[]);
  useEffect(()=>{if(!preview)void Promise.resolve().then(reload);},[preview,reload]);
  // Client labels come from Jira (the same names used in Work and Clients); loaded only when the invoice form opens.
  useEffect(()=>{if(!editing||labels.length)return;let live=true;conditionalReader<Awaited<ReturnType<typeof loadWorkData>>>('/api/work')(true).then(r=>{if(!live||!r.value?.ok||!r.value.data)return;setLabels([...new Set((r.value.data.tasks as {jira_labels?:string[]}[]).flatMap(t=>t.jira_labels||[]))].sort((a,b)=>a.localeCompare(b)));}).catch(()=>undefined);return()=>{live=false;};},[editing,labels.length]);
  const invoices=useMemo(()=>(state?.invoices||[]).filter(i=>(filter==='all'||i.display_status===filter)&&`${i.number} ${i.client_name}`.toLowerCase().includes(query.trim().toLowerCase())),[state,filter,query]);
  const summary=useMemo(()=>financeSummary(state?.invoices||[],today.slice(0,7)),[state,today]);
  const open=useMemo(()=>state?.invoices.find(i=>i.id===openId),[state,openId]);
  const clients=useMemo(()=>[...new Set([...labels,...(state?.invoices||[]).map(i=>i.client_name)])].sort((a,b)=>a.localeCompare(b)),[labels,state]);
  const run=(action:()=>Promise<{ok:boolean;message:string;id?:string}>,after?:(id?:string)=>void)=>start(async()=>{try{const result=await action();setNotice({ok:result.ok,message:result.message});if(result.ok){setState(await loadFinance());after?.(result.id);}}catch{setNotice({ok:false,message:'The change could not be confirmed. Refresh and check the invoice.'});}});
  function exportCsv(){
    const lines=[['Invoice','Client','Issued','Due','Currency','Subtotal','Tax','Total','Paid','Balance','Status'],...invoices.map(i=>[i.number,i.client_name,i.issue_date,i.due_date,i.currency,i.subtotal.toFixed(2),i.tax.toFixed(2),i.total.toFixed(2),i.paid.toFixed(2),i.balance.toFixed(2),STATUS_TEXT[i.display_status]])];
    const url=URL.createObjectURL(new Blob([lines.map(l=>l.map(csvCell).join(',')).join('\n')],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`invoices-${today}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(preview)return <section className="panel"><h2>Finance</h2><p>Sign in to manage invoices and payments.</p></section>;
  if(!state)return <section className="panel"><p role="status">Loading finance…</p></section>;
  if(!state.ok)return <section className="panel"><h2>Finance</h2><p role={state.setupRequired?'status':'alert'}>{state.message}</p>{!state.setupRequired&&<button className="secondary" onClick={reload}>Retry</button>}</section>;
  const totals=editing?invoiceTotals(numbers(editing.items),Number(editing.discount)||0,Number(editing.tax_percent)||0):undefined;
  return <div className="analytics finance">
    <section className="an-kpis" aria-label="Finance summary">{summary.length?summary.flatMap(s=>[['Outstanding',s.outstanding,'Sent invoices not fully paid'],['Overdue',s.overdue,'Past the due date'],['Collected this month',s.collected,'Payments received (not reversed)']].map(([label,value,note])=><div className="an-kpi" key={`${s.currency}${label}`}><small>{label}{summary.length>1?` (${s.currency})`:''}</small><strong>{formatMoney(value as number,s.currency)}</strong><span>{note}</span></div>)):<div className="an-kpi"><small>Outstanding</small><strong>{formatMoney(0,'INR')}</strong><span>No invoices yet</span></div>}</section>
    <section className="panel an-controls">
      <div className="an-presets" role="group" aria-label="Status">{FILTERS.map(f=><button key={f} className={filter===f?'selected':''} onClick={()=>setFilter(f)}>{f==='all'?'All':STATUS_TEXT[f]}</button>)}</div>
      <input className="fin-search" aria-label="Search invoices" placeholder="Search client or invoice number" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="an-actions"><button className="secondary small" disabled={busy} onClick={reload}><RefreshCw size={14}/> Refresh</button><button className="secondary small" disabled={!invoices.length} onClick={exportCsv}><Download size={14}/> Export CSV</button><button className="primary small" onClick={()=>{setNotice(undefined);setEditing(blankDraft(today));}}><FilePlus2 size={14}/> New invoice</button></div>
    </section>
    {notice&&<p role={notice.ok?'status':'alert'} className={`form-message ${notice.ok?'success':'error'}`}>{notice.message}</p>}
    <section className="panel">{invoices.length?<div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id} className="fin-row" onClick={()=>{setNotice(undefined);setOpenId(i.id);}}><td><button className="fin-link" onClick={e=>{e.stopPropagation();setNotice(undefined);setOpenId(i.id);}}>{i.number}</button></td><td>{i.client_name}</td><td>{dateText(i.issue_date)}</td><td>{dateText(i.due_date)}</td><td>{formatMoney(i.total,i.currency)}</td><td>{i.status==='sent'?formatMoney(i.balance,i.currency):'—'}</td><td><span className={`fin-status ${i.display_status}`}>{STATUS_TEXT[i.display_status]}</span></td></tr>)}</tbody></table></div>:<p className="subtle">{state.invoices.length?'No invoices match these filters.':'No invoices yet. Create the first one with New invoice.'}</p>}</section>

    {editing&&totals&&<WorkDrawer label={editing.id?'Edit invoice':'New invoice'} busy={busy} onClose={()=>setEditing(undefined)}><section className="panel time-panel fin-form">
      <div className="time-heading"><h2>{editing.id?'Edit draft invoice':'New invoice'}</h2><button className="secondary" disabled={busy} onClick={()=>setEditing(undefined)}>Close</button></div>
      {notice&&!notice.ok&&<p role="alert" className="form-message error">{notice.message}</p>}
      <form className="stack time-form" onSubmit={e=>{e.preventDefault();const payload=JSON.stringify({...editing,items:editing.items});run(()=>saveInvoice(payload,editing.id),id=>{setEditing(undefined);if(id)setOpenId(id);});}}>
        <div className="fin-grid">
          <label>Client<input list="fin-clients" required maxLength={255} value={editing.client_name} onChange={e=>setEditing({...editing,client_name:e.target.value})} placeholder="Jira client label or name"/><datalist id="fin-clients">{clients.map(c=><option key={c} value={c}/>)}</datalist></label>
          <label>Client email (optional)<input type="email" value={editing.client_email} onChange={e=>setEditing({...editing,client_email:e.target.value})}/></label>
          <label>Issue date<input type="date" required value={editing.issue_date} onChange={e=>setEditing({...editing,issue_date:e.target.value,due_date:editing.due_date<e.target.value?nextDueDate(e.target.value):editing.due_date})}/></label>
          <label>Due date<input type="date" required min={editing.issue_date} value={editing.due_date} onChange={e=>setEditing({...editing,due_date:e.target.value})}/></label>
          <label>Currency<select value={editing.currency} onChange={e=>setEditing({...editing,currency:e.target.value})}>{[...new Set([editing.currency,...CURRENCIES])].map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Tax %<input type="number" min={0} max={100} step="0.01" value={editing.tax_percent} onChange={e=>setEditing({...editing,tax_percent:e.target.value})}/></label>
          <label>Discount ({editing.currency})<input type="number" min={0} step="0.01" value={editing.discount} onChange={e=>setEditing({...editing,discount:e.target.value})}/></label>
        </div>
        <fieldset className="fin-items"><legend>Line items</legend>
          {editing.items.map((item,index)=><div className="fin-item" key={index}>
            <input aria-label={`Item ${index+1} description`} required maxLength={500} placeholder="Description" value={item.description} onChange={e=>setEditing({...editing,items:editing.items.map((x,i)=>i===index?{...x,description:e.target.value}:x)})}/>
            <input aria-label={`Item ${index+1} quantity`} type="number" required min="0.001" step="0.001" value={item.quantity} onChange={e=>setEditing({...editing,items:editing.items.map((x,i)=>i===index?{...x,quantity:e.target.value}:x)})}/>
            <input aria-label={`Item ${index+1} unit price`} type="number" required min={0} step="0.01" placeholder="Unit price" value={item.unit_price} onChange={e=>setEditing({...editing,items:editing.items.map((x,i)=>i===index?{...x,unit_price:e.target.value}:x)})}/>
            <output>{formatMoney(Math.round((Number(item.quantity)||0)*(Number(item.unit_price)||0)*100)/100,editing.currency)}</output>
            <button type="button" className="icon-button" aria-label={`Remove item ${index+1}`} disabled={editing.items.length===1} onClick={()=>setEditing({...editing,items:editing.items.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button>
          </div>)}
          <button type="button" className="secondary small" disabled={editing.items.length>=100} onClick={()=>setEditing({...editing,items:[...editing.items,blankItem()]})}><Plus size={14}/> Add line</button>
        </fieldset>
        <label>Notes (optional)<textarea maxLength={2000} value={editing.notes} onChange={e=>setEditing({...editing,notes:e.target.value})} placeholder="Payment terms, bank details…"/></label>
        <dl className="fin-totals"><div><dt>Subtotal</dt><dd>{formatMoney(totals.subtotal,editing.currency)}</dd></div><div><dt>Tax</dt><dd>{formatMoney(totals.tax,editing.currency)}</dd></div><div><dt>Total</dt><dd><strong>{formatMoney(totals.total,editing.currency)}</strong></dd></div></dl>
        <button className="primary" disabled={busy}>{busy?'Saving…':editing.id?'Save changes':'Save draft'}</button>
      </form>
    </section></WorkDrawer>}

    {open&&!editing&&<WorkDrawer label={`Invoice ${open.number}`} busy={busy} onClose={()=>{setOpenId('');setReverse(undefined);}}><section className="panel time-panel fin-detail">
      <div className="time-heading"><div><span className="eyebrow">INVOICE</span><h2>{open.number} · {open.client_name}</h2></div><button className="secondary" disabled={busy} onClick={()=>{setOpenId('');setReverse(undefined);}}>Close</button></div>
      {notice&&<p role={notice.ok?'status':'alert'} className={`form-message ${notice.ok?'success':'error'}`}>{notice.message}</p>}
      <p><span className={`fin-status ${open.display_status}`}>{STATUS_TEXT[open.display_status]}</span> · Issued {dateText(open.issue_date)} · Due {dateText(open.due_date)}{open.client_email?` · ${open.client_email}`:''}</p>
      <div className="table-scroll"><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{open.items.map((x,i)=><tr key={i}><td>{x.description}</td><td>{x.quantity}</td><td>{formatMoney(x.unit_price,open.currency)}</td><td>{formatMoney(Math.round(x.quantity*x.unit_price*100)/100,open.currency)}</td></tr>)}</tbody></table></div>
      <dl className="fin-totals"><div><dt>Subtotal</dt><dd>{formatMoney(open.subtotal,open.currency)}</dd></div>{open.discount>0&&<div><dt>Discount</dt><dd>− {formatMoney(open.discount,open.currency)}</dd></div>}<div><dt>Tax ({open.tax_percent}%)</dt><dd>{formatMoney(open.tax,open.currency)}</dd></div><div><dt>Total</dt><dd><strong>{formatMoney(open.total,open.currency)}</strong></dd></div><div><dt>Paid</dt><dd>{formatMoney(open.paid,open.currency)}</dd></div><div><dt>Balance</dt><dd><strong>{formatMoney(open.balance,open.currency)}</strong></dd></div></dl>
      {open.notes&&<p className="subtle">Notes: {open.notes}</p>}
      <div className="time-controls">
        <button className="secondary" onClick={()=>void downloadPdf(open,company)}><Download size={14}/> Download PDF</button>
        {open.status==='draft'&&<><button className="secondary" disabled={busy} onClick={()=>{setNotice(undefined);setEditing(fromInvoice(open));}}>Edit</button><button className="primary" disabled={busy} onClick={()=>{const f=new FormData();f.set('invoice',open.id);f.set('status','sent');run(()=>setInvoiceStatus(f));}}>Mark as sent</button></>}
        {(open.status==='draft'||open.status==='sent')&&<button className="secondary danger" disabled={busy} onClick={()=>{if(!window.confirm(`Void invoice ${open.number}? A voided invoice cannot be reopened.`))return;const f=new FormData();f.set('invoice',open.id);f.set('status','void');run(()=>setInvoiceStatus(f));}}>Void invoice</button>}
      </div>
      {open.status==='sent'&&open.balance>0&&<form className="stack time-form fin-pay" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);f.set('invoice',open.id);run(()=>recordPayment(f));e.currentTarget.reset();}}>
        <h3>Record a payment</h3>
        <div className="fin-grid"><label>Amount ({open.currency})<input name="amount" type="number" required min="0.01" max={open.balance} step="0.01" defaultValue={open.balance}/></label><label>Date received<input name="paid_on" type="date" required max={today} defaultValue={today}/></label><label>Method<select name="method">{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m==='upi'?'UPI':m[0].toUpperCase()+m.slice(1)}</option>)}</select></label><label>Reference (optional)<input name="reference" maxLength={200} placeholder="UTR / cheque no."/></label></div>
        <button className="primary" disabled={busy}>Record payment</button>
      </form>}
      {open.payments.length>0&&<><h3>Payments</h3><div className="table-scroll"><table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th/></tr></thead><tbody>{open.payments.map(p=><tr key={p.id} className={p.voided_at?'fin-reversed':''}><td>{dateText(p.paid_on)}</td><td>{formatMoney(Number(p.amount),open.currency)}</td><td>{p.method}</td><td>{p.reference||'—'}{p.voided_at&&<small className="block">Reversed: {p.void_reason}</small>}</td><td>{!p.voided_at&&(reverse?.id===p.id?<form className="fin-reverse" onSubmit={e=>{e.preventDefault();const f=new FormData();f.set('payment',p.id);f.set('reason',reverse.reason);run(()=>voidPayment(f),()=>setReverse(undefined));}}><input aria-label="Reason" required minLength={3} maxLength={500} placeholder="Reason" value={reverse.reason} onChange={e=>setReverse({id:p.id,reason:e.target.value})}/><button className="secondary small" disabled={busy}>Reverse</button><button type="button" className="secondary small" onClick={()=>setReverse(undefined)}>Cancel</button></form>:<button className="secondary small" disabled={busy} onClick={()=>setReverse({id:p.id,reason:''})}>Reverse</button>)}</td></tr>)}</tbody></table></div></>}
    </section></WorkDrawer>}
  </div>;
}
