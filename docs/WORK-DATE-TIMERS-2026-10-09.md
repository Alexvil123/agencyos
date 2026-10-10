# Work date presets and task timer controls — 9 October 2026

Work task date inputs were replaced by All dates, Today, Yesterday, This Week, Last Week, This Month and Previous Month. Presets use Asia/Kolkata calendar days, Monday–Sunday weeks and full calendar months. The existing Due/work, Created and Updated date selector remains available. The selected range is shown as text, without From/To inputs.

The separate row Edit button was removed. Task timer Start/End remains visible for Jira and manual tasks; Start changes to Hold while running and Resume while paused. Other employees' controls remain disabled with an assignment explanation. Employees operate their own timers and need attendance active with no break. Closed Jira work cannot start until reopened through an allowed Jira transition.

Existing End behavior saves recorded time before opening the issue's current Jira transition selector. Saving uses the existing server-authorized Jira write and conflict checks, then refreshes CRM data. No Jira status or assignment was modified during live UI verification.

Validation: 12 relevant date/filter/control/Jira-time tests passed, including End and status-write concurrency guards. Live preset filter checks confirmed Today 2, Yesterday 9, Last Week 92, This Month 192 and Previous Month 376 Jira tasks for the current Owner team scope. Counts reflect this snapshot and may change. Screenshot: test-results/work-date-timers-2026-10-09/work.png.`nProduction build and TypeScript compilation passed.
