begin;
create table public.sales_conversion_settings (
 organization_id uuid primary key references public.organizations(id), owner_actor uuid not null references auth.users(id),
 enabled boolean not null default false, source_tab text not null default 'Tracksheet', name_column text not null default 'Business Name', status_column text not null default 'Status', won_value text not null default 'Deal Closed',
 jira_project text not null check(jira_project in ('OCT','SEP')), issue_type text not null check(issue_type ~ '^[0-9]+$'), summary_template text not null default 'Client onboarding — {client}',
 lease_until timestamptz, last_checked_at timestamptz, last_error text, updated_at timestamptz not null default now()
);
create table public.sales_client_conversions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), client_key text not null, client_name text not null, jira_label text not null,
 source_tab text not null, source_id text not null, source_fingerprint text not null, jira_project text not null, issue_type text not null, summary text not null,
 state text not null default 'pending' check(state in ('pending','creating','synced','failed','review','cancelled')),
 jira_key text, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,client_key), unique(organization_id,jira_label), unique(organization_id,jira_key)
);
create table public.sales_conversion_sources (
 organization_id uuid not null references public.organizations(id), source_tab text not null, source_id text not null, client_name text not null,
 suppressed boolean not null default false, conversion_id uuid references public.sales_client_conversions(id), primary key(organization_id,source_tab,source_id)
);
alter table public.sales_conversion_settings enable row level security;
alter table public.sales_client_conversions enable row level security;
alter table public.sales_conversion_sources enable row level security;
revoke all on public.sales_conversion_settings,public.sales_client_conversions,public.sales_conversion_sources from public,anon,authenticated;
grant select on public.sales_conversion_settings,public.sales_client_conversions,public.sales_conversion_sources to authenticated;
grant select,insert,update on public.sales_conversion_settings,public.sales_client_conversions,public.sales_conversion_sources to service_role;
create policy sales_settings_owner on public.sales_conversion_settings for select to authenticated using(private.is_owner(organization_id));
create policy sales_conversions_owner on public.sales_client_conversions for select to authenticated using(private.is_owner(organization_id));
create policy sales_sources_owner on public.sales_conversion_sources for select to authenticated using(private.is_owner(organization_id));
create function public.sales_conversion_configure(org_id uuid, payload jsonb, baseline jsonb, expected timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare previous public.sales_conversion_settings; row jsonb;
begin
 if not private.is_owner(org_id) then raise exception 'Owner required'; end if;
 perform pg_advisory_xact_lock(hashtext('sales_conversion:'||org_id::text));
 select * into previous from public.sales_conversion_settings where organization_id=org_id;
 if previous.organization_id is not null and (expected is null or previous.updated_at<>expected) then raise exception 'Settings changed; refresh'; end if;
 if length(payload->>'source_tab')>150 or payload->>'source_tab' not in ('Tracksheet','Leads') or length(payload->>'name_column') not between 1 and 255 or length(payload->>'status_column') not between 1 and 255 or length(payload->>'won_value') not between 1 and 255 or length(payload->>'summary_template') not between 1 and 180 or position('{client}' in payload->>'summary_template')=0 then raise exception 'Invalid conversion settings'; end if;
 if previous.organization_id is null or previous.source_tab<>(payload->>'source_tab') or previous.won_value<>(payload->>'won_value') or previous.status_column<>(payload->>'status_column') then
  if jsonb_typeof(baseline)<>'array' or jsonb_array_length(baseline)>10000 then raise exception 'Invalid baseline'; end if;
  for row in select value from jsonb_array_elements(baseline) loop
   insert into public.sales_conversion_sources(organization_id,source_tab,source_id,client_name,suppressed) values(org_id,payload->>'source_tab',row->>'id',row->>'name',true) on conflict do nothing;
  end loop;
 end if;
 insert into public.sales_conversion_settings(organization_id,owner_actor,enabled,source_tab,name_column,status_column,won_value,jira_project,issue_type,summary_template)
 values(org_id,auth.uid(),(payload->>'enabled')::boolean,payload->>'source_tab',payload->>'name_column',payload->>'status_column',payload->>'won_value',payload->>'jira_project',payload->>'issue_type',payload->>'summary_template')
 on conflict(organization_id) do update set owner_actor=excluded.owner_actor,enabled=excluded.enabled,source_tab=excluded.source_tab,name_column=excluded.name_column,status_column=excluded.status_column,won_value=excluded.won_value,jira_project=excluded.jira_project,issue_type=excluded.issue_type,summary_template=excluded.summary_template,updated_at=now(),last_error=null;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,new_value) values(org_id,auth.uid(),'sales_conversion_configured','sales_conversion',payload);
end $$;
create function public.sales_conversion_scan_claim(org_id uuid) returns setof public.sales_conversion_settings language sql security definer set search_path='' as $$
 update public.sales_conversion_settings set lease_until=now()+interval '3 minutes' where organization_id=org_id and enabled and (lease_until is null or lease_until<now()) returning *;
$$;
create function public.sales_conversion_job_claim(job_id uuid) returns setof public.sales_client_conversions language sql security definer set search_path='' as $$
 update public.sales_client_conversions j set state='creating',updated_at=now() where id=job_id and state='pending' and exists(select 1 from public.sales_conversion_settings s join public.memberships m on m.organization_id=s.organization_id and m.user_id=s.owner_actor and m.active join public.membership_roles r on r.membership_id=m.id and r.role_key='owner' where s.organization_id=j.organization_id and s.enabled) returning j.*;
$$;
revoke all on function public.sales_conversion_configure(uuid,jsonb,jsonb,timestamptz),public.sales_conversion_scan_claim(uuid),public.sales_conversion_job_claim(uuid) from public,anon,authenticated;
grant execute on function public.sales_conversion_configure(uuid,jsonb,jsonb,timestamptz) to authenticated;
grant execute on function public.sales_conversion_scan_claim(uuid),public.sales_conversion_job_claim(uuid) to service_role;
commit;
