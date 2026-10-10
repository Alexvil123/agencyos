# Priority implementation and verification — 9 October 2026

## Fixed

- Work GET reads now abort after 30 seconds. A timed-out request clears its validator and releases the in-flight slot so a later refresh can recover. Added a regression test with a hanging request followed by a successful fresh read.
- A recovered Work refresh clears only its own connection-error notice, retaining task-save/status messages.
- Sign-in policy, profile and role lookups now start together after membership verification, removing one sequential database round trip. Current auth, active membership, role grants and sign-in policy are still checked on every request.
- Deployment audit found local provider credential files referenced by Next.js server file traces. Added global file-trace exclusions and restricted persistent worker instrumentation to development. Rebuilt and scanned every production server trace, including instrumentation: **zero local credential, environment or verification files remain**. No bundle had been uploaded before this fix. Production unattended workers now explicitly require a supported scheduler.

152 regression tests passed. Production build, TypeScript and changed-file ESLint passed.

## Live read and Jira refresh

Remote Jira read: OCT 245, SEP 414, SOURCE 78 = 737 issues. Work has 659 Jira issues: 642 labelled and 17 unlabelled. Two newly added Jira issues were initially absent from the saved cache because Automatic Fetch was Off. The Owner's manual Sync Jira completed successfully; Team Work then showed 661 total tasks including the two existing manual tasks. SOURCE remains separate. Automatic Fetch remains Off.

Work Today filter showed only tasks with due/work date 9 October. Exact Jira status/client/project options and per-assignee timer restrictions were visible. No real employee timers or Jira task fields were changed during these checks.

A second authoritative read after manual sync confirmed **zero missing cache issues** and identical remote/saved labelled totals (642). Workflow API access also succeeded separately for all three projects: OCT 16 statuses, SEP 16, SOURCE 19. SOURCE's statuses are its existing client/source organization names, not the production task workflow; no invented mapping was enabled.

All 15 Google workbook tabs were fetched and parsed read-only. Tracksheet has 458 rows; Leads 130. Formula-containing tabs also parsed successfully. This check did not edit business rows. The Sales keyboard UI test timed out in browser automation and is not counted as passed. Previous scratch-provider round trips remain separate evidence; they do not prove every production validation/UI path.

## Employee UI journey

Used a separate organization and two disposable accounts. The employee signed in through the real login UI, clicked Clock In, created an Other-client manual task, and clicked Start. The button changed to Hold and the running timer appeared on Overview.

Start Break automatically held the task. End Break automatically resumed it; the 45-second break was excluded from task work. End completed the task. Work displayed Start again; restarting preserved its prior 1m30s and created another session. Ending again produced 2m14s total closed task work.

Clock Out showed a review dialog and persisted after confirmation. Clock In then became disabled. Employee Reports matched:

| Metric | Recorded result |
|---|---|
| Working attendance | 00:09:45 |
| Break | 00:00:45 |
| Combined | 00:10:30 |
| Closed task work | 00:02:14 |
| Overtime | 00:00:00 |

CSV export completed at `C:\Users\vps\Downloads\work-report-2026-10-09-2026-10-09 (1).csv`.

Proof: `test-results/employee-ui-clockout-2026-10-09.png` and `test-results/employee-ui-report-2026-10-09.png`. The temporary organization, both accounts and all created data were removed afterward. Real employees remain untouched. Date-only correction approval was previously verified through authenticated RPCs; it was not repeated through both approver and requester UI in this pass.

## Launch status and remaining work

Netlify account login verified for the user's Vilpower team. Official CLI 27.12.0 was verified after recovering from an incomplete npm cache installation. The user explicitly approved Netlify CLI access; the browser confirmed Authorization Granted, and CLI sign-in confirmed the authorized account. Created/linked free project `vilpower-agency-crm`, ID `1c80574d-86c8-4b3a-8071-07bef6d4fece`, intended URL `https://vilpower-agency-crm.netlify.app`. The project is not yet a published CRM deployment.

Prepared 13 allowlisted environment variables in ignored `.netlify/production.env` without displaying secret values. Automatic approval review rejected uploading the Supabase/Jira/Google secrets because hosting/CLI approval did not specifically authorize that transfer. No provider credentials have been sent to Netlify. Requested exact destination-and-credential approval; deployment remains pending this decision. Existing `netlify.toml` config is appropriate for detected Next.js builds. See `FREE-HOSTING-LAUNCH.md` for protected runtime settings, OAuth callbacks, background automation and backup requirements.

Authenticated database/network latency remains; this change removes a sequential read but does not establish a measured universal speedup. Local persistent timers require a supported production scheduler before unattended Jira/Sales synchronization can be promised. Campaigns, Analytics and Finance remain planned modules, not completed workflows. Employee profile input remains incomplete: only 1 birthday, 2 phone numbers and 2 photos supplied; employee IDs were not supplied for the 11 employees.
