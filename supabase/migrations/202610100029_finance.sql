begin;
-- Finance: invoices, line items and payments. All access goes through the functions below; the tables themselves
-- have row level security enabled with no policies and no direct grants. Allowed: the Owner and the Finance roles
-- (permission finance.read). Money is numeric with two decimals; the currency is an ISO code stored on each invoice.
create function private.finance_access(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_owner(org_id) or private.has_permission(org_id,'finance.read')
$$;

create table public.finance_invoice_counters(
 organization_id uuid not null references public.organizations(id),
 year int not null check(year between 2000 and 2100),
 last_number int not null default 0,
 primary key(organization_id,year)
);
create table public.finance_invoices(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 number text not null,
 client_name text not null check(length(trim(client_name)) between 1 and 255),
 client_email text check(client_email is null or length(client_email)<=254),
 issue_date date not null,
 due_date date not null,
 currency text not null default 'INR' check(currency ~ '^[A-Z]{3}$'),
 tax_percent numeric(5,2) not null default 0 check(tax_percent between 0 and 100),
 discount numeric(14,2) not null default 0 check(discount>=0),
 notes text check(notes is null or length(notes)<=2000),
 status text not null default 'draft' check(status in ('draft','sent','void')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(due_date>=issue_date),
 unique(organization_id,number)
);
create table public.finance_invoice_items(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
 position int not null,
 description text not null check(length(trim(description)) between 1 and 500),
 quantity numeric(12,3) not null check(quantity>0),
 unit_price numeric(14,2) not null check(unit_price>=0)
);
create table public.finance_payments(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 invoice_id uuid not null references public.finance_invoices(id),
 amount numeric(14,2) not null check(amount>0),
 paid_on date not null,
 method text not null check(method in ('bank','upi','cash','card','other')),
 reference text check(reference is null or length(reference)<=200),
 voided_at timestamptz,
 void_reason text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index finance_items_invoice on public.finance_invoice_items(invoice_id,position);
create index finance_payments_invoice on public.finance_payments(invoice_id);
alter table public.finance_invoice_counters enable row level security;
alter table public.finance_invoices enable row level security;
alter table public.finance_invoice_items enable row level security;
alter table public.finance_payments enable row level security;
revoke all on public.finance_invoice_counters,public.finance_invoices,public.finance_invoice_items,public.finance_payments from anon,authenticated;
grant all on public.finance_invoice_counters,public.finance_invoices,public.finance_invoice_items,public.finance_payments to service_role;
create trigger audit_finance_invoices after insert or update on public.finance_invoices for each row execute function private.audit_change();
create trigger audit_finance_items after insert or update or delete on public.finance_invoice_items for each row execute function private.audit_change();
create trigger audit_finance_payments after insert or update on public.finance_payments for each row execute function private.audit_change();

-- subtotal, tax and total are always derived from the line items, never stored
create function private.finance_amounts(invoice uuid) returns table(subtotal numeric,tax numeric,total numeric,paid numeric) language sql stable security definer set search_path='' as $$
 select s.subtotal,t.tax,s.net+t.tax,coalesce((select sum(p.amount) from public.finance_payments p where p.invoice_id=i.id and p.voided_at is null),0)
 from public.finance_invoices i
 cross join lateral(select coalesce(round(sum(x.quantity*x.unit_price),2),0) as subtotal from public.finance_invoice_items x where x.invoice_id=i.id) s0
 cross join lateral(select s0.subtotal as subtotal,greatest(s0.subtotal-i.discount,0) as net) s
 cross join lateral(select round(s.net*i.tax_percent/100,2) as tax) t
 where i.id=invoice
$$;
create function private.finance_next_number(org uuid,issue date) returns text language plpgsql security definer set search_path='' as $$
declare y int:=extract(year from issue)::int; n int;
begin
 insert into public.finance_invoice_counters(organization_id,year,last_number) values(org,y,1)
 on conflict(organization_id,year) do update set last_number=public.finance_invoice_counters.last_number+1 returning last_number into n;
 return 'INV-'||y||'-'||lpad(n::text,4,'0');
end $$;

create function public.finance_save_invoice(org_id uuid,invoice_id uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.finance_invoices; item jsonb; pos int:=0; issue date; due date; subtotal numeric:=0; discount_value numeric; tax_value numeric; currency_value text; id_value uuid;
begin
 if not private.finance_access(org_id) then raise exception 'Finance access required';end if;
 if coalesce(jsonb_typeof(payload->'items'),'')<>'array' then raise exception 'Add between 1 and 100 line items';end if;
 if jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'Add between 1 and 100 line items';end if;
 if coalesce(nullif(trim(payload->>'client_name'),''),'')='' then raise exception 'Client name is required';end if;
 issue:=(payload->>'issue_date')::date; due:=(payload->>'due_date')::date;
 if issue is null or due is null then raise exception 'Issue and due dates are required';end if;
 if due<issue then raise exception 'The due date cannot be before the issue date';end if;
 currency_value:=upper(coalesce(nullif(trim(payload->>'currency'),''),'INR'));
 if currency_value !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code';end if;
 tax_value:=coalesce(nullif(payload->>'tax_percent','')::numeric,0); discount_value:=coalesce(nullif(payload->>'discount','')::numeric,0);
 if tax_value not between 0 and 100 then raise exception 'Tax must be between 0 and 100 percent';end if;
 if discount_value<0 then raise exception 'Discount cannot be negative';end if;
 for item in select * from jsonb_array_elements(payload->'items') loop
  if coalesce(nullif(trim(item->>'description'),''),'')='' then raise exception 'Every line item needs a description';end if;
  if coalesce((item->>'quantity')::numeric,0)<=0 then raise exception 'Quantity must be greater than zero';end if;
  if coalesce((item->>'unit_price')::numeric,-1)<0 then raise exception 'Unit price cannot be negative';end if;
  subtotal:=subtotal+round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,2);
 end loop;
 if discount_value>subtotal then raise exception 'Discount cannot exceed the subtotal';end if;
 if invoice_id is null then
  insert into public.finance_invoices(organization_id,number,client_name,client_email,issue_date,due_date,currency,tax_percent,discount,notes,created_by)
  values(org_id,private.finance_next_number(org_id,issue),trim(payload->>'client_name'),nullif(trim(coalesce(payload->>'client_email','')),''),issue,due,currency_value,tax_value,discount_value,nullif(trim(coalesce(payload->>'notes','')),''),auth.uid())
  returning id into id_value;
 else
  select * into inv from public.finance_invoices where id=invoice_id and organization_id=org_id for update;
  if inv.id is null then raise exception 'Invoice not found';end if;
  if inv.status<>'draft' then raise exception 'Only draft invoices can be edited';end if;
  update public.finance_invoices set client_name=trim(payload->>'client_name'),client_email=nullif(trim(coalesce(payload->>'client_email','')),''),issue_date=issue,due_date=due,currency=currency_value,tax_percent=tax_value,discount=discount_value,notes=nullif(trim(coalesce(payload->>'notes','')),''),updated_at=now() where id=inv.id;
  delete from public.finance_invoice_items where finance_invoice_items.invoice_id=inv.id;
  id_value:=inv.id;
 end if;
 for item in select * from jsonb_array_elements(payload->'items') loop
  pos:=pos+1;
  insert into public.finance_invoice_items(organization_id,invoice_id,position,description,quantity,unit_price) values(org_id,id_value,pos,trim(item->>'description'),(item->>'quantity')::numeric,(item->>'unit_price')::numeric);
 end loop;
 return id_value;
end $$;

create function public.finance_set_status(org_id uuid,invoice_id uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
declare inv public.finance_invoices;
begin
 if not private.finance_access(org_id) then raise exception 'Finance access required';end if;
 select * into inv from public.finance_invoices where id=invoice_id and organization_id=org_id for update;
 if inv.id is null then raise exception 'Invoice not found';end if;
 if new_status='sent' and inv.status='draft' then
  update public.finance_invoices set status='sent',updated_at=now() where id=inv.id;
 elsif new_status='void' and inv.status in ('draft','sent') then
  if exists(select 1 from public.finance_payments where finance_payments.invoice_id=inv.id and voided_at is null) then raise exception 'Void or reverse the payments before voiding this invoice';end if;
  update public.finance_invoices set status='void',updated_at=now() where id=inv.id;
 else raise exception 'This status change is not allowed';end if;
end $$;

create function public.finance_record_payment(org_id uuid,invoice_id uuid,amount_value numeric,paid_date date,method_value text,reference_value text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.finance_invoices; a record; id_value uuid;
begin
 if not private.finance_access(org_id) then raise exception 'Finance access required';end if;
 select * into inv from public.finance_invoices where id=invoice_id and organization_id=org_id for update;
 if inv.id is null then raise exception 'Invoice not found';end if;
 if inv.status<>'sent' then raise exception 'Payments can only be recorded on sent invoices';end if;
 if amount_value is null or amount_value<=0 then raise exception 'Payment amount must be greater than zero';end if;
 if paid_date is null or paid_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'The payment date cannot be in the future';end if;
 select * into a from private.finance_amounts(inv.id);
 if round(amount_value,2)>a.total-a.paid then raise exception 'Payment exceeds the outstanding balance';end if;
 insert into public.finance_payments(organization_id,invoice_id,amount,paid_on,method,reference,created_by) values(org_id,inv.id,round(amount_value,2),paid_date,method_value,nullif(trim(coalesce(reference_value,'')),''),auth.uid()) returning id into id_value;
 return id_value;
end $$;

create function public.finance_void_payment(org_id uuid,payment_id uuid,reason_value text) returns void language plpgsql security definer set search_path='' as $$
declare p public.finance_payments;
begin
 if not private.finance_access(org_id) then raise exception 'Finance access required';end if;
 if length(trim(coalesce(reason_value,'')))<3 then raise exception 'Enter a reason for reversing this payment';end if;
 select * into p from public.finance_payments where id=payment_id and organization_id=org_id for update;
 if p.id is null then raise exception 'Payment not found';end if;
 if p.voided_at is not null then raise exception 'This payment was already reversed';end if;
 update public.finance_payments set voided_at=now(),void_reason=trim(reason_value) where id=p.id;
end $$;

create function public.finance_overview(org_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Kolkata')::date; result jsonb;
begin
 if not private.finance_access(org_id) then raise exception 'Finance access required';end if;
 select coalesce(jsonb_agg(entry order by (entry->>'issue_date') desc,(entry->>'number') desc),'[]'::jsonb) into result from (
  select jsonb_build_object('id',i.id,'number',i.number,'client_name',i.client_name,'client_email',i.client_email,'issue_date',i.issue_date,'due_date',i.due_date,'currency',i.currency,'tax_percent',i.tax_percent,'discount',i.discount,'notes',i.notes,'status',i.status,
   'subtotal',a.subtotal,'tax',a.tax,'total',a.total,'paid',a.paid,'balance',a.total-a.paid,
   'display_status',case when i.status='void' then 'void' when i.status='draft' then 'draft' when a.total-a.paid<=0 then 'paid' when i.due_date<today then 'overdue' when a.paid>0 then 'partial' else 'sent' end,
   'items',coalesce((select jsonb_agg(jsonb_build_object('description',x.description,'quantity',x.quantity,'unit_price',x.unit_price) order by x.position) from public.finance_invoice_items x where x.invoice_id=i.id),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount,'paid_on',p.paid_on,'method',p.method,'reference',p.reference,'voided_at',p.voided_at,'void_reason',p.void_reason) order by p.paid_on,p.created_at) from public.finance_payments p where p.invoice_id=i.id),'[]'::jsonb)) as entry
  from public.finance_invoices i cross join lateral private.finance_amounts(i.id) a
  where i.organization_id=org_id order by i.issue_date desc,i.number desc limit 1000) rows;
 return result;
end $$;

revoke all on function private.finance_access(uuid),private.finance_amounts(uuid),private.finance_next_number(uuid,date) from public,anon,authenticated;
revoke all on function public.finance_save_invoice(uuid,uuid,jsonb),public.finance_set_status(uuid,uuid,text),public.finance_record_payment(uuid,uuid,numeric,date,text,text),public.finance_void_payment(uuid,uuid,text),public.finance_overview(uuid) from public,anon;
grant execute on function public.finance_save_invoice(uuid,uuid,jsonb),public.finance_set_status(uuid,uuid,text),public.finance_record_payment(uuid,uuid,numeric,date,text,text),public.finance_void_payment(uuid,uuid,text),public.finance_overview(uuid) to authenticated;
commit;
