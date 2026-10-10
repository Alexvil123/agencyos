# CRM setup verification — 9 October 2026

Implemented core modules load and their backing database/provider connections are available. This is a verification of the current local deployment, not a claim that every planned module or every production write has been exercised.

## Validation

- Full suite: **143/143 tests passed**; production build, full ESLint and TypeScript checks passed.
- Live browser session: Owner Alex; existing employee records and provider connections inspected.
- Supabase attendance, breaks, work sessions, corrections, announcements, employee profiles, chat tables and private photo storage available.
- No employee passwords, attendance, task status, sheet cells, announcements or chat messages changed for testing.
- One manual Jira import refreshed the CRM cache. Read-only Jira/Google checks used existing server credentials; normal OAuth refresh may rotate tokens.
- Current aggregate output: [live-setup.json](/E:/Mycrm/test-results/full-verification-2026-10-09/live-setup.json).

## Numbered flow results

| Step | Menu / flow | Observed result | Evidence |
|---|---|---|---|
| 1 | Overview | Attendance and current-task controls render. Today's attendance is closed; duplicate Clock In is disabled. Task time includes today's portion of an overnight session. | [Overview](/E:/Mycrm/test-results/full-verification-2026-10-09/05-overview.png) |
| 2 | Work | Team queue has 659 tasks: 657 Jira and 2 manual. Today date filter returned 4 matches; Clear filters restored all 659. Start/End controls visible; other employees' timers cannot be operated from Owner login. | [Work](/E:/Mycrm/test-results/full-verification-2026-10-09/02-work.png) |
| 3 | Clients | 657 Jira work issues: **640 labelled + 17 unlabelled**. Current remote snapshot and cache match, with zero missing issues. Client labels are not counts of all issues. | [Clients](/E:/Mycrm/test-results/full-verification-2026-10-09/03-clients.png) |
| 4 | Source | 78 SOURCE records displayed separately from task work/timers. Actual Jira status names are retained. | [Source](/E:/Mycrm/test-results/full-verification-2026-10-09/04-source.png) |
| 5 | Sales | All 15 Google tabs read successfully. Tracksheet shows 458 rows without page navigation. Search with a nonexistent value returned zero matches; clearing restored 458. Formula protections remain. | [Sales](/E:/Mycrm/test-results/full-verification-2026-10-09/01-sales.png) |
| 6 | Attendance | India timestamps, working, break, combined duration, overtime and daily target render. One pending correction exists; Owner cannot approve own request. | [Attendance](/E:/Mycrm/test-results/full-verification-2026-10-09/11-attendance.png) |
| 7 | My account & time | Own timesheet includes recorded session timestamps. Continue-work request asks for date only; approval enables the user to click Clock In, rather than fabricating an automatic clock-in. | [My time](/E:/Mycrm/test-results/full-verification-2026-10-09/12-me.png) |
| 8 | Team | 11 employee profiles, 9 departments, 9 Jira identity links. Profile database fields and private photo bucket are ready. | [Team](/E:/Mycrm/test-results/full-verification-2026-10-09/07-team.png) |
| 9 | Team Chat | 10 other active employees appear as personal contacts. New Group button present; Alex currently has zero visible groups. Membership privacy and group images covered by isolated database tests; no test group/message sent live. | [Chat](/E:/Mycrm/test-results/full-verification-2026-10-09/08-chat.png) |
| 10 | Announcements | Owner publishing form loads. No announcements currently exist. Notification date/time formatting tested; no announcement published for this audit. | [Announcements](/E:/Mycrm/test-results/full-verification-2026-10-09/09-announcements.png) |
| 11 | Reports | Work report rendered and CSV actually downloaded, 1,672 bytes with 17-column header. Excel/PDF artifact tests passed; their browser downloads were not repeated. | [Reports](/E:/Mycrm/test-results/full-verification-2026-10-09/06-reports.png) |
| 12 | Settings | Supabase ready, Jira OAuth connection saved and live reads successful. Automatic Jira fetch **Off**. Client onboarding automation **Active**, background check interval 30 seconds while CRM server is running. | [Settings](/E:/Mycrm/test-results/full-verification-2026-10-09/10-settings.png) |
| 13 | Campaigns | Explicit planned workspace; not implemented. | [Campaigns](/E:/Mycrm/test-results/full-verification-2026-10-09/13-campaigns.png) |
| 14 | Analytics | Explicit planned workspace; not implemented. | [Analytics](/E:/Mycrm/test-results/full-verification-2026-10-09/14-analytics.png) |
| 15 | Finance | Explicit planned workspace; not implemented. | [Finance](/E:/Mycrm/test-results/full-verification-2026-10-09/15-finance.png) |

CSV download: `C:\Users\vps\Downloads\work-report-2026-10-09-2026-10-09.csv`.

## Configuration and data still needing attention

