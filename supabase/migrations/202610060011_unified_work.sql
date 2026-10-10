begin;
alter table public.time_tasks alter column membership_id drop not null;
alter table public.time_tasks add column source text not null default 'manual' check(source in ('manual','jira'));
alter table public.time_tasks add column description text not null default '';
alter table public.time_tasks add column department_id uuid references public.departments(id);
alter table public.time_tasks add column priority text not null default 'medium' check(priority in ('low','medium','high','urgent'));
alter table public.time_tasks add column estimated_seconds integer check(estimated_seconds>=0);
alter table public.time_tasks add column task_type text not null default 'General';
alter table public.time_tasks add column work_status text not null default 'pending' check(work_status in ('pending','in_progress','on_hold','completed','cancelled'));
alter table public.time_tasks add column assigned_at timestamptz not null default now();
alter table public.time_tasks add column updated_at timestamptz not null default now();
alter table public.time_tasks add column jira_issue_id text;
alter table public.time_tasks add column jira_project text;
alter table public.time_tasks add column jira_status text;
alter table public.time_tasks add column jira_status_id text;
alter table public.time_tasks add column jira_assignee_account_id text;
alter table public.time_tasks add column jira_updated_at timestamptz;
alter table public.time_tasks add column canonical_id uuid references public.time_tasks(id);
alter table public.time_tasks add column jira_creation_state text check(jira_creation_state in ('creating','created','failed','uncertain','owner_review'));
update public.time_tasks set source='jira' where jira_key is not null;
update public.time_tasks t set jira_issue_id=j.id,jira_project=j.project_key,jira_status=j.status_name,jira_status_id=j.status_id,jira_assignee_account_id=j.assignee_id,jira_updated_at=j.jira_updated from public.jira_issues j where j.organization_id=t.organization_id and j.key=t.jira_key;
update public.time_tasks set work_status='completed' where completed_at is not null;
update public.time_tasks set assigned_at=created_at;
-- Preserve any legacy duplicate rows as archived aliases; retain their audit history.
with ranked as(select id,first_value(id) over(partition by organization_id,jira_key order by created_at,id) leader,row_number() over(partition by organization_id,jira_key order by created_at,id) n from public.time_tasks where jira_key is not null)
update public.time_tasks t set canonical_id=r.leader from ranked r where t.id=r.id and r.n>1;
update public.time_logs l set task_id=t.canonical_id from public.time_tasks t where l.task_id=t.id and t.canonical_id is not null;
drop index public.time_jira_task;
create unique index work_jira_identity on public.time_tasks(organization_id,jira_key) where jira_key is not null and canonical_id is null;
create unique index work_jira_id on public.time_tasks(organization_id,jira_issue_id) where jira_issue_id is not null and canonical_id is null;
drop index public.time_one_timer;
create unique index work_one_active_timer on public.time_logs(membership_id) where state='running';
alter table public.time_segments rename to task_work_sessions;
alter table public.task_work_sessions rename column membership_id to employee_id;
alter table public.task_work_sessions rename column start_at to started_at;
alter table public.task_work_sessions rename column end_at to ended_at;
alter table public.task_work_sessions add column task_id uuid references public.time_tasks(id);
alter table public.task_work_sessions add column paused_at timestamptz;
alter table public.task_work_sessions add column updated_at timestamptz not null default now();
alter table public.task_work_sessions add column duration_seconds bigint generated always as(case when ended_at is null then 0 else greatest(0,floor(extract(epoch from ended_at-started_at)))::bigint end) stored;
alter table public.task_work_sessions add column status text generated always as(case when ended_at is null then 'active' when paused_at is not null then 'paused' else 'completed' end) stored;
update public.task_work_sessions s set task_id=l.task_id from public.time_logs l where l.id=s.log_id;
create function private.work_session_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select task_id into new.task_id from public.time_logs where id=new.log_id and organization_id=new.organization_id and membership_id=new.employee_id;
 if new.task_id is null then raise exception 'Invalid work session identity';end if;
 new.updated_at:=now();return new;
