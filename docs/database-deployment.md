# Supabase foundation deployment

Applied on 06 October 2026 after the user's explicit confirmation: "Database setup pannu".

- Project: `nzkebyggxagbpdjouuhj` in the user's `mycrm` Free organization.
- Applied file: `supabase/migrations/202610060001_foundation.sql`.
- Supabase SQL Editor execution returned: `Success. No rows returned`.
- Read-only live checks: 14 public CRM tables; all 14 with RLS enabled; 12 roles; 12 permissions.
- Anonymous writable tables: 0. Authenticated direct writable tables: 0. Mutations remain restricted to approved RPCs.
- Authenticated execution of `bootstrap_owner`: false.
- Employee records: 0. No user accounts, owner privileges, clients, or employee data were created in this deployment.
- Proof: `docs/database-setup.jpg`.

Next steps: connect the application using the project's public configuration, arrange Alex's authentication account, perform confirmed owner bootstrap, and verify MFA/login against this project. No credentials are stored in this document.

## Connection and owner identity preparation

- Verified confirmed email/password auth account: Alex, `alexvilpower@gmail.com`, UID `33852255-e6b8-4de4-acd4-e96429fd35fd`.
- Added public project URL and publishable key to ignored `.env.local`. No server secret was retrieved or stored.
- Restarted the local application with this connection.
- Prepared the one-time Owner activation script (removed after use) and staged it in the SQL Editor, without execution. It verifies the actual confirmed auth identity and initializes the one-time Owner membership, linked employee record, and audit entries.
- Editable company display name will use the existing Supabase organization name `mycrm`.
- Owner activation awaits action-time confirmation because it grants privileged access.

## Confirmed Owner activation

On 06 October 2026 the user explicitly confirmed "Owner activate pannu". Executed the one-time Owner activation script (removed after use) through the project's SQL Editor.

- Created organization ID: `6b6f9be3-6d3f-42a5-9901-32f736c95e2b` (`mycrm`).
- Live read-only verification: Alex's membership is active, role is `owner`, one linked employee profile, one `owner_bootstrapped` audit entry.
- Proof: `docs/owner-activation-complete.jpg`.
- Connected CRM now redirects the signed-in Owner to `/auth/mfa`, correctly requiring authenticator enrollment before privileged workspace access. Enrollment and code entry must be completed by the user.

## Email/password-only access and client creation

Subsequently on 06 October 2026 the user requested removal of mandatory two-step verification and confirmed "Apply pannu". Applied `202610060002_password_login_clients.sql` successfully. Verified `require_mfa=false`, Alex active, employee/client-create permissions true, and one authentication-policy audit entry. Connected Owner Team/Clients pages and create forms open successfully. See password-login-clients.md for scope and verification limits.

## Employee email/password creation activated

On 06 October 2026 the user confirmed "Activate employee login setup". Applied `202610060003_employee_password_login.sql`, configured the existing project secret on the local server, and verified Auth connectivity with a read-only admin request. Live function grants: server allowed, authenticated/anonymous denied. Owner Add employee form enables direct login creation. No passwords or real employee accounts were created by the agent; see employee-password-login.md.
# Jira integration — 6 October 2026

Migration `202610060007_jira_table_grants.sql` also applied successfully. Live inspection found Supabase default privileges granted authenticated table mutations despite the absence of mutation RLS policies. Migration 007 explicitly revokes all authenticated/anonymous table privileges and restores only authenticated SELECT. This also denies TRUNCATE, which RLS does not govern. Four targeted SQL tests passed with simulated Supabase default ALL grants before applying migration 007.

Migration `202610060006_jira.sql` applied to project `nzkebyggxagbpdjouuhj` after explicit user confirmation. SQL Editor returned "Success. No rows returned". The migration creates Jira task snapshots, Owner-controlled employee identity mapping, scoped server synchronization and auditing. Live function checks confirm service_role synchronization allowed, authenticated direct synchronization denied, anonymous employee mapping denied. CRM Settings → Integrations now enables Verify & connect Jira. API credentials and real Jira task operations remain pending user connection.
