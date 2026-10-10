# Campaigns — connecting Meta Ads and Google Ads

The Campaigns menu (Owner only) reads live spend, impressions, clicks and results from your ad accounts. Credentials are
**server environment variables only**: add them in Netlify → Site configuration → Environment variables (mark each as secret),
then redeploy. Nothing is stored in the CRM database and nothing is sent to the browser. Without them the menu shows a setup card.

## Meta Ads (Facebook and Instagram)
| Variable | Value |
| --- | --- |
| `META_ADS_ACCESS_TOKEN` | Access token (a Business Manager **system user** token with `ads_read` is recommended; it does not expire like a personal token) |
| `META_ADS_ACCOUNT_IDS` | Comma separated ad account IDs, for example `act_1234567890,act_9876543210` |
| `META_GRAPH_VERSION` | Optional. Default `v25.0`. Meta retires each version two years after the next one ships |

## Google Ads
| Variable | Value |
| --- | --- |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | From the Google Ads manager account → API Center |
| `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` | OAuth client (Google Cloud → APIs & Services → Credentials) |
| `GOOGLE_ADS_REFRESH_TOKEN` | Refresh token for a user who can read the accounts (scope `https://www.googleapis.com/auth/adwords`) |
| `GOOGLE_ADS_CUSTOMER_IDS` | Comma separated, for example `123-456-7890,987-654-3210` |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional. Manager (MCC) account ID when you read client accounts through it |
| `GOOGLE_ADS_API_VERSION` | Optional. Default `v25`. Google retires a version about one year after release |

## Behaviour
- Results are cached for 5 minutes per platform and date range (Refresh bypasses the cache).
- "Results" are leads plus purchases as the platform reports them, counting each result once.
- Amounts stay in each account's currency and are never added across currencies.
- The code is covered by tests with simulated API responses. It has **not** been run against real accounts yet; the first run with real
  credentials is the live test. A wrong token, ID or API version appears as a clear message on the Campaigns page, not as an error page.
