# Departments and Owner account editing

Applied on 06 October 2026 at the user's request.

- Added nine departments through the existing Owner-authorized database RPC, preserving the exact supplied names/spelling. Idempotent setup script: `supabase/add-agency-departments.sql`. Live SQL and Team UI verified all nine records.
- Deployed migrations `202610060004_owner_updates.sql` and `202610060005_owner_email_updates.sql`.
- Owner can edit employee name/email/job title/department, client names, and department names. Server and database both enforce Owner status and organization scope. Changes are audited; profile-only employees and linked accounts have distinct identity handling.
- Changing a linked employee email requires confirmation that the new email was verified. Authentication identity is updated first; database completion synchronizes employee/membership email and profile name. A definitive database failure attempts to restore the prior Auth email. Uncertain transport/rollback status requires Owner review before retrying.
- Owner may change any workspace member's password, including their own, from Settings → Users or a linked employee profile. Password change requires explicit confirmation, validates password length, reserves an audited request, updates Supabase Auth via the trusted server, and records completion/failure. Passwords never enter audit JSON or directory tables. Only service_role may complete password-change audits.
- The agent did not enter or change any real credentials. The user must complete new password entry and submission themselves.
- Twenty-three tests cover organization isolation, Owner-only editing, linked identity synchronization, audit records, password confirmation, service-only completion and duplicate-completion denial. Typecheck, ESLint and production build pass.
- Live screenshots: `departments-owner-edit.jpg`, `owner-employee-edit.jpg`, `owner-password-control.jpg`, `owner-updates-applied.jpg`. UI forms verified without submitting real account changes. Business workflows in pending modules remain outside these foundation record controls.
