-- Restart completed personal manual work without changing old sessions or Jira status.
create or replace function private.work_event_core(org_id uuid,operation text,task uuid,switch_current boolean default false,expected_active uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); active_log public.time_logs; target_log public.time_logs; t public.time_tasks;
begin
 if actor is null then raise exception 'Active employee required';end if;
 perform 1 from public.memberships where id=actor for update;
 select * into t from public.time_tasks where id=task and organization_id=org_id and membership_id=actor and canonical_id is null;
 if t.id is null then raise exception 'Assigned task required';end if;
 select * into active_log from public.time_logs where membership_id=actor and state='running';
 select * into target_log from public.time_logs where membership_id=actor and task_id=task and state<>'stopped' order by created_at desc limit 1;
 if operation in ('start','resume') then
 if not exists(select 1 from public.time_attendance where membership_id=actor and clock_out is null) then raise exception 'Clock in first';end if;
 if exists(select 1 from public.time_breaks where membership_id=actor and end_at is null) then raise exception 'End break before starting work';end if;
 if t.work_status='cancelled' or (t.work_status='completed' and not (t.source='manual' and operation='start')) then raise exception 'Task is closed';end if;
 if active_log.id is not null then
 if active_log.task_id=task or not switch_current then raise exception 'You already have an active task.';end if;
 if active_log.task_id is distinct from expected_active then raise exception 'Active task changed; review again';end if;
 update public.task_work_sessions set ended_at=now(),paused_at=now() where log_id=active_log.id and ended_at is null;
 update public.time_logs set state='paused' where id=active_log.id;
 update public.time_tasks set work_status='on_hold',updated_at=now() where id=active_log.task_id;
 end if;
 if operation='resume' and target_log.state is distinct from 'paused' then raise exception 'No held work session';end if;
 if target_log.id is null then insert into public.time_logs(organization_id,membership_id,task_id,state) values(org_id,actor,task,'running') returning * into target_log;else update public.time_logs set state='running' where id=target_log.id;end if;
 insert into public.task_work_sessions(organization_id,employee_id,log_id,started_at) values(org_id,actor,target_log.id,now());
 update public.time_tasks set work_status='in_progress',completed_at=case when t.source='manual' then null else completed_at end,updated_at=now() where id=task;
 elsif operation in ('hold','end') then
 if target_log.id is null then raise exception 'No open work session';end if;
 if operation='hold' and target_log.state<>'running' then raise exception 'Task already on hold';end if;
 update public.task_work_sessions set ended_at=now(),paused_at=case when operation='hold' then now() else paused_at end where log_id=target_log.id and ended_at is null;
 update public.time_logs set state=case when operation='hold' then 'paused' else 'stopped' end,jira_sync_state=case when operation='end' and t.source='jira' then 'awaiting' else jira_sync_state end where id=target_log.id;
 update public.time_tasks set work_status=case when operation='hold' then 'on_hold' else 'completed' end,completed_at=case when operation='end' then now() else completed_at end,updated_at=now() where id=task;
 else raise exception 'Invalid work operation';end if;
 return target_log.id;
end $$;
