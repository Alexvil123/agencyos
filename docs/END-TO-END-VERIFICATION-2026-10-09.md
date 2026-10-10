# CRM verification — 9 October 2026

This follow-up verifies propagation using live authenticated employee/Owner requests and temporary provider fixtures, in addition to the earlier browser audit. It is not a claim that every possible production interaction is bug-free.

## Results and evidence

| Flow | Verified result | Evidence level |
|---|---|---|
| Profile update | Owner edits persisted; employee directory and chat lookup returned the updated name and private photo. Signed photo URL downloaded successfully. Employee cannot perform Owner edits or access another organization. | Live authenticated Supabase RPC/RLS and storage read-back; updated employee name also appeared in Overview. |
| Attendance | Clock In persisted; duplicate Clock In rejected. Clock Out persisted and same-day second Clock In rejected until an approved continuation request. | Browser Clock In followed by authenticated server read-back; final employee Overview showed Clocked Out and disabled Clock In. |
| Break and task time | Start Break held the running manual task; End Break resumed it. Hold/Resume/End persisted session boundaries. Completed manual task restarted without losing previous sessions. | Live authenticated employee RPCs in a separate test workspace. |
| Corrections | Date-only continuation request rejected self-approval, accepted Owner approval, and permitted explicit Clock In afterwards. Approval itself did not fabricate a check-in. | Live employee and Owner RPCs. |
| Birthday | Clock-in birthday lookup returned eligible names/photos. | Live authenticated RPC; animation appearance was not re-tested in the browser. |
| Announcements | Owner publication was visible to employee with timestamp; personal read receipt persisted. | Live authenticated RPCs, only two temporary accounts. |
| Chat | Group creation, employee message and Owner read-back succeeded within the isolated workspace. | Live authenticated RPCs. Real personal-photo display and repeat-selection behavior were browser-tested in the preceding audit. |
| Google Sheets | Created a scratch tab, edited a cell, added a row and deleted a fixture row; each operation matched a fresh read through the CRM native parser. | Real provider writes and CRM server helper read-back. Existing business cells/formulas untouched. |
| Jira | Created an unassigned OCT fixture, edited its title and performed an available workflow transition; each authoritative Jira response imported correctly into CRM task cache. | Real provider writes using application payload/import helpers; not a click-through test of the Next.js create form. |

Raw evidence:

- [Attendance/profile/timer/correction checks](../test-results/employee-roundtrip.json)
- [Announcements/chat/audit checks](../test-results/employee-social-roundtrip.json)
- [Google round-trip](../test-results/provider-roundtrip/google-report.json)
- [Jira round-trip](../test-results/provider-roundtrip/jira-report.json)
- [Cleanup verification](../test-results/cleanup-verification.json)
- [Final employee Overview screenshot](../test-results/employee-overview-verified-2026-10-09.png)

The first employee script completed 12 checks before its announcement step called an incorrectly named RPC (`publish_announcement`). This was a verification-script error. After correcting it to the application's `announcement_publish`, the remaining social checks passed in the separate social report. The original report is retained without hiding that failure.

## Application fix discovered during verification

OCT requires Labels when creating Jira issues. The previous CRM create payload omitted Labels and Jira returned HTTP 400. Creation now accepts exact Jira/client labels, validates label syntax, and includes them in the Jira payload. The confirmed issue is also imported immediately into the unified Work cache, including when automatic fetching is Off. A regression test covers preserved case, deduplication, invalid whitespace and unauthorized projects.

Previous follow-up fixes remain: personal chat photos, preservation of drafts on repeated selection, correct history merging during polling, and employee popup derivation from current profile data. See [earlier audit](FULL-SETUP-VERIFICATION-2026-10-09.md).

## Final validation and cleanup

- Regression suite: **146 passed, 0 failed**.
- Production build: **passed**, including TypeScript and route generation.
- Lint of changed application files, tests and verification scripts: **passed**.
- Scratch Google worksheet and created Jira issue/cache records removed.
- Isolated workspace, two temporary Auth accounts, records and uploaded fixtures removed. Private fixture credentials file removed.
- Read-back confirmed no verification organization/accounts/Jira cache rows remained; real employee count remained **11**.
- Real employee passwords, attendance and business spreadsheet cells were not changed.

## Explicit limits

Browser navigation intermittently timed out during local development. Failed clicks were not recorded as passes. The final employee Overview was visually confirmed, but this run did not click through every mutation form in both roles. Backend/RPC evidence does not replace that missing UI coverage.

Jira writes were exercised on one OCT issue type and an available transition, not every issue type/workflow in OCT, SEP and SOURCE. Google writes were exercised on a disposable sheet, not every production validation/formula configuration. No concurrency, always-on hosting/scheduler or provider outage recovery claim is made.

The real workspace's **Automatic Jira Fetch remains Off**. Manual sync was verified; external Jira edits will not be described as automatically fetched under that setting. Campaigns, Analytics and Finance remain planned modules from the earlier audit.
