-- Sanitized telemetry, no tokens, issue contents or sheet cell values.
begin;
create table public.workspace_sync_health (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 scope_key text not null,
 integration text not null check (integration in ('jira','google_read','google_write')),
 last_checked_at timestamptz not null default now(),
 last_success_at timestamptz,
 state text not null check (state in ('ok','attention')),
 primary key(organization_id,scope_key,integration)
);
alter table public.workspace_sync_health enable row level security;
grant select on public.workspace_sync_health to authenticated;
grant all on public.workspace_sync_health to service_role;
create policy sync_health_read on public.workspace_sync_health for select to authenticated using (
 private.time_member(organization_id)::text=scope_key or private.is_owner(organization_id)
);
create function public.workspace_sync_health_record(org_id uuid, scope_value text, integration_value text, success_value boolean)
returns void language sql security definer set search_path=public as $$
 insert into workspace_sync_health(organization_id,scope_key,integration,last_checked_at,last_success_at,state)
 values(org_id,scope_value,integration_value,now(),case when success_value then now() end,case when success_value then 'ok' else 'attention' end)
 on conflict(organization_id,scope_key,integration) do update set last_checked_at=excluded.last_checked_at,last_success_at=coalesce(excluded.last_success_at,workspace_sync_health.last_success_at),state=excluded.state;
$$;
revoke all on function public.workspace_sync_health_record(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.workspace_sync_health_record(uuid,text,text,boolean) to service_role;
-- Existing single-use sales audit tickets distinguish in-flight saves from unconfirmed outcomes.
create function public.sales_pending_health(org_id uuid)
returns table(pending bigint,review bigint) language plpgsql security invoker set search_path=public as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required'; end if;
 return query select count(*) filter(where requested.created_at>now()-interval '2 minutes'),count(*) filter(where requested.created_at<=now()-interval '2 minutes')
 from audit_logs requested where requested.organization_id=org_id and requested.action in ('sales_edit_requested','sales_add_requested','sales_delete_requested')
 and not exists(select 1 from audit_logs confirmed where confirmed.organization_id=org_id and confirmed.action in ('sales_edit_confirmed','sales_add_confirmed','sales_delete_confirmed') and confirmed.new_value->>'ticket'=requested.new_value->>'ticket');
end;
$$;
revoke all on function public.sales_pending_health(uuid) from public,anon;
grant execute on function public.sales_pending_health(uuid) to authenticated;
commit;
