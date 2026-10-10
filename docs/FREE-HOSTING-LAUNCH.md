# Free hosting launch — Netlify

Updated 10 October 2026. The CRM is deployed at https://vilpower-agency-crm.netlify.app (deploy `6ac8df620f1f57c34fc9f7c1`, Netlify state `ready`). The user explicitly authorized uploading server credentials, deploying live and making production public while preserving CRM authentication and private previews. The allowlisted environment has been imported, and the Supabase server key, Jira OAuth secret/encryption key and Google service-account JSON have been marked as secrets. Netlify's production-only Make public action succeeded. The login page and stylesheet return HTTP 200 anonymously; `/`, `/work`, `/reports`, `/chat` and `/settings` redirect anonymous visitors to login (HTTP 307). All seven read-only hosting checks passed; evidence is in `test-results/live-hosting/read-checks.json`. Authenticated live workflows still require verification using existing accounts.

`netlify.toml` already configures the Next.js build (`npm run build`, `.next`, Node 24). Use Netlify's detected Next.js adapter, not a static HTML drag-and-drop deployment. Keep the source repository private. Never upload `.env.local`, provider credential files, `test-results`, employee exports or database snapshots into the repository.

## Account and deployment

Live read verification on 10 October: the user signed in with the existing Owner account; Overview loaded the Owner role and attendance/team data. Work's Team tasks view loaded 659 Jira tasks and 2 manual tasks. Opening OCT-1434 fetched live Jira details, attachments and actual available transitions without submitting any edit. Sales connected to Google, listed 15 tabs and loaded Tracksheet's 458 rows. Employee sign-in, timing writes, Jira/Sheets writes, chat delivery and report export have not been tested on this deployment. Anonymous `/api/work` returned the application's generic failure response (503) without work data; this is its current auth-failure status behavior, not evidence that the authenticated Work page is unavailable.

Netlify shows Public production site and Private project. The immutable URL for the exact deployment currently published as production also serves the CRM login publicly; do not describe that production permalink as a protected preview. Future unpublished preview visibility remains the private project setting.

1. Sign in to Netlify and select its Free plan. Do not enable paid upgrades or automatic paid usage.
2. Create the CRM project from a private repository, or deploy through the authenticated Netlify CLI with the Next.js adapter.
3. Reserve the assigned HTTPS `netlify.app` URL, then set `APP_URL` to that exact origin.
4. Set the existing Supabase public URL/publishable key and server-only `SUPABASE_SECRET_KEY` in protected environment settings. Use `.env.example` as the variable-name inventory; it contains no credentials.
5. Transfer existing Jira OAuth client ID, client secret and encryption key into server-only variables. Preserve the existing encryption key so stored tokens remain readable. Set `JIRA_ORGANIZATION_ID` to the existing organization.
6. Set the existing Google service account JSON, organization ID and selected Sales membership IDs in protected runtime settings. Do not change which employees have Sales access.
7. Register the HTTPS `/integrations/jira/callback` URL in the Atlassian OAuth app. Update Supabase's approved Site URL and auth callback URLs. Redeploy after environment changes.
8. Verify Owner and employee sign-in, private photos, manual task timers, announcements/chat, exports and actual provider connections on the HTTPS site before inviting employees to use it.

## Background automation boundary

Current local Jira and Sales conversion workers run inside the persistent Node process. Serverless instances can freeze or terminate, so those timers do not guarantee unattended production synchronization. Before enabling unattended live automation, configure a supported scheduler/background job with access checks and execution limits. The existing Jira webhook requires a signed request and server-only secret; do not expose an unsigned import endpoint. Jira Automatic Fetch remains Off until the Owner changes it.

Production instrumentation no longer imports the development-only workers. Global server-trace exclusions also remove local environment/credential/test files. A completed production rebuild and an all-trace scan confirmed zero private local files, including the instrumentation trace. Retain this scan after adapter builds before uploading.

## Local Windows packaging

The generated Netlify Runtime 5.16.2 adapter requires a local compatibility step: `node scripts/netlify-windows-adapter.cjs`. It replaces privileged symlink copies with ordinary copies and disables the adapter's separate copying of local `.env` files. The helper refuses an unreviewed adapter version. These changes affect ignored build tooling only. Recheck the function package and ZIP contents before upload; Next.js trace exclusions alone do not prevent the adapter from copying `.env.local`.

The first privacy check caught `.env.local` in the generated function package. That deployment was interrupted before upload and its ZIP was removed. A subsequent scan found no local credentials in the function directory and no embedded server secrets in static/edge code. Turbopack middleware could not be packaged successfully on Windows, so production builds now use Next.js's documented `--webpack` option; development remains unchanged. Validate a full local-only `netlify build --offline --context production` before publishing. Isolated live test-account creation was rejected by automatic approval review; use existing accounts for the final authenticated checks or obtain explicit test-account authorization.

The Webpack build, TypeScript, function bundling and authentication edge bundling passed. The final directory swap failed on Windows while the local development server was running; deployment used the prepared static directory and explicitly included the complete server function. `node scripts/netlify-package-privacy.cjs` removed the traced local Jira credential file from generated artifacts and invalidated the old ZIP. Preview deployment succeeded with server/edge functions, then that exact deployment was promoted using `restoreSiteDeploy`. A new public/edge scan found zero embedded Supabase server/Jira secrets. ESLint passed for the deployment helpers before the last read-check origin parameter update; application tests remain the earlier 152 passing checks. No authenticated live workflow is claimed as verified yet.

The user supplied the exact production-public approval. The CLI visibility update returned HTTP 422, so the approved change was completed through Netlify's Make public dialog, which explicitly preserved private deploy previews. The dashboard confirmed “Your project is public”; screenshot evidence is in `test-results/live-hosting/public-confirmation.png`. [Official project visibility documentation](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/).

## Backup and monitoring

Establish a recoverable database backup/export process, private storage backup and a restore check before relying on the deployment for daily operations. Verify available Supabase Free backup options rather than assuming managed daily backups. Inspect Netlify function failures/credit usage and CRM Sync Health; set usage notifications. Free hosting has monthly quotas and is not a guarantee of uninterrupted service.

Sources: [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [Free plan](https://www.netlify.com/blog/introducing-netlify-free-plan/), [current pricing](https://www.netlify.com/pricing/), [scheduled function limits](https://docs.netlify.com/build/functions/scheduled-functions/).
