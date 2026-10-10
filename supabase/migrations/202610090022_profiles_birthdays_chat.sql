begin;
alter table public.employees add column phone text not null default '' check(length(phone)<=30),add column employee_code text check(length(employee_code) between 1 and 40),add column birthday date,add column photo_path text;
create unique index employee_code_unique on public.employees(organization_id,lower(employee_code)) where employee_code is not null;
create function private.employee_profile_fields(org uuid,employee uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if nullif(payload->>'birthday','')::date>current_date then raise exception 'Birthday cannot be in the future';end if;
 if nullif(payload->>'photo_path','') is not null and (payload->>'photo_path' not like org::text||'/%' or payload->>'photo_path' like '%..%') then raise exception 'Invalid photo path';end if;
 update public.employees set phone=case when payload?'phone' then coalesce(trim(payload->>'phone'),'') else phone end,employee_code=case when payload?'employee_code' then nullif(trim(payload->>'employee_code'),'') else employee_code end,birthday=case when payload?'birthday' then nullif(payload->>'birthday','')::date else birthday end,photo_path=case when payload?'photo_path' then nullif(payload->>'photo_path','') else photo_path end where id=employee and organization_id=org;
end $$;
revoke all on function private.employee_profile_fields(uuid,uuid,jsonb) from public,anon,authenticated;
alter function public.create_employee(uuid,jsonb) rename to create_employee_before_profile;
revoke all on function public.create_employee_before_profile(uuid,jsonb) from public,anon,authenticated;
create function public.create_employee(org_id uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare employee uuid;begin employee:=public.create_employee_before_profile(org_id,payload);perform private.employee_profile_fields(org_id,employee,payload);return employee;end $$;
alter function public.complete_employee_login(uuid,uuid,uuid,jsonb) rename to complete_employee_login_before_profile;
revoke all on function public.complete_employee_login_before_profile(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.complete_employee_login(org_id uuid,owner_actor uuid,new_user_id uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare employee uuid;previous_actor text:=current_setting('request.jwt.claim.sub',true);begin employee:=public.complete_employee_login_before_profile(org_id,owner_actor,new_user_id,payload);perform set_config('request.jwt.claim.sub',owner_actor::text,true);perform private.employee_profile_fields(org_id,employee,payload);perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);return employee;end $$;
alter function public.update_directory_record(uuid,text,uuid,jsonb) rename to update_directory_before_profile;
revoke all on function public.update_directory_before_profile(uuid,text,uuid,jsonb) from public,anon,authenticated;
create function public.update_directory_record(org_id uuid,record_kind text,record_id uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin perform public.update_directory_before_profile(org_id,record_kind,record_id,payload);if record_kind='employee' then perform private.employee_profile_fields(org_id,record_id,payload);end if;end $$;
revoke all on function public.create_employee(uuid,jsonb),public.complete_employee_login(uuid,uuid,uuid,jsonb),public.update_directory_record(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_employee(uuid,jsonb),public.update_directory_record(uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.complete_employee_login(uuid,uuid,uuid,jsonb) to service_role;
-- Only names and photos are shared for birthday celebrations; never full birth dates.
create function public.today_birthdays(org_id uuid) returns table(id uuid,display_name text,photo_path text) language sql stable security definer set search_path='' as $$
 select e.id,e.display_name,e.photo_path from public.employees e join public.memberships m on m.id=e.membership_id and m.active and m.kind='employee'
 where e.organization_id=org_id and private.time_member(org_id) is not null and exists(select 1 from public.time_attendance a where a.membership_id=private.time_member(org_id) and a.work_date=(now() at time zone 'Asia/Kolkata')::date and a.clock_out is null)
 and to_char(e.birthday,'MM-DD')=to_char(now() at time zone 'Asia/Kolkata','MM-DD') order by e.display_name
$$;
revoke all on function public.today_birthdays(uuid) from public,anon;
grant execute on function public.today_birthdays(uuid) to authenticated;

create table public.chat_conversations(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),kind text not null check(kind in ('direct','group')),name text not null default '' check(length(name)<=100),created_by uuid not null references public.memberships(id),direct_key text,created_at timestamptz not null default now(),unique(organization_id,direct_key));
create table public.chat_members(conversation_id uuid not null references public.chat_conversations(id),membership_id uuid not null references public.memberships(id),last_read_at timestamptz not null default '-infinity',primary key(conversation_id,membership_id));
create table public.chat_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.chat_conversations(id),author_id uuid not null references public.memberships(id),body text not null check(length(trim(body)) between 1 and 4000),created_at timestamptz not null default now(),client_id uuid not null,unique(author_id,client_id));
create index chat_message_order on public.chat_messages(conversation_id,created_at,id);
create function private.chat_access(chat uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.chat_conversations c join public.chat_members p on p.conversation_id=c.id where c.id=chat and p.membership_id=private.time_member(c.organization_id))$$;
revoke all on function private.chat_access(uuid) from public,anon;
grant execute on function private.chat_access(uuid) to authenticated;
alter table public.chat_conversations enable row level security;alter table public.chat_members enable row level security;alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations,public.chat_members,public.chat_messages from anon,authenticated;grant select on public.chat_conversations,public.chat_members,public.chat_messages to authenticated;grant all on public.chat_conversations,public.chat_members,public.chat_messages to service_role;
create policy chat_conversation_read on public.chat_conversations for select to authenticated using(private.chat_access(id));
create policy chat_member_read on public.chat_members for select to authenticated using(private.chat_access(conversation_id));
create policy chat_message_read on public.chat_messages for select to authenticated using(private.chat_access(conversation_id));
create function public.chat_people(org_id uuid) returns table(id uuid,display_name text) language sql stable security definer set search_path='' as $$select m.id,p.display_name from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=org_id and m.active and m.kind='employee' and private.time_member(org_id) is not null order by p.display_name$$;
create function public.chat_create(org_id uuid,chat_kind text,chat_name text,people uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id);members uuid[];chat uuid;pair text;
begin
 if actor is null then raise exception 'Active employee required';end if;
 select array_agg(distinct x order by x) into members from unnest(array_append(people,actor)) x;
 if cardinality(members)<2 or cardinality(members)>50 or chat_kind not in ('direct','group') then raise exception 'Choose 1 to 49 teammates';end if;
 if chat_kind='direct' and cardinality(members)<>2 then raise exception 'Direct chat requires two employees';end if;
 if chat_kind='group' and length(trim(chat_name)) not between 1 and 100 then raise exception 'Group name required';end if;
 if exists(select 1 from unnest(members) x where not exists(select 1 from public.memberships m where m.id=x and m.organization_id=org_id and m.active and m.kind='employee')) then raise exception 'Invalid team member';end if;
 if chat_kind='direct' then pair:=array_to_string(members,':');end if;
 insert into public.chat_conversations(organization_id,kind,name,created_by,direct_key) values(org_id,chat_kind,case when chat_kind='group' then trim(chat_name) else '' end,actor,pair) on conflict(organization_id,direct_key) do update set direct_key=excluded.direct_key returning id into chat;
 insert into public.chat_members select chat,x from unnest(members) x on conflict do nothing;return chat;
end $$;
create function public.chat_send(org_id uuid,chat uuid,message text,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.time_member(org_id);saved uuid;
begin
 if actor is null or not private.chat_access(chat) or not exists(select 1 from public.chat_conversations where id=chat and organization_id=org_id) then raise exception 'Chat access denied';end if;
 perform 1 from public.memberships where id=actor for update;
 select id into saved from public.chat_messages where author_id=actor and client_id=request_key;if saved is not null then return saved;end if;
 if (select count(*) from public.chat_messages where author_id=actor and created_at>now()-interval '1 minute')>=30 then raise exception 'Please wait before sending more messages';end if;
 insert into public.chat_messages(conversation_id,author_id,body,client_id) values(chat,actor,trim(message),request_key) returning id into saved;return saved;
end $$;
create function public.chat_read(org_id uuid,chat uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not private.chat_access(chat) or not exists(select 1 from public.chat_conversations where id=chat and organization_id=org_id) then raise exception 'Chat access denied';end if;update public.chat_members set last_read_at=now() where conversation_id=chat and membership_id=private.time_member(org_id);end $$;
revoke all on function public.chat_people(uuid),public.chat_create(uuid,text,text,uuid[]),public.chat_send(uuid,uuid,text,uuid),public.chat_read(uuid,uuid) from public,anon;
grant execute on function public.chat_people(uuid),public.chat_create(uuid,text,text,uuid[]),public.chat_send(uuid,uuid,text,uuid),public.chat_read(uuid,uuid) to authenticated;
commit;
