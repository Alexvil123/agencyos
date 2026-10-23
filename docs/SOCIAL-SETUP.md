# Analytics — connecting Instagram, Facebook and YouTube

The Analytics menu shows how posts perform: **views, likes, comments, shares/saves and engagement** for posts published in a chosen
period (7, 30, 90 days, this or last month), per platform, with CSV export. The Owner enters the credentials in **Settings → Integrations** (several accounts per platform can be added and removed there, e.g. when a client leaves);
they are encrypted before they are stored and never sent back to the browser. Server environment variables (Netlify → Site configuration → Environment variables, marked secret) still work as a fallback.
The Owner sees Analytics; employees only if the Owner allows it in Settings → Module access. Without credentials the menu shows a setup card.
See docs/INTEGRATIONS.md for the encryption key.

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
- The page refreshes itself every 5 minutes while it is open and visible (and when the tab is shown or goes back online); Refresh reads the platforms immediately. The server shares one read for 4 minutes between viewers. "Updated" is the time the numbers were read from the platforms. A rate-limited read backs off (5, 10, then 20 minutes) instead of retrying faster. Followers, likes and comments are live counters; views come from the platforms' insights and can lag. Nothing is pushed by Meta or YouTube, so "instant" means the next automatic read.
- Instagram uses the `views` insight and Facebook `post_media_view`; both replaced the retired impressions metrics. Platforms can delay
  insights by up to 48 hours. Instagram Stories are not included. A dash means the platform did not report that number.
- Up to 50 posts per Instagram account and Facebook Page and 100 videos per YouTube channel are read for each period.
- Besides the post list the page shows follower and subscriber counts, a comparison by content type (Instagram Reel/Photo/Carousel, YouTube Short up to 3 minutes vs Video) and the best posting weekday and time (average views, India time). Instagram reach is shown per post where the platform reports it.
- Meta reports an expired or invalid token as an error code in the response body; the page turns that into a plain message ("rejected the saved credentials") instead of a generic HTTP error.
- The code is covered by tests with simulated API responses. Live check on 15 Oct 2026: one Facebook Page and one Instagram account (a client’s) connected through Settings → Integrations returned follower counts, post views, likes, comments, shares/saves and top posts. YouTube has not been run against a real channel yet. A wrong token, ID or API version shows as a clear message on the page, not as an error screen.
