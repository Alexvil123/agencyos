# Scheduled background sync (free hosting)

Netlify serverless functions cannot keep timers running, so Jira reconciliation
needs an outside clock. The CRM exposes one protected endpoint for it: `/api/cron/sync`.

## One-time setup
1. Create a random secret of at least 32 characters (for example `openssl rand -base64 36`).
2. Add it to the Netlify site as **CRM environment variable `CRON_SECRET`** (mark it secret) and redeploy.
3. Create one schedule with any free scheduler (cron-job.org, GitHub Actions `schedule:`, Supabase `pg_cron` + `pg_net`):

| Job | URL | Suggested interval |
| --- | --- | --- |
| Jira reconciliation | `https://<site>/api/cron/sync?job=jira` | every 5 minutes |

Send the header `Authorization: Bearer <CRON_SECRET>` (GET or POST). Without the secret the endpoint returns 401;
if `CRON_SECRET` is not configured it returns 503.

## Behaviour
- Each call runs the job so it fits a serverless time limit. It keeps its own lease and never retries an uncertain write.
- Jira reconciliation still honours the Owner's **Automatic Fetch** switch (Settings → Integrations). While it is Off the job
  reports success but imports nothing.
- Results appear in Settings → Sync health. The response contains only `ok`, job name, organization count and duration.

## Example (GitHub Actions)
```yaml
on:
  schedule: [{cron: '*/5 * * * *'}]
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "https://<site>/api/cron/sync?job=jira"
```

## Browser errors
Uncaught errors in signed-in browsers are posted to `/api/client-error` and written to the Netlify function log
(Logs → Functions, search `[client-error]`). Nothing is stored in the database.
