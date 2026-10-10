begin;
create table public.announcements(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),title text not null check(length(trim(title)) between 1 and 120),message text not null check(length(trim(message)) between 1 and 3000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.announcement_reads(announcement_id uuid not null references public.announcements(id),membership_id uuid not null references public.memberships(id),primary key(announcement_id,membership_id));
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
revoke all on public.announcements,public.announcement_reads from anon,authenticated;
grant select on public.announcements,public.announcement_reads to authenticated;
grant all on public.announcements,public.announcement_reads to service_role;
create policy announcement_read on public.announcements for select to authenticated using(private.time_member(organization_id) is not null);
create policy own_announcement_reads on public.announcement_reads for select to authenticated using(exists(select 1 from public.memberships m where m.id=membership_id and m.user_id=auth.uid() and m.active and m.kind='employee'));
create trigger audit_announcements after insert on public.announcements for each row execute function private.audit_change();
create function public.announcement_publish(org_id uuid,title_value text,message_value text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required';end if;
 insert into public.announcements(organization_id,title,message,created_by) values(org_id,trim(title_value),trim(message_value),auth.uid());
end $$;
create function public.announcement_read(org_id uuid,item uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id);
begin
 if actor is null or not exists(select 1 from public.announcements where id=item and organization_id=org_id) then raise exception 'Announcement access denied';end if;
 insert into public.announcement_reads values(item,actor) on conflict do nothing;
end $$;
revoke all on function public.announcement_publish(uuid,text,text),public.announcement_read(uuid,uuid) from public,anon;
grant execute on function public.announcement_publish(uuid,text,text),public.announcement_read(uuid,uuid) to authenticated;

alter table public.time_breaks add column excluded_from_attendance boolean not null default false;
alter table public.time_corrections add column consumed_at timestamptz;
alter table public.time_corrections drop constraint time_corrections_kind_check;
alter table public.time_corrections add constraint time_corrections_kind_check check(kind in ('attendance','manual_task','work_session','continue_work'));
create unique index one_continue_request on public.time_corrections(target_id) where kind='continue_work' and state in ('pending','approved') and consumed_at is null;
create function public.time_continue_request(org_id uuid,work_day date) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id);a public.time_attendance;
begin
 if actor is null then raise exception 'Active employee required';end if;
 perform 1 from public.memberships where id=actor for update;
 if work_day<>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Continue work requires today';end if;
 select * into a from public.time_attendance where membership_id=actor and organization_id=org_id and work_date=work_day and clock_out is not null;
 if a.id is null then raise exception 'Closed attendance required';end if;
 insert into public.time_corrections(organization_id,membership_id,kind,target_id,expected_updated,start_at,end_at,reason) values(org_id,actor,'continue_work',a.id,a.updated_at,a.clock_in,greatest(a.clock_out,a.clock_in+interval '1 microsecond'),'Continue work after wrong clock-out');
end $$;
alter function public.time_correction_review(uuid,uuid,boolean) rename to time_correction_review_before_continue;
revoke all on function public.time_correction_review_before_continue(uuid,uuid,boolean) from public,anon,authenticated;
create function public.time_correction_review(org_id uuid,request_id uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.time_corrections;a public.time_attendance;
begin
 select * into r from public.time_corrections where id=request_id and organization_id=org_id;
 if r.kind is distinct from 'continue_work' then perform public.time_correction_review_before_continue(org_id,request_id,approve);return;end if;
 if not private.time_manage(org_id) then raise exception 'Authorized approver required';end if;
 perform 1 from public.memberships where id=r.membership_id and active for update;if not found then raise exception 'Employee inactive';end if;
 select * into r from public.time_corrections where id=request_id and organization_id=org_id for update;
 if r.state<>'pending' then raise exception 'Pending request required';end if;
 if r.membership_id=private.time_member(org_id) then raise exception 'Cannot approve own request';end if;
 select * into a from public.time_attendance where id=r.target_id and organization_id=org_id;
 if a.updated_at<>r.expected_updated or a.clock_out is null then raise exception 'Attendance changed; request again';end if;
 if approve and a.work_date<>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Continue work requires today';end if;
 update public.time_corrections set state=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid() where id=r.id;
end $$;
alter function private.work_attendance_core(uuid,text,uuid) rename to work_attendance_before_continue;
create function private.work_attendance_core(org_id uuid,operation text,task uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id);a public.time_attendance;r public.time_corrections;
begin
 if actor is null then raise exception 'Active employee required';end if;
 perform 1 from public.memberships where id=actor for update;
 if operation='clock_in' then
  select * into a from public.time_attendance where membership_id=actor and organization_id=org_id and work_date=(now() at time zone 'Asia/Kolkata')::date for update;
  if a.id is not null and a.clock_out is not null then
   select * into r from public.time_corrections where target_id=a.id and kind='continue_work' and state='approved' and consumed_at is null and expected_updated=a.updated_at for update;
   if r.id is null then raise exception 'Approved continue request required';end if;
   insert into public.time_breaks(organization_id,attendance_id,membership_id,start_at,end_at,excluded_from_attendance) values(org_id,a.id,actor,a.clock_out,now(),true);
   update public.time_attendance set clock_out=null,updated_at=now() where id=a.id;
   update public.time_corrections set consumed_at=now() where id=r.id;return;
  end if;
 end if;
 perform private.work_attendance_before_continue(org_id,operation,task);
end $$;
revoke all on function private.work_attendance_core(uuid,text,uuid),private.work_attendance_before_continue(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.time_continue_request(uuid,date),public.time_correction_review(uuid,uuid,boolean) from public,anon;
grant execute on function public.time_continue_request(uuid,date),public.time_correction_review(uuid,uuid,boolean) to authenticated;
commit;