end $$;
create trigger work_session_link before insert or update on public.task_work_sessions for each row execute function private.work_session_link();
create view public.time_segments with(security_invoker=true) as select id,organization_id,employee_id as membership_id,log_id,started_at as start_at,ended_at as end_at from public.task_work_sessions;
revoke all on public.time_segments from public,anon,authenticated;
grant select on public.time_segments to authenticated;grant all on public.time_segments to service_role;
create table public.work_project_config(organization_id uuid not null references public.organizations(id),client_id uuid primary key,jira_project text not null check(jira_project in ('OCT','SEP','SOURCE')),issue_type_id text not null,foreign key(client_id,organization_id) references public.clients(id,organization_id));
alter table public.work_project_config enable row level security;
revoke all on public.work_project_config from anon,authenticated;grant select on public.work_project_config to authenticated;grant all on public.work_project_config to service_role;
create policy work_project_read on public.work_project_config for select to authenticated using(private.time_manage(organization_id));
create function public.work_project_save(org_id uuid,client uuid,project text,issue_type text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 if not exists(select 1 from public.clients where id=client and organization_id=org_id) or issue_type !~ '^[0-9]+$' then raise exception 'Invalid project configuration';end if;
 insert into public.work_project_config values(org_id,client,project,issue_type) on conflict(client_id) do update set jira_project=excluded.jira_project,issue_type_id=excluded.issue_type_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value) values(org_id,auth.uid(),'work_project_configured','clients',client,jsonb_build_object('project',project,'issue_type',issue_type));
