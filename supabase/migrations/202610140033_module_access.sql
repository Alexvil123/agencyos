-- Module access. Calendar, Campaigns, Finance and Analytics are Owner-only unless the Owner grants an employee access in Settings.
-- Finance keeps working for anyone who already has the finance.read permission. Nothing is readable or writable directly:
-- people go through the functions below.
begin;
create table public.module_access(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module text not null check (module in ('calendar','campaigns','finance','analytics')),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(organization_id,module,membership_id)
);
alter table public.module_access enable row level security;
revoke all on public.module_access from anon, authenticated;

create function private.module_allowed(org_id uuid, module_name text) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_owner(org_id) or exists(
    select 1 from public.module_access a join public.memberships m on m.id=a.membership_id
    where a.organization_id=org_id and a.module=module_name and m.user_id=auth.uid() and m.active and m.organization_id=org_id)
$$;

create or replace function private.finance_access(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_owner(org_id) or private.has_permission(org_id,'finance.read') or private.module_allowed(org_id,'finance')
$$;

create function public.module_access_mine(org_id uuid) returns text[] language sql stable security definer set search_path='' as $$
  select case when private.is_owner(org_id) then array['calendar','campaigns','finance','analytics']
    else coalesce((select array_agg(distinct x) from (
      select a.module x from public.module_access a join public.memberships m on m.id=a.membership_id
        where a.organization_id=org_id and m.user_id=auth.uid() and m.active
      union select 'finance' where private.has_permission(org_id,'finance.read')) s),array[]::text[]) end
$$;

create function public.module_access_list(org_id uuid) returns table(module text, membership_id uuid) language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_owner(org_id) then raise exception 'Only the Owner can manage module access';end if;
  return query select a.module,a.membership_id from public.module_access a where a.organization_id=org_id;
end $$;

create function public.module_access_save(org_id uuid, module_name text, member_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare ids uuid[]:=coalesce(member_ids,array[]::uuid[]);
begin
  if not private.is_owner(org_id) then raise exception 'Only the Owner can manage module access';end if;
  if module_name not in ('calendar','campaigns','finance','analytics') then raise exception 'Unknown module';end if;
  if exists(select 1 from unnest(ids) i where not exists(select 1 from public.memberships m where m.id=i and m.organization_id=org_id and m.active and m.kind='employee')) then raise exception 'Choose active employees only';end if;
  delete from public.module_access where organization_id=org_id and module=module_name and membership_id<>all(ids);
  insert into public.module_access(organization_id,module,membership_id) select org_id,module_name,i from unnest(ids) i on conflict do nothing;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    values(org_id,auth.uid(),'module_access_changed','module_access',null,jsonb_build_object('module',module_name,'people',cardinality(ids)));
end $$;
revoke all on function public.module_access_mine(uuid), public.module_access_list(uuid), public.module_access_save(uuid,text,uuid[]) from public, anon;
grant execute on function public.module_access_mine(uuid), public.module_access_list(uuid), public.module_access_save(uuid,text,uuid[]) to authenticated;
commit;
