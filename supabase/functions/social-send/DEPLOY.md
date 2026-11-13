# social-send · deploy (T-210) — NOT deployed

Copy + Open in the admin "Social queue" works without any of this (no Reddit approval needed).
The [Send] button needs Reddit API access on the founder's own account:

1. Founder, logged in to Reddit: https://www.reddit.com/prefs/apps → "create another app…" → type **web app**,
   redirect URI `http://localhost:8080` (used once to get the token). If Reddit asks for a Data API access request,
   file it and wait for approval; report the status in bus/outbox/CTO.md.
2. One-time consent for scope `submit` with `duration=permanent`, then exchange the code for a **refresh token**.
3. Edge secrets (never in the repo, never printed):
   `supabase secrets set REDDIT_CLIENT_ID=… REDDIT_CLIENT_SECRET=… REDDIT_REFRESH_TOKEN=… REDDIT_USERNAME=…`
4. Migration `supabase/migrations/0040_social_queue.sql` on the live DB.
5. `supabase functions deploy social-send` (JWT check stays ON: the DB rails run as the signed-in admin).

Without the secrets the function answers `REDDIT_OFF` before touching the queue, and the admin page says to use Copy + Open.
Undo: `supabase functions delete social-send`; the undo lines at the top of 0040.
