begin;
-- Store authoritative display metadata under the existing assigned-task RLS.
-- This does not change memberships, role grants or employee visibility.
alter table public.time_tasks add column jira_metadata jsonb not null default '{}'::jsonb;
alter function public.work_import(uuid,uuid,jsonb,boolean) rename to work_import_core;
create function public.work_import(org_id uuid,actor_user uuid,issues jsonb,system_event boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare x jsonb; metadata jsonb;
begin
 perform public.work_import_core(org_id,actor_user,issues,system_event);
 for x in select * from jsonb_array_elements(issues) loop
  if x ? 'labels' and jsonb_typeof(x->'labels')<>'array' then raise exception 'Invalid Jira labels';end if;
  metadata:=jsonb_build_object(
   'labels',coalesce(x->'labels','[]'::jsonb),'components',coalesce(x->'components','[]'::jsonb),
   'priority_name',x->'priority_name','priority_id',x->'priority_id',
   'status_category',x->'status_category','assignee_name',x->'assignee_name',
   'project_name',x->'project_name','created_at',x->'created_at',
   'resolved_at',x->'resolved_at','parent_key',x->'parent_key');
  update public.time_tasks set jira_metadata=metadata
  where organization_id=org_id and jira_key=x->>'key' and source='jira' and canonical_id is null
   and jira_updated_at=(x->>'jira_updated')::timestamptz and jira_metadata is distinct from metadata;
 end loop;
end $$;
revoke all on function public.work_import(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.work_import(uuid,uuid,jsonb,boolean) to service_role;
commit;
