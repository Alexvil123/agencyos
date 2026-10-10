# Client counts, navigation and report exports — 9 October 2026

## Verified results
- Complete Jira snapshot and current saved board both contain 652 unique issues: 635 with client labels and 17 without labels. Label assignments total 635 in this snapshot.
- Six stale cached issues are marked unavailable after a fully validated snapshot. Their work sessions and history remain stored. Manual tasks, newer updates and other account scopes are protected.
- Owner Clients > NTT > View & edit tasks opens Team tasks directly with NTT selected. The board shows 68 matching tasks (10 initially rendered). Employee assignment permissions remain unchanged.
- CSV, Excel and PDF weekly exports for 5–11 October were generated through the live UI and downloaded to the user's Downloads directory. A persistent Download link remains visible after generation.
- The export helper attaches its anchor before clicking, and the Blob URL remains valid until a replacement download or component unmount.
- Historical reports preserve unavailable issues and recorded work, so their historical cohort counts can exceed the current Jira board count.

## Validation
- Production build passed.
- Final TypeScript check passed.
- Full suite: 129 tests passed, 0 failed, including complete-snapshot retirement safeguards and parsing CSV/Excel/PDF export content.
- Screenshots: test-results/client-report-fixes-2026-10-09/client-work.png and reports.png.
- Password settings and password behavior were not changed.