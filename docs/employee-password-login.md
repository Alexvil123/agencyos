# Owner-created employee email/password login

Requested on 06 October 2026. UI is implemented in the connected CRM: Add employee includes an optional login checkbox, password field, verified-email/standard-Employee-access confirmation, and Create employee + login button. Owner sees this mode by default; profile-only save remains available.

## Server workflow

1. Validate the current active Owner session, directory permission, email/name/department and password (minimum 6 characters, maximum 72 UTF-8 bytes), and explicit access confirmation. On 06 October 2026 the user requested flexible passwords; the app's extra 12-character rule was removed across employee creation, Owner password changes, and invitation password setup. No letters/digits/symbol combination is required. Hosted Supabase's minimum-six restriction remains enforced by Auth.
2. Create a new Supabase Auth identity through the server-only admin client. Owner confirms that the email belongs to the employee; the identity is email-confirmed. No invitation email is sent.
3. Call service-only `complete_employee_login` to atomically create a profile, membership, standard Employee role, and linked employee record (or link an existing unlinked directory record). Every directory/access change is attributed to Owner in audit logs.
4. Refresh the directory after confirmed success. Never overwrite an existing Auth password. On database completion failure, remove only the newly created Auth identity; if completion/cleanup is uncertain, stop and request Owner review.

Passwords are passed only to Supabase Auth; never to directory RPCs, audit JSON, success messages, client persistence or console logs. UI clears the password after submission. No Owner, private HR or finance roles are granted.

## Verification and rollout

- Twenty tests pass: existing security tests plus service-only RPC access, active Owner and identity checks, password-field rejection, employee-role linkage, atomic rollback, actor-attributed audits, and auth cleanup behavior.
- TypeScript, ESLint, production build passed. Connected UI email/password fields visually verified (`employee-password-form-review.jpg`).
- On 06 October 2026 the user confirmed "Activate employee login setup". Migration `202610060003_employee_password_login.sql` applied successfully; existing server secret configured in ignored `.env.local`, never displayed in chat or added to client properties. Clipboard was cleared after configuration.
- Live read-only checks: provisioning installed; service_role execution allowed; authenticated and anonymous execution denied. Server Auth admin connection verified with a read-only list request, without displaying account details. Connected Owner form now enables Create employee + login; proof: `employee-login-activated.jpg` and `employee-login-permissions-verified.jpg`.
- No employee credentials were created during verification. The user must enter employee passwords themselves. First real account creation/login remains to be verified with an actual employee; no fake account was inserted.
