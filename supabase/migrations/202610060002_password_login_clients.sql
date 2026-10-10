-- Apply after confirmation of email/password-only login.
begin;
alter table public.organizations add column require_mfa boolean not null default false;
create or replace function private.assurance_ok(org_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.member_of(org_id) and exists(select 1 from public.organizations o where o.id=org_id and
 (not o.require_mfa or coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(
 select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id join public.roles r on r.key=mr.role_key
 where m.organization_id=org_id and m.user_id=auth.uid() and m.active and r.sensitivity<>'standard')));
$$;
alter table public.clients add constraint client_name_length check(length(trim(display_name)) between 2 and 100);
create unique index clients_org_name_unique on public.clients(organization_id,lower(trim(display_name)));
insert into public.permissions values ('clients.manage','Create client profiles');
insert into public.role_permissions values ('owner','clients.manage');
create trigger audit_clients after insert or update or delete on public.clients for each row execute function private.audit_change();
create function public.create_client(org_id uuid,client_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
 if not private.is_owner(org_id) or not private.has_permission(org_id,'clients.manage') then raise exception 'Owner access required'; end if;
 if client_name is null or length(trim(client_name)) not between 2 and 100 then raise exception 'Invalid client name'; end if;
 insert into public.clients(organization_id,display_name) values(org_id,trim(client_name)) returning id into created_id;
 return created_id;
end;
$$;
revoke all on function public.create_client(uuid,text) from public,anon,authenticated;
grant execute on function public.create_client(uuid,text) to authenticated;
insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
select o.id,m.user_id,'authentication_policy_changed','organizations',o.id,
 jsonb_build_object('require_mfa',false,'source','user_confirmed_operator_setup') from public.organizations o
 join public.memberships m on m.organization_id=o.id and m.active
 join public.membership_roles mr on mr.membership_id=m.id and mr.role_key='owner';
commit;
