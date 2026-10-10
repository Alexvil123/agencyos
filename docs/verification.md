# Phase 1 verification

## Automated checks

- PostgreSQL migration executes against embedded PostgreSQL (PGlite).
- 14 passing security/validation tests: organization isolation, self/direct-report visibility, client restrictions, denied direct mutations, bootstrap isolation, MFA at database boundary, sensitive-role delegation, confirmation, atomic audits, cross-organization foreign keys, invitation throttling/identity matching, deactivation, ownership transfer, input validation, redirect validation, employee persistence/email normalization/duplicate rejection, and existing membership linkage without new role grants.
- TypeScript: passed. ESLint: passed with zero warnings. Optimized production build: passed.
- Production without a configured backend redirects to sign-in and exposes no setup preview. Verified HTTP 200 sign-in response, X-Frame-Options DENY and X-Content-Type-Options nosniff. Development preview remains available locally.

## Browser checks

- Overview renders with empty records and a visible setup-preview banner.
- Command search filters pages and navigates to Team.
- Employee and department tabs render honest empty states.
- Company controls are disabled in setup preview.
- Permission descriptions match the confirmed owner/administrator model.
- Mobile settings layout and navigation verified at 390 × 844; no page-wide horizontal overflow.
- Attendance displays pending company-policy decisions rather than running assumed calculations.
- Updated Team dark appearance verified in the empty development preview; responsive Team layout has no horizontal overflow at 390 × 844. Screenshot: `team-dark-preview.jpg`.

## Dependency audit

Online audit of production dependencies: zero known advisories at verification time.
Full dependency audit: five high-severity findings in the development-only ESLint → fast-glob → micromatch → braces chain. Current published braces version is 3.0.3; the reported advisory includes that version. No patched compatible release was available during verification. Do not use automated forced downgrades of the Next.js lint configuration. Recheck before production rollout and keep the lint runner off untrusted inputs.

## Not verified live

The Supabase foundation was deployed and its table/RLS/direct-write restrictions checked live (see database-deployment.md). Alex's Owner activation was explicitly confirmed and completed. Live checks confirm the active Owner role, linked employee profile, and activation audit entry. The connected app redirects Alex to authenticator enrollment, enforcing the MFA requirement. User enrollment and live employee-save verification remain pending; the employee persistence tests above run against embedded PostgreSQL. OAuth callbacks, SMTP invitation delivery, hosting quotas, production backups and restoration still need live verification. Server-only invitation credentials are not configured.
