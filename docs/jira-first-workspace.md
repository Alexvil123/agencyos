# Jira-first workspace decisions

Confirmed by Alex, 7 October 2026.

- Linked Jira tasks use the actual Jira project, title, description, issue type, status, priority, assignee, due date, labels, components, parent, creation and resolution dates. Approved projects remain OCT, SEP and SOURCE; every search page is fetched. Employees retain their assigned-task scope.
- Jira labels represent client names exactly as stored. Multiple labels remain separate; spelling and case differences are preserved. Labels do not automatically create or merge CRM client records.
- All employees can create their own manual tasks. Manual task creation writes only to CRM, never automatically creates a Jira issue. Owner and authorized time managers may assign manual tasks to employees.

- SOURCE is a separate reference library at `/source`. Work and Overview task lists and unified work reports exclude SOURCE; they show OCT, SEP and CRM manual tasks. Existing cached SOURCE records and historical sessions are retained, never deleted by this presentation change.
- Source provides exact Jira status, labels, priority and assignee, search and status filters, original Jira links, and the existing authorized CRM editor. It does not expose task timer controls or manual task creation. Owner sees all permitted SOURCE records; employees see their own assignments.
- Clients uses only exact Jira label groups from the month projects, linked to filtered Work views. Owner requested removal of the manual directory and manual client creation on 7 October 2026. The 14 manually created profiles were removed from the live database; no task, assignment or project configuration referenced them. Remaining manual profiles: 0. A recovery backup and Owner-attributed audit entries were saved; task/time history was preserved.
- Manual client creation is disabled in the server action. Manual client tab, Add Client actions, manual client filter choices, task dropdown and obsolete client/project configuration were removed. Manual tasks remain CRM-only internal work; they do not create client profiles. Legacy profile names cannot appear in task/report client labels.
- Jira title/key links open the original issue; Edit opens the CRM drawer. Supported edits remain title, optional plain-text description replacement, legal workflow transitions, and Owner label changes. Other Jira fields are displayed but not editable in this release.
- Browser visual verification is pending because the browser tool rejected local URL access. Compilation, lint and automated regression checks are recorded separately; no screenshot comparison is claimed.
- Linked task title, description and permitted status changes are sent to Jira and read back before confirming success. Owner can explicitly replace labels. Employees retain assigned title/description/status editing permissions. Jira workflow rules and optimistic version checks remain enforced.
- Jira changes refresh into CRM every 30 seconds while the workspace is open; focus refresh and Sync Jira now are available. This is not a guarantee of instantaneous background synchronization. The signed webhook receiver also uses the same metadata field list, but deployed delivery is a separate hosting/configuration concern.
- Attendance controls belong on Overview. Work contains task controls. Task timers and attendance remain separate from Jira status, and only explicit CRM timer actions record time.
- Automatic timer-to-Jira transitions remain disabled until project-specific workflow mappings are confirmed. No guessed status names or fabricated timer activity.

## Implementation and verification

Migration `202610070012_jira_metadata.sql` stores metadata under the existing task visibility policies. It delegates import authorization to the existing core, rejects stale metadata, and does not change role grants. Applied to the configured Supabase project; dashboard returned Success.

70 tests passed, including metadata persistence, stale import rejection, service-only imports, employee task scope and exact label filtering. TypeScript, ESLint and production build passed. Live browser verified 723 Jira tasks, NTT label filtering (66 tasks), project filtering, exact task details including parent OCT-1449, and the CRM-only manual form. The aggregate database query confirmed 724 retained Jira task records, including historical records, with 632 records containing labels. No business task was created or changed for verification.

## Current limits

This is a task workspace, not a complete reproduction of every Jira feature. Comments, attachments, arbitrary custom fields, sprint/board administration, and editing every Jira field are not implemented. Client labels are displayed as labels rather than inferred client relationships. Reports of CRM timer work retain their separate timer-state meanings.
