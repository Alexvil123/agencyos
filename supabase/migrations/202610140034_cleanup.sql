-- Cleanup after an audit.
-- 1. The Sales sheet → Jira client onboarding automation was removed from the app (clients come from Jira only). Its three tables
--    (empty apart from one settings row) and three functions are dropped.
-- 2. The signed-out role (anon) never needs the workspace tables below. Row-level security already blocked it; the grants are removed too.
-- 3. rls_auto_enable is a Supabase event-trigger helper; nobody should be able to call it through the API.
begin;
drop function if exists public.sales_conversion_configure(uuid, jsonb, jsonb, timestamptz);
drop function if exists public.sales_conversion_scan_claim(uuid);
drop function if exists public.sales_conversion_job_claim(uuid);
drop table if exists public.sales_conversion_sources;
drop table if exists public.sales_client_conversions;
drop table if exists public.sales_conversion_settings;
revoke all on public.jira_sync_settings, public.sales_team_access, public.workspace_sync_health from anon;
do $$ begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rls_auto_enable') then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
commit;
