# Workspace page responsibilities

Confirmed by Alex on 7 October 2026:

- Overview owns daily attendance controls: clock in, clock out, start break and end break.
- Work owns task execution: Jira/manual task browsing, details, legal Jira status edits, START/HOLD/RESUME/END task timers, sessions and task summaries.
- Do not duplicate the Overview attendance controls on Work. Work can direct employees to Overview when attendance is required before starting a task.
- Work summary and live-work views show task activity rather than attendance/break totals.
- Attendance remains the administration/history/correction area. Existing clock-in requirements and permission checks are preserved.

Product suggestions discussed separately are proposals, not authorization to implement every proposed feature.

Implemented: Overview-only attendance card; Work task-only summary cards, task-only daily summary and live-work views; Overview link for employees who need to clock in. Browser checked Overview, Work and Work Summary; TypeScript and lint passed. No attendance records or user permissions were changed.
