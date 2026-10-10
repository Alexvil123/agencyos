# CRM senior developer audit — 7 October 2026

**Verdict:** A useful internal team-work foundation with a consistent visual direction. It is not yet ready for unrestricted team rollout or a “complete production CRM” claim. The main remaining work concerns report accuracy, operational setup, Jira continuity and deployment configuration—not just appearance.

Scope: current localhost application, authenticated Owner UI, source and migrations in E:/Mycrm, and existing automated checks. Product Design audit workflow was used for screenshot evidence. No employee accounts, passwords, shifts, permissions or timer activity were deliberately changed during this review. Opening Work can run its normal background Jira import; this audit does not claim that the application performed no background writes.

## Verification and boundaries

- Current run: **62/62 tests passed**, production build passed, ESLint passed.
- Tests exercise database permission rules, employee provisioning protections, time tracking and approvals, Jira assignment/conflict checks, OAuth protections and report/export helpers.
- Passing checks establish useful coverage; they do not prove every live workflow.
- Live UI inspection used the Owner session. Employee login, account provisioning, clock-in/break/task mutations, correction submission/approval and ownership transfer were not performed against real business records.
- Desktop evidence is at the browser’s ordinary approximately 1176px-wide viewport. Mobile, screen readers, keyboard-only navigation, 200% zoom and measured WCAG contrast were not comprehensively tested.
- No penetration test, dependency advisory audit, load benchmark, hosted release, backup restore or disaster recovery drill was performed.
- Jira status mappings remain unconfirmed. Keeping automatic transitions disabled is correct under the user’s instructions.
- Client sign-in is intentionally unavailable under the latest team-only scope; that is not a defect.

## Highest-priority findings

### 1. P1 — Imported Jira dates can mislead historical reports

The import gives tasks an assignment date based on CRM insertion/reassignment time, and can give completed tasks a completion date based on Jira’s general last-updated time. Those values do not establish when Jira assignment or completion actually occurred. “Assigned today” and average completion elapsed time can therefore describe import timing instead of employee delivery.

Evidence: [migration](E:/Mycrm/supabase/migrations/202610060011_unified_work.sql:165), assignment default at line 10 and update at line 167; report calculations in src/lib/work-report.ts; screenshot 08.

Fix: preserve import/first-seen timestamps separately; fetch authoritative historical dates where available, label unknown history and exclude inferred dates from employee performance comparisons. CRM timer records should remain based on explicit employee actions.

### 2. P1 — Task metadata does not support reliable client/department reporting yet

Visible imported rows show “No client”; Jira configuration has no saved client-to-project mappings. Imports do not retrieve Jira priority, and do not populate task department/client fields. Displaying a default Medium priority risks implying that it came from Jira. Department filters act on task department, so employee department membership alone does not fill this gap.

Evidence: screenshots 02, 10 and 15; [import field list](E:/Mycrm/src/app/work-actions.ts:21), [remote mapping](E:/Mycrm/src/lib/work-server.ts:10).

Fix: provide an explicit reviewable client mapping and task department policy; import priority or label it unspecified. Confirm coverage before using client-wise or department-wise reports for decisions.

### 3. P1 — Assigned Jira title/description editing is missing in the unified Work screen

Jira task details render plain text. Only manual tasks render the editable TaskForm. This does not satisfy the previously agreed assigned-employee title/description/status editing experience, even though other Jira editing code exists.

Evidence: screenshot 15; [Jira details branch](E:/Mycrm/src/components/work-panel.tsx:38).

Fix: expose the existing server-protected edit flow in unified task details, retaining current-assignee authorization and conflict checks. Status controls and task timer controls must continue to be separate.

### 4. P1 — Attendance is blocked by unfinished setup

All 11 listed employees have no assigned shift, and clock-in is disabled. No time manager is currently enabled in the setup view. The feature exists, but the operational configuration is incomplete.

Evidence: screenshots 01, 06 and 07.

Fix: Owner assigns the approved 08:30–18:00 or 09:00–18:30 shift to each employee. Appoint only the intended time managers, then run a small attendance pilot. Do not invent shifts or grant manager access automatically.

### 5. P1 — Continuous Jira-to-CRM sync is not established

Current Work loads/imports the first 100 updated Jira issues and exposes “Import next page.” The 30-second manager refresh reads CRM data; it is not a 30-second Jira API sync. Employee cached refresh also differs from manager refresh. Current local webhook configuration has no webhook secret/organization values. A 300-task cache does not prove complete Jira coverage.