end $$;
create function public.work_task_save(org_id uuid,target uuid,title_value text,description_value text,client uuid,department uuid,priority_value text,due timestamptz,estimate integer,type_value text,task_id uuid default null,expected timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.time_manage(org_id) and (private.time_member(org_id) is null or target<>private.time_member(org_id)) then raise exception 'Own task or authorized manager required';end if;
 if not exists(select 1 from public.memberships where id=target and organization_id=org_id and active and kind='employee') then raise exception 'Active employee required';end if;
 if department is not null and not exists(select 1 from public.departments where id=department and organization_id=org_id) then raise exception 'Invalid department';end if;
 if length(trim(title_value)) not between 1 and 255 or length(description_value)>20000 or length(trim(type_value)) not between 1 and 100 then raise exception 'Invalid task';end if;
 if client is not null and not private.time_manage(org_id) and not exists(select 1 from public.time_clients(org_id) c where c.id=client) then raise exception 'Client scope denied';end if;
 if task_id is null then
 insert into public.time_tasks(organization_id,membership_id,title,description,client_id,department_id,priority,due_at,estimated_seconds,task_type) values(org_id,target,trim(title_value),description_value,client,department,priority_value,due,estimate,trim(type_value)) returning id into result;
 else
 perform 1 from public.time_tasks where id=task_id and organization_id=org_id and source='manual' and canonical_id is null and updated_at=expected and (membership_id=private.time_member(org_id) or private.time_manage(org_id)) for update;if not found then raise exception 'Task changed or is Jira-synced';end if;
 if exists(select 1 from public.time_logs where task_id=work_task_save.task_id and state='running') then raise exception 'Hold the task before editing';end if;
 update public.time_tasks set membership_id=target,title=trim(title_value),description=description_value,client_id=client,department_id=department,priority=priority_value,due_at=due,estimated_seconds=estimate,task_type=trim(type_value),assigned_at=case when membership_id is distinct from target then now() else assigned_at end,updated_at=now() where id=task_id;result:=task_id;
 end if;return result;
end $$;
create function private.work_event_core(org_id uuid,operation text,task uuid,switch_current boolean default false,expected_active uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
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
 if t.work_status in ('completed','cancelled') then raise exception 'Task is closed';end if;
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
 update public.time_tasks set work_status='in_progress',updated_at=now() where id=task;
 elsif operation in ('hold','end') then
 if target_log.id is null then raise exception 'No open work session';end if;
 if operation='hold' and target_log.state<>'running' then raise exception 'Task already on hold';end if;
 update public.task_work_sessions set ended_at=now(),paused_at=case when operation='hold' then now() else paused_at end where log_id=target_log.id and ended_at is null;
 update public.time_logs set state=case when operation='hold' then 'paused' else 'stopped' end,jira_sync_state=case when operation='end' and t.source='jira' then 'awaiting' else jira_sync_state end where id=target_log.id;
 update public.time_tasks set work_status=case when operation='hold' then 'on_hold' else 'completed' end,completed_at=case when operation='end' then now() else completed_at end,updated_at=now() where id=task;
 else raise exception 'Invalid work operation';end if;
 return target_log.id;
end $$;
create function public.work_event(org_id uuid,operation text,task uuid,switch_current boolean default false,expected_active uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.time_tasks where id=task and source='jira') and operation in ('start','resume') then raise exception 'Use verified Jira timer action';end if;
 return private.work_event_core(org_id,operation,task,switch_current,expected_active);
end $$;
create function public.work_jira_event(org_id uuid,actor_user uuid,operation text,task uuid,issue_assignee text,switch_current boolean default false,expected_active uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);actor:=private.time_member(org_id);
 if actor is null or not exists(select 1 from public.jira_account_links where organization_id=org_id and membership_id=actor and account_id=issue_assignee) or not exists(select 1 from public.time_tasks where id=task and organization_id=org_id and source='jira' and jira_assignee_account_id=issue_assignee) then raise exception 'Current Jira assignment required';end if;
 return private.work_event_core(org_id,operation,task,switch_current,expected_active);
end $$;
create function private.work_attendance_core(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); a public.time_attendance; shift_name text; d date:=(now() at time zone 'Asia/Kolkata')::date; task_id uuid;
begin
 if actor is null then raise exception 'Active employee required';end if;perform 1 from public.memberships where id=actor for update;
 select * into a from public.time_attendance where membership_id=actor and clock_out is null;
 if operation='clock_in' then
 if a.id is not null then raise exception 'Already clocked in';end if;if extract(isodow from d)=7 then raise exception 'Sunday is a non-working day';end if;
 select shift into shift_name from public.time_shifts where membership_id=actor;if shift_name is null then raise exception 'Owner must assign a shift';end if;
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
create or replace function public.time_event(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$begin perform private.work_attendance_core(org_id,operation,task);end $$;
create function public.work_import(org_id uuid,actor_user uuid,issues jsonb,system_event boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare x jsonb; assigned uuid; existing public.time_tasks; status_value text;
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 if jsonb_typeof(issues)<>'array' or jsonb_array_length(issues)>100 then raise exception 'Invalid batch';end if;
 for x in select * from jsonb_array_elements(issues) loop
 if not system_event and not private.can_access_jira(org_id,x->>'assignee_id') then raise exception 'Assigned Jira access required';end if;
 if x->>'project_key' not in ('OCT','SEP','SOURCE') or x->>'key' !~ '^(OCT|SEP|SOURCE)-[1-9][0-9]*$' then raise exception 'Invalid Jira identity';end if;
 select m.id into assigned from public.jira_account_links l join public.memberships m on m.id=l.membership_id and m.active where l.organization_id=org_id and l.account_id=x->>'assignee_id';
 select * into existing from public.time_tasks where organization_id=org_id and jira_key=x->>'key' and canonical_id is null for update;
 if existing.id is not null and (existing.jira_updated_at>(x->>'jira_updated')::timestamptz or existing.jira_updated_at=(x->>'jira_updated')::timestamptz and existing.membership_id is not distinct from assigned) then continue;end if;
 status_value:=case when x->>'status_category'='done' then 'completed' when existing.id is not null and existing.jira_status_id=x->>'status_id' then existing.work_status when exists(select 1 from public.work_workflow_mappings where organization_id=org_id and project=x->>'project_key' and hold_status=x->>'status_id' and enabled) then 'on_hold' when x->>'status_category'='indeterminate' then 'in_progress' else 'pending' end;
 insert into public.time_tasks(organization_id,membership_id,title,description,source,jira_key,jira_issue_id,jira_project,jira_status,jira_status_id,jira_assignee_account_id,jira_updated_at,work_status,completed_at,task_type,due_at)
 values(org_id,assigned,x->>'summary',coalesce(x->>'description_text',''),'jira',x->>'key',x->>'id',x->>'project_key',x->>'status_name',x->>'status_id',x->>'assignee_id',(x->>'jira_updated')::timestamptz,status_value,case when status_value='completed' then (x->>'jira_updated')::timestamptz else null end,coalesce(x->>'task_type','General'),case when x->>'due_date' ~ '^\d{4}-\d{2}-\d{2}$' then ((x->>'due_date')||'T23:59:59+05:30')::timestamptz else null end)
 on conflict(organization_id,jira_key) where jira_key is not null and canonical_id is null do update set membership_id=excluded.membership_id,title=excluded.title,description=excluded.description,jira_issue_id=excluded.jira_issue_id,jira_project=excluded.jira_project,jira_status=excluded.jira_status,jira_status_id=excluded.jira_status_id,jira_assignee_account_id=excluded.jira_assignee_account_id,jira_updated_at=excluded.jira_updated_at,work_status=excluded.work_status,completed_at=case when excluded.work_status='completed' then coalesce(public.time_tasks.completed_at,excluded.completed_at) else null end,task_type=case when public.time_tasks.task_type='General' then excluded.task_type else public.time_tasks.task_type end,due_at=excluded.due_at,assigned_at=case when public.time_tasks.membership_id is distinct from excluded.membership_id then now() else public.time_tasks.assigned_at end,updated_at=now();
 end loop;
end $$;
-- Employees retain their own recorded task history; only current assignees control timers.
drop policy time_read on public.time_tasks;
create policy work_task_read on public.time_tasks for select to authenticated using(membership_id=private.time_member(organization_id) or private.time_manage(organization_id) or exists(select 1 from public.time_logs l where l.task_id=public.time_tasks.id and l.membership_id=private.time_member(organization_id)));
create function public.work_departments(org_id uuid) returns table(id uuid,name text) language sql stable security definer set search_path='' as $$select d.id,d.name from public.departments d where d.organization_id=org_id and private.time_member(org_id) is not null order by d.name$$;
create function public.work_cancel(org_id uuid,task uuid,reason text,reopen boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.time_manage(org_id) or length(trim(reason))<5 then raise exception 'Authorized manager and reason required';end if;
 if exists(select 1 from public.time_logs where task_id=task and state='running') then raise exception 'Hold the task first';end if;
 update public.time_tasks set work_status=case when reopen then 'pending' else 'cancelled' end,completed_at=case when reopen then null else completed_at end,updated_at=now() where id=task and organization_id=org_id and source='manual';if not found then raise exception 'Manual task required';end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value) values(org_id,auth.uid(),case when reopen then 'task_reopened' else 'task_cancelled' end,'time_tasks',task,jsonb_build_object('reason',reason));
end $$;
-- Work-session corrections preserve both values and a required reason; review is atomic.
alter table public.time_corrections drop constraint time_corrections_kind_check;
alter table public.time_corrections add check(kind in ('attendance','manual_task','work_session'));
create function public.work_correction_request(org_id uuid,session_id uuid,start_value timestamptz,end_value timestamptz,reason_value text) returns void language plpgsql security definer set search_path='' as $$
declare s public.task_work_sessions;
begin
 select * into s from public.task_work_sessions where id=session_id and organization_id=org_id and (employee_id=private.time_member(org_id) or private.time_manage(org_id));
 if s.id is null or s.ended_at is null or end_value>now() or end_value<=start_value or end_value-start_value>interval '24 hours' then raise exception 'Closed session and valid times required';end if;
 insert into public.time_corrections(organization_id,membership_id,kind,target_id,expected_updated,start_at,end_at,reason) values(org_id,s.employee_id,'work_session',s.id,s.updated_at,start_value,end_value,trim(reason_value));
end $$;
alter function public.time_correction_review(uuid,uuid,boolean) set schema private;
alter function private.time_correction_review(uuid,uuid,boolean) rename to time_correction_review_legacy;
revoke all on function private.time_correction_review_legacy(uuid,uuid,boolean) from public,anon,authenticated;
create function public.time_correction_review(org_id uuid,request_id uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.time_corrections; s public.task_work_sessions;
begin
 if not private.time_manage(org_id) then raise exception 'Authorized approver required';end if;
 select * into r from public.time_corrections where id=request_id and organization_id=org_id for update;
 if r.kind is distinct from 'work_session' then perform private.time_correction_review_legacy(org_id,request_id,approve);return;end if;
 if r.state<>'pending' then raise exception 'Pending request required';end if;
 if r.membership_id=private.time_member(org_id) then raise exception 'Cannot approve own request';end if;
 perform 1 from public.memberships where id=r.membership_id and active for update;if not found then raise exception 'Employee inactive';end if;
 select * into s from public.task_work_sessions where id=r.target_id and organization_id=org_id for update;
 if s.id is null or s.employee_id<>r.membership_id or s.updated_at<>r.expected_updated then raise exception 'Session changed; request again';end if;
 if approve then
 if exists(select 1 from public.task_work_sessions where employee_id=s.employee_id and id<>s.id and started_at<r.end_at and coalesce(ended_at,now())>r.start_at) then raise exception 'Work session overlap';end if;
 update public.task_work_sessions set started_at=r.start_at,ended_at=r.end_at,paused_at=case when paused_at is null then null else r.end_at end where id=s.id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value) values(org_id,auth.uid(),'work_session_corrected','task_work_sessions',s.id,to_jsonb(s),jsonb_build_object('started_at',r.start_at,'ended_at',r.end_at,'reason',r.reason,'request_id',r.id));
 end if;
 update public.time_corrections set state=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid() where id=r.id;
end $$;
revoke all on function private.work_event_core(uuid,text,uuid,boolean,uuid),private.work_attendance_core(uuid,text,uuid),private.work_session_link() from public,anon,authenticated;
revoke all on function public.work_jira_event(uuid,uuid,text,uuid,text,boolean,uuid),public.work_import(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.work_jira_event(uuid,uuid,text,uuid,text,boolean,uuid),public.work_import(uuid,uuid,jsonb,boolean) to service_role;
revoke all on function public.work_event(uuid,text,uuid,boolean,uuid),public.work_task_save(uuid,uuid,text,text,uuid,uuid,text,timestamptz,integer,text,uuid,timestamptz),public.work_project_save(uuid,uuid,text,text),public.work_departments(uuid),public.work_cancel(uuid,uuid,text,boolean),public.work_correction_request(uuid,uuid,timestamptz,timestamptz,text),public.time_correction_review(uuid,uuid,boolean) from public,anon;
grant execute on function public.work_event(uuid,text,uuid,boolean,uuid),public.work_task_save(uuid,uuid,text,text,uuid,uuid,text,timestamptz,integer,text,uuid,timestamptz),public.work_project_save(uuid,uuid,text,text),public.work_departments(uuid),public.work_cancel(uuid,uuid,text,boolean),public.work_correction_request(uuid,uuid,timestamptz,timestamptz,text),public.time_correction_review(uuid,uuid,boolean) to authenticated;
create table public.work_workflow_mappings(organization_id uuid not null references public.organizations(id),project text not null check(project in ('OCT','SEP','SOURCE')),start_status text not null,hold_status text,end_status text not null,enabled boolean not null default false,confirmed_by uuid references auth.users(id),confirmed_at timestamptz,primary key(organization_id,project));
alter table public.work_workflow_mappings enable row level security;
revoke all on public.work_workflow_mappings from anon,authenticated;grant select on public.work_workflow_mappings to authenticated;grant all on public.work_workflow_mappings to service_role;
create policy workflow_read on public.work_workflow_mappings for select to authenticated using(private.time_member(organization_id) is not null);
create function public.work_mapping_save(org_id uuid,project_key text,start_value text,hold_value text,end_value text,enable boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 if length(start_value) not between 1 and 100 or length(end_value) not between 1 and 100 then raise exception 'Choose actual Jira statuses';end if;
 insert into public.work_workflow_mappings values(org_id,project_key,start_value,nullif(hold_value,''),end_value,enable,auth.uid(),now()) on conflict(organization_id,project) do update set start_status=excluded.start_status,hold_status=excluded.hold_status,end_status=excluded.end_status,enabled=excluded.enabled,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,new_value) values(org_id,auth.uid(),'jira_workflow_mapping_confirmed','work_workflow_mappings',jsonb_build_object('project',project_key,'start',start_value,'hold',hold_value,'end',end_value,'enabled',enable));
end $$;
create function public.work_jira_creation_claim(org_id uuid,actor_user uuid,task uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);if not private.is_owner(org_id) then raise exception 'Owner required for Jira creation';end if;
 update public.time_tasks set jira_creation_state='creating',updated_at=now() where id=task and organization_id=org_id and source='manual' and jira_creation_state is null;
 return found;
end $$;
create function public.work_jira_attach(org_id uuid,actor_user uuid,task uuid,issue jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t public.time_tasks; member uuid;
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 select * into t from public.time_tasks where id=task and organization_id=org_id and source='manual' for update;if t.id is null then raise exception 'Manual task required';end if;
 select membership_id into member from public.jira_account_links where organization_id=org_id and account_id=issue->>'assignee_id';if member is distinct from t.membership_id then raise exception 'Issue assignee mismatch';end if;
 if issue->>'project_key' not in ('OCT','SEP','SOURCE') or issue->>'key' !~ '^(OCT|SEP|SOURCE)-[1-9][0-9]*$' then raise exception 'Invalid Jira identity';end if;
 update public.time_tasks set source='jira',jira_key=issue->>'key',jira_issue_id=issue->>'id',jira_project=issue->>'project_key',jira_status=issue->>'status_name',jira_status_id=issue->>'status_id',jira_assignee_account_id=issue->>'assignee_id',jira_updated_at=(issue->>'jira_updated')::timestamptz,jira_creation_state='created',updated_at=now() where id=t.id;
end $$;
revoke all on function public.work_mapping_save(uuid,text,text,text,text,boolean) from public,anon;grant execute on function public.work_mapping_save(uuid,text,text,text,text,boolean) to authenticated;
revoke all on function public.work_jira_creation_claim(uuid,uuid,uuid),public.work_jira_attach(uuid,uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function public.work_jira_creation_claim(uuid,uuid,uuid),public.work_jira_attach(uuid,uuid,uuid,jsonb) to service_role;
create or replace function private.time_event_core(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$begin perform private.work_attendance_core(org_id,operation,task);end $$;
create function public.work_creation_result(org_id uuid,actor_user uuid,task uuid,outcome text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 if outcome not in ('failed','uncertain','owner_review') then raise exception 'Invalid creation state';end if;
 update public.time_tasks set jira_creation_state=outcome,updated_at=now() where id=task and organization_id=org_id and source='manual' and (membership_id=private.time_member(org_id) or private.time_manage(org_id));if not found then raise exception 'Task access denied';end if;
end $$;
revoke all on function public.work_creation_result(uuid,uuid,uuid,text) from public,anon,authenticated;grant execute on function public.work_creation_result(uuid,uuid,uuid,text) to service_role;
alter table public.time_tasks add column jira_transition_lease uuid;
alter table public.time_tasks add column jira_transition_at timestamptz;
alter table public.time_tasks add column jira_sync_warning text;
create function public.work_transition_claim(org_id uuid,actor_user uuid,task uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 update public.time_tasks set jira_transition_lease=token,jira_transition_at=now() where id=task and organization_id=org_id and source='jira' and private.can_access_jira(org_id,jira_assignee_account_id) and (jira_transition_lease is null or jira_transition_at<now()-interval '60 seconds');
 if not found then raise exception 'Status update in progress or access denied';end if;return token;
end $$;
create function public.work_transition_result(org_id uuid,actor_user uuid,task uuid,token uuid,warning text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 update public.time_tasks set jira_transition_lease=null,jira_sync_warning=warning where id=task and organization_id=org_id and jira_transition_lease=token and private.can_access_jira(org_id,jira_assignee_account_id);if not found then raise exception 'Transition attempt changed';end if;
end $$;
revoke all on function public.work_transition_claim(uuid,uuid,uuid),public.work_transition_result(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;grant execute on function public.work_transition_claim(uuid,uuid,uuid),public.work_transition_result(uuid,uuid,uuid,uuid,text) to service_role;
-- Keep the legacy completion endpoint consistent with the unified task workflow.
create or replace function public.time_task_complete(org_id uuid,task uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.time_tasks where id=task and organization_id=org_id and source='manual' and (membership_id=private.time_member(org_id) or private.time_manage(org_id))) then raise exception 'Manual task access required';end if;
 if exists(select 1 from public.time_logs where task_id=task and state<>'stopped') then raise exception 'Stop the task timer first';end if;
 update public.time_tasks set completed_at=now(),work_status='completed',updated_at=now() where id=task and organization_id=org_id;
end $$;
update public.time_tasks t set work_status=case when exists(select 1 from public.time_logs l where l.task_id=t.id and l.state='running') then 'in_progress' else 'on_hold' end where completed_at is null and exists(select 1 from public.time_logs l where l.task_id=t.id and l.state<>'stopped');
commit;
