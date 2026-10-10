begin;
create or replace function public.update_directory_record(org_id uuid,record_kind text,record_id uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner access required'; end if;
 if record_kind='employee' then
  if exists(select 1 from public.employees where id=record_id and organization_id=org_id and membership_id is not null and email<>lower(trim(payload->>'email'))) and not exists(
    select 1 from public.employees e join public.memberships m on m.id=e.membership_id join auth.users u on u.id=m.user_id
    where e.id=record_id and e.organization_id=org_id and lower(u.email)=lower(trim(payload->>'email'))) then raise exception 'Authentication email must be updated first'; end if;
  if payload->>'email' is null or length(payload->>'email')>254 or payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  update public.employees set display_name=trim(payload->>'display_name'),email=lower(trim(payload->>'email')),job_title=coalesce(trim(payload->>'job_title'),''),department_id=nullif(payload->>'department_id','')::uuid,updated_at=now() where id=record_id and organization_id=org_id;
 elsif record_kind='department' then
  update public.departments set name=trim(payload->>'name') where id=record_id and organization_id=org_id;
 elsif record_kind='client' then
  update public.clients set display_name=trim(payload->>'display_name') where id=record_id and organization_id=org_id;
 else raise exception 'Invalid record kind'; end if;
 if not found then raise exception 'Record not found in this workspace'; end if;
 if record_kind='employee' then
  update public.memberships set email=lower(trim(payload->>'email')) where id in(select membership_id from public.employees where id=record_id and organization_id=org_id);
  update public.profiles set display_name=trim(payload->>'display_name') where id in (
   select m.user_id from public.memberships m join public.employees e on e.membership_id=m.id where e.id=record_id and e.organization_id=org_id);
 end if;
end;
$$;
commit;
