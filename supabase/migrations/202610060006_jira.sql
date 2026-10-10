begin;
create table public.jira_account_links (
 organization_id uuid not null references public.organizations(id), membership_id uuid primary key,
 account_id text not null check(length(account_id) between 1 and 200),
 foreign key(membership_id,organization_id) references public.memberships(id,organization_id), unique(organization_id,account_id)
);
create table public.jira_issues (
 organization_id uuid not null references public.organizations(id), id text not null, key text not null,
 project_key text not null check(project_key in ('OCT','SEP','SOURCE')), summary text not null,
 description jsonb, status_id text not null, status_name text not null, assignee_id text, assignee_name text,
 jira_updated timestamptz not null, synced_at timestamptz not null default now(), primary key(organization_id,id)
);
alter table public.jira_account_links enable row level security;
alter table public.jira_issues enable row level security;
create function private.can_access_jira(org_id uuid, assignee text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_owner(org_id) or (private.assurance_ok(org_id) and exists(
 select 1 from public.jira_account_links l join public.memberships m on m.id=l.membership_id
 join public.membership_roles r on r.membership_id=m.id
 where l.organization_id=org_id and m.organization_id=org_id and m.user_id=auth.uid() and m.active and m.kind='employee' and r.role_key='employee' and l.account_id=assignee));
$$;
create policy jira_links_read on public.jira_account_links for select to authenticated using(private.is_owner(organization_id) or exists(select 1 from public.memberships m where m.id=membership_id and m.user_id=auth.uid() and m.active and m.kind='employee'));
-- Employee reads use live Jira assignee checks; a stale cached assignment must not grant access.
create policy jira_issues_read on public.jira_issues for select to authenticated using(private.is_owner(organization_id));
grant select on public.jira_account_links,public.jira_issues to authenticated;
revoke all on public.jira_account_links,public.jira_issues from anon;
create function public.link_jira_account(org_id uuid, target uuid, jira_account text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner(org_id) then raise exception 'Owner required'; end if;
 if not exists(select 1 from public.memberships where id=target and organization_id=org_id and active and kind='employee') then raise exception 'Active employee required'; end if;
 insert into public.jira_account_links values(org_id,target,jira_account) on conflict(membership_id) do update set account_id=excluded.account_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value) values(org_id,auth.uid(),'jira_account_linked','memberships',target,jsonb_build_object('account_id',jira_account));
end; $$;
create function public.jira_sync_batch(org_id uuid, owner_actor uuid, issues jsonb) returns void language plpgsql security definer set search_path='' as $$
declare original text := current_setting('request.jwt.claim.sub',true);
begin
 perform set_config('request.jwt.claim.sub',owner_actor::text,true);
 if jsonb_typeof(issues)<>'array' or jsonb_array_length(issues)>100 then raise exception 'Invalid batch'; end if;
 if not private.is_owner(org_id) and (jsonb_array_length(issues)<>1 or not private.can_access_jira(org_id,issues->0->>'assignee_id')) then raise exception 'Owner or assigned employee required'; end if;
 insert into public.jira_issues(organization_id,id,key,project_key,summary,description,status_id,status_name,assignee_id,assignee_name,jira_updated)
 select org_id,x.id,x.key,x.project_key,x.summary,x.description,x.status_id,x.status_name,x.assignee_id,x.assignee_name,x.jira_updated::timestamptz
 from jsonb_to_recordset(issues) as x(id text,key text,project_key text,summary text,description jsonb,status_id text,status_name text,assignee_id text,assignee_name text,jira_updated text)
 on conflict(organization_id,id) do update set key=excluded.key,project_key=excluded.project_key,summary=excluded.summary,description=excluded.description,status_id=excluded.status_id,status_name=excluded.status_name,assignee_id=excluded.assignee_id,assignee_name=excluded.assignee_name,jira_updated=excluded.jira_updated,synced_at=now()
 where excluded.jira_updated>=public.jira_issues.jira_updated;
 perform set_config('request.jwt.claim.sub',coalesce(original,''),true);
end; $$;
create function public.jira_audit(org_id uuid, actor uuid, issue_assignee text, operation text, issue_key text) returns void language plpgsql security definer set search_path='' as $$
declare original text := current_setting('request.jwt.claim.sub',true);
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if not private.can_access_jira(org_id,issue_assignee) or (operation not like 'edit%' and not private.is_owner(org_id)) then raise exception 'Not authorized'; end if;
 if operation not in ('create_requested','create_completed','create_uncertain','edit_requested','edit_completed','edit_uncertain','connection_requested','connection_saved','sync_completed') then raise exception 'Invalid action'; end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,new_value) values(org_id,actor,'jira_'||operation,'jira',jsonb_build_object('issue_key',issue_key));
 perform set_config('request.jwt.claim.sub',coalesce(original,''),true);
end; $$;
revoke all on function public.link_jira_account(uuid,uuid,text),public.jira_sync_batch(uuid,uuid,jsonb),public.jira_audit(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.link_jira_account(uuid,uuid,text) to authenticated;
grant execute on function public.jira_sync_batch(uuid,uuid,jsonb),public.jira_audit(uuid,uuid,text,text,text) to service_role;
grant execute on function private.can_access_jira(uuid,text) to authenticated;
commit;
