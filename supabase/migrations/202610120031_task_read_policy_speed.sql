-- Faster read policy for public.time_tasks. The visibility rules do not change.
-- work_task_read called private.time_member()/time_manage() once per row, each running its own queries, so loading a few hundred tasks
-- cost over a second. The helpers below return the caller's memberships and managed organizations once per statement.
create function private.time_member_set() returns table(org uuid,member uuid) language sql stable security definer set search_path='' as $$
 select m.organization_id,m.id from public.memberships m where m.user_id=auth.uid() and m.active and m.kind='employee' and private.assurance_ok(m.organization_id)
$$;
create function private.time_manage_set() returns setof uuid language sql stable security definer set search_path='' as $$
 select m.organization_id from public.memberships m where m.user_id=auth.uid() and m.active and private.is_owner(m.organization_id)
 union
 select tm.organization_id from public.time_managers tm join private.time_member_set() s on s.org=tm.organization_id and s.member=tm.membership_id
$$;
drop policy work_task_read on public.time_tasks;
create policy work_task_read on public.time_tasks for select to authenticated using(
 (organization_id,membership_id) in (select org,member from private.time_member_set())
 or organization_id in (select private.time_manage_set())
 or exists(select 1 from public.time_logs l where l.task_id=public.time_tasks.id and (l.organization_id,l.membership_id) in (select org,member from private.time_member_set()))
);
