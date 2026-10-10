-- Sales grants persist independently of provider credentials and server instances.
create table public.sales_team_access (
 organization_id uuid primary key references public.organizations(id),
 members uuid[] not null default '{}',
 updated_at timestamptz not null default now()
);
alter table public.sales_team_access enable row level security;
grant select on public.sales_team_access to authenticated;
grant all on public.sales_team_access to service_role;
create policy sales_team_owner_read on public.sales_team_access for select to authenticated
 using (private.is_owner(organization_id));

create function public.sales_team_save(org_id uuid, member_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare selected uuid[]; previous uuid[];
begin
 if not private.is_owner(org_id) then raise exception 'Owner required'; end if;
 if member_ids is null or cardinality(member_ids)>500 or array_position(member_ids,null) is not null then
  raise exception 'Select active workspace employees only';
 end if;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into selected from unnest(member_ids) id;
 if exists(select 1 from unnest(selected) as chosen(member_id) where not exists (
  select 1 from public.memberships m where m.id=chosen.member_id and m.organization_id=org_id and m.kind='employee' and m.active
 )) then raise exception 'Select active workspace employees only'; end if;
 -- Serialize replacements, including the initial save, without partial grants/audits.
 perform 1 from public.organizations where id=org_id for update;
 select members into previous from public.sales_team_access where organization_id=org_id;
 insert into public.sales_team_access(organization_id,members) values(org_id,selected)
 on conflict(organization_id) do update set members=excluded.members,updated_at=now();
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,old_value,new_value)
 values(org_id,auth.uid(),'sales_access_changed','sales_sheet',
  jsonb_build_object('members',coalesce(previous,'{}'::uuid[])),jsonb_build_object('members',selected));
end $$;
revoke all on function public.sales_team_save(uuid,uuid[]) from public,anon;
grant execute on function public.sales_team_save(uuid,uuid[]) to authenticated;