Evidence: screenshot 02; [import pagination](E:/Mycrm/src/app/work-actions.ts:21), [refresh effect](E:/Mycrm/src/components/work-panel.tsx:21), [webhook configuration](E:/Mycrm/src/app/integrations/jira/webhook/route.ts:6). Configuration presence was checked without exposing values.

Fix: show last successful Jira sync, backlog/page coverage and failures; complete initial backfill; configure authenticated HTTPS webhooks or a controlled scheduled import. Include reconciliation for deleted/moved/unassigned issues. Keep automatic workflow transitions disabled until project mappings are confirmed.

### 6. P1 — Local OAuth success will not automatically survive production deployment

The current local environment does not contain the production Jira OAuth client ID/secret variables; development uses a local app configuration fallback. The implementation deliberately disables that fallback in production. A successful build therefore does not establish a working hosted Jira connection.

Evidence: [production configuration rule](E:/Mycrm/src/lib/jira-oauth-server.ts:24). Only variable-presence flags were inspected; no secret values are included in this report.

Fix: configure production organization, OAuth app credentials, encryption key, HTTPS APP_URL and approved callback URL securely. Verify refresh and reconnect in a hosted staging environment.

## Other findings

### P2 — Dashboard metrics and statuses need clearer meanings

“Today’s Tasks” mixes tasks assigned/completed/worked today, while its overdue count covers the wider backlog. The Team view shows 1 completed, 11 pending and 112 overdue under one daily heading. Those counters do not have a shared denominator.

A row can correctly have separate CRM and Jira states, but the screen labels them too weakly: OCT-1460 shows CRM “To Do” and Jira “Design Completed.” This is confusing unless both states are explicitly named. Do not make Jira status fabricate timer activity to resolve the visual mismatch.

Default due-date sorting brings old August/September tasks above current October work. Add an explicit overdue backlog view and an actionable current-work view.

Evidence: screenshots 02 and 15; src/components/work-dashboard.tsx.

### P2 — Data fetching will become expensive as history grows

Work loading fetches broad time history across multiple tables, then fetches work sessions separately. Manager polling repeats this. Workspace navigation also loads common employee/client/role data across pages. Limits guard against presenting incomplete exports, but do not replace date filtering, pagination or aggregation.

Evidence: [work load](E:/Mycrm/src/app/work-actions.ts:14), src/app/time-actions.ts and src/lib/data.ts.

Fix: select only the relevant date range and scope, paginate histories, use summary aggregates and remove duplicate reads. This is a source-level scaling concern; UI tool delays were not treated as a measured performance benchmark.

### P2 — Navigation promises more than it delivers

- Global Create disables Task even though manual task creation exists inside Work.
- Global search promises tasks/clients/employees, but its search results cover pages and visible employees.
- Reports renders work reports and attendance reports with separate navigation/filter blocks, making the page long and their scopes easy to confuse.
- Settings integration controls precede the settings navigation in the page content, making navigation difficult on the long integration screen.
- Recent Activity repeats generic “Update Time Tasks” entries without useful actor/task context.
- Help and Phase 1 text are stale; README describes earlier MFA/provisioning behavior.

Evidence: screenshots 01, 08 and 10; [workspace UI](E:/Mycrm/src/components/workspace.tsx:83).

Fix: connect common entry points to real features, label report types and filter scope, move settings navigation above content, improve audit event rendering and update documentation.

### P2 — Desktop density and accessibility need a focused pass

At the observed desktop width, task tables require horizontal scrolling to reveal important columns and actions. Small pale secondary text is difficult to read; a long employee modal places the final action below the first viewport. These are usability/accessibility risks visible in screenshots, not a WCAG compliance determination.

Fix: improve table prioritization, provide clearer text and focus states, keep long-form actions accessible, and test keyboard, zoom, mobile and screen-reader behavior.

### P2 — Maintainability and release operations need attention

Large compressed components and accumulated styling overrides make changes hard to review. This directory is not currently a Git repository. A repeatable release, CI verification, monitoring and database restore procedure were not demonstrated by this audit.

Fix: establish version control and release ownership; refactor high-change panels incrementally; document deployment variables/migrations; verify backup restoration and error monitoring before team dependence increases.

## What is already strong

- Visual hierarchy, white/lavender palette, sidebar and card layout are consistent with the supplied reference direction.
- Owner administration has a meaningful server/database permission boundary, rather than relying only on hidden controls.
- Sensitive role/account operations use confirmation and auditing; tests cover Owner protection and unauthorized escalation.
- Employee account creation handles Auth/database failures and cleanup cases.
- Time controls use explicit employee actions; Jira status imports do not create fabricated work sessions.
- Conflict checks, server-side assignment checks and uncertain Jira-write handling are valuable safeguards.
- India-time calculations, closed-session reporting and spreadsheet formula escaping have automated coverage.
- Empty and planned states generally avoid displaying invented business data.

