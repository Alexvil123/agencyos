-- Phase 1. No attendance, Jira, billing or private chat rules are seeded.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organizations (
 id uuid primary key default gen_random_uuid(), display_name text not null check(length(display_name) between 2 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text not null check(length(display_name) between 1 and 100), created_at timestamptz not null default now()
);
create table public.roles (
 key text primary key, name text not null unique,
 sensitivity text not null check(sensitivity in ('standard','system','finance','hr','owner'))
);
create table public.permissions (key text primary key, description text not null);
create table public.role_permissions (
 role_key text not null references public.roles(key), permission_key text not null references public.permissions(key),
 primary key(role_key,permission_key)
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 user_id uuid not null references public.profiles(id), email text not null,
 kind text not null check(kind in ('employee','client')), active boolean not null default true,
 created_at timestamptz not null default now(), unique(organization_id,user_id), unique(organization_id,email), unique(id,organization_id)
);
create table public.membership_roles (
 membership_id uuid not null references public.memberships(id), role_key text not null references public.roles(key),
 primary key(membership_id,role_key)
);
create table public.departments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(name) between 2 and 80), created_at timestamptz not null default now(),
 unique(organization_id,name), unique(id,organization_id)
);
create table public.employees (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 membership_id uuid, department_id uuid, display_name text not null check(length(display_name) between 2 and 100),
 email text not null, job_title text not null default '' check(length(job_title) <= 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,email), unique(organization_id,membership_id), unique(id,organization_id),
 foreign key(membership_id,organization_id) references public.memberships(id,organization_id),
 foreign key(department_id,organization_id) references public.departments(id,organization_id)
);
create table public.employee_manager_assignments (
 organization_id uuid not null references public.organizations(id), employee_id uuid not null,
 manager_membership_id uuid not null, primary key(employee_id,manager_membership_id),
 foreign key(employee_id,organization_id) references public.employees(id,organization_id),
 foreign key(manager_membership_id,organization_id) references public.memberships(id,organization_id)
);
-- Client identity foundation only. Sales, services and billing belong to later phases.
create table public.clients (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 display_name text not null, created_at timestamptz not null default now(), unique(id,organization_id)
);
create table public.client_assignments (
 organization_id uuid not null references public.organizations(id), client_id uuid not null, membership_id uuid not null,
 primary key(client_id,membership_id),
 foreign key(client_id,organization_id) references public.clients(id,organization_id),
 foreign key(membership_id,organization_id) references public.memberships(id,organization_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid references auth.users(id), action text not null, entity_type text not null, entity_id uuid,
 old_value jsonb, new_value jsonb, created_at timestamptz not null default now()
);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 email text not null, kind text not null check(kind in ('employee','client')), actor_id uuid not null references auth.users(id),
 state text not null default 'pending' check(state in ('pending','sent','failed')), created_at timestamptz not null default now()
);
create unique index invitations_pending_unique on public.invitations(organization_id,email) where state in ('pending','sent');
create index memberships_user_active on public.memberships(user_id,organization_id) where active;
create index employees_org_department on public.employees(organization_id,department_id);
create index audit_org_time on public.audit_logs(organization_id,created_at desc);

insert into public.roles values
 ('owner','Owner','owner'),('system_admin','System Administrator','system'),
 ('operations_manager','Operations Manager','standard'),('department_manager','Department Manager','standard'),
 ('account_manager','Account Manager','standard'),('sales','Sales','standard'),('employee','Employee','standard'),('client','Client User','standard'),
 ('finance','Finance','finance'),('finance_admin','Finance Administrator','finance'),('hr','HR / Attendance Manager','hr'),('hr_admin','HR Administrator','hr');
insert into public.permissions values
 ('directory.read','Read employee directory within approved scope'),('directory.read_all','Read organization employee directory'),
 ('directory.read_team','Read directly assigned reports'),('directory.manage','Create employee records and departments'),
 ('settings.read','Read organization settings'),('settings.manage','Manage company configuration'),
 ('users.manage','Invite users and manage access subject to delegation safeguards'),('audit.read','Read organization audit history'),
 ('finance.read','Access financial records in future modules'),('hr.private','Access private HR records in future modules'),
 ('finance.grant','Delegate finance access'),('hr.grant','Delegate private HR access');
