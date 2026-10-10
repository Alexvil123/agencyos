# Local CRM performance — 9 October 2026

## Implemented

- Expensive workspace insight checks now run only while Settings → Sync Health is visible. Previously every menu mounted them, re-reading time history and the Tracksheet in the background despite those results not being displayed there. Announcement notifications continue independently.
- Work's separate automatic-fetch setting read was folded into its task/time read, sharing the authenticated context. Independent database reads start together, including session/configuration reads and people/client lookups.
- Overview, Work, Source and Work Reports now poll `GET /api/work` instead of entering Next.js's serial client Server Action queue. Mutations remain authenticated Server Actions. This prevents the Work data poll itself from sitting ahead of button writes in that queue.
- Conditional requests compare a private ETag after current authentication and RLS reads. Unchanged results return 304 without transferring the full task/history payload or replacing React state. Task/permission/fetch-setting changes return new data. Server time alone does not invalidate the data version; visible counters continue locally from the previous verified server time.
- Overlapping polls reuse one in-flight request. A post-save refresh waits for any older read and performs a new unconditional read, preventing a pre-save response from being mistaken for saved state. Failed authorization clears its validator. No shared user-data cache was introduced.

## Evidence

- **151 regression tests passed; production build/TypeScript and changed-file lint passed.** Four added tests cover conditional responses, concurrent reads, post-save freshness and authorization failure.
- Live Owner Work view loaded **659 tasks = 657 Jira + 2 manual**. Team view, exact status options, date controls and assignment restrictions remained available. [Screenshot](../test-results/work-performance-2026-10-09.png).
- Server logs confirmed authenticated `GET /api/work` 200 and subsequent 304 responses. A signed-out request returned 503 with no task data. The generic failure status currently does not distinguish unauthenticated access from unavailable workspace setup.
- No task status, timer, attendance, employee password or provider business record was edited during this performance verification. Jira Automatic Fetch remains Off.

## Measurements and boundaries

Small local login-page samples, milliseconds:

| Mode | Request 1 | Request 2 | Request 3 |
|---|---:|---:|---:|
| Development before restart | 892 | 246 | 232 |
| Production comparison | 689 | 46 | 50 |

These measure the login page only, not authenticated Work or Jira/Google latency. They are a small diagnostic sample, not a universal speedup benchmark.

The old development listener used about **3,223 MB** working memory. After restarting the local preview, the new development listener used about **428 MB** at the sampled moment. Restarting clears development caches; memory can grow again. This does not prove a memory leak was fixed.

Authenticated Work reads in the observed logs still took roughly **3.8–10.1 seconds**, with a slower cold/load-contended request around 17 seconds. A 304 saves payload transfer and client rendering; it still rechecks authentication, permissions and database data. Database/provider/network latency and Next.js development compilation remain. Announcement and other menus' existing Server Action reads were not all converted in this change.

## Current runtime

The application is running again at **http://127.0.0.1:3000/** using **`npm run dev`**, with the optimized code. The temporary production comparison server was stopped. Local Jira OAuth/API-token and Google credentials intentionally use development-only files; managed production requires environment secrets and a valid HTTPS OAuth callback. Those protections were retained. No credential files or environment values were changed.

Server mode changes invalidated old Server Action identifiers in the browser; Work was reloaded and its updated view verified. Other already-open CRM tabs should also be reloaded once if they still hold the prior build. For a future production launch, use a fresh successful `npm run build` followed by `npm start` after managed environment configuration. The retained dev server picks up future code edits automatically.
