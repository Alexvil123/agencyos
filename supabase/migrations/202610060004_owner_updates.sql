begin;
create function public.update_directory_record(org_id uuid,record_kind text,record_id uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner access required'; end if;
 if record_kind='employee' then
  if exists(select 1 from public.employees where id=record_id and organization_id=org_id and membership_id is not null and email<>lower(trim(payload->>'email'))) then raise exception 'Linked login email cannot be changed through the directory'; end if;
  if payload->>'email' is null or length(payload->>'email')>254 or payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  update public.employees set display_name=trim(payload->>'display_name'),email=lower(trim(payload->>'email')),job_title=coalesce(trim(payload->>'job_title'),''),department_id=nullif(payload->>'department_id','')::uuid,updated_at=now() where id=record_id and organization_id=org_id;
 elsif record_kind='department' then
  update public.departments set name=trim(payload->>'name') where id=record_id and organization_id=org_id;
 elsif record_kind='client' then
  update public.clients set display_name=trim(payload->>'display_name') where id=record_id and organization_id=org_id;
 else raise exception 'Invalid record kind'; end if;
 if not found then raise exception 'Record not found in this workspace'; end if;
 if record_kind='employee' then
  update public.profiles set display_name=trim(payload->>'display_name') where id in (
   select m.user_id from public.memberships m join public.employees e on e.membership_id=m.id where e.id=record_id and e.organization_id=org_id);
 end if;
end;
$$;
create function public.request_password_change(org_id uuid,target_membership uuid,confirmed boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;target_user uuid;
begin
 if not private.is_owner(org_id) or confirmed is not true then raise exception 'Confirmed Owner access required'; end if;
 select user_id into target_user from public.memberships where id=target_membership and organization_id=org_id;
 if target_user is null then raise exception 'Account not in this workspace'; end if;
 if (select count(*) from public.audit_logs where actor_id=auth.uid() and action='password_change_requested' and created_at>now()-interval '1 minute')>=5 then raise exception 'Password change rate limit'; end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
 values(org_id,auth.uid(),'password_change_requested','memberships',target_membership,jsonb_build_object('user_id',target_user)) returning id into request_id;
 return request_id;
end;
$$;
create function public.complete_password_change(request_id uuid,succeeded boolean) returns void language plpgsql security definer set search_path='' as $$
declare request public.audit_logs;
begin
 select * into request from public.audit_logs where id=request_id and action='password_change_requested' for update;
 if not found then raise exception 'Password change request missing'; end if;
 if exists(select 1 from public.audit_logs where action in ('password_changed','password_change_failed') and new_value->>'request_id'=request_id::text) then raise exception 'Request already completed'; end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
 values(request.organization_id,request.actor_id,case when succeeded then 'password_changed' else 'password_change_failed' end,'memberships',request.entity_id,jsonb_build_object('request_id',request_id));
end;
$$;
revoke all on function public.update_directory_record(uuid,text,uuid,jsonb),public.request_password_change(uuid,uuid,boolean),public.complete_password_change(uuid,boolean) from public,anon,authenticated;
grant execute on function public.update_directory_record(uuid,text,uuid,jsonb),public.request_password_change(uuid,uuid,boolean) to authenticated;
grant execute on function public.complete_password_change(uuid,boolean) to service_role;
commit;
