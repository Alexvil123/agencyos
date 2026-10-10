# Email/password login and client creation

Requested by the user on 06 October 2026. Applied `supabase/migrations/202610060002_password_login_clients.sql` to Supabase project `nzkebyggxagbpdjouuhj` after explicit confirmation: "Apply pannu". SQL Editor returned success.

- Existing Owner employee-create permission remains enforced by the server and database.
- Owner gets client-profile creation, with name validation, organization isolation, case-insensitive duplicate-name rejection, and transactional audit logging.
- Client profiles contain the company/client name only; services, renewals, invoices, portal sharing and login invitations remain separate workflows.
- Client and employee directories load actual RLS-permitted records; successful saves refresh the workspace. No browser-only persistence or automatically granted login roles.
- Login enforcement follows the database organization `require_mfa` setting. The app fails closed with the former MFA requirement until the reviewed migration is deployed. Users cannot modify authentication policy directly.
- Fifteen embedded PostgreSQL/validation tests passed, including AAL1 Owner employee/client creation, duplicate rejection, cross-organization denial, unauthorized/anonymous/direct-write denial, and client audits. TypeScript, lint, and production build passed.
- Live verification: mycrm `require_mfa=false`; Alex active; employee/client create permissions true; one authentication-policy audit entry. Connected CRM opens Team and Clients without mandatory MFA; Add employee and Add client dialogs and save controls are enabled.
- Proof: `password-login-applied.jpg`, `password-login-verified.jpg`, `live-employee-form.jpg`, `live-client-directory.jpg`, `live-client-form.jpg`.
- No live test clients or employees were inserted. Actual browser-form save verification awaits real records supplied by the user; persistence and audit behavior were tested in embedded PostgreSQL.
