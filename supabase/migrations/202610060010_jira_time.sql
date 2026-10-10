begin;
alter table public.time_tasks add column jira_key text check(jira_key ~ '^(OCT|SEP|SOURCE)-[1-9][0-9]*$');
create unique index time_jira_task on public.time_tasks(organization_id,membership_id,jira_key) where jira_key is not null;
alter table public.time_logs add column jira_sync_state text check(jira_sync_state in ('awaiting','sending','synced','conflict','failed'));
alter table public.time_logs add column jira_target_status text;
alter table public.time_logs add column jira_status_name text;
alter table public.time_logs add column jira_attempt uuid;
alter table public.time_logs add column jira_attempt_at timestamptz;
-- Jira start/resume must pass through the server's current Jira assignee check.
alter function public.time_event(uuid,text,uuid) set schema private;
alter function private.time_event(uuid,text,uuid) rename to time_event_core;
revoke all on function private.time_event_core(uuid,text,uuid) from public,anon,authenticated;
create function public.time_event(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id);
begin
 if operation='timer_start' and exists(select 1 from public.time_tasks where id=task and jira_key is not null)
 or operation='timer_resume' and exists(select 1 from public.time_logs l join public.time_tasks t on t.id=l.task_id where l.membership_id=actor and l.state<>'stopped' and t.jira_key is not null)
 then raise exception 'Use verified Jira timer action';end if;
 perform private.time_event_core(org_id,operation,task);
end $$;
revoke all on function public.time_event(uuid,text,uuid) from public,anon;
grant execute on function public.time_event(uuid,text,uuid) to authenticated;
create function public.time_jira_begin(org_id uuid,actor_user uuid,issue_key text,issue_assignee text,title_value text,operation text) returns uuid language plpgsql security definer set search_path='' as $$
declare member uuid; tracked_task uuid;
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 member:=private.time_member(org_id);
 if member is null or not exists(select 1 from public.jira_account_links where organization_id=org_id and membership_id=member and account_id=issue_assignee) then raise exception 'Current Jira assignment required';end if;
 if issue_key !~ '^(OCT|SEP|SOURCE)-[1-9][0-9]*$' or operation not in ('timer_start','timer_resume') then raise exception 'Invalid Jira timer action';end if;
 perform 1 from public.memberships where id=member for update;
 insert into public.time_tasks(organization_id,membership_id,title,jira_key) values(org_id,member,title_value,issue_key)
 on conflict(organization_id,membership_id,jira_key) where jira_key is not null do update set title=excluded.title
 returning id into tracked_task;
 if operation='timer_resume' and not exists(select 1 from public.time_logs where membership_id=member and task_id=tracked_task and state='paused') then raise exception 'No paused timer';end if;
 perform private.time_event_core(org_id,operation,tracked_task);
 return tracked_task;
end $$;
create function public.time_jira_end(org_id uuid,log_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare member uuid:=private.time_member(org_id); l public.time_logs;
begin
 if member is null then raise exception 'Active employee required';end if;
 perform 1 from public.memberships where id=member for update;
 select * into l from public.time_logs where id=log_id and organization_id=org_id and membership_id=member for update;
 if l.id is null or not exists(select 1 from public.time_tasks where id=l.task_id and jira_key is not null) then raise exception 'Own Jira timer required';end if;
 if l.state<>'stopped' then perform private.time_event_core(org_id,'timer_stop',null);end if;
 update public.time_logs set jira_sync_state=coalesce(jira_sync_state,'awaiting') where id=l.id;
end $$;
-- A short lease stops double-clicks and concurrent tabs sending duplicate transitions.
create function public.time_jira_status_claim(org_id uuid,actor_user uuid,log_id uuid,target_status text,status_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare member uuid; l public.time_logs; token uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);member:=private.time_member(org_id);
 select * into l from public.time_logs where id=log_id and organization_id=org_id and membership_id=member for update;
 if l.id is null or l.state<>'stopped' or not exists(select 1 from public.time_tasks where id=l.task_id and jira_key is not null) then raise exception 'Ended own Jira timer required';end if;
 if l.jira_sync_state='sending' and l.jira_attempt_at>now()-interval '60 seconds' then raise exception 'Status update in progress';end if;
 if length(target_status) not between 1 and 100 or length(status_name) not between 1 and 255 then raise exception 'Invalid status';end if;
 update public.time_logs set jira_sync_state='sending',jira_target_status=target_status,jira_status_name=status_name,jira_attempt=token,jira_attempt_at=now() where id=l.id;
 return token;
end $$;
create function public.time_jira_status_result(org_id uuid,actor_user uuid,log_id uuid,attempt uuid,outcome text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',actor_user::text,true);
 if outcome not in ('synced','conflict','failed') then raise exception 'Invalid outcome';end if;
 update public.time_logs set jira_sync_state=outcome where id=log_id and organization_id=org_id and membership_id=private.time_member(org_id) and jira_attempt=attempt;
 if not found then raise exception 'Status attempt changed';end if;
end $$;
revoke all on function public.time_jira_begin(uuid,uuid,text,text,text,text),public.time_jira_status_claim(uuid,uuid,uuid,text,text),public.time_jira_status_result(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.time_jira_begin(uuid,uuid,text,text,text,text),public.time_jira_status_claim(uuid,uuid,uuid,text,text),public.time_jira_status_result(uuid,uuid,uuid,uuid,text) to service_role;
revoke all on function public.time_jira_end(uuid,uuid) from public,anon;
grant execute on function public.time_jira_end(uuid,uuid) to authenticated;
commit;
