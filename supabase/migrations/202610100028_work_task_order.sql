create table public.work_task_orders (
 organization_id uuid not null references public.organizations(id),
 membership_id uuid primary key,
 task_ids uuid[] not null default '{}',
 revision integer not null default 0,
 updated_at timestamptz not null default now(),
 foreign key(membership_id,organization_id) references public.memberships(id,organization_id)
);
alter table public.work_task_orders enable row level security;
revoke all on public.work_task_orders from public,anon,authenticated;
grant select on public.work_task_orders to authenticated;
grant all on public.work_task_orders to service_role;
create policy work_task_order_read on public.work_task_orders for select to authenticated
 using(membership_id=private.time_member(organization_id) or private.is_owner(organization_id));

create function public.work_task_order_save(org_id uuid,target uuid,ordered_ids uuid[],expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); current_revision integer;
begin
 if actor is null or (target<>actor and not private.is_owner(org_id)) then raise exception 'Own task order or Owner required';end if;
 if not exists(select 1 from public.memberships where id=target and organization_id=org_id and active and kind='employee') then raise exception 'Active employee required';end if;
 if expected_revision is null or expected_revision<0 or ordered_ids is null or cardinality(ordered_ids)>20000 or array_position(ordered_ids,null) is not null or
  cardinality(ordered_ids)<>(select count(distinct id) from unnest(ordered_ids) id) then raise exception 'Invalid task order';end if;
 -- Serialize queue replacements for this assignee.
 perform 1 from public.memberships where id=target and organization_id=org_id for update;
 if exists(select 1 from unnest(ordered_ids) as chosen(task_id) where not exists(
  select 1 from public.time_tasks t where t.id=chosen.task_id and t.organization_id=org_id
   and t.membership_id=target and t.canonical_id is null and coalesce((t.jira_metadata->>'available')::boolean,true)
 )) then raise exception 'Task assignment changed; refresh before ordering';end if;
 select revision into current_revision from public.work_task_orders where membership_id=target;
 if coalesce(current_revision,0)<>expected_revision then raise exception 'Task order changed; refresh before ordering';end if;
 insert into public.work_task_orders(organization_id,membership_id,task_ids,revision)
 values(org_id,target,ordered_ids,coalesce(current_revision,0)+1)
 on conflict(membership_id) do update set task_ids=excluded.task_ids,revision=excluded.revision,updated_at=now();
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
 values(org_id,auth.uid(),'work_task_order_changed','work_task_orders',target,
  jsonb_build_object('task_ids',ordered_ids,'revision',coalesce(current_revision,0)+1));
 return coalesce(current_revision,0)+1;
end $$;
revoke all on function public.work_task_order_save(uuid,uuid,uuid[],integer) from public,anon;
grant execute on function public.work_task_order_save(uuid,uuid,uuid[],integer) to authenticated;
