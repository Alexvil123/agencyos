import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='50000000-0000-4000-8000-000000000001',worker='50000000-0000-4000-8000-000000000002',finance='50000000-0000-4000-8000-000000000003';
let org:string;
async function as(user:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
const invoice=(extra:Record<string,unknown>={})=>JSON.stringify({client_name:'NTT Traders',client_email:'accounts@ntt.example',issue_date:'2026-10-01',due_date:'2099-12-31',currency:'INR',tax_percent:18,discount:50,notes:'Thank you',items:[{description:'Social media management',quantity:2,unit_price:500},{description:'Poster design',quantity:1,unit_price:250.5}],...extra});
const save=async(payload=invoice(),id:string|null=null)=>(await db.query<{finance_save_invoice:string}>('select public.finance_save_invoice($1,$2,$3)',[org,id,payload])).rows[0].finance_save_invoice;
type Row={id:string;number:string;status:string;display_status:string;subtotal:number;tax:number;total:number;paid:number;balance:number;items:unknown[];payments:{id:string;voided_at:string|null}[]};
const overview=async()=>(await db.query<{finance_overview:Row[]}>('select public.finance_overview($1)',[org])).rows[0].finance_overview;
const find=async(id:string)=>(await overview()).find(r=>r.id===id)!;
const pay=(id:string,amount:number,date='2026-10-05',method='bank')=>db.query('select public.finance_record_payment($1,$2,$3,$4,$5,$6)',[org,id,amount,date,method,'UTR123']);
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal','aal1')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
  for(const [id,email] of [[owner,'owner@example.com'],[worker,'worker@example.com'],[finance,'finance@example.com']])await db.query('insert into auth.users values($1,$2)',[id,email]);
  for(const file of ['202610060001_foundation.sql','202610060002_password_login_clients.sql','202610060003_employee_password_login.sql','202610060004_owner_updates.sql','202610060005_owner_email_updates.sql','202610060009_time_management.sql','202610100029_finance.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  org=(await db.query<{bootstrap_owner:string}>('select public.bootstrap_owner($1,$2,$3)',[owner,'Finance tests','Owner'])).rows[0].bootstrap_owner;
  for(const [user,name,email,role] of [[worker,'Worker','worker@example.com','employee'],[finance,'Finance','finance@example.com','finance']]){
    await db.query('insert into public.profiles values($1,$2,now())',[user,name]);
    const member=(await db.query<{id:string}>("insert into public.memberships(organization_id,user_id,email,kind) values($1,$2,$3,'employee') returning id",[org,user,email])).rows[0].id;
    await db.query('insert into public.membership_roles values($1,$2)',[member,role]);
  }
});
after(()=>db.close());

test('totals come from the line items: subtotal, discount, tax and a numbered invoice',async()=>{
  await as(owner);const id=await save();const row=await find(id);
  assert.equal(row.number,'INV-2026-0001');assert.equal(row.status,'draft');assert.equal(row.display_status,'draft');
  assert.equal(Number(row.subtotal),1250.5);assert.equal(Number(row.tax),216.09);assert.equal(Number(row.total),1416.59);assert.equal(Number(row.balance),1416.59);assert.equal(row.items.length,2);
  const second=await save(invoice({issue_date:'2026-10-02'}));assert.equal((await find(second)).number,'INV-2026-0002');
  const next=await save(invoice({issue_date:'2027-01-05',due_date:'2027-01-20'}));assert.equal((await find(next)).number,'INV-2027-0001');
});
test('only the Owner and Finance roles can use Finance; other employees are refused everywhere',async()=>{
  await as(worker);
  await assert.rejects(overview(),/Finance access required/);
  await assert.rejects(save(),/Finance access required/);
  await assert.rejects(db.query("select public.finance_set_status($1,$2,'sent')",[org,'00000000-0000-4000-8000-000000000000']),/Finance access required/);
  await assert.rejects(db.query('select * from public.finance_invoices'),/permission denied/);
  await as(finance);assert.ok((await overview()).length>=3);await save(invoice({client_name:'By finance role'}));
});
test('validation rejects bad dates, discounts, currency, tax and empty items',async()=>{
  await as(owner);
  await assert.rejects(save(invoice({due_date:'2026-09-01'})),/due date/);
  await assert.rejects(save(invoice({discount:5000})),/Discount cannot exceed/);
  await assert.rejects(save(invoice({currency:'RUPEES'})),/Currency/);
  await assert.rejects(save(invoice({tax_percent:120})),/Tax must be/);
  await assert.rejects(save(invoice({items:[]})),/between 1 and 100/);
  await assert.rejects(save(invoice({items:[{description:'x',quantity:0,unit_price:1}]})),/Quantity/);
  await assert.rejects(save(invoice({items:[{description:' ',quantity:1,unit_price:1}]})),/description/);
  await assert.rejects(save(invoice({client_name:'  '})),/Client name/);
});
test('draft invoices can be edited; sent invoices cannot, and only drafts can be sent',async()=>{
  await as(owner);const id=await save();
  await save(invoice({client_name:'Renamed client',items:[{description:'Retainer',quantity:1,unit_price:1000}],tax_percent:0,discount:0}),id);
  const edited=await find(id);assert.equal(edited.items.length,1);assert.equal(Number(edited.total),1000);assert.equal(edited.number.length,13);
  await db.query("select public.finance_set_status($1,$2,'sent')",[org,id]);assert.equal((await find(id)).display_status,'sent');
  await assert.rejects(save(invoice(),id),/Only draft invoices/);
  await assert.rejects(db.query("select public.finance_set_status($1,$2,'sent')",[org,id]),/not allowed/);
});
test('payments: only on sent invoices, never above the balance, partial then paid, reversible',async()=>{
  await as(owner);const id=await save(invoice({tax_percent:0,discount:0,items:[{description:'Retainer',quantity:1,unit_price:1000}]}));
  await assert.rejects(pay(id,100),/only be recorded on sent/);
  await db.query("select public.finance_set_status($1,$2,'sent')",[org,id]);
  await assert.rejects(pay(id,0),/greater than zero/);
  await assert.rejects(pay(id,1000.01),/exceeds the outstanding/);
  await assert.rejects(pay(id,100,'2099-01-01'),/future/);
  await pay(id,400);let row=await find(id);assert.equal(Number(row.paid),400);assert.equal(Number(row.balance),600);
  assert.ok(['partial','overdue'].includes(row.display_status));
  await assert.rejects(pay(id,600.01),/exceeds the outstanding/);
  await assert.rejects(db.query("select public.finance_set_status($1,$2,'void')",[org,id]),/Void or reverse the payments/);
  await pay(id,600,'2026-10-06','upi');row=await find(id);assert.equal(Number(row.balance),0);assert.equal(row.display_status,'paid');
  const first=row.payments[0].id;
  await assert.rejects(db.query('select public.finance_void_payment($1,$2,$3)',[org,first,'x']),/reason/);
  await db.query('select public.finance_void_payment($1,$2,$3)',[org,first,'Cheque bounced']);
  row=await find(id);assert.equal(Number(row.paid),600);assert.equal(Number(row.balance),400);assert.notEqual(row.display_status,'paid');assert.ok(row.payments.some(p=>p.voided_at));
  await assert.rejects(db.query('select public.finance_void_payment($1,$2,$3)',[org,first,'again please']),/already reversed/);
});
test('overdue is derived from the due date and an unpaid invoice can be voided',async()=>{
  await as(owner);const id=await save(invoice({issue_date:'2026-01-01',due_date:'2026-01-10'}));
  await db.query("select public.finance_set_status($1,$2,'sent')",[org,id]);assert.equal((await find(id)).display_status,'overdue');
  await db.query("select public.finance_set_status($1,$2,'void')",[org,id]);assert.equal((await find(id)).display_status,'void');
  await assert.rejects(pay(id,10),/only be recorded on sent/);
  await assert.rejects(db.query("select public.finance_set_status($1,$2,'sent')",[org,id]),/not allowed/);
});
test('every finance change is written to the audit log',async()=>{
  await db.exec('reset role');
  const actions=(await db.query<{action:string}>("select distinct action from public.audit_logs where entity_type like 'finance_%' order by 1")).rows.map(r=>r.action);
  for(const expected of ['insert_finance_invoices','update_finance_invoices','insert_finance_invoice_items','insert_finance_payments','update_finance_payments'])assert.ok(actions.includes(expected),expected);
});
