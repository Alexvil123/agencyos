# CRM menu verification — 8 October 2026

Checked the running localhost CRM as Alex/Owner, read the current routes/components, and reran the existing test suite: **126 passed, 0 failed**. This is an implementation and live smoke-check report, not a claim that every production write workflow is certified.

Ten menus contain implemented core functionality; four are planned placeholders. Reports and Clients need follow-up work before calling them fully polished.

## Menu checks, in navigation order

| Step | Menu | Implementation and current check |
|---|---|---|
| 1 | Overview | Implemented. Existing clock-in, break, working and task totals render and tick. Current task Hold/End visible. Attendance action behavior covered by database tests; live attendance was not changed. |
| 2 | Sales | Implemented. Live Google connection; 15 tabs discovered. Tracksheet loaded 458 rows. Positive filter returned 9; deliberately unmatched search returned 0, then filters were restored. Other tabs' individual contents and actual edit/add/delete writes were not all exercised. |
| 3 | Clients | Implemented from Jira labels. Cached view initially showed 22 labels / 658 tasks. NTT search returned one label with 70 tasks. Owner link opens My assigned tasks, yielding an empty result until Team tasks is selected: usability defect. Automatic Fetch Off still displays misleading 'Connecting to automatic Jira sync' copy. |
| 4 | Work | Implemented. Own/manual and team/Jira views, actual Jira statuses, due/created dates, task controls and simple manual-create form verified. Owner Team + NTT showed 70 tasks. Successful manual Sync Jira while Automatic Fetch Off returned 652 non-SOURCE tasks at 17:33. Actual Jira edits/timer writes were not performed in this run. |
| 5 | Source | Implemented separately. 78 reference records loaded; NTT status filter returned 10. No work timer controls on these references. Edit/write flow not exercised. |
| 6 | My account & time | Implemented. Own attendance and six task segments rendered. Timesheet/correction form and password screen opened. No password or correction was submitted. |
| 7 | Attendance | Implemented. Real attendance timestamps, work/break/combined/overtime totals, reports and empty Approvals state rendered. Sample totals 04:25:51 work + 00:28:36 break = 04:54:27 combined. No approval or attendance write was made. |
| 8 | Communication | Pending. Only PLANNED WORKSPACE screen; channels/messages are not implemented. |
| 9 | Campaigns | Pending. Only PLANNED WORKSPACE screen; platform campaign connections/metrics are not implemented. |
| 10 | Analytics | Pending. Only PLANNED WORKSPACE screen; analytical trends/dashboard are not implemented. Existing operational reports are separate. |
| 11 | Finance | Pending. Only PLANNED WORKSPACE screen; invoices/payments/accounting are not implemented. |
| 12 | Team | Implemented. 11 linked employees and 9 departments. Ajith search, profile/Owner editor and employee + password onboarding form opened. No new account/profile/password changes submitted. Current passwords require 6–72 characters, so the earlier arbitrary-length request is not implemented. |
| 13 | Reports | Implemented but needs polish/verification. Work and attendance report engines render, manual source selection produced 2 tasks, closed recorded work 02:13:30. Task reports exclude active segments; attendance reports show provisional active time. There are two report/tab/filter blocks, making the page long and repetitive. Browser inspection/export attempt timed out; CSV download could not be confirmed, and Excel/PDF were not exercised. Cause of browser timeout is not established. |
| 14 | Settings | Implemented. Company, users, role controls, audit logs, Jira credentials, automatic fetch switch and employee identity mapping screens rendered. Automatic Fetch currently Off, preserved. Sync health shows successful Jira/Google reads, no pending Jira transitions/conversion review/unconfirmed saves; Google verified-write health is 'Not checked yet'. Workflow mappings were not fetched or changed. |

## Follow-up findings

1. Fix Owner Clients → Work navigation to open the appropriate team client scope, without expanding employee access.
2. Correct Clients' automatic-sync copy in Off mode.
3. Reconcile authoritative Jira snapshot availability across Work, Clients and reports. Saved Clients count was 658 both before and after the successful remote Work fetch returned 652 non-SOURCE issues. This is a confirmed cross-screen count mismatch; the reason those six issues are absent remotely is not established. Work's snapshot merger hides absent records locally, while manual sync imports returned records without a persistent whole-snapshot removal reconciliation.
4. Simplify Reports' duplicated work/attendance navigation and verify downloads in a reliable browser run.
5. Finish a dedicated employee-login acceptance pass: assigned scope, Jira End/status change, break pause/resume, correction approval and selected sales-team writes. Local tests cover many rules, but do not prove live provider writes.
6. Main global Create menu still disables Lead/Task even though these actions exist inside Sales/Work; Help copy still describes the old Phase 1 foundation. These are discoverability/copy gaps from source review.

No production Sheet cells, passwords, permissions, Jira statuses or attendance records were changed for this audit. Manual Jira fetch refreshed CRM metadata. Existing Automatic Fetch Off was preserved. Desktop screenshot review found small/muted table text; full keyboard, mobile and screen-reader coverage was not performed in this audit.

## Current-run screenshot evidence

These are captured screenshots, inspected in two contact sheets. Each step links to its original screenshot. A desktop viewport only shows the visible part of long pages.

1. [Overview](../test-results/menu-audit-2026-10-08/01-overview.png) — core screen healthy.
2. [Sales](../test-results/menu-audit-2026-10-08/02-sales.png) — live Positive filter healthy.
3. [Clients](../test-results/menu-audit-2026-10-08/03-clients.png) — search healthy, navigation/copy issues.
4. [Work](../test-results/menu-audit-2026-10-08/04-work.png) — team client tasks healthy.
5. [Source](../test-results/menu-audit-2026-10-08/05-source.png) — status filter healthy.
6. [Personal time](../test-results/menu-audit-2026-10-08/06-me.png) — timesheet healthy.
7. [Attendance](../test-results/menu-audit-2026-10-08/07-attendance.png) — live report healthy.
8. [Communication](../test-results/menu-audit-2026-10-08/08-communication.png) — pending.
9. [Campaigns](../test-results/menu-audit-2026-10-08/09-campaigns.png) — pending.
10. [Analytics](../test-results/menu-audit-2026-10-08/10-analytics.png) — pending.
11. [Finance](../test-results/menu-audit-2026-10-08/11-finance.png) — pending.
12. [Team](../test-results/menu-audit-2026-10-08/12-team.png) — profile/edit form healthy.
13. [Reports](../test-results/menu-audit-2026-10-08/13-reports.png) — manual filter healthy; export unconfirmed.
14. [Settings](../test-results/menu-audit-2026-10-08/14-settings.png) — automatic fetch Off and OAuth configuration visible.
15. [Sync health](../test-results/menu-audit-2026-10-08/15-sync-health.png) — reads passed; writes not checked.
16. [Manual Jira sync](../test-results/menu-audit-2026-10-08/16-manual-sync.png) — remote fetch succeeded while Off.

![Steps 1–8](../test-results/menu-audit-2026-10-08/contact-1.jpg)

![Steps 9–14 and health](../test-results/menu-audit-2026-10-08/contact-2.jpg)
