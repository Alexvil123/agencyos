# Team time management — approved implementation

Status: migration 009 applied to Supabase project nzkebyggxagbpdjouuhj on 6 October 2026. All eight tables have RLS enabled, no anonymous read, and no authenticated direct INSERT or TRUNCATE. Live Owner UI verified for Attendance, Tasks, Timesheet, Reports, Approvals and Setup. 49 tests pass; typecheck, lint and production build pass.

## Approved rules

- Internal team workspace only. Client-account workspace access and client invitations are denied by the application. Client directory records remain available as internal report labels.
- India time, Monday–Saturday. Sunday is non-working. Owner individually assigns 08:30–18:00 or 09:00–18:30; there is no silent default assignment.
- Scheduled combined attendance target: 9h 30m. Working, break and combined durations are separate. Overtime hours = max(working duration − 9h 30m, 0), with no payroll/rate calculation.
- Five-minute arrival grace is inclusive. Late display shows actual arrival delay from shift start.
- Manual clock in/out uses database time. One attendance record per employee/day; one open session across days. Missed clock-out stays open and provisional, with a correction workflow.
- One active or paused task timer per employee. Break start stores and pauses the running log; break end resumes only that exact break-paused log. Manually held, ended or reassigned tasks are not resumed. Jira resume requires a fresh server-side assignment check; a failed check ends the break but keeps the timer held with a warning. Clock-out closes the break and stops the timer.
- Time-tracking tasks, deadlines, assignments and optional client labels are CRM-only and do not write Jira worklogs. Jira task statuses are separate from CRM time-task completion.
- Owner and explicitly authorized time managers may review all team corrections. Managers may create time tasks and read team time reports. They cannot grant time-manager access. Self-review is denied.
- Manual task intervals and attendance corrections remain pending until approval. Overlapping approved task intervals, changed attendance, inactive employees, and repeat reviews are rejected.
- Employees read their own time records. Owner/time managers read team records. Direct table writes and TRUNCATE are denied; audited RPCs enforce permissions.

## Included UI

Attendance, Tasks, Timesheet, Reports, Approvals, and Owner Setup tabs. Daily/weekly/monthly date-range attendance reports, provisional running totals, task times, client totals, current overdue/24-hour deadlines and attendance CSV export. No absence, half-day, salary deduction, holiday or leave rules are inferred.

## Validation and limits

SQL tests use actual PostgreSQL-compatible execution and role/RLS changes, not mock permission flags. Actual employee sign-in and clock/timer actions have not been performed on production records; SQL tests validate their behavior in an isolated database. Read loading paginates up to 20,000 rows per time table; an explicit incomplete-report warning and disabled export appear beyond that cap. Open sessions are provisional; corrections preserve audited original values. No demo attendance or employee activity is inserted into the actual agency database.

Next steps: Owner opens Attendance → Setup, assigns each employee a shift and explicitly authorizes chosen time managers. All 11 employees currently have no shift assigned; clock-in stays disabled until assignment. The earlier Work-page glitches were identified for review and have not been changed in this time-management implementation.
