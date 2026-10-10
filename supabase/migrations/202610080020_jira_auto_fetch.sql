create table public.jira_sync_settings(organization_id uuid primary key references public.organizations(id),auto_fetch boolean not null default true,updated_at timestamptz not null default now());
alter table public.jira_sync_settings enable row level security;
create policy jira_sync_settings_read on public.jira_sync_settings for select to authenticated using(private.time_member(organization_id) is not null);
grant select on public.jira_sync_settings to authenticated;
grant all on public.jira_sync_settings to service_role;
create function public.jira_auto_fetch_save(org_id uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 insert into public.jira_sync_settings(organization_id,auto_fetch) values(org_id,enabled) on conflict(organization_id) do update set auto_fetch=excluded.auto_fetch,updated_at=now();
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,new_value) values(org_id,auth.uid(),'jira_auto_fetch_changed','jira_sync_settings',jsonb_build_object('enabled',enabled));
end $$;
revoke all on function public.jira_auto_fetch_save(uuid,boolean) from public,anon;
grant execute on function public.jira_auto_fetch_save(uuid,boolean) to authenticated;
