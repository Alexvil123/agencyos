# Work task ordering and navigation

- Work Order is the default task sort. Drag the numbered handle or use the up/down arrows.
- Employees arrange their own assigned Jira and manual tasks. The Owner can select an employee under Team tasks and arrange that employee's queue.
- All-employees views require an employee selection before ordering. Other sort modes remain available; switch back to Work Order to arrange tasks.
- Orders persist in `work_task_orders`, separately from Jira and timer activity. Removed or reassigned tasks disappear from the effective queue; new tasks join the end. Filtered-out tasks retain their relative order.
- Saves check current organization, active employee, task assignment and revision on the server. Concurrent stale saves are rejected; unsuccessful optimistic moves roll back. Successful changes are audited.
- Sidebar links preserve navigation scroll position for the browser session. Page content starts at the top while the clicked menu stays selected.

Validation: task ordering database/security tests, existing date/filter tests, TypeScript, targeted lint, production build and authenticated live UI verification.

Production verification (10 October 2026):
- Netlify deploy `6ac9c17e4b7e81a396c0fe3c` published at https://vilpower-agency-crm.netlify.app.
- Supabase migration applied successfully.
- Actual browser drag saved; hard reload returned the reordered queue. Arrow move restored the original Owner task order. No task timers/statuses changed.
- Settings and Reports links retained sidebar scrollTop 78 after navigation (previous behavior reset to 0); each destination stayed selected.
- 4 task ordering database/helper tests + 5 existing task/date filter tests passed. TypeScript, targeted lint and production build passed.
- 7 anonymous live hosting/login checks passed. 125 public build files scanned with zero configured credential matches; private local configuration excluded from the uploaded server package.
- Employee permissions were tested in a local Postgres instance; the live browser verification used the signed-in Owner account.
