# Workflow code cleanup — 9 October 2026

Reviewed the implemented Work, attendance, Jira synchronization, employee profile and chat paths, their imports, configuration and regression tests. This is a focused source review, not proof that every possible bug is absent.

## Fixes

1. **Stale browser Jira snapshot:** after a complete manual sync, Work retained that snapshot and merged it over later database reloads. Tasks imported afterwards could be marked unavailable merely because they were missing from that old browser snapshot. Work now renders the latest authoritative saved task data. The server already reconciles availability after complete scoped imports. Direct confirmed issue edits still update the displayed task immediately; timers/history are preserved.
2. **Chat pagination after a failed refresh:** failure retained messages but lost the older-history pagination flag; subsequent recovery could reopen an exhausted history cursor. Failure now preserves that frontier and recovery respects retained older messages. Added a regression test and strengthened the failure test.

The stale snapshot correction was established by source/data-flow review and existing canonical-import/availability tests; no new production issue was created to reproduce it in the UI.

## Removed confirmed unused paths

- Unmounted legacy `JiraPanel` listing/edit/create UI. Its active Settings connection form was extracted to `jira-connection.tsx` and the workspace import updated.
- Unmounted `jira-timer-panel.tsx` and its otherwise unreferenced `jira-time-actions.ts` callbacks. Current timers use unified Work actions.
- Unmounted manual-client `client-panel.tsx` and the unused disabled `createClient` callback. Current Clients remain Jira-label based.
- Unmounted old `my-day.tsx` dashboard components. Current Overview and Work dashboards remain active.
- Two `false &&` toolbar/guide blocks, unreachable partial-import cursor state and old paging props/buttons.
- Unreferenced partial-import `refreshWorkTasks` and legacy `listJiraTasks` callbacks. Current sync fetches all pages through `syncWorkJira`.

Database migrations were retained because they define the deployed schema and upgrade history. Shared authentication, permission checks, Jira creation helpers/actions, reports and verification tests were retained. No real data, passwords, credentials, workflow mappings or automatic-fetch setting were changed.

## Configuration assessment

Local credential files and generated/test artifacts are ignored; secret-bearing provider helpers stay server-side. Production Google credentials intentionally require hosting environment configuration rather than local-file fallback. Jira automatic fetching remains controlled by the existing Owner setting. Background workers need a persistent running server for continuous operation; serverless production scheduling requires deployment-specific setup. Those deployment requirements are not evidence of a local code bug.

## Validation

Regression suite: **147 passed, 0 failed**, including chat outage/recovery and existing timer, scope, canonical import, availability, filters and export cases. Final production build and TypeScript passed after the final deletion pass. Full-repository lint passed with one unused type-import warning; that import was then removed and the affected file rechecked without warnings.

An intermediate build overlapped deletion of an unused file and reported that file as missing. The final build was restarted after cleanup completed; no application files were changed during that final build.
