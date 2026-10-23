# Jira integration setup

Status: local CRM UI and server actions implemented and verified. Migration 006 applied successfully to Supabase project nzkebyggxagbpdjouuhj on 6 October 2026 after Alex confirmed "Apply pannu". Jira credentials are not configured; live task synchronization is not verified.

## Confirmed by Alex

Migration 007 hardens default Supabase table privileges: authenticated users have only RLS-controlled SELECT; anonymous users have none. Direct INSERT/UPDATE/DELETE/TRUNCATE is denied. Narrow audited RPCs remain the mutation route.

- Site: https://vilpowerdigitalmarketing.atlassian.net/
- Direction: CRM ↔ Jira task and status updates.
- Use existing Jira execution workflow; do not invent completion or approval rules.
- Free services only.
- Projects: one per month (JAN … DEC, for example OCT, SEP, NOV) plus SOURCE. A month project is picked up by the next sync as soon as it exists in Jira; nothing needs changing. Anything outside these twelve and SOURCE is ignored.
- CRM displays the same Jira status names and uses available Jira transitions.
- Employees: currently assigned tasks only; view and edit title/description/status. Owner alone creates tasks.

## Observed on 6 October 2026

- Signed-in Jira account: digitalmarketing@vilpower.com.
- Recent projects: October 2026 (OCT), September (SEP), Source Board (SOURCE).
- OCT board columns: To Do, Content In Progress, Client Content Approval, Shoot Needed, Design To Do, Design In Progress, Thumbnail Waiting, Design Hold.
- Board had an existing assignee filter. This observation is not a full issue or workflow inventory.
- Browser login does not authenticate the CRM backend. No Jira API credentials have been collected or saved.
- No Jira issues were created or changed during discovery.

## Implemented behavior

Authentication compatibility update: connection verification probes normal personal API tokens at the fixed Jira site, then only on HTTP 401/403 probes scoped tokens at the fixed Atlassian gateway for cloud ID `f60b8e24-9101-423d-b785-d792219922aa` observed in this site's Jira login redirect. The successful token type is stored server-side. Mutations never automatically switch endpoints or retry. Input email/token whitespace is trimmed; UI distinguishes 401 invalid credentials from 403 access/scopes restrictions. Production uses JIRA_TOKEN_TYPE=classic or scoped. Existing runtime authentication error was reported by the user; its exact root cause remains unconfirmed until they resubmit the connection form.

1. Work → Refresh tasks pulls 100 live tasks per page; Load next loads subsequent pages. Owner refreshes persist task snapshots in Supabase. This is manual two-way integration, not background automation.
2. Owner explicitly links a CRM employee membership to a verified Jira account. No matching by employee name or email. Clients have no Jira access.
3. Employee reads query live Jira by mapped assignee; every detail/edit rechecks actual project and assignee. Stale database snapshots grant no employee read access.
4. Editing checks the Jira updated timestamp before writing and stops if it changed. Jira has no atomic compare-and-set here: a concurrent external change during the request remains possible. Title/description and status use separate REST calls; partial/uncertain results require refresh and review.
5. Existing descriptions are preserved by default. Replacing with plain text requires selecting the explicit replacement checkbox because formatting/embedded content may be lost.
6. New Owner-created tasks use Jira's default status and assignee behavior. Extra required project fields may reject creation; the UI does not claim success in that case.
7. Local credential setup verifies `/myself`, then saves in ignored `.jira-credentials.local.json`, bound to the organization. Credentials never enter client props or audits. Production reads server environment variables instead.
8. Task mutations are audited before/after the operation and confirmed snapshots are saved to CRM. Ambiguous writes are never automatically retried.

Verification: 30 tests pass, including SQL RLS/service access, employee mapping, stale-cache denial, cross-assignee rejection, deactivation, project constraints, idempotent snapshots, stale-version protection, fixed API destination, and sanitized errors. Typecheck, lint and production build pass. Local Work and Settings connection UI observed in browser. Real Jira API reads/writes and employee login workflow remain unverified until credentials are configured.

Client assignment, automatic client approval/completion, and deletion propagation remain undefined and disabled.

## Technical implementation requirements

