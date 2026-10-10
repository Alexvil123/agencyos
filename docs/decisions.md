# Approved business decisions

Confirmed by the user on 06 October 2026. Recommendations not expressly confirmed remain pending.

| ID | Approved decision |
| --- | --- |
| F1 | One agency with one office. |
| F2 | Proposed Next.js / TypeScript / Supabase stack. Start with free plans; do not activate paid services. Managed hosting provider and region remain pending. No promise that free quotas support the ultimate production load. |
| F3 | Employees and clients can have accounts. |
| F4 | Email/password and work-account sign-in approved. User delegated provider selection; prepare optional Google sign-in first, enable only when provider credentials are configured. Microsoft remains available as an optional adapter. |
| F5 | Suggested roles with assigned-client/team scope. Finance and private HR require separate permissions. |
| F6 | Alex is initial owner, using alexvilpower@gmail.com (provided explicitly). Owner has full system access. Owner can invite, activate/deactivate, assign all roles, appoint administrators, grant finance/private HR, and transfer ownership. Only Owner may assign Owner. |
| F7 | Start empty; no imported or fabricated business records. |

## Implementation constraints

- No employee quality score based on issue count.
- No attendance hours, break allowances, classification, overtime, leave accrual, or enforcement without approved policy.
- No Jira writes or status automation before approved mappings and synchronization direction.
- User invitations and role assignment follow the confirmed delegation rules below.
- No salary/finance/private-message access implied by a system administrator role.
- Setup preview displays no real data, performs no database writes, and is unavailable in production.

## Phase 1 workflow and database impact

Authenticated user → verified active membership → permission-scoped workspace.
Client memberships are distinct from employee identities. A client can only access its explicitly assigned client context in future modules.
Directory, departments, company settings, and audit logs use server-side authorization and PostgreSQL RLS.
Tables: organizations, profiles, roles, permissions, role_permissions, memberships, membership_roles, departments, employees, employee_manager_assignments, clients (identity only), client_assignments, project/client scope foundations, audit_logs.
Initial owner creation is a one-time server-operator action using the confirmed real email, not a hardcoded default.

## Confirmed account delegation model

- System Administrator may invite users, activate/deactivate normal accounts, manage configuration, and assign standard operational roles.
- System Administrator cannot assign/remove Owner, transfer ownership, deactivate Owner, or grant finance/private HR without explicit Owner authorization.
- Finance and private HR are sensitive permissions. Owner or explicitly appointed Finance/HR Administrator may grant corresponding access.
- Appointment of Finance/HR Administrator is owner-controlled.
- Other managers cannot invite users or assign roles by default.
- Every invitation, grant/revoke, activation/deactivation, and ownership change must be audited.
- Sensitive changes require explicit confirmation. Self-permission escalation is prohibited. Backend checks are mandatory.
- Safety invariant: at least one active Owner must remain. Transfer grants target ownership before removing the initiating owner's role, transactionally.
- Account invitations do not automatically assign operational roles or client resources.
- Free deployment target selected under the user's delegated technical discretion: Netlify Free + Supabase Free. No paid features or automatic upgrades; actual accounts/deployment require account setup.
