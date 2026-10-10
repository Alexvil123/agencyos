# Google Sheets Sales workspace

The CRM Sales page uses the connected Business Development spreadsheet (`1-4r9F5klbkqpgM4f8iy74UjSuipfwEkNICXAkGLNEI8`). All 15 current tabs are fetched live, including the two hidden tabs for Owner. The server connection takes precedence over the older private read-only imported snapshot.

## Access

Every server action verifies active employee membership, organization binding and Sales access. Owner can read and edit accessible cells in all tabs. Explicitly selected active Sales employees can read, add, edit and delete all Tracksheet and Leads records only. Clients and other employees are denied. Financial, regional and other tabs remain Owner-only. UI visibility is additional to server authorization.

Owner assigns employees through Sales → Connection & team → Sales team access. Migration `202610100027_sales_team_access.sql` persists selections in Supabase. The Owner-only `sales_team_save` RPC validates active employees in the same organization and records the replacement and audit atomically. Every Sales request reads the current database grants, without process caching or environment fallback, so removal applies to subsequent reads and writes across server instances. Missing permission storage fails closed. A pending request that already passed authorization can still finish.

## Sheet-style workflow

- Click selects a cell; arrow keys navigate across visible columns and filtered rows. Double-click, Enter or F2 opens its input, native dropdown or date/time control. Enter saves; Tab/Shift+Tab saves and selects the neighbouring visible column; Escape cancels. Text-edit left/right arrows retain cursor movement (Alt+Left/Right saves and navigates). Up/Down in text inputs saves and navigates; dropdown and date controls retain native arrows.
- Add row opens a blank draft in the table. Tab moves through draft fields without saving. Enter or Save row inserts the whole row below the stated source row. The top Add row button uses the last suitable populated data row; each row also has Insert below.
- Edit row opens an optional full-record editor. Delete displays the complete-row warning and requires confirmation before deleting the actual Google Sheets row, including hidden columns.
- Search, exact status/location filters, native date ranges and additional AND conditions cover every fetched row. Numeric/date sorting, column visibility and wrapping affect only the CRM view. All matching records share one scrollable sheet with no pagination. Fixed-height rows render in a moving window with overscan to keep large tabs responsive; Wrap text uses all rows for variable heights.
- Actual headers, original row numbers, values, formula results, list validations and native cell colours are retained. Formula cells, calculated spill outputs, protected ranges, merged cells, rich text/chips and unsupported validations are read only. This is a spreadsheet record editor, not a replacement for Google's formula, chart or workbook-structure editor.

## Write safeguards

The server reads fresh data before every operation. Unique # IDs identify standard Sales records; tabs without a # header use coordinates and row fingerprints. Existing IDs cannot be edited. Add/delete require the entire sheet fingerprint to match; changed records are rejected for review.

Single-cell updates write only userEnteredValue with literal string, number or boolean values. Text beginning with = remains text. Existing date/time numbers and formatting are retained. Native batchUpdate row insertion copies formatting, validation and individual formulas using Google's relative-reference behaviour, without duplicating business literals. Numeric IDs are generated uniquely where applicable; non-numeric IDs need a specific integration rather than an invented ID. Delete uses native row deletion and stores a private complete native-row backup first.

Operations reserve a single-use UUID in audit_logs before sending the write. Requests are never automatically retried. A fresh readback confirms values and inserted/deleted row counts, followed by a confirmation audit. Google writes and Supabase audits cannot share one transaction. An uncertain result requires checking the sheet before retrying. Google has no compare-and-swap transaction spanning the read and write, so external sorting/structural edits during that gap can still race.

## Connection and synchronization

The service account is crm-sales@vilpower-crm.iam.gserviceaccount.com. Local credentials are in ignored .sales-google.local.json outside public assets; keys never enter client code. Deleted-row backups are ignored under .sales-deleted-rows. Managed hosting uses GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON and GOOGLE_SHEETS_ORGANIZATION_ID for provider credentials. Production credential changes use hosting settings. Sales membership permissions are database-backed and editable by Owner in the CRM; the legacy GOOGLE_SHEETS_SALES_MEMBERSHIP_IDS variable no longer grants access.

Visible pages automatically check for Google changes every 30 seconds with failure backoff. Refresh pauses while editing. Cell values display immediately as pending saves; successful Google readback confirms them, while failure restores the last confirmed grid and reports the result. Other edits stay disabled until the pending save settles to protect row versions. Changes saved in CRM are sent to Google and verified; edits made directly in Google appear on the next successful check. Shared metadata/grid caches last up to 15 seconds; writes bypass the grid cache and invalidate all tabs afterwards. This is polling, not push or an unattended background worker. The CRM server must be running. Multiple hosting instances may need centralized quota management.

Bounds are 10,000 allocated rows, 256 allocated columns and 1,000,000 allocated cells per tab. Blank records and unused trailing columns are omitted from display. Structural writes are restricted on protected, merged or spilled output rows.

## Verification, 8 October 2026

All 15 tabs were successfully read with the production API field selection and parser. Tracksheet had 458 records; Leads had 130. Actual formula metadata, wide Bike Track columns and multi-row Expenses headers parsed successfully. 92 regression tests passed, including authorization, filters, dates, stale/duplicate identity handling, formula/validation protection and native insert/delete planning. TypeScript, targeted lint and production build passed. Spreadsheet mutations were tested with local fixtures; no business records were changed for validation. Authenticated visual interaction testing remains unverified.

