begin;
-- Integration credentials entered by the Owner in Settings. The value is encrypted by the server (AES-256-GCM) before it is
-- stored, so the database only ever holds ciphertext. Only the server (service role) can read or write this table; browsers
-- and signed-in users have no access at all.
create table public.integration_credentials(
 organization_id uuid not null references public.organizations(id),
 provider text not null check(provider in ('meta_social','youtube','meta_ads','google_ads','google_sheets','jira_oauth_app')),
 encrypted text not null check(length(encrypted) between 20 and 20000),
 hint text not null default '' check(length(hint)<=300),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(organization_id,provider)
);
alter table public.integration_credentials enable row level security;
revoke all on public.integration_credentials from anon,authenticated;
grant all on public.integration_credentials to service_role;
commit;