insert into public.role_permissions select 'owner',key from public.permissions;
insert into public.role_permissions values
 ('system_admin','settings.read'),('system_admin','settings.manage'),('system_admin','users.manage'),('system_admin','audit.read'),
 ('operations_manager','directory.read'),('operations_manager','directory.read_team'),
 ('department_manager','directory.read'),('department_manager','directory.read_team'),
 ('employee','directory.read'),('account_manager','directory.read'),('sales','directory.read'),
 ('hr','directory.read'),('hr','directory.read_all'),('hr','directory.manage'),('hr','hr.private'),
 ('hr_admin','directory.read'),('hr_admin','directory.read_all'),('hr_admin','directory.manage'),('hr_admin','hr.private'),('hr_admin','hr.grant'),('hr_admin','users.manage'),
 ('finance','finance.read'),('finance_admin','finance.read'),('finance_admin','finance.grant'),('finance_admin','users.manage');

create function private.member_of(org_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=auth.uid() and m.active);
$$;
create function private.assurance_ok(org_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(
 select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id join public.roles r on r.key=mr.role_key
 where m.organization_id=org_id and m.user_id=auth.uid() and m.active and r.sensitivity<>'standard');
$$;
create function private.has_permission(org_id uuid, requested text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id
 join public.role_permissions rp on rp.role_key=mr.role_key
 where m.organization_id=org_id and m.user_id=auth.uid() and m.active and rp.permission_key=requested) and private.assurance_ok(org_id);
$$;
create function private.is_owner(org_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id
 where m.organization_id=org_id and m.user_id=auth.uid() and m.active and mr.role_key='owner') and private.assurance_ok(org_id);
$$;
create function private.can_read_employee(org_id uuid, employee_id uuid, linked_membership uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.has_permission(org_id,'directory.read_all') or
 (private.has_permission(org_id,'directory.read') and exists(select 1 from public.memberships m where m.id=linked_membership and m.user_id=auth.uid() and m.active)) or
 (private.has_permission(org_id,'directory.read_team') and exists(select 1 from public.employee_manager_assignments a join public.memberships m on m.id=a.manager_membership_id
 where a.employee_id=can_read_employee.employee_id and a.organization_id=org_id and m.user_id=auth.uid() and m.active));
$$;
create function private.can_read_client(org_id uuid, requested_client uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_owner(org_id) or exists(select 1 from public.client_assignments a join public.memberships m on m.id=a.membership_id
 where a.client_id=requested_client and a.organization_id=org_id and m.user_id=auth.uid() and m.active);
$$;
create function private.is_my_membership(requested_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships m where m.id=requested_id and m.user_id=auth.uid() and m.active);
$$;
create function private.can_read_profile(profile_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select profile_id=auth.uid() or exists(select 1 from public.memberships m where m.user_id=profile_id and private.has_permission(m.organization_id,'users.manage'));
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.employee_manager_assignments enable row level security;
alter table public.clients enable row level security;
alter table public.client_assignments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.invitations enable row level security;

create policy organization_read on public.organizations for select to authenticated using(private.member_of(id));
create policy profile_read on public.profiles for select to authenticated using(private.can_read_profile(id));
create policy role_read on public.roles for select to authenticated using(exists(select 1 from public.memberships where user_id=auth.uid() and active));
create policy permissions_read on public.permissions for select to authenticated using(exists(select 1 from public.memberships where user_id=auth.uid() and active));
create policy role_permissions_read on public.role_permissions for select to authenticated using(exists(select 1 from public.memberships where user_id=auth.uid() and active));
create policy membership_read on public.memberships for select to authenticated using((user_id=auth.uid() and active) or private.has_permission(organization_id,'users.manage'));
create policy membership_roles_read on public.membership_roles for select to authenticated using(private.is_my_membership(membership_id));
create policy department_read on public.departments for select to authenticated using(private.has_permission(organization_id,'directory.read'));
create policy employee_read on public.employees for select to authenticated using(private.can_read_employee(organization_id,id,membership_id));
create policy manager_assignment_read on public.employee_manager_assignments for select to authenticated using(private.is_my_membership(manager_membership_id) or private.is_owner(organization_id));
create policy client_read on public.clients for select to authenticated using(private.can_read_client(organization_id,id));
create policy client_assignment_read on public.client_assignments for select to authenticated using(private.is_my_membership(membership_id) or private.is_owner(organization_id));
create policy audit_read on public.audit_logs for select to authenticated using(private.has_permission(organization_id,'audit.read'));
create policy invitations_read on public.invitations for select to authenticated using(private.has_permission(organization_id,'users.manage'));

-- Direct mutations are denied, including attempts to self-assign roles. Writes use narrow RPCs.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

create function private.audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare org uuid; old_data jsonb; new_data jsonb; entity uuid;
begin
 if TG_OP <> 'INSERT' then old_data:=to_jsonb(old); end if;
 if TG_OP <> 'DELETE' then new_data:=to_jsonb(new); end if;
 org:=coalesce((new_data->>'organization_id')::uuid,(old_data->>'organization_id')::uuid);
 entity:=coalesce((new_data->>'id')::uuid,(old_data->>'id')::uuid);
 if TG_TABLE_NAME='organizations' then org:=entity; end if;
 if TG_TABLE_NAME='membership_roles' then
   entity:=coalesce((new_data->>'membership_id')::uuid,(old_data->>'membership_id')::uuid);
   select organization_id into org from public.memberships where id=entity;
 end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 values(org,auth.uid(),lower(TG_OP)||'_'||TG_TABLE_NAME,TG_TABLE_NAME,entity,old_data,new_data);
 if TG_OP='DELETE' then return old; end if; return new;
end;
$$;
create trigger audit_organizations after insert or update on public.organizations for each row execute function private.audit_change();
create trigger audit_employees after insert or update or delete on public.employees for each row execute function private.audit_change();
create trigger audit_departments after insert or update or delete on public.departments for each row execute function private.audit_change();
create trigger audit_memberships after insert or update or delete on public.memberships for each row execute function private.audit_change();
create trigger audit_membership_roles after insert or update or delete on public.membership_roles for each row execute function private.audit_change();
create trigger audit_invitations after insert or update on public.invitations for each row execute function private.audit_change();

create function public.create_employee(org_id uuid,payload jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid; email_value text;
begin
 if not private.has_permission(org_id,'directory.manage') then raise exception 'Not authorized'; end if;
 email_value:=lower(trim(payload->>'email'));
 if email_value is null or length(email_value)>254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 insert into public.employees(organization_id,membership_id,display_name,email,job_title,department_id)
 values(org_id,(select id from public.memberships where organization_id=org_id and email=email_value and kind='employee'),trim(payload->>'display_name'),email_value,coalesce(trim(payload->>'job_title'),''),nullif(payload->>'department_id','')::uuid) returning id into created_id;
 return created_id;
end;
$$;
create function public.create_department(org_id uuid,department_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
 if not private.has_permission(org_id,'directory.manage') then raise exception 'Not authorized'; end if;
 insert into public.departments(organization_id,name) values(org_id,trim(department_name)) returning id into created_id;
 return created_id;
end;
$$;
create function public.update_company(org_id uuid,company_name text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.has_permission(org_id,'settings.manage') then raise exception 'Not authorized'; end if;
 update public.organizations set display_name=trim(company_name),updated_at=now() where id=org_id;
end;
$$;

create function public.list_workspace_members(org_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.has_permission(org_id,'users.manage') then raise exception 'Not authorized'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'email',m.email,'active',m.active,'kind',m.kind,'display_name',p.display_name,
 'roles',coalesce((select jsonb_agg(r.name order by r.name) from public.membership_roles mr join public.roles r on r.key=mr.role_key where mr.membership_id=m.id),'[]'::jsonb)))
 from public.memberships m join public.profiles p on p.id=m.user_id where m.organization_id=org_id),'[]'::jsonb);
end;
$$;

create function public.change_member_access(org_id uuid,target_id uuid,operation text,requested_role text,confirmed boolean) returns void language plpgsql security definer set search_path = '' as $$
declare target public.memberships; role_sensitivity text; owner_actor boolean; admin_actor boolean;
begin
 if confirmed is distinct from true or not private.has_permission(org_id,'users.manage') then raise exception 'Confirmation and authority required'; end if;
 -- Serialize all access changes and recheck permissions after acquiring the lock.
 perform 1 from public.organizations where id=org_id for update;
 if not private.has_permission(org_id,'users.manage') then raise exception 'Not authorized'; end if;
 select * into target from public.memberships where id=target_id and organization_id=org_id for update;
 if not found then raise exception 'Unknown member'; end if;
 if target.user_id=auth.uid() then raise exception 'Self changes prohibited'; end if;
 owner_actor:=private.is_owner(org_id);
 admin_actor:=exists(select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id where m.organization_id=org_id and m.user_id=auth.uid() and m.active and mr.role_key='system_admin');
 if operation in ('activate','deactivate') then
   if not owner_actor then
     if not admin_actor then raise exception 'Account activation requires owner or system administrator'; end if;
     if exists(select 1 from public.membership_roles mr join public.roles r on r.key=mr.role_key where mr.membership_id=target_id and r.sensitivity<>'standard') then raise exception 'Privileged account protected'; end if;
   end if;
   if operation='deactivate' and exists(select 1 from public.membership_roles where membership_id=target_id and role_key='owner') then raise exception 'Transfer ownership before deactivating an owner'; end if;
   update public.memberships set active=(operation='activate') where id=target_id;
 elsif operation in ('grant','revoke') then
   select sensitivity into role_sensitivity from public.roles where key=requested_role;
   if not found then raise exception 'Unknown role'; end if;
   if requested_role='owner' and not owner_actor then raise exception 'Only owner can assign ownership'; end if;
   if requested_role='owner' and target.kind<>'employee' then raise exception 'Owner must be internal'; end if;
   if operation='grant' and not target.active then raise exception 'Activate account first'; end if;
   if target.kind='client' and requested_role<>'client' then raise exception 'Client accounts cannot have internal roles'; end if;
   if target.kind='employee' and requested_role='client' then raise exception 'Internal account cannot take client role'; end if;
   if not owner_actor then
     if exists(select 1 from public.membership_roles where membership_id=target_id and role_key='owner') then raise exception 'Owner account protected'; end if;
     if role_sensitivity='system' then raise exception 'Only owner can assign system administration'; end if;
     if role_sensitivity='standard' and not admin_actor then raise exception 'Standard roles require system administrator'; end if;
     if role_sensitivity='finance' and not private.has_permission(org_id,'finance.grant') then raise exception 'Finance grant authority required'; end if;
     if role_sensitivity='hr' and not private.has_permission(org_id,'hr.grant') then raise exception 'HR grant authority required'; end if;
     -- Grant authority itself is owner-controlled, even for delegated administrators.
     if requested_role in ('finance_admin','hr_admin') then raise exception 'Only owner can delegate sensitive grant authority'; end if;
     if admin_actor and role_sensitivity='standard' and exists(select 1 from public.membership_roles mr join public.roles r on r.key=mr.role_key where mr.membership_id=target_id and r.sensitivity<>'standard') then raise exception 'Privileged account protected'; end if;
   end if;
   if operation='grant' then insert into public.membership_roles values(target_id,requested_role) on conflict do nothing;
   else
     if requested_role='owner' and (select count(*) from public.membership_roles mr join public.memberships m on m.id=mr.membership_id where m.organization_id=org_id and m.active and mr.role_key='owner')<=1 then raise exception 'Cannot remove last owner'; end if;
     delete from public.membership_roles where membership_id=target_id and role_key=requested_role;
   end if;
 elsif operation='transfer' then
   if not owner_actor or not target.active or target.kind<>'employee' then raise exception 'Active internal target and owner authority required'; end if;
   insert into public.membership_roles values(target_id,'owner') on conflict do nothing;
   delete from public.membership_roles mr using public.memberships m where mr.membership_id=m.id and m.organization_id=org_id and m.user_id=auth.uid() and mr.role_key='owner';
   insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value) values(org_id,auth.uid(),'ownership_transferred','memberships',target_id,jsonb_build_object('new_owner',target.user_id));
 else raise exception 'Unknown operation'; end if;
end;
$$;

create function public.reserve_invitation(org_id uuid,recipient text,account_kind text) returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation uuid;
begin
 perform 1 from public.organizations where id=org_id for update;
 if not private.has_permission(org_id,'users.manage') or (not private.is_owner(org_id) and not exists(select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id where m.organization_id=org_id and m.user_id=auth.uid() and m.active and mr.role_key='system_admin')) then raise exception 'Invitation authority required'; end if;
 if length(recipient)>254 or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 if (select count(*) from public.invitations where actor_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception 'Invitation rate limit'; end if;
 if exists(select 1 from public.memberships where organization_id=org_id and email=lower(trim(recipient))) then raise exception 'Already a member'; end if;
 insert into public.invitations(organization_id,email,kind,actor_id) values(org_id,lower(trim(recipient)),account_kind,auth.uid()) returning id into invitation;
 return invitation;
end;
$$;
create function public.complete_invitation(invitation_id uuid,invited_user_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations; auth_email text; initiator_active boolean;
begin
 select * into invitation from public.invitations where id=invitation_id and state='pending' for update;
 if not found then raise exception 'No pending invitation'; end if;
 if invited_user_id is null then update public.invitations set state='failed' where id=invitation_id; return; end if;
 select email into auth_email from auth.users where id=invited_user_id;
 if auth_email is null or lower(auth_email)<>invitation.email then raise exception 'Identity mismatch'; end if;
 select exists(select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id where m.organization_id=invitation.organization_id and m.user_id=invitation.actor_id and m.active and mr.role_key in ('owner','system_admin')) into initiator_active;
 if not initiator_active then update public.invitations set state='failed' where id=invitation_id; return; end if;
 insert into public.profiles(id,display_name) values(invited_user_id,split_part(invitation.email,'@',1)) on conflict do nothing;
 insert into public.memberships(organization_id,user_id,email,kind) values(invitation.organization_id,invited_user_id,invitation.email,invitation.kind);
 if invitation.kind='employee' then
   update public.employees set membership_id=(select id from public.memberships where organization_id=invitation.organization_id and user_id=invited_user_id),updated_at=now()
   where organization_id=invitation.organization_id and email=invitation.email and membership_id is null;
 end if;
 update public.invitations set state='sent' where id=invitation_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
 values(invitation.organization_id,invitation.actor_id,'invitation_completed','invitations',invitation_id,jsonb_build_object('user_id',invited_user_id));
end;
$$;

-- Bootstrap is server-operator only, requires real auth identity, and refuses a second organization.
create function public.bootstrap_owner(owner_user_id uuid,agency_name text,owner_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid; membership uuid; owner_email text;
begin
 perform pg_advisory_xact_lock(82761006);
 if exists(select 1 from public.organizations) then raise exception 'Workspace already initialized'; end if;
 select lower(email) into owner_email from auth.users where id=owner_user_id;
 if owner_email is null then raise exception 'Owner auth account required'; end if;
 insert into public.organizations(display_name) values(agency_name) returning id into org;
 insert into public.profiles(id,display_name) values(owner_user_id,owner_name) on conflict(id) do update set display_name=excluded.display_name;
 insert into public.memberships(organization_id,user_id,email,kind) values(org,owner_user_id,owner_email,'employee') returning id into membership;
 insert into public.membership_roles values(membership,'owner');
 insert into public.employees(organization_id,membership_id,display_name,email,job_title) values(org,membership,owner_name,owner_email,'Owner');
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value) values(org,owner_user_id,'owner_bootstrapped','memberships',membership,jsonb_build_object('source','operator_setup'));
 return org;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.member_of(uuid),private.has_permission(uuid,text),private.is_owner(uuid),private.can_read_employee(uuid,uuid,uuid),private.can_read_client(uuid,uuid),private.is_my_membership(uuid),private.can_read_profile(uuid) to authenticated;
revoke all on function public.create_employee(uuid,jsonb),public.create_department(uuid,text),public.update_company(uuid,text),public.list_workspace_members(uuid),public.change_member_access(uuid,uuid,text,text,boolean),public.reserve_invitation(uuid,text,text),public.complete_invitation(uuid,uuid),public.bootstrap_owner(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_employee(uuid,jsonb),public.create_department(uuid,text),public.update_company(uuid,text),public.list_workspace_members(uuid),public.change_member_access(uuid,uuid,text,text,boolean),public.reserve_invitation(uuid,text,text) to authenticated;
grant execute on function public.complete_invitation(uuid,uuid),public.bootstrap_owner(uuid,text,text) to service_role;
commit;
