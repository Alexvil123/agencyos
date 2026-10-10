-- Actual clock-in is the start; no assigned shift is required. Historical rows remain unchanged.
begin;
alter table public.time_attendance drop constraint time_attendance_shift_check;
alter table public.time_attendance add constraint time_attendance_shift_check check(shift in ('early','late','flexible'));
create or replace function private.work_attendance_core(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); a public.time_attendance; shift_name text; d date:=(now() at time zone 'Asia/Kolkata')::date; task_id uuid;
begin
 if actor is null then raise exception 'Active employee required';end if;perform 1 from public.memberships where id=actor for update;
 select * into a from public.time_attendance where membership_id=actor and clock_out is null;
 if operation='clock_in' then
 if a.id is not null then raise exception 'Already clocked in';end if;if extract(isodow from d)=7 then raise exception 'Sunday is a non-working day';end if;
 shift_name:='flexible';
 insert into public.time_attendance(organization_id,membership_id,work_date,shift) values(org_id,actor,d,shift_name);return;end if;
 if a.id is null then raise exception 'Clock in first';end if;
 if operation='break_start' then
 if exists(select 1 from public.time_breaks where membership_id=actor and end_at is null) then raise exception 'Break already started';end if;
 select l.task_id into task_id from public.time_logs l where membership_id=actor and state='running';if task_id is not null then perform private.work_event_core(org_id,'hold',task_id,false);end if;
 insert into public.time_breaks(organization_id,membership_id,attendance_id) values(org_id,actor,a.id);
 elsif operation='break_end' then update public.time_breaks set end_at=now() where membership_id=actor and end_at is null;if not found then raise exception 'No active break';end if;
 elsif operation='clock_out' then
 update public.time_breaks set end_at=now() where membership_id=actor and end_at is null;
 update public.task_work_sessions set ended_at=now(),paused_at=now() where employee_id=actor and ended_at is null;
 update public.time_tasks t set work_status='on_hold',updated_at=now() where id in(select l.task_id from public.time_logs l where membership_id=actor and state='running');
 update public.time_logs set state='stopped' where membership_id=actor and state<>'stopped';
 update public.time_attendance set clock_out=now(),updated_at=now() where id=a.id;
 elsif operation in ('timer_start','timer_resume','timer_pause','timer_stop') then
 select coalesce(task,(select l.task_id from public.time_logs l where membership_id=actor and state=case when operation='timer_resume' then 'paused' else 'running' end order by created_at desc limit 1)) into task_id;
 if exists(select 1 from public.time_tasks where id=task_id and source='jira') and operation in ('timer_start','timer_resume') then raise exception 'Use verified Jira timer action';end if;
 perform private.work_event_core(org_id,case operation when 'timer_start' then 'start' when 'timer_resume' then 'resume' when 'timer_pause' then 'hold' else 'end' end,task_id,false);
 else raise exception 'Invalid time operation';end if;
end $$;

-- Keep existing manager authorization and audit rules, without assigning a schedule.
create or replace function public.time_owner_setup(org_id uuid,target uuid,shift_name text,manager_access boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 if not exists(select 1 from public.memberships where id=target and organization_id=org_id and active and kind='employee') then raise exception 'Active employee required';end if;
 if manager_access and target=private.time_member(org_id) then raise exception 'Cannot increase own permissions';end if;
 if manager_access then insert into public.time_managers values(org_id,target) on conflict do nothing;else delete from public.time_managers where membership_id=target and organization_id=org_id;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value) values(org_id,auth.uid(),'time_access_configured','memberships',target,jsonb_build_object('manager',manager_access));
end $$;
commit;