1. **Automatic Jira fetch is Off.** Five remote issues were initially absent from the cache; the manual sync brought it current. Keep Off for manual imports, or explicitly enable On for background imports. CRM-originated issue edits still verify live Jira permissions/workflow. Current scope is OCT, SEP and SOURCE.
2. **Profiles are incomplete:** birthdays 1/11, phones 2/11, photos 2/11, Employee IDs 0/11. Birthday wishes depend on actual saved birthdays. These missing values were not invented.
3. **Overnight timing needs human review:** Oct 8 attendance ran from 12:32:49 pm until Oct 9 9:35:07 am. One task session ran from Oct 8 4:05:48 pm until Oct 9 9:18:36 am. This explains the 09:18:36 task time on Oct 9 despite a separate 21-second Oct 9 attendance. Records are internally consistent but may represent a missed stop; use corrections for actual worked time.
4. **One Alex correction remains pending.** Another authorized approver must review it. This audit did not grant anyone new approval permissions.
5. **Jira timer-to-status automatic mappings remain unconfirmed.** The UI offers actual-status fetching and mapping configuration. The requested manual status selection remains the safe current workflow; no mapping names were assumed.
6. **Always-on hosting is not verified.** Background workers require a running CRM server; localhost cannot continue when this machine/server is stopped.

## Visual findings

- Work has a wide table at the current desktop viewport; some timing columns require horizontal scrolling. Keep task controls/time columns easy to reach in a future layout pass.
- Attendance rows compress name/date and daily-target/state together without comfortable separation. Settings integration intro has smaller, denser text than other cards. These are presentation improvements, not failed database connections.
- Dev navigation briefly shows Preparing/Updating states, then data renders. This audit does not establish production latency or mobile/accessibility compliance.

## Verification limits

Live testing used Owner's existing session, not each employee's credentials. Sensitive role boundaries, chat membership, timer/break transitions, correction approval and provider write behavior were exercised by the isolated test suite; real employee time and external Jira/Sheets writes were deliberately not changed during the live audit. No claim of fully tested production two-way writes, concurrent load, recovery, or deployment uptime is made.

Audit-only code added: `scripts/verify-setup-readonly.ts`. No application features or permission settings changed in this verification.

## Follow-up correction: personal chat profile photos

The original chat audit checked contact count and membership handling but missed profile-photo propagation. The personal-contact UI displayed initials and the chat feed did not include employee photos. This was an implementation gap, so the earlier verification must not be read as confirming that display.

Fixed the server feed to resolve photo paths only for the authenticated employee's same-organization active chat directory, return private signed URLs, and render photos in personal contacts and the conversation header. Murugesh and Nanjil Manohar S's existing images both loaded successfully in the live browser (`complete && naturalWidth > 0`). No profile data or storage visibility changed. [Live proof](/E:/Mycrm/test-results/chat-profile-photos-2026-10-09.png).

## Deeper interaction review after user feedback

The initial verification was too broad in its conclusion: page availability and passing database tests did not establish that all frontend feature connections worked. Additional findings and fixes:

| Finding | Correction | Evidence level |
|---|---|---|
| Clicking the selected personal conversation again cleared its unsent draft and message state until the next refresh. | Reselecting the same conversation preserves its current state. | Reproduced live before the change; repeated click afterwards preserved draft and enabled composer. Draft cleared afterwards; no message sent. |
| Polling the latest message page could restore `more=true` after the oldest history had been exhausted; history-page merges could duplicate messages. A failed poll discarded visible history. | Merge by message ID, preserve the older-page frontier during latest polling, retain messages on failed reads. | Two new regression tests; no existing conversation had enough live messages to exercise pagination. |
| Open employee profile held a snapshot object, so revalidated directory props did not update the open profile summary/photo. | Store only selected employee ID and derive displayed details from current directory data. Successful profile saves broadcast the workspace change event to other open CRM tabs. | Code-path review and TypeScript/lint; no real profile changed to simulate a save. |

Live New Group dialog inspection confirmed group name, optional photo and all 10 other active employee checkboxes. Notification bell inspection showed announcements only and the correct empty state. No group was submitted. Opening the personal contact may lazily create/reuse an empty direct conversation; no messages were transmitted.

After these changes the full isolated suite passed **145/145**, production build passed, and changed-file lint plus TypeScript checks passed. These results include backend employee scope, group membership, timer/break rules, Jira canonical cache, filters and export generation. They still do not prove live concurrent multi-employee use or real provider writes. The browser runs as Owner; no employee credential was requested or impersonated. [Corrected conversation proof](/E:/Mycrm/test-results/chat-interaction-review-2026-10-09.png).

Current verification boundaries remain explicit: profile save → open popup update was corrected by code review, long-history pagination by regression tests, and repeated chat selection by actual browser interaction. None should be described as universally proven by merely loading the page.

## Subsequent live round-trip verification

The later [end-to-end verification report](END-TO-END-VERIFICATION-2026-10-09.md) adds real authenticated employee/Owner checks in a disposable workspace, Google scratch-sheet writes, Jira fixture writes/cache read-back, the required-label Jira create fix, and cleanup evidence. Its final suite is **146/146**. The earlier no-provider-write and Owner-only statements above describe the initial audit, not this later run. Remaining UI and deployment limits are recorded in the new report.
