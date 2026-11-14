# line-auth · deploy (T-205) — NOT deployed yet, founder says "deploy" first

1. LINE Developers → the LINE Login channel → LINE Login tab → Callback URL:
   `https://kringapp.com/app/line-callback.html` (add `http://localhost:4173/app/line-callback.html` for a local test).
   OpenID Connect → apply for the email permission (optional; without it new members get a placeholder email).
2. Migration `supabase/migrations/0038_kr8_line_login.sql` on the live DB.
3. Secrets (values from `.env.local`, never printed):
   `supabase secrets set LINE_LOGIN_CHANNEL_ID=… LINE_LOGIN_CHANNEL_SECRET=…`
4. `supabase functions deploy line-auth --no-verify-jwt`
   (the app calls it before anyone is signed in, with the publishable key, which is not a JWT).
5. App build: `VITE_LINE_CHANNEL_ID=<channel id> VITE_AUTH_LIVE=1 npx vite build --base=/app/`
   The channel ID is public (it is in every LINE authorize URL); the secret is only in the function.
   Without `VITE_LINE_CHANNEL_ID` the LINE button is hidden and email stays the only way in.

Undo: remove `VITE_LINE_CHANNEL_ID` from the build (button disappears); `supabase functions delete line-auth`; 0038 undo lines.

## LIFF one-tap (added 13 Nov) — backward compatible
The same function also accepts `{ liff_id_token }` (from `liff.getIDToken()` in the LIFF app of the same LINE Login
channel). It is checked with `POST https://api.line.me/oauth2/v2.1/verify` (id_token + client_id = LINE_LOGIN_CHANNEL_ID),
then the same user lookup / creation / token_hash runs. No new secret. The old `{ code, … }` body works as before.
Redeploy: `supabase functions deploy line-auth --no-verify-jwt --project-ref pedxoxpammnyfnizljyj`
(needs SUPABASE_ACCESS_TOKEN in the shell; never print it).
