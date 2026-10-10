# Sales access persistence — 10 October 2026

The production Sales team form previously attempted to write the local provider configuration. Production deliberately rejected that write, so selecting employees never persisted access.

Selections now live in Supabase `sales_team_access`, independent of Google credentials. The authenticated Owner-only `sales_team_save` RPC validates active employee membership in the same organization, replaces the selected list and records an audit in one transaction. All Sales reads and mutations use the current database list; legacy local-file/environment lists no longer grant access. Financial and other tabs stay Owner-only; selected employees receive Tracksheet/Leads access.

Validation: nine targeted tests passed, including grant/revoke persistence, audit history, denied employee self-grants/direct writes, rejected invalid/inactive members, restricted tabs and existing spreadsheet safeguards. TypeScript and targeted ESLint passed. The production migration succeeded and a read-only server query confirmed the table is available. No employee was granted access during these checks.

Full production build, server function and authentication edge bundling passed. Netlify production deployment `6ac9bbae2bf0716086c32979` is live. Generated package privacy checks passed and public assets contained no server secrets. All seven anonymous hosting checks passed.

The existing Owner's live Sales form successfully saved the unchanged empty selection. A separate read-only database query confirmed the permission row and `sales_access_changed` audit had the same transaction timestamp (`2026-10-10T04:16:26.420067Z`). This checks real production persistence without assigning access to an employee the user has not selected. Existing Google connection, 15 sheet tabs and 458 Tracksheet rows still loaded. Actual selected-employee live sign-in has not been tested; grant/revoke and employee-denial cases were exercised in the isolated database tests.