- Server-side authentication and organization/role checks for every operation.
- Server-only credentials; no secrets in client props, logs, audit payloads, or chat.
- Constrain destination to the approved Jira site and projects; disable redirects on credentialed HTTP requests.
- Use REST v3 enhanced JQL search with pagination, rather than removed legacy search routes.
- Read actual issue types, required fields, and valid transitions before rendering creation/status controls.
- Persist Jira issue IDs and project IDs, not just mutable display names.
- Track sync progress, errors, and ambiguous outcomes honestly; do not automatically retry uncertain create operations.
- Prevent sync loops and preserve an audit trail. Conflict semantics require approval before implementation.
- Public hosting/scheduler/webhook deployment is still pending; do not describe localhost as an always-on sync service.

## Official references

- [Authentication](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)
- [OAuth 2.0 authorization](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Enhanced issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Issues and transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)
- [Project discovery](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/)

## OAuth implementation — prepared, live connection pending

Owner-only OAuth connect/callback routes are implemented. The callback is `http://127.0.0.1:3000/integrations/jira/callback` for this local server. Requested scopes are `read:jira-work`, `write:jira-work`, `read:jira-user`, and `offline_access`; the selected resource must match the approved Jira site. The classic write scope bundles additional Jira capabilities, although CRM exposes only the approved task operations.

Migration `202610060008_jira_oauth.sql` is tested but has not yet been applied to the live database. It provides service-only encrypted token storage, one-use expiring Owner-bound OAuth state, and a database lease for rotating refresh tokens. The encryption key and app secret remain in ignored server-only local configuration, or server environment variables in production. Next development logs suppress server-action arguments and OAuth callback request URLs.

Verification: all 38 tests, typecheck, lint, and production build pass. Atlassian callback/scopes, existing app credential setup, live migration, and user consent are still pending. No successful live OAuth connection is claimed.

OAuth deployment update: user approved setup. Atlassian app's three classic Jira scopes and localhost callback were saved. Existing app credentials were stored in ignored local server configuration without exposing the secret. Migration 008 ran successfully on Supabase. User OAuth consent and live task retrieval are still pending.

Live OAuth verification: user consented, but token exchange failed. Browser clipboard retrieval returned stale/empty content and DOM credential reads return a masked value. Invalid local configuration was removed. Owner Client ID is prefilled in CRM; the user must copy the existing Atlassian Secret into the CRM Owner setup field and submit Save OAuth app. No live OAuth connection exists yet. Callback logs now report fixed failure-stage labels only, and local configuration rejects whitespace/masked secrets.

Owner saved the actual app credential using the CRM form. OAuth callback returned connected, verified Jira /myself, encrypted and persisted tokens, and recorded the connection audit. Live task retrieval is being verified; no real Jira task mutations were performed.

Live integration verified: Work → Refresh tasks successfully fetched the first 100 real Jira issues across OCT, SEP and SOURCE and saved them to the CRM database with sync audit confirmation. Existing Jira statuses and assignees appear in the UI; additional pages are available. Employee identity mapping remains pending explicit Owner choices. Jira create/edit/status writes and automatic refresh-token rotation have not been exercised against real tasks. Sync remains manual on Refresh/Save.

Owner explicitly confirmed nine identity mappings and requested exact Jira names in CRM. Applied all nine links using existing Owner-checked audited RPCs in a transaction. Updated Nanjil to Nanjil Manohar S and Muthu Buvanesh to Muthu through update_directory_record, preserving email, department, and job title; corresponding login profile display names are synchronized. Verified nine persisted links and updated names in Team. Employee interactive sign-in remains untested. Alex, Prince, and Tharani were outside the confirmed mapping set.

## Status categories across month projects

Jira keeps a separate status, with its own category (To Do / In Progress / Done), in every month project. SEP has the pipeline statuses categorised correctly, but OCT only had Done as Done, so Posted, Client Approved and Design Completed looked open and could be started. The CRM now applies the SEP category per status name to every month project (`statusCategoryFor` in `src/lib/jira-types.ts`): Done, Posted, Client Approved and Design Completed are closed; Design In Progress, Client Sent, Client Content Approval and Design Hold are in progress; To Do, Design To Do and Shoot Needed are not started. Other statuses and the SOURCE project keep the category Jira reports. Fixing the categories in Jira (Settings → Issues → Statuses) gives the same result.
