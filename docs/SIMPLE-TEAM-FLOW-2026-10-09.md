# Simple attendance requests and announcements — 9 October 2026

Applied live migration 202610090021 to Supabase nzkebyggxagbpdjouuhj; SQL editor returned Success. No rows returned.

Continue work: Attendance > Timesheet contains only Date and Request approval. This requests re-entry for today's closed attendance; it does not fabricate corrected timestamps. Owner or an authorized time manager approves another person's request. Approval enables Clock In without starting work. Employee clicks Clock In to reopen the same daily record using server time. The off-clock interval is retained as an excluded interval and is subtracted from working, break and combined attendance totals. Authorization is single-use. Normal second clock-in remains blocked. Original attendance events remain in audit history.

Announcements: Announcements menu provides Owner title/message publishing. Active employees read announcements in their own organization. The bell shows unread announcement counts only; per-member read receipts reduce the badge. No deadline/task/assignment alerts appear there. Screens refresh automatically every 30 seconds while open. No test announcement was published to real employees.

Removed Overview attention-items strip and its View alerts button. Existing sync health remains in Settings.

Verification: 133 tests passed; production build passed. Live UI verified empty announcement feed and no badge, Owner publish form, date-only request, and absence of Overview alert strip. Screenshots are in test-results/simple-team-flow-2026-10-09.