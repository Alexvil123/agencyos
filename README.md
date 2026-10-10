# Agency OS

One workspace for one agency: attendance and task timers, Jira-first work management, a Jira-synced calendar, the Sales Google Sheet,
team chat and announcements, reports, analytics, campaign reporting and invoicing. Next.js (App Router) + Supabase + Netlify.

## Menus
| Menu | What it does | Data source |
| --- | --- | --- |
| Overview | Clock in/out, breaks, current task, daily target | Supabase |
| Sales | The Business Development sheet, Excel-style: column filters, dropdown chips, date/time shortcuts, live edit/add/delete | Google Sheets |
| Clients | Client labels and their Jira work, Sales → Jira onboarding automation | Jira labels |
| Work | Assigned and team tasks, timers, Jira status and edits (two-way) | Jira + Supabase |
| Calendar | Tasks by due date. The Owner creates, assigns and reschedules Jira tasks here | Jira |
| Source | Jira SOURCE reference records | Jira |
| Attendance / My account & time | Attendance, breaks, timesheets, corrections and approvals | Supabase |
| Announcements, Team Chat | Company announcements, personal and group chat | Supabase |
| Campaigns (Owner) | Meta Ads and Google Ads spend and results | Ad platform APIs (env keys) |
| Analytics | Tracked hours, completed and open work, with definitions | Work records |
| Finance (Owner, Finance role) | Invoices, payments, outstanding balances, PDF/CSV | Supabase |
| Team, Reports, Settings | Directory and profiles, filterable reports with CSV/Excel/PDF, users, integrations, sync health, audit | Supabase |

## Run locally
```powershell
npm ci
npm run dev        # http://127.0.0.1:3000
```
Copy `.env.example` to `.env.local` and fill the values (Supabase, Jira OAuth, Google Sheets, optional ad platforms).
Without Supabase configuration, development shows a read-only empty preview.

## Database
Apply the files in `supabase/migrations/` in order (Supabase SQL editor). The newest, `202610100029_finance.sql`, enables Finance;
until it is applied the Finance menu shows a setup message. Each migration is tested against an in-memory PostgreSQL (PGlite).

## Hosting (free)
Netlify Free for the app, Supabase Free for data. Secrets live only in the hosting environment (never `NEXT_PUBLIC_`).
- `docs/FREE-HOSTING-LAUNCH.md` — deploying to Netlify
- `docs/SCHEDULED-SYNC.md` — the external scheduler for background Jira sync and Sales → client onboarding (`CRON_SECRET`)
- `docs/CAMPAIGNS-SETUP.md` — Meta Ads and Google Ads credentials

## Checks
```powershell
npm run check:deploy   # typecheck, lint, all tests, and a scan of build output for secrets
```
The suite covers permissions and row-level security, time and Jira rules, Sales sheet parsing and editing, reports, analytics, finance and
the campaign connectors (with simulated API responses). Live round trips against Jira, Google and the ad platforms are run by hand
with the scripts in `scripts/`.

## More documentation
`docs/decisions.md` (approved business rules), `docs/architecture.md`, `docs/jira-integration.md`, `docs/sales-google-sheets.md`, `docs/time-management.md`.
