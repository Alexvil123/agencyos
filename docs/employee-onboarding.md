# Employee onboarding workflow

## Add an employee

1. Sign in with an authorized Owner or HR account using email/password. Mandatory MFA was removed at the user's confirmed request.
2. Open Team → Add employee (also available from + Create).
3. Enter full name, work email, optional job title and department.
4. Click Save employee. The server validates the input and membership permission, then calls the database RPC.
5. On success, the employee is persisted in PostgreSQL, an audit entry is committed in the same transaction, and the directory refreshes. No employee data is stored only in browser state.

Duplicate emails are rejected per organization. Department foreign keys cannot point to another organization. Errors preserve the form for correction; an interrupted request advises checking the directory before retrying.

## Find employees

- Card and table views.
- Name/email/title search and department filtering.
- Profile details from permitted database records.
- Account-linked badge means a membership is linked; it does not claim the account is active or has roles.
- Scope remains enforced by RLS, including after page refresh.

## Give an employee a login

Owner can now select Create email/password login directly in Add employee, enter the employee password, and confirm verified-email/standard-Employee access. Create employee + login creates Auth identity and linked workspace records. For an existing unlinked directory profile, use the same email; it is linked rather than duplicated. Passwords go only to Auth, never into directory or audit records. The agent must not enter new employee credentials; the user completes this form.

After saving, Owner/System Administrator can select Invite to workspace; the employee's email is prefilled. The invitation still requires explicit confirmation and configured email delivery. Roles are explicitly assigned in Settings → Users under the approved delegation rules.

No password, owner/finance/private HR role, attendance policy, leave balance, salary, or client sharing is automatically assigned when creating an employee record. No automatic invitation is sent by a directory save.

## Appearance

Light/dark appearance is a local preference, independent of permissions and business data. Team and onboarding screens use responsive cards, readable status labels, restrained gradients, and clear save states.

## Live rollout status

The database foundation is deployed and public connection settings are configured. Alex's confirmed auth account was activated as Owner after explicit user confirmation. The user subsequently confirmed email/password-only access; that database migration is deployed. Live verification confirms Owner access to Team/Clients, enabled create forms, and the policy-change audit. Real browser saves await actual employee/client details; embedded PostgreSQL persistence tests pass.
