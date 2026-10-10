# Analytics — connecting Instagram, Facebook and YouTube

The Analytics menu shows how posts perform: **views, likes, comments, shares/saves and engagement** for posts published in a chosen
period (7, 30, 90 days, this or last month), per platform, with CSV export. Credentials are **server environment variables only**
(Netlify → Site configuration → Environment variables, mark them secret, redeploy). Nothing is stored in the CRM database and nothing is
sent to the browser. Every signed-in employee can view the results; without credentials the menu shows a setup card.

## Instagram and Facebook (Meta)
| Variable | Value |
| --- | --- |
| `META_SOCIAL_ACCESS_TOKEN` | Business Manager **system user** token (does not expire like a personal token). Permissions: `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` |
| `INSTAGRAM_ACCOUNT_IDS` | Comma separated Instagram Business/Creator account IDs (numbers). The account must be linked to a Facebook Page |
| `FACEBOOK_PAGE_IDS` | Comma separated Facebook Page IDs (numbers) |
| `META_GRAPH_VERSION` | Optional. Default `v25.0` |

The system user must be assigned the Pages and Instagram accounts in Business Settings. For Facebook, the CRM asks the Page for its own
access token (needed for post insights) and uses it only for that Page.

## YouTube
| Variable | Value |
| --- | --- |
| `YOUTUBE_API_KEY` | Google Cloud → APIs & Services → enable **YouTube Data API v3** → Credentials → API key (restrict it to that API) |
| `YOUTUBE_CHANNEL_IDS` | Comma separated channel IDs starting with `UC` (YouTube Studio → Settings → Channel → Advanced settings) |

Only public statistics are read (views, likes, comments). The API's default quota (10,000 units/day) is far above what this page uses
(about 5–15 units per refresh).

## Behaviour
- Results are cached for 15 minutes per platform and period; Refresh bypasses the cache.
- Instagram uses the `views` insight and Facebook `post_media_view`; both replaced the retired impressions metrics. Platforms can delay
  insights by up to 48 hours. Instagram Stories are not included. A dash means the platform did not report that number.
- Up to 50 posts per Instagram account and Facebook Page and 100 videos per YouTube channel are read for each period.
- The code is covered by tests with simulated API responses. It has **not** been run against real accounts yet: the first run with real
  credentials is the live test. A wrong token, ID or API version shows as a clear message on the page, not as an error screen.
