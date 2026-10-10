# Employee workspace improvements — 8 October 2026

Implemented the seven employee-focused improvements approved by the Owner:

1. Work opens with **My assigned tasks**, including personal manual tasks. Authorized managers retain the Team view.
2. Task details include today's and total recorded work, the current Start/Hold/Resume control and End. Jira details include source links and available attachments. Jira status selection and recorded timer activity remain separate.
3. My Day shows task-wise time, working and break totals, remaining combined attendance target and working time without a recorded task. Clock Out opens a review before submitting the existing server action. Live totals are provisional; unallocated time is not a productivity score.
4. Notifications include recent personal assignments, upcoming/today/overdue deadlines and personal correction outcomes. Task notifications open the corresponding permitted task.
5. Work refreshes saved data between remote checks; remote checks run periodically. Authorized time reads reuse the verified request context. Google transient reads retry once, in-flight reads share promises, and Jira rate limits respect Retry-After. Mutations are never blindly replayed.
6. **My account & time** provides personal attendance, timesheet/report/correction views and the existing signed-in account password form. Existing server permissions and database row policies continue to govern access; profile identity remains Owner-managed.
7. Small screens show task records as cards, larger touch controls, wrapped filters and a full-width task drawer. Temporary browser viewport changes were restored after QA.

## Verification

- Full regression suite: **122 passed, 0 failed**.
- Changed TypeScript components/server modules: ESLint and TypeScript checks passed.
- Final production build passed, including TypeScript and all generated routes.
- Live Owner-session UI checks: personal attendance, password form (not submitted), task drawer, Clock Out review (not confirmed), mobile work queue and mobile task drawer.
- Existing permission regression tests cover employee isolation and authorized manager access. A separate live employee login was not performed.
- No real task, attendance, password, Jira issue or Google Sheet record was changed for UI testing.

## Practical limits

This is periodic synchronization while the CRM server is running. Jira was rate-limited during live QA; the cooldown prevents repeated calls but cannot remove the provider limit. These checks do not establish uninterrupted hosting or prove external writes during an outage. Attachment links still require the user's applicable Jira access. No new automatic Jira workflow mapping was enabled.

Screenshots are in `test-results/employee-*.png`.
