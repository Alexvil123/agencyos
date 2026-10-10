# Employee profiles, birthdays, team chat and announcement timestamps

Implemented employee photo drag/drop (JPEG, PNG, WebP, 2 MB), phone, Employee ID and birthday alongside name, email and role/job title. Owner edits from Team → employee profile. Role/job title does not grant system permissions. Existing passwords are unchanged. Employee ID is unique within the agency. Optional details on existing profiles remain empty until supplied; no birthdays or photos are invented.

Photos use the private employee-photos Supabase bucket. Only server-authorized uploads and signed reads are used. Birthday names/photos appear after today's clock-in in Overview, once per employee/day/browser when dismissed. Full birth dates are not returned by the celebration endpoint. Animations respect reduced motion.

Team Chat supports personal conversations and named groups of active employees. Conversation participants alone can read/send; Owner has no private-chat override. Messages persist in Supabase and refresh automatically while the page is active. Sending has a retry key to prevent duplicates and a server limit of 30 messages/minute. Earlier messages can be loaded. No chat messages are added to the announcement bell.

Announcement cards in both the bell and Announcements page show publication date, time including seconds, and India time (Asia/Kolkata). Read receipts retain the original publication timestamp.

Migrations 202610090022_profiles_birthdays_chat.sql and 202610090023_employee_photo_storage.sql were applied successfully to nzkebyggxagbpdjouuhj. Database tests use local isolated fixtures; no live employee birthdays, attendance events, announcements or messages were fabricated for verification. Live browser confirmed profile form, active teammate options, group controls and announcement-only notification empty state. Screenshots are in test-results/profile-birthday-chat-2026-10-09.

Validation: full regression suite 139/139 passed, followed by 7/7 focused tests including the added service provisioning case. Production build, TypeScript and full ESLint passed. Photo failures fall back without blocking the workspace; confirmed failed creates discard unreferenced new photos. Unknown save outcomes retain uploads for Owner review.

## Chat simplification
Personal chat navigation now lists every active teammate by default, excluding the signed-in employee. Existing direct conversations are reused; clicking a teammate opens the pair's conversation. The old personal/group creation selector is replaced by New Group: name, optional image, and selected employees. The creator is added automatically. Only participants see the group. Creator-only image changes are enforced by a new database RPC; group uploads remain private and use the same 2 MB image restrictions. Migration 202610090024_chat_group_photos.sql applied successfully. Eight focused tests, production build and full lint passed. Browser verified ten other employees for Alex and the group name/image/member form. No test groups or messages were posted to production. Evidence: test-results/chat-defaults-2026-10-09.
