begin;
create table public.time_managers(organization_id uuid not null references public.organizations(id),membership_id uuid primary key,foreign key(membership_id,organization_id) references public.memberships(id,organization_id));
create table public.time_shifts(organization_id uuid not null references public.organizations(id),membership_id uuid primary key,shift text not null check(shift in ('early','late')),foreign key(membership_id,organization_id) references public.memberships(id,organization_id));
create table public.time_attendance(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),membership_id uuid not null,work_date date not null,shift text not null check(shift in ('early','late')),clock_in timestamptz not null default now(),clock_out timestamptz,break_override_seconds integer check(break_override_seconds>=0),updated_at timestamptz not null default now(),foreign key(membership_id,organization_id) references public.memberships(id,organization_id),unique(membership_id,work_date),check(clock_out is null or clock_out>=clock_in));
create unique index time_one_open_attendance on public.time_attendance(membership_id) where clock_out is null;
create table public.time_breaks(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),attendance_id uuid not null references public.time_attendance(id),membership_id uuid not null,start_at timestamptz not null default now(),end_at timestamptz,foreign key(membership_id,organization_id) references public.memberships(id,organization_id),check(end_at is null or end_at>=start_at));
create unique index time_one_open_break on public.time_breaks(membership_id) where end_at is null;
create table public.time_tasks(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),membership_id uuid not null,title text not null check(length(title) between 1 and 255),client_id uuid,due_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now(),foreign key(membership_id,organization_id) references public.memberships(id,organization_id),foreign key(client_id,organization_id) references public.clients(id,organization_id));
create table public.time_logs(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),membership_id uuid not null,task_id uuid not null references public.time_tasks(id),state text not null check(state in ('running','paused','stopped')),created_at timestamptz not null default now(),foreign key(membership_id,organization_id) references public.memberships(id,organization_id));
create unique index time_one_timer on public.time_logs(membership_id) where state<>'stopped';
create table public.time_segments(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),membership_id uuid not null,log_id uuid not null references public.time_logs(id),start_at timestamptz not null default now(),end_at timestamptz,foreign key(membership_id,organization_id) references public.memberships(id,organization_id),check(end_at is null or end_at>=start_at));
create unique index time_one_running_segment on public.time_segments(membership_id) where end_at is null;
create table public.time_corrections(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),membership_id uuid not null,kind text not null check(kind in ('attendance','manual_task')),target_id uuid not null,expected_updated timestamptz,start_at timestamptz not null,end_at timestamptz not null,break_seconds integer not null default 0,reason text not null check(length(reason) between 5 and 1000),state text not null default 'pending' check(state in ('pending','approved','rejected')),reviewed_by uuid references auth.users(id),created_at timestamptz not null default now(),foreign key(membership_id,organization_id) references public.memberships(id,organization_id),check(end_at>start_at),check(break_seconds>=0 and break_seconds<=extract(epoch from end_at-start_at)));
create function private.time_member(org uuid) returns uuid language sql stable security definer set search_path='' as $$select id from public.memberships where organization_id=org and user_id=auth.uid() and active and kind='employee' and private.assurance_ok(org)$$;
create function private.time_manage(org uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_owner(org) or exists(select 1 from public.time_managers where organization_id=org and membership_id=private.time_member(org))$$;
do $$ declare t text; begin
 foreach t in array array['time_managers','time_shifts','time_attendance','time_breaks','time_tasks','time_logs','time_segments','time_corrections'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy time_read on public.%I for select to authenticated using (membership_id=private.time_member(organization_id) or private.time_manage(organization_id))',t);
 if t not in ('time_managers','time_shifts') then execute format('create trigger audit_%I after insert or update on public.%I for each row execute function private.audit_change()',t,t);end if;
 end loop;
end $$;
create function public.time_owner_setup(org_id uuid,target uuid,shift_name text,manager_access boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 if not exists(select 1 from public.memberships where id=target and organization_id=org_id and active and kind='employee') then raise exception 'Active employee required';end if;
 if shift_name not in ('early','late') then raise exception 'Invalid shift';end if;
 insert into public.time_shifts values(org_id,target,shift_name) on conflict(membership_id) do update set shift=excluded.shift;
 if manager_access and target=private.time_member(org_id) then raise exception 'Cannot increase own permissions';end if;
 if manager_access then insert into public.time_managers values(org_id,target) on conflict do nothing;else delete from public.time_managers where membership_id=target and organization_id=org_id;end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value) values(org_id,auth.uid(),'time_access_configured','memberships',target,jsonb_build_object('shift',shift_name,'manager',manager_access));
end $$;
create function public.time_event(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); a public.time_attendance; l public.time_logs; shift_name text; day date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if actor is null then raise exception 'Active team member required';end if;
 perform 1 from public.memberships where id=actor for update;
 select * into a from public.time_attendance where membership_id=actor and clock_out is null;
 select * into l from public.time_logs where membership_id=actor and state<>'stopped';
 if operation='clock_in' then
  if a.id is not null then raise exception 'Already clocked in';end if;
  if extract(isodow from day)=7 then raise exception 'Sunday is a non-working day';end if;
  select shift into shift_name from public.time_shifts where membership_id=actor and organization_id=org_id;if shift_name is null then raise exception 'Owner must assign a shift';end if;
  insert into public.time_attendance(organization_id,membership_id,work_date,shift) values(org_id,actor,day,shift_name);return;
 end if;
 if a.id is null then raise exception 'Clock in first';end if;
 if operation='break_start' then
  if exists(select 1 from public.time_breaks where membership_id=actor and end_at is null) then raise exception 'Break already started';end if;
  update public.time_segments set end_at=now() where membership_id=actor and end_at is null;
  update public.time_logs set state='paused' where membership_id=actor and state='running';
  insert into public.time_breaks(organization_id,membership_id,attendance_id) values(org_id,actor,a.id);
 elsif operation='break_end' then
  update public.time_breaks set end_at=now() where membership_id=actor and end_at is null;if not found then raise exception 'No active break';end if;
 elsif operation='clock_out' then
  update public.time_breaks set end_at=now() where membership_id=actor and end_at is null;
  update public.time_segments set end_at=now() where membership_id=actor and end_at is null;
  update public.time_logs set state='stopped' where membership_id=actor and state<>'stopped';
  update public.time_attendance set clock_out=now(),updated_at=now() where id=a.id;
 elsif operation in ('timer_start','timer_resume') then
  if exists(select 1 from public.time_breaks where membership_id=actor and end_at is null) then raise exception 'End break before starting work';end if;
  if operation='timer_start' then
   if l.id is not null then raise exception 'Stop current timer first';end if;
   if not exists(select 1 from public.time_tasks where id=task and organization_id=org_id and membership_id=actor and completed_at is null) then raise exception 'Assigned active task required';end if;
   insert into public.time_logs(organization_id,membership_id,task_id,state) values(org_id,actor,task,'running') returning * into l;
  else
   if l.state is distinct from 'paused' then raise exception 'No paused timer';end if;
   update public.time_logs set state='running' where id=l.id;
  end if;
  insert into public.time_segments(organization_id,membership_id,log_id) values(org_id,actor,l.id);
 elsif operation in ('timer_pause','timer_stop') then
  if l.id is null then raise exception 'No current timer';end if;
  if operation='timer_pause' and l.state<>'running' then raise exception 'Timer already paused';end if;
  update public.time_segments set end_at=now() where log_id=l.id and end_at is null;
  update public.time_logs set state=case when operation='timer_pause' then 'paused' else 'stopped' end where id=l.id;
 else raise exception 'Invalid time operation';end if;
end $$;
create function public.time_task_save(org_id uuid,target uuid,title_value text,client uuid,due timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.time_manage(org_id) then raise exception 'Owner or authorized manager required';end if;
 if not exists(select 1 from public.memberships where id=target and organization_id=org_id and active and kind='employee') then raise exception 'Active employee required';end if;
 insert into public.time_tasks(organization_id,membership_id,title,client_id,due_at) values(org_id,target,trim(title_value),client,due);
end $$;
create function public.time_task_complete(org_id uuid,task uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.time_tasks where id=task and organization_id=org_id and (membership_id=private.time_member(org_id) or private.time_manage(org_id))) then raise exception 'Task access denied';end if;
 if exists(select 1 from public.time_logs where task_id=task and state<>'stopped') then raise exception 'Stop the task timer first';end if;
 update public.time_tasks set completed_at=now() where id=task and organization_id=org_id;
end $$;
create function public.time_correction_request(org_id uuid,correction_kind text,target uuid,start_value timestamptz,end_value timestamptz,break_value integer,reason_value text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id); stamp timestamptz;
begin
 if actor is null then raise exception 'Active employee required';end if;
 if end_value>now() or end_value-start_value>interval '24 hours' then raise exception 'Invalid time interval';end if;
 if correction_kind='attendance' then
  select updated_at into stamp from public.time_attendance where id=target and membership_id=actor and organization_id=org_id;
  if not found then raise exception 'Attendance access denied';end if;
 elsif correction_kind='manual_task' then
  if break_value<>0 or not exists(select 1 from public.time_tasks where id=target and membership_id=actor and organization_id=org_id) then raise exception 'Task access denied';end if;
 else raise exception 'Invalid correction kind';end if;
 insert into public.time_corrections(organization_id,membership_id,kind,target_id,expected_updated,start_at,end_at,break_seconds,reason) values(org_id,actor,correction_kind,target,stamp,start_value,end_value,break_value,trim(reason_value));
end $$;
create function public.time_correction_review(org_id uuid,request_id uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.time_corrections; a public.time_attendance; l uuid;
begin
 if not private.time_manage(org_id) then raise exception 'Authorized approver required';end if;
 select * into r from public.time_corrections where id=request_id and organization_id=org_id for update;
 if r.id is null or r.state<>'pending' then raise exception 'Pending request required';end if;
 if r.membership_id=private.time_member(org_id) then raise exception 'Cannot approve own request';end if;
 perform 1 from public.memberships where id=r.membership_id and active for update;if not found then raise exception 'Employee inactive';end if;
 if approve then
  if r.kind='attendance' then
   select * into a from public.time_attendance where id=r.target_id and organization_id=org_id and membership_id=r.membership_id for update;
   if a.id is null or a.updated_at<>r.expected_updated then raise exception 'Attendance changed; request again';end if;
   if exists(select 1 from public.time_breaks where attendance_id=a.id and end_at is null) or exists(select 1 from public.time_logs where membership_id=r.membership_id and state<>'stopped') then raise exception 'Stop timer and end break before approval';end if;
   if (r.start_at at time zone 'Asia/Kolkata')::date<>a.work_date then raise exception 'Correction must stay on its work date';end if;
   if exists(select 1 from public.time_attendance where membership_id=r.membership_id and id<>a.id and clock_in<r.end_at and coalesce(clock_out,now())>r.start_at) then raise exception 'Attendance overlap';end if;
   update public.time_attendance set clock_in=r.start_at,clock_out=r.end_at,break_override_seconds=r.break_seconds,updated_at=now() where id=a.id;
  else
   if exists(select 1 from public.time_segments where membership_id=r.membership_id and start_at<r.end_at and coalesce(end_at,now())>r.start_at) then raise exception 'Time overlaps an existing task segment';end if;
   insert into public.time_logs(organization_id,membership_id,task_id,state) values(org_id,r.membership_id,r.target_id,'stopped') returning id into l;
   insert into public.time_segments(organization_id,membership_id,log_id,start_at,end_at) values(org_id,r.membership_id,l,r.start_at,r.end_at);
  end if;
 end if;
 update public.time_corrections set state=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid() where id=r.id;
end $$;
revoke all on function public.time_owner_setup(uuid,uuid,text,boolean),public.time_event(uuid,text,uuid),public.time_task_save(uuid,uuid,text,uuid,timestamptz),public.time_task_complete(uuid,uuid),public.time_correction_request(uuid,text,uuid,timestamptz,timestamptz,integer,text),public.time_correction_review(uuid,uuid,boolean) from public,anon;
grant execute on function public.time_owner_setup(uuid,uuid,text,boolean),public.time_event(uuid,text,uuid),public.time_task_save(uuid,uuid,text,uuid,timestamptz),public.time_task_complete(uuid,uuid),public.time_correction_request(uuid,text,uuid,timestamptz,timestamptz,integer,text),public.time_correction_review(uuid,uuid,boolean) to authenticated;
create function public.time_people(org_id uuid) returns table(id uuid,display_name text,email text) language sql stable security definer set search_path='' as $$select m.id,p.display_name,m.email from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=org_id and m.active and m.kind='employee' and (private.time_manage(org_id) or m.id=private.time_member(org_id)) order by p.display_name$$;
create function public.time_clients(org_id uuid) returns table(id uuid,display_name text) language sql stable security definer set search_path='' as $$select c.id,c.display_name from public.clients c where c.organization_id=org_id and (private.time_manage(org_id) or exists(select 1 from public.time_tasks t where t.client_id=c.id and t.membership_id=private.time_member(org_id))) order by c.display_name$$;
revoke all on function public.time_people(uuid),public.time_clients(uuid) from public,anon;
grant execute on function public.time_people(uuid),public.time_clients(uuid) to authenticated;
commit;
