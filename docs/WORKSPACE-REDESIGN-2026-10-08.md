# Daily dashboard, task workspace and Jira fetch control

- Overview now shows attendance/break actions beside a current-task preview, four compact time totals, five upcoming tasks, personal day information and a scoped manager team snapshot. Full work tables, filters and report tabs are removed from Overview.
- Work uses a compact current-task strip and the task queue. Repeated large summary cards and live/activity rail are removed; task actions stay pinned to the right on desktop and remain in task cards on small screens.
- Jira rows display actual Due and Created dates. Date filters distinguish Due/work date, Created date and Updated date, with From/To boundaries and a missing-date option. Created/Updated calendar dates use India time; Jira due dates retain their calendar date. No due date is invented.
- Settings → Integrations → Automatic Jira fetch stores an organization-wide Owner-managed preference. Changes are audited. Off stops automatic Work/Overview/Clients/Source list imports, background reconciliation and signed webhook imports. Manual Sync Jira remains available. Explicit task details/edits/status actions still verify live Jira access and workflow; an already-running import may finish.
- The switch was tested Off and restored to **On**. No task, attendance or Google Sheet business record was changed for testing.

Verification: 126 regression tests passed; final production build, TypeScript and changed-component lint passed. Live checks confirmed Off persistence, background importer skipping, manual Sync fetching 650 work issues while Off, On persistence, and exact 8 October Created-date filtering. Desktop Overview/Work screenshots and a 390px mobile Work screenshot were captured and inspected. Temporary filters, team scope and viewport override were restored.

Screenshots: `test-results/overview-redesign.png`, `work-redesign.png`, `work-date-filter.png`, `jira-auto-fetch-off.png`, `jira-auto-fetch-on.png`, `work-redesign-mobile.png`.

Limits: synchronization remains periodic while the server runs and is subject to Jira availability/rate limits. Separate employee logins, full keyboard/screen-reader accessibility, every project transition and external write paths were not exercised during this visual/settings check; existing permission/workflow regression tests remain in place.