## Captured screen walkthrough

Each screenshot below was captured and inspected during this audit. “Working UI” means the current screen rendered and could be inspected; it does not assert a completed live write workflow.

### 01 — Overview / My View — Needs setup

Consistent visual hierarchy and clear empty state. Shift not assigned disables clock-in. Table scrolling and repetitive activity reduce clarity.

![01 Overview](E:/Mycrm/docs/audit-2026-10-07/01-overview.png)

### 02 — Team work overview — Needs metric clarity

300 cached tasks visible. Daily/backlog counts and dual statuses need clear labels; client mapping is absent in shown rows.

![02 Team work](E:/Mycrm/docs/audit-2026-10-07/02-team-work.png)

### 03 — Employee directory — Working UI

11 employees and 9 departments displayed. Some job titles/department data remain unspecified; verify completeness through Owner review.

![03 Team](E:/Mycrm/docs/audit-2026-10-07/03-team.png)

### 04 — Add employee — Working form, submission untested

Login email/password setup and standard-access confirmation are present. Long modal requires scrolling to final action. No account created in this audit.

![04 Add employee](E:/Mycrm/docs/audit-2026-10-07/04-add-employee.png)

### 05 — Clients — Basic directory

14 saved clients displayed. This is a directory, not a full client account/billing/service workflow. Client login remains intentionally disabled.

![05 Clients](E:/Mycrm/docs/audit-2026-10-07/05-clients.png)

### 06 — Attendance — Blocked until setup

Rules and break separation are visible; actual clock-in/out was not exercised.

![06 Attendance](E:/Mycrm/docs/audit-2026-10-07/06-attendance.png)

### 07 — Shift / time manager setup — Incomplete

All 11 employees unassigned; Owner must set approved shifts and intended approvers.

![07 Shift setup](E:/Mycrm/docs/audit-2026-10-07/07-shift-setup.png)

### 08 — Reports — Needs accuracy and structure fixes

Visible metrics need trustworthy assignment/completion dates. Duplicate reporting blocks and filters need a clearer structure. Actual downloaded PDF/XLSX/CSV files were not validated in this audit.

![08 Reports](E:/Mycrm/docs/audit-2026-10-07/08-reports.png)

### 09 — Company settings — Working UI

Agency and office settings rendered. No configuration changed.

![09 Settings](E:/Mycrm/docs/audit-2026-10-07/09-settings.png)

### 10 — Jira settings — Connected locally, setup pending

Stored OAuth connection and fetched project statuses visible. Automatic transitions correctly disabled pending mapping; client project mappings absent. Production/webhook setup is separate.

![10 Jira settings](E:/Mycrm/docs/audit-2026-10-07/10-jira-settings.png)

### 11 — Users / roles — Working UI; permission checks tested

Owner and employee accounts active. Sensitive role controls and confirmations displayed. No roles/passwords changed; live cross-account authorization was not tested.

![11 Users](E:/Mycrm/docs/audit-2026-10-07/11-users.png)

### 12 — Sales — Planned

No live lead/proposal workflow implemented.

![12 Sales](E:/Mycrm/docs/audit-2026-10-07/12-sales.png)

### 13 — Finance — Planned

No live invoicing/payment workflow implemented.

![13 Finance](E:/Mycrm/docs/audit-2026-10-07/13-finance.png)

### 14 — Communication — Planned

The NEW navigation label can suggest availability even though the screen is planned.

![14 Communication](E:/Mycrm/docs/audit-2026-10-07/14-communication.png)

### 15 — Unified Jira task details — Editing gap

Details open successfully, but Jira title and description have no editing fields. The screenshot also shows the independent CRM/Jira states and horizontal table scrolling.

![15 Jira task details](E:/Mycrm/docs/audit-2026-10-07/15-jira-task-details.png)

Campaigns and Analytics are also marked planned in src/lib/modules.ts; they were source-reviewed, not separately captured in this screenshot walkthrough.

## Recommended delivery sequence

1. Correct historical date semantics and metadata mapping before trusting employee reports.
2. Restore assigned Jira title/description editing and clarify CRM/Jira status labels.
3. Assign shifts, designate intended approvers and run a small real employee attendance/timer/correction pilot.
4. Establish complete import coverage, visible sync health and production Jira configuration.
5. Simplify reports/search/create/settings and verify mobile/accessibility/downloads.
6. Establish Git, repeatable deployment, monitoring and a tested restore path.

The employee-worktracking scope should be stabilized before expanding the five planned commercial modules.

