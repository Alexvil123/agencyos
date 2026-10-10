# Agency OS — Phase 1

Next.js / TypeScript CRM foundation for one agency, one office, employee and client accounts. Starts empty. The confirmed initial owner is Alex; the actual owner email is recorded in docs/decisions.md and supplied explicitly during operator setup.

## Run locally

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Without Supabase configuration, development displays a read-only, empty setup preview. No business records or account privileges are fabricated. Production refuses workspace access without configuration.

## Implemented

- Responsive application shell and all module destinations; later modules are marked as planned.
- Overview, command search, quick-action menu, employee directory/search and departments.
- Email/password login, invitation acceptance/password setup, optional Google/Microsoft OAuth, sign-out.
- Authenticator MFA for sensitive roles, enforced in backend and database policies.
- Company display-name changes; employee/department creation with validation and transactional audits.
- Invitations, role grant/revoke, activation/deactivation, ownership transfer, explicit confirmations, delegated finance/HR safeguards.
- PostgreSQL migration with RLS, cross-organization foreign keys, restricted RPCs, read-only audit history and invitation throttling.
- One-time operator bootstrap; no public signup, invitation, role escalation, or bootstrap endpoint.

Employee records do not create login accounts. Account invitations grant no roles or client resource assignments automatically. Employee/login records are linked by verified email within the organization when both exist. Team assignments and client resource sharing require the later approved assignment workflow; there is no UI to broaden these scopes in this phase.

## Connect a free Supabase project

1. Create your own Supabase Free project. Do not upgrade or add paid features.
2. Apply `supabase/migrations/202610060001_foundation.sql` with the Supabase SQL editor or migration tooling. Apply it once to a new database.
3. Copy `.env.example` to `.env.local`. Set the project URL, publishable key, and canonical `APP_URL`. Server-only `SUPABASE_SECRET_KEY` is required for invitation delivery and operator bootstrap. Never put a secret/service-role key in a `NEXT_PUBLIC_` variable or send it in chat.
4. Configure Auth Site URL and allowed redirects for the local URL and eventual HTTPS production domain.
5. Disable public email signups. Turn on TOTP MFA and enforce a strong password policy (the invitation form requires at least 12 characters).
6. Configure the invitation email template link to use a token-hash URL:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Accept workspace invitation</a>
```

For recovery templates use `type=recovery`. The default implicit-flow email link is not the configured SSR invitation flow.

7. Create Alex's auth account in your own Supabase dashboard with the real owner email. Password entry and management remain with the owner. Obtain that user's UUID.
8. Run the operator bootstrap with the real email, actual agency display name, and auth UUID:

```powershell
npx tsx scripts/bootstrap-owner.ts YOUR_REAL_OWNER_EMAIL "YOUR_AGENCY_NAME" YOUR_AUTH_USER_UUID
```

The script validates the auth account email and refuses a second workspace. It assigns Owner and creates the linked owner directory record. The owner must enroll an authenticator before privileged access.

9. Configure a production email delivery service before inviting teammates. Supabase's default email service has restrictions and is not general production SMTP. Do not activate a paid service; confirm a suitable free SMTP option and quota for your agency first.
10. Optional Google sign-in: configure the Google provider in Supabase, its callback URL in Google Cloud, and set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`. Microsoft is prepared but disabled; enable only when its provider is configured. OAuth login alone never creates a workspace membership.

## Free hosting plan

Proposed: Netlify Free for the app and Supabase Free for the database/authentication. No accounts, deployment, payment, or external invitation has been performed by this task. Use free limits and keep paid upgrades/auto-recharge disabled. Quotas may pause services; free plans are not a guarantee of production availability at any scale.

Netlify supports Next.js through its adapter and permits commercial projects on Free. Vercel Hobby is not selected because its terms restrict it to non-commercial personal use. Review current provider terms and quotas at deployment.

- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://www.netlify.com/blog/introducing-netlify-free-plan/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth/auth-smtp

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Security tests execute the actual migration and RPCs in embedded PostgreSQL (PGlite) with simulated Supabase auth identities. They test permitted and denied paths, tenant isolation, MFA, delegated grants, audit atomicity, invitation rate limits, deactivation, and transfer. They do not substitute for live Supabase OAuth/SMTP/MFA and hosted deployment tests.

## Before real production data

- Apply migrations to staging; rerun policy checks against live Supabase.
- Verify email invitation, token confirmation, password login, MFA, OAuth, sign-out, and deactivation end-to-end.
- Review sensitive account recipients and actual resource assignments with Alex.
- Configure independent encrypted backups and restore them into an isolated project. Do not assume a Free project provides production recovery guarantees.
- Configure monitoring and HTTPS, check provider quotas, and pilot with a small authorized group.
- Confirm attendance, Jira, chat, sales, finance, and reporting rules before implementing their modules.

See docs/decisions.md, docs/pending-decisions.md, and docs/architecture.md. This is a tested local foundation, not a deployed complete production CRM.
