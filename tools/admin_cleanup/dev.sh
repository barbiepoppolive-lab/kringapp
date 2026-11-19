#!/usr/bin/env bash
# LOCAL-ONLY dev server for the admin clean-up screenshots. Supabase points at a path on this same server that Playwright
# answers with SAMPLE data (tools/admin_cleanup/fixture.mjs), so nothing ever reaches the live project.
cd "$(dirname "$0")/../.."
export VITE_AUTH_LIVE=1
export VITE_SUPABASE_URL=http://127.0.0.1:5319/__fake
export VITE_SUPABASE_ANON_KEY=local-fake-anon-key
export VITE_LINE_CHANNEL_ID=
exec npx vite --port 5319 --strictPort --host 127.0.0.1 --base /app/
