import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceInput,invoiceTotals,paymentInput,voidPaymentInput,financeSummary,formatMoney,pdfMoney,nextDueDate,type FinanceInvoice} from '../src/lib/finance';
const base={client_name:'NTT Traders',client_email:'',issue_date:'2026-10-01',due_date:'2026-10-15',currency:'inr',tax_percent:'18',discount:'50',notes:'',items:[{description:'Management',quantity:'2',unit_price:'500'},{description:'Poster',quantity:1,unit_price:250.5}]};
test('the form preview matches the database totals',()=>{
  assert.deepEqual(invoiceTotals([{quantity:2,unit_price:500},{quantity:1,unit_price:250.5}],50,18),{subtotal:1250.5,tax:216.09,total:1416.59});
  assert.deepEqual(invoiceTotals([{quantity:3,unit_price:0.1}],0,0),{subtotal:0.3,tax:0,total:0.3});
  assert.deepEqual(invoiceTotals([{quantity:1,unit_price:10}],99,18),{subtotal:10,tax:0,total:0});
});
test('invoice input is coerced and every rule has a plain message',()=>{
  const ok=invoiceInput.parse(base);assert.equal(ok.currency,'INR');assert.equal(ok.items[0].quantity,2);assert.equal(ok.discount,50);
  const msg=(patch:Record<string,unknown>)=>{const r=invoiceInput.safeParse({...base,...patch});return r.success?'ok':r.error.issues[0].message;};
  assert.match(msg({client_name:' '}),/client name/i);assert.match(msg({due_date:'2026-09-01'}),/due date/i);assert.match(msg({discount:'5000'}),/Discount cannot exceed/);
  assert.match(msg({currency:'RUPEES'}),/3-letter/);assert.match(msg({tax_percent:'120'}),/exceed 100/);assert.match(msg({items:[]}),/at least one/);
  assert.match(msg({items:[{description:'x',quantity:'0',unit_price:'1'}]}),/Quantity/);assert.match(msg({items:[{description:'',quantity:'1',unit_price:'1'}]}),/description/);
  assert.match(msg({client_email:'not-an-email'}),/email|Invalid/i);assert.equal(msg({client_email:'a@b.co'}),'ok');
});
test('payments and reversals are validated',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  assert.equal(paymentInput.parse({invoice:id,amount:'400.50',paid_on:'2026-10-05',method:'upi'}).amount,400.5);
  assert.throws(()=>paymentInput.parse({invoice:id,amount:'0',paid_on:'2026-10-05',method:'upi'}));assert.throws(()=>paymentInput.parse({invoice:id,amount:'5',paid_on:'2026-10-05',method:'crypto'}));
  assert.throws(()=>voidPaymentInput.parse({payment:id,reason:'x'}));
});
test('summary keeps currencies apart and counts only this month\'s unreversed payments',()=>{
  const invoice=(patch:Partial<FinanceInvoice>):FinanceInvoice=>({id:'i',number:'n',client_name:'c',client_email:null,issue_date:'2026-10-01',due_date:'2026-10-15',currency:'INR',tax_percent:0,discount:0,notes:null,status:'sent',display_status:'sent',subtotal:0,tax:0,total:0,paid:0,balance:0,items:[],payments:[],...patch});
  const rows=financeSummary([
    invoice({balance:1000,display_status:'overdue'}),invoice({balance:500,display_status:'partial',payments:[{id:'a',amount:300,paid_on:'2026-10-03',method:'bank',reference:null,voided_at:null,void_reason:null},{id:'b',amount:100,paid_on:'2026-10-04',method:'bank',reference:null,voided_at:'2026-10-05',void_reason:'x'},{id:'c',amount:50,paid_on:'2026-09-30',method:'bank',reference:null,voided_at:null,void_reason:null}]}),
    invoice({status:'draft',display_status:'draft'}),invoice({currency:'USD',balance:20}),invoice({status:'void',display_status:'void',balance:999}),
  ],'2026-10');
  assert.deepEqual(rows.find(r=>r.currency==='INR'),{currency:'INR',outstanding:1500,overdue:1000,collected:300,drafts:1});
  assert.deepEqual(rows.find(r=>r.currency==='USD'),{currency:'USD',outstanding:20,overdue:0,collected:0,drafts:0});
});
test('money and dates format safely',()=>{
  assert.match(formatMoney(1416.59,'INR'),/1,416\.59/);assert.equal(formatMoney(5,'ZZZZ'),'ZZZZ 5.00');
  assert.equal(pdfMoney(1416.59,'INR'),'INR 1,416.59');assert.equal(nextDueDate('2026-10-20'),'2026-11-04');assert.equal(nextDueDate('2026-12-20',15),'2027-01-04');
});
