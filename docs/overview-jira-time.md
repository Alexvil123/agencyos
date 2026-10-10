# Overview attendance and Jira timers

Migration 010 is applied to Supabase project nzkebyggxagbpdjouuhj (6 October 2026). Overview now provides Clock in, Clock out, Start break and End break, followed by assigned Jira tasks. Attendance → Tasks has the same Jira timer component. Both use the same database records.

## Employee workflow

Owner assigns a shift in Attendance → Setup and links the employee's Jira identity in Work. The employee signs into their own CRM account, clocks in, and starts an assigned Jira task. One active/paused timer is allowed across CRM and Jira tasks. Pause/resume and breaks create separate segments; breaks are excluded from task time. End task saves and stops the session before retrieving status choices. Choose an available Jira transition (or keep the current status), confirm, and Save Jira status. End task alone does not assume Done or complete the issue.

Time and timesheets remain CRM-only: no Jira worklogs are created. Status changes use Jira's actual transition IDs and only update status, preserving the title and rich description. Session and cumulative task time appear on Overview; existing timesheets and team reports include these Jira-linked segments. Optional internal client allocation is not automatically inferred from a Jira project.

## Authorization and recovery

Start/resume and status operations recheck the live Jira assignee, including for an Owner's personal timer. Owner's all-team issue management remains in Work. The time projection is per organization, employee and Jira key, so reassignment never moves another employee's historical time. Direct authenticated Jira start/resume calls cannot bypass server verification. Server-only enrollment and status-result functions preserve authenticated actor audit attribution. Existing time-table RLS scopes and Jira OAuth scopes remain unchanged.

End is idempotent and closes the timer once. A failed Jira request cannot reopen time or discard recorded seconds. Ended sessions remain available for status review, with pagination. Status submission checks the latest Jira updated timestamp and allowed transitions before sending, then reads Jira again to confirm the target. A database attempt lease blocks concurrent sends for 60 seconds; stale completion attempts cannot overwrite newer results. Refresh status choices reconciles a lost successful response by reading the recorded target, without replaying the transition.

Jira does not provide an atomic conditional transition through this endpoint: a remote change between the preflight read and transition can still race. Post-write mismatches are surfaced for review. No background retry or automatic transition mapping is enabled.

## Verification

53 isolated tests pass, including service-only enrollment, linked-assignee checks, duplicate timers, verified resume, break exclusion, idempotent End, cross-user denial, status leases and stale result rejection. Production build/typecheck and lint checked. Live Supabase migration success and Overview controls verified. No artificial attendance or task activity was inserted, and no real Jira status was changed during verification. Alex currently needs a personal Jira identity link; employee shifts still need Owner assignment before actual clock-in/timer use.

Endpoint reference: [Atlassian Jira Cloud issue transitions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post).
