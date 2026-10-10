# Filter and automatic synchronization review — 7 October 2026

## Changes

- Work/Overview and Source share tested search/status/project/label matching. Search trims surrounding whitespace. Exact Jira label case and status IDs are retained. Manual status and Jira status filters are independent.
- Filtered Work overview counts use the same matching records as the task table. Every filter change resets the visible row limit. Clear filters restores the full view. A selected Jira label/status that disappears after a remote update remains visible as a selection with no matches rather than silently showing a different filter.
- Client links adopt a new URL label even when the Work screen is reused. Manual client search trims whitespace and displays matching versus loaded record counts. Team search and department matching were reviewed; their existing logic already intersects both filters.
- Reports now provide exact Jira priority and Jira status filters separately from CRM work state. Jira status categories drive completion/in-progress/overdue metrics; CRM timer state never substitutes for a known Jira status category. Jira resolution dates supply completion elapsed time when available. Manual tasks retain CRM workflow meanings. Assignment cohort and closed session date clipping remain unchanged.
- Invalid report date ranges show a warning and disable exports. Changing dates switches the period selector to Custom. Missing issue types match the displayed General option.
- SOURCE stays outside operational work-session totals and reports. Database history is retained. Attendance client-time groups use exact Jira label combinations for Jira tasks and saved clients for manual tasks; multiple labels do not duplicate recorded time across groups.

## Automatic behavior

- Work, Overview, Source, Jira clients and Attendance reports refresh automatically while visible/online. No routine fetch button press is required.
- The scheduler checks again 30 seconds after a completed successful refresh. Failed reads back off to 60/120 seconds. Focus, returning to a visible tab and connectivity restoration trigger another check. Network/Jira latency affects when a completed update is displayed; this is polling, not instant delivery.
- CRM task saves, timer actions, attendance changes and confirmed Jira status saves signal other open CRM tabs through BroadcastChannel. Those tabs refresh their authorized data. The broadcast contains no business data or credentials.
- Background sync continues with an edit drawer open. It updates the board without replacing the form's captured Jira version or unsaved input. A conflicting save still stops for review. Writes are never automatically retried by the refresh scheduler.
- Existing Jira status saves use available workflow transitions, reject stale expected versions, read authoritative Jira data back, and import the confirmed result. Timer activity remains independent. Automatic START/HOLD/END workflow mappings remain disabled until separately confirmed.
- Every approved Jira search page is fetched, including newly created Jira issues. CRM manual tasks remain CRM-only and are reloaded from the database.

## Verification and limits

- 77 automated tests passed, including exact combined filters, new-task/status-change filter membership, priority separation, Jira completion/overdue, automatic polling/backoff, visibility gating, cleanup, duplicate refresh suppression, pagination, stale updates, server permissions and transition leases.
- Targeted ESLint and production build were run. No production Jira business task was created or changed for verification.
- Live browser click-through and visual output verification remain unavailable because the browser tool rejected localhost access. Automated code-level checks are not presented as browser end-to-end verification.
- `JIRA_WEBHOOK_SECRET` and `JIRA_WEBHOOK_ORGANIZATION_ID` are not configured in this local environment. The signed webhook receiver exists, but instant Jira delivery or synchronization while the CRM server is stopped is not active. Public hosting and registering a Jira webhook are required for that mode: [Atlassian Jira webhook documentation](https://developer.atlassian.com/cloud/jira/platform/webhooks/).
- Pending Sales, Communication, Campaigns, Analytics and Finance modules do not provide live filters; they remain explicitly marked as planned modules.
