import {z} from 'zod';
// Finance rules shared by the browser and the server. The database is the authority for totals (see
// supabase/migrations/202610100029_finance.sql); `invoiceTotals` mirrors it so the form can show a live preview.
export const PAYMENT_METHODS=['bank','upi','cash','card','other'] as const;
export const INVOICE_STATUSES=['draft','sent','partial','overdue','paid','void'] as const;
export type InvoiceStatus=typeof INVOICE_STATUSES[number];
export type FinanceItem={description:string;quantity:number;unit_price:number};
export type FinancePayment={id:string;amount:number;paid_on:string;method:string;reference:string|null;voided_at:string|null;void_reason:string|null};
export type FinanceInvoice={id:string;number:string;client_name:string;client_email:string|null;issue_date:string;due_date:string;currency:string;tax_percent:number;discount:number;notes:string|null;status:'draft'|'sent'|'void';display_status:InvoiceStatus;subtotal:number;tax:number;total:number;paid:number;balance:number;items:FinanceItem[];payments:FinancePayment[]};

const round=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
export function invoiceTotals(items:Pick<FinanceItem,'quantity'|'unit_price'>[],discount:number,taxPercent:number){
  const subtotal=round(items.reduce((sum,i)=>sum+round(i.quantity*i.unit_price),0)),net=Math.max(subtotal-discount,0),tax=round(net*taxPercent/100);
  return {subtotal,tax,total:round(net+tax)};
}
const day=z.iso.date();
export const invoiceInput=z.object({
  client_name:z.string().trim().min(1,'Enter the client name.').max(255),
  client_email:z.union([z.email().max(254),z.literal('')]).default(''),
  issue_date:day,due_date:day,
  currency:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/,'Currency must be a 3-letter code such as INR.'),
  tax_percent:z.coerce.number().min(0,'Tax cannot be negative.').max(100,'Tax cannot exceed 100%.'),
  discount:z.coerce.number().min(0,'Discount cannot be negative.'),
  notes:z.string().max(2000).default(''),
  items:z.array(z.object({description:z.string().trim().min(1,'Every line item needs a description.').max(500),quantity:z.coerce.number().positive('Quantity must be greater than zero.').max(1_000_000),unit_price:z.coerce.number().min(0,'Unit price cannot be negative.').max(1_000_000_000)})).min(1,'Add at least one line item.').max(100),
}).refine(v=>v.due_date>=v.issue_date,{message:'The due date cannot be before the issue date.',path:['due_date']})
  .refine(v=>v.discount<=invoiceTotals(v.items,0,0).subtotal,{message:'Discount cannot exceed the subtotal.',path:['discount']});
export const paymentInput=z.object({invoice:z.uuid(),amount:z.coerce.number().positive('Enter the amount received.').max(1_000_000_000),paid_on:day,method:z.enum(PAYMENT_METHODS),reference:z.string().trim().max(200).default('')});
export const statusInput=z.object({invoice:z.uuid(),status:z.enum(['sent','void'])});
export const voidPaymentInput=z.object({payment:z.uuid(),reason:z.string().trim().min(3,'Enter a reason for reversing this payment.').max(500)});

export function formatMoney(value:number,currency:string){
  try{return new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(value);}catch{return `${currency} ${value.toFixed(2)}`;}
}
// jsPDF's built-in fonts cannot draw currency symbols such as ₹, so PDFs use the ISO code.
export const pdfMoney=(value:number,currency:string)=>`${currency} ${new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)}`;
export function financeSummary(invoices:FinanceInvoice[],monthPrefix:string){
  const rows=new Map<string,{currency:string;outstanding:number;overdue:number;collected:number;drafts:number}>();
  const row=(currency:string)=>{let r=rows.get(currency);if(!r){r={currency,outstanding:0,overdue:0,collected:0,drafts:0};rows.set(currency,r);}return r;};
  for(const invoice of invoices){
    const r=row(invoice.currency);
    if(invoice.display_status==='draft')r.drafts++;
    if(invoice.status==='sent'){r.outstanding+=invoice.balance;if(invoice.display_status==='overdue')r.overdue+=invoice.balance;}
    for(const payment of invoice.payments)if(!payment.voided_at&&payment.paid_on.startsWith(monthPrefix))r.collected+=Number(payment.amount);
  }
  return [...rows.values()].map(r=>({...r,outstanding:round(r.outstanding),overdue:round(r.overdue),collected:round(r.collected)})).sort((a,b)=>b.outstanding-a.outstanding);
}
export function nextDueDate(issue:string,days=15){const d=new Date(`${issue}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
