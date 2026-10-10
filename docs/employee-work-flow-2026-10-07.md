# Employee daily work — 7 October 2026

- Employees open Work → My assigned tasks to see their linked Jira assignments and their CRM manual tasks. Jira assignee and client labels are visible alongside the issue's real status. Owner/team managers may filter Team tasks by CRM employee. This does not grant permission to operate someone else's timer.
- Each own task has visible Start, Hold, Resume and End buttons. Clock-in and breaks remain on Overview. Disabled Start/Resume controls explain whether clock-in, ending a break or completion prevents recording new work. End remains available for an existing work session.
- My current task now remains visible while paused, with Resume and End controls. The counter includes recorded work segments and excludes held gaps. Starting another task retains the existing explicit switch confirmation.
- Task rows display first recorded start, last hold and end times in India time, today's work, total work and timer state. View sessions opens employee/start/hold-or-end/duration history without opening Jira or changing time.
- End uses the saved CRM completion timestamp when available, including ending a held task later than its last working segment. Open/held tasks do not show a fabricated end timestamp. No Jira status change creates a timer segment.
- Today totals follow the current assigned employee/task filters. Open session values are provisional. Source library records remain excluded from Work.

Validation: 78 regression tests passed, including timing through Start/Hold/Resume/End, paused-gap exclusion, employee isolation and existing server permissions. Production build and targeted lint passed; the final timestamp refinement was checked again. Browser click-through remains blocked by the browser tool's localhost access rejection. No employee attendance/timer records or business Jira issues were modified for verification.
