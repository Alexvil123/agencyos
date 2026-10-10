-- Resume only the exact log held by this break. Existing breaks are not backfilled.
begin;
alter table public.time_breaks add column paused_log_id uuid references public.time_logs(id) on delete set null;
create function private.work_finish_break(org_id uuid,expected_break uuid default null,verified_log uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); b public.time_breaks; l public.time_logs; t public.time_tasks;
begin
 if actor is null then raise exception 'Active employee required';end if;
 perform 1 from public.memberships where id=actor for update;
 select * into b from public.time_breaks where membership_id=actor and organization_id=org_id and end_at is null for update;
 if b.id is null then raise exception 'No active break';end if;
 if expected_break is not null and b.id<>expected_break then raise exception 'Break changed; refresh again';end if;
 update public.time_breaks set end_at=now() where id=b.id;
 select * into l from public.time_logs where id=b.paused_log_id and organization_id=org_id and membership_id=actor and state='paused';
 if l.id is null or exists(select 1 from public.time_logs where membership_id=actor and state='running') then return false;end if;
 select * into t from public.time_tasks where id=l.task_id and organization_id=org_id and membership_id=actor and canonical_id is null and work_status='on_hold';
 if t.id is null then return false;end if;
 if t.source='jira' and (verified_log is distinct from l.id or not exists(select 1 from public.jira_account_links where organization_id=org_id and membership_id=actor and account_id=t.jira_assignee_account_id)) then return false;end if;
 perform private.work_event_core(org_id,'resume',t.id,false);
 return true;
end $$;
revoke all on function private.work_finish_break(uuid,uuid,uuid) from public,anon,authenticated;
create function public.work_break_end(org_id uuid,actor_user uuid,expected_break uuid,verified_log uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 return private.work_finish_break(org_id,expected_break,verified_log);
end $$;
revoke all on function public.work_break_end(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.work_break_end(uuid,uuid,uuid,uuid) to service_role;
create or replace function private.work_attendance_core(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); a public.time_attendance; shift_name text; d date:=(now() at time zone 'Asia/Kolkata')::date; task_id uuid; paused_log uuid;
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
 select l.task_id,l.id into task_id,paused_log from public.time_logs l where membership_id=actor and state='running';if task_id is not null then perform private.work_event_core(org_id,'hold',task_id,false);end if;
 insert into public.time_breaks(organization_id,membership_id,attendance_id,paused_log_id) values(org_id,actor,a.id,paused_log);
 elsif operation='break_end' then perform private.work_finish_break(org_id);
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


commit;
