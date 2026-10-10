# Architecture and implementation boundaries

## Layers

Next.js App Router → verified Supabase user → active organization membership → permissions → scoped data queries.
Mutations: Server Action schema validation → verified membership/permission → narrow SQL RPC → relational constraints and database authorization → atomic audit trigger.
Invitations: authenticated permission check → audited/rate-limited reservation → server-only Auth admin client → matching auth identity checked → membership created → audited completion. Roles remain empty until explicitly assigned.
The administrative client is never used for normal directory, settings, audit, or role queries.

## Phase 1 data

- Identity: organizations, profiles, memberships.
- Authorization: roles, permissions, role_permissions, membership_roles.
- People: departments, employees, employee_manager_assignments.
- Client sharing foundation: clients, client_assignments (no services/billing rules).
- Governance: invitations, audit_logs.

Database reads are RLS-scoped. Authenticated users have no direct table mutation grants. Only explicitly granted RPC functions accept mutations. Audit tables have no application update/delete path. Private helper functions pin the search path and are not exposed in the public API schema.

## Approved grant model

Owner grants any role to another appropriate account. System Administrator grants standard roles only and controls normal accounts only. Owner appoints Finance/HR Administrators; they can delegate their respective sensitive read access but cannot grant administrator roles. No actor can modify their own account access. Ownership transfer is transactional and leaves an active owner.

Sensitive-role accounts need AAL2 in both server authorization and database permission helpers. An inactive membership loses access regardless of cached browser navigation or session validity.

## Future boundaries

- Jira: integration worker, event inbox, idempotent processing, reconciliation, credential vault, issue snapshots, approved mappings.
- Attendance: authoritative timestamps and separate break records; versioned policies and reproducible calculations; correction approval history.
- Chat: durable messages, membership-controlled private realtime channels, attachment permissions and retention.
- Reporting: permission-scoped definitions, explicit formulas, background export jobs, private expiring files.
- Realtime: only approved module events; not connected in this empty Phase 1 workspace.
- Backup: independent encrypted database/storage exports, documented RPO/RTO after owner approval, scheduled restore testing.

No table or behavior for future business workflows is silently enabled by this foundation.
