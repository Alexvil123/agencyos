begin;
create table public.jira_oauth_connections (
 organization_id uuid primary key references public.organizations(id), encrypted_tokens text not null,
 connected_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 refresh_lease uuid, refresh_lease_until timestamptz
);
create table public.jira_oauth_states (
 nonce_hash text primary key, organization_id uuid not null references public.organizations(id),
 owner_actor uuid not null references auth.users(id), expires_at timestamptz not null
);
alter table public.jira_oauth_connections enable row level security;
alter table public.jira_oauth_states enable row level security;
revoke all on public.jira_oauth_connections,public.jira_oauth_states from anon,authenticated;
grant all on public.jira_oauth_connections,public.jira_oauth_states to service_role;
create function public.consume_jira_oauth_state(nonce text,org_id uuid,actor uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare found_nonce text; original text:=current_setting('request.jwt.claim.sub',true);
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if not private.is_owner(org_id) then raise exception 'Owner required'; end if;
 delete from public.jira_oauth_states where nonce_hash=nonce and organization_id=org_id and owner_actor=actor and expires_at>now() returning nonce_hash into found_nonce;
 perform set_config('request.jwt.claim.sub',coalesce(original,''),true);
 return found_nonce is not null;
end; $$;
create function public.claim_jira_oauth_refresh(org_id uuid,lease uuid) returns text language plpgsql security definer set search_path='' as $$
declare tokens text;
begin
 update public.jira_oauth_connections set refresh_lease=lease,refresh_lease_until=now()+interval '60 seconds'
 where organization_id=org_id and (refresh_lease_until is null or refresh_lease_until<now()) returning encrypted_tokens into tokens;
 return tokens;
end; $$;
revoke all on function public.consume_jira_oauth_state(text,uuid,uuid),public.claim_jira_oauth_refresh(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_jira_oauth_state(text,uuid,uuid),public.claim_jira_oauth_refresh(uuid,uuid) to service_role;
commit;
