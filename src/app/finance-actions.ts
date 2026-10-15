'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {workspaceContext} from '@/lib/access';
import {serverClient} from '@/lib/supabase/server';
import {invoiceInput,paymentInput,statusInput,voidPaymentInput,type FinanceInvoice} from '@/lib/finance';

// Invoices and payments live in the database and are only reachable through audited functions that allow the Owner
// and Finance roles. These actions add input validation and friendly messages; the database re-checks everything.
type FinanceResult={ok:boolean;message:string;id?:string};
async function access(){
  const ctx=await workspaceContext();
  if(ctx.preview||ctx.kind!=='employee'||!(ctx.roles.includes('Owner')||ctx.permissions.includes('finance.read')||ctx.modules.includes('finance')))throw new Error('Finance access required');
  return {ctx,db:await serverClient()};
}
const KNOWN=['Finance access required','Only draft invoices can be edited','This status change is not allowed','Void or reverse the payments before voiding this invoice','Payments can only be recorded on sent invoices','Payment exceeds the outstanding balance','The payment date cannot be in the future','This payment was already reversed','Discount cannot exceed the subtotal','The due date cannot be before the issue date','Invoice not found','Payment not found'];
function reason(error:unknown,fallback:string){
  if(error instanceof z.ZodError)return error.issues[0]?.message||'Check the form fields.';
  const text=error instanceof Error?error.message:typeof error==='object'&&error&&'message' in error?String((error as {message:unknown}).message):'';
  return KNOWN.find(k=>text.includes(k))||fallback;
}
const missing=(error:{code?:string;message?:string}|null)=>Boolean(error&&(error.code==='42883'||error.code==='PGRST202'||/finance_overview/.test(error.message||'')&&/function|schema cache/i.test(error.message||'')));

export async function loadFinance():Promise<{ok:boolean;message:string;setupRequired:boolean;invoices:FinanceInvoice[]}>{
  try{
    const {ctx,db}=await access();
    const {data,error}=await db.rpc('finance_overview',{org_id:ctx.organizationId});
    if(missing(error))return {ok:false,message:'The Finance database setup has not been applied yet. Apply supabase/migrations/202610100029_finance.sql in Supabase, then refresh.',setupRequired:true,invoices:[]};
    if(error)throw error;
    return {ok:true,message:'',setupRequired:false,invoices:(data||[]) as FinanceInvoice[]};
  }catch(error){return {ok:false,message:reason(error,'Finance could not be loaded. Check your connection and retry.'),setupRequired:false,invoices:[]};}
}
export async function saveInvoice(payload:string,invoiceId:string):Promise<FinanceResult>{
  try{
    const {ctx,db}=await access();
    const parsed=invoiceInput.parse(JSON.parse(payload)),id=invoiceId?z.uuid().parse(invoiceId):null;
    const {data,error}=await db.rpc('finance_save_invoice',{org_id:ctx.organizationId,invoice_id:id,payload:parsed});
    if(error)throw error;
    revalidatePath('/finance');
    return {ok:true,message:id?'Invoice updated.':'Draft invoice created.',id:String(data)};
  }catch(error){return {ok:false,message:reason(error,'The invoice could not be saved.')};}
}
export async function setInvoiceStatus(form:FormData):Promise<FinanceResult>{
  try{
    const {ctx,db}=await access(),input=statusInput.parse(Object.fromEntries(form));
    const {error}=await db.rpc('finance_set_status',{org_id:ctx.organizationId,invoice_id:input.invoice,new_status:input.status});
    if(error)throw error;
    return {ok:true,message:input.status==='sent'?'Invoice marked as sent.':'Invoice voided.'};
  }catch(error){return {ok:false,message:reason(error,'The invoice status could not be changed.')};}
}
export async function recordPayment(form:FormData):Promise<FinanceResult>{
  try{
    const {ctx,db}=await access(),input=paymentInput.parse(Object.fromEntries(form));
    const {error}=await db.rpc('finance_record_payment',{org_id:ctx.organizationId,invoice_id:input.invoice,amount_value:input.amount,paid_date:input.paid_on,method_value:input.method,reference_value:input.reference});
    if(error)throw error;
    return {ok:true,message:'Payment recorded.'};
  }catch(error){return {ok:false,message:reason(error,'The payment could not be recorded.')};}
}
export async function voidPayment(form:FormData):Promise<FinanceResult>{
  try{
    const {ctx,db}=await access(),input=voidPaymentInput.parse(Object.fromEntries(form));
    const {error}=await db.rpc('finance_void_payment',{org_id:ctx.organizationId,payment_id:input.payment,reason_value:input.reason});
    if(error)throw error;
    return {ok:true,message:'Payment reversed.'};
  }catch(error){return {ok:false,message:reason(error,'The payment could not be reversed.')};}
}
