-- Service-only employee provisioning. Passwords never enter this RPC or audit JSON.
begin;
create function public.complete_employee_login(org_id uuid,owner_actor uuid,new_user_id uuid,payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare account_email text; membership uuid; employee uuid; previous_actor text;
begin
 if not exists(select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id
 where m.organization_id=org_id and m.user_id=owner_actor and m.active and m.kind='employee' and mr.role_key='owner') then
 raise exception 'Active Owner required'; end if;
 if payload ? 'password' then raise exception 'Password must not be sent to the directory'; end if;
 select lower(email) into account_email from auth.users where id=new_user_id;
 if account_email is null or account_email<>lower(trim(payload->>'email')) then raise exception 'Authentication identity mismatch'; end if;
 if exists(select 1 from public.memberships where user_id=new_user_id) then raise exception 'Account already linked'; end if;
 if length(trim(payload->>'display_name')) not between 2 and 100 or payload->>'display_name' is null then raise exception 'Invalid name'; end if;
 previous_actor:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',owner_actor::text,true);
 insert into public.profiles(id,display_name) values(new_user_id,trim(payload->>'display_name'));
 insert into public.memberships(organization_id,user_id,email,kind) values(org_id,new_user_id,account_email,'employee') returning id into membership;
 insert into public.membership_roles values(membership,'employee');
 select id into employee from public.employees where organization_id=org_id and email=account_email for update;
 if employee is not null then
   if exists(select 1 from public.employees where id=employee and membership_id is not null) then raise exception 'Employee already linked'; end if;
   update public.employees set membership_id=membership,display_name=trim(payload->>'display_name'),
    job_title=coalesce(trim(payload->>'job_title'),''),department_id=nullif(payload->>'department_id','')::uuid,updated_at=now() where id=employee;
 else
   insert into public.employees(organization_id,membership_id,display_name,email,job_title,department_id)
   values(org_id,membership,trim(payload->>'display_name'),account_email,coalesce(trim(payload->>'job_title'),''),nullif(payload->>'department_id','')::uuid) returning id into employee;
 end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
 values(org_id,owner_actor,'employee_login_created','memberships',membership,jsonb_build_object('user_id',new_user_id,'employee_id',employee,'role_key','employee','source','owner_password_setup'));
 perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
 return employee;
end;
$$;
revoke all on function public.complete_employee_login(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_employee_login(uuid,uuid,uuid,jsonb) to service_role;
commit;
