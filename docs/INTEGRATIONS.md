# Integrations (Settings → Integrations)

All integration credentials are entered by the **Owner** in **Settings → Integrations**. Each card shows only the fields that integration needs. **Save** checks the credentials with the provider, stores them encrypted and switches the integration on immediately. **Remove** deletes them and switches it off.

Integrations: Meta (Instagram + Facebook analytics), YouTube, Meta Ads, Google Ads, Google Sheets (Sales), Jira OAuth app.

## One-time setup

1. Apply `supabase/migrations/202610100030_integration_credentials.sql` in Supabase.
2. Create an encryption key and store it in the hosting environment, then redeploy:

   ```bash
   openssl rand -base64 32
   ```

   Variable: `INTEGRATION_ENCRYPTION_KEY` (the existing `JIRA_OAUTH_ENCRYPTION_KEY` is reused if this one is absent).
   **Do not lose or change this key**: credentials saved with a different key cannot be opened and must be entered again.

## How it behaves

- Secrets are encrypted (AES-256-GCM) and readable only by the server. The browser never receives a saved secret; configured secret fields show as "saved" and a blank field keeps the stored value.
- Before saving, the credentials are checked live. A provider rejection blocks the save; if the provider cannot be reached the values are saved with a warning.
- Values saved in Settings take priority over hosting environment variables. Integrations already configured with environment variables show as "Active · hosting settings" until replaced here.
- Every save/remove is written to the audit log (never the secret values).
