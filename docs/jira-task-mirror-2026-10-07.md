# Jira task mirror — implemented 7 October 2026

Jira is the authoritative source for Jira task title, description, exact status, assignee, priority, task type and due date. CRM timer records remain independent.

## Current behavior

- Work and Overview automatically fetch every Jira search page for OCT, SEP and SOURCE. The connected Owner account returned **723 tasks** in live verification. Employees fetch only their linked Jira assignee scope.
- Visible screens refresh Jira every 30 seconds and on return to the browser tab. Refresh pauses while a task form is open so unsaved input is preserved. “Sync Jira now” refreshes explicitly.
- The sync banner identifies the last successful fetch and errors. Failed/incomplete pagination never replaces the current complete snapshot or reports success.
- Primary Jira row labels and filters use exact Jira status IDs/names. Filters include the project to distinguish equal names across workflows. Summary categories use Jira's actual status categories, rather than inferred English status names.
- Rows no longer show a CRM “To Do” label as the primary status for an issue whose Jira status is “Design Completed.” CRM timer state is separately labelled.
- Owner opens in Team View by default, with tasks sorted by Jira's last-updated timestamp. My View remains available.
- Live task details allow authorized title/description editing and legal Jira workflow transitions. Title-only updates preserve existing rich text. Replacing a description explicitly converts the supplied plain text to Jira document paragraphs.
- Editing checks the live assignee and expected Jira update timestamp; concurrent CRM writes use the existing database lease. A confirmed write is reread from Jira and imported into the unified CRM task record. Uncertain outcomes require refresh rather than blind retries.
- A task absent from a successful complete Jira scope is omitted from the current board; its recorded CRM work history remains available. Cached historical tasks are not deleted.
- Automatic START/HOLD/END status mappings remain disabled until the previously requested project-specific mappings are confirmed. Manual Jira status selection remains available.

## Verification

- 68 tests passed, including six new pagination/merge/exact-status tests; lint, TypeScript and production build passed.
- Browser: full 723-task sync, exact statuses/project filters, automatic repeated sync and OCT-1460 live details inspected.
- Existing database tests cover assigned-only Jira authorization, employee isolation, idempotent imports, server-only privileged operations, write leases and timer independence.
- No real Jira task was edited merely for testing. The new edit form/server integration is present, but a disposable-record live write round trip has not been demonstrated.

## Operational limits

This is periodic sync while the local CRM screen is open, not an always-running hosted webhook service. Jira search indexing and API latency can delay visibility. A fetch reflects the Jira data available to the connected account, not issues it has no permission to read.

The existing database stores core title/description/status/due fields. Extra display metadata such as exact priority and assignee display name comes from the latest successful live snapshot; an unverified cached load labels unavailable metadata explicitly. This change introduces no schema migration or broader user access.

Comments, attachments, custom fields, Jira board administration and rich-text editor parity are not implemented by this change. Historical assignment/completion report-date corrections from the audit remain separate outstanding work.

REST behavior follows the [Atlassian issue API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/) and [paginated enhanced search API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).

![Verified synchronized Work screen](E:/Mycrm/docs/jira-sync-2026-10-07/synchronized-work.png)

![Live Jira task editor](E:/Mycrm/docs/jira-sync-2026-10-07/live-task-editor.png)
