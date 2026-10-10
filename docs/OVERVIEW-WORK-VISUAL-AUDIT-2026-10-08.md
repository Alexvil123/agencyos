# Overview and Work — visual review

Scope: the current desktop Owner session, captured on 8 October 2026. No application code or business data changed. Four screenshots were captured and inspected at the same browser viewport.

## Captured steps

1. **Overview opening — needs hierarchy changes.** Clear greeting and personal totals, but the tall My Day block occupies almost the entire first viewport. Attendance actions are below it. The Owner's 157 attention items dominate before their personal work summary.

![Overview opening](E:/Mycrm/test-results/visual-page-audit/01-overview-top.png)

2. **Overview work section — visually repeats Work.** Attendance is clear once reached, but current task, task counts, task tabs, filters and full table make this a second task workspace. The personal current task and time totals repeat the preceding My Day block.

![Overview work section](E:/Mycrm/test-results/visual-page-audit/02-overview-work-section.png)

3. **Work opening — useful controls, task queue starts too low.** Consistent branding and recognizable Hold/End controls are strengths. Tabs, sync banner, personal/team selector, instruction box and two large cards consume the first viewport. Compact these into a toolbar and active-task strip so employees see their assigned queue immediately. The current screen also shows a last verified sync timestamp alongside a rate-limit warning; these need explicitly separate labels.

![Work opening](E:/Mycrm/test-results/visual-page-audit/03-work-top.png)

4. **Work table — readable grouping, action visibility needs improvement.** Horizontal scrolling hides the work controls off the right edge. Rows spend considerable space on three historical timestamps. Live Work and generic Recent Activity repeat Overview and extend the page without helping choose the next task.

![Work table](E:/Mycrm/test-results/visual-page-audit/04-work-table.png)

## Recommended page responsibilities

| Surface | Main employee question | Recommended content |
|---|---|---|
| Overview | What is happening today? | Attendance/break actions at the top, compact current-task preview, working/break/task/remaining totals, up to five urgent or upcoming tasks and personal alerts. Open My Work link. |
| Work | Which task should I work on, and what can I update? | Compact running-task strip, New task, My/Jira/Manual filters, visible assigned queue, pinned timer/actions, task details drawer and exact Jira status controls. |

Keep full task search/filtering, session tables and detailed task reports in Work or their existing dedicated views. Keep team attendance/operational summaries on Overview for authorized roles, without forcing employees through management panels. Show one compact team summary before offering the full list.

Use the same logo, navigation and purple accent across both pages. Distinguish them through structure: Overview uses compact summary cards; Work uses a dense task workspace. Reserve strong colours for active work, held work, completion, overdue state and actions. Avoid colouring every surface equally.

## Accessibility and evidence limits

Small muted labels, pale outlined buttons and long horizontal tables are visible readability/operability risks. Increase secondary text clarity, keep actions visible and retain text labels alongside status colours. No numeric contrast measurement, keyboard/screen-reader audit or mobile reflow audit was performed in this review; screenshots alone cannot establish accessibility compliance.

This session shows the Owner's two personally assigned manual tasks, with Jira rate-limit warnings. It does not demonstrate a separate employee login or a large personal Jira queue. The review concerns layout and hierarchy, not whether every synchronization or permission path succeeds.
