begin;
-- Supabase default privileges may grant ALL on newly created public tables.
-- TRUNCATE bypasses row-level security, so remove all direct mutation privileges.
revoke all on table public.jira_account_links,public.jira_issues from authenticated,anon;
grant select on table public.jira_account_links,public.jira_issues to authenticated;
commit;
