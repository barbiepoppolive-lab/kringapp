# Kring LINE closer bot: deploy guide (for Barbie / Argon)

One Supabase Edge Function (`line-oa-webhook`) serves all five LINE Official Accounts:

| OA | Role | What the bot does |
|---|---|---|
| `@304ikyuf` | host | Pitches hosts: greeting, then qualify (zone, activity, days/times, referral code), then offer, then sign-up link, then onboarding |
| `@806oxwvj` | sup | Connector pitch, personal `C-xxxx` code + link, PromptPay phone |
| `@194hsqbc` | venue | Sends a greeting, then hands off to Barbie (no venue facts are locked yet) |
| `@266jjwqh` | general + scout | Lets the lead choose: **book an activity (guest waitlist)** / host / connector. Also runs scout applications (`ภาคสนาม` / `สเก๊าต์` / `scout` / `สมัคร`) |
| `@825eyKYW` | general | Lets the lead choose: book an activity (guest waitlist) / host / connector |

On **any** OA, guest-intent words (อยากจอง, จองยังไง, หาคนพา, ช่างภาพพาเดิน, how to book …) switch the lead to the guest waitlist. Weak words (อยากไป, book) only do this when the lead hasn't started a flow yet.

## How a free-text message is handled (replies are instant)

Every inbound message goes through these layers in order, and the first one that handles it replies through the free Reply API:

1. **Safety switches.** STOP / ไม่สนใจ / หยุด opts the lead out. "คุยกับคน" / "ขอคุยกับแอดมิน" pauses the bot for that lead. Opted-out and paused leads get no auto-reply.
2. **Stage machine: the expected answer.** For example, the zone while we're asking for the zone, "สมัครเลย" in pitch, or a PromptPay phone number. The answer is stored and the next question goes out.
3. **FAQ intents (`core/faq.ts`).** These are instant, fixed answers in Thai and English, built only from locked playbook facts:
   - Intents: trust/scam, how and when you get paid, fees, price setting, activities, guests/safety, time commitment, location, launch, ID check, age (scouts only), no-show/cancel, how to sign up, company/website, Sup pay, scout pay.
   - Each answer is at most 4 lines and ends with the lead's next-step question, or repeats the current stage's question.
   - "How do I sign up" sends the real sign-up link template to hosts and the personal code to Sup connectors.
   - The matched intent is saved on the turn (`kr7_line_turns.intent`) and in `notes.last_intent`.
   - Where the playbook has no fact, there is deliberately no intent, so those questions fall through to step 4 or 5. Examples: host age, English ability, venue terms.
4. **LLM, only if a key is set.** The order is `ANTHROPIC_API_KEY`, then `GEMINI_API_KEY`. Both use the same system prompt and JSON contract, an 8-second timeout, the guardrail, and one regeneration.
5. **Instant acknowledgement + agent queue.** The lead gets *"ขอบคุณค่ะ 🙏 ได้รับข้อความแล้ว เดี๋ยวตอบกลับในแชทนี้นะคะ"* (at most once per 10 minutes) and is flagged `needs_human`. The scheduled Claude agent then reviews what's left (step 9b). The same fallback is used whenever an LLM call fails or a reply fails the guardrail.

Every outbound text (templates, FAQ, LLM, agent replies, follow-ups) then goes through:
- **Brand-voice filter (`core/voice.ts`).** Barbie is female-polite. ครับ becomes ค่ะ (or คะ in questions), นะครับ becomes นะคะ, and the pronoun ผม/กระผม becomes เรา. ผม meaning hair (ทำผม, ตัดผม, ผมยาว …) is left alone.
- **Guardrail.** It blocks never-words, any baht amount or percentage outside the allowed set, foreign URLs, and texts over 700 characters.

**Intended setup: `BOT_MODE=auto` and no `ANTHROPIC_API_KEY`.** `GEMINI_API_KEY` is optional; the free Google AI Studio tier is fine. The bot answers everything it can with fixed templates (greetings, qualifying questions, offer, sign-up link, Sup code, scout application, STOP). Any other free-text question gets an instant short acknowledgement. The lead is then flagged, and a **scheduled Claude agent** (running on the founder's Claude subscription) picks it up through the Agent API (step 9b) and replies by Push.

Nothing in this repo contains a secret. Every value marked `<...>` below has to be filled in by you.

---

## 0. Prerequisites

```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
cd /path/to/kring-repo       # the repo that holds supabase/ (copy these files in, see step 1)
supabase link --project-ref <PROJECT_REF>
```

## 1. Copy the files into the main repo

```
supabase/functions/line-oa-webhook/index.ts      (replaces the old W1 file; all old exports still exist)
supabase/functions/line-oa-webhook/core/*.ts
supabase/migrations/0019_line_closer_bot.sql
```

## 2. Apply the migration

```bash
supabase db push            # applies 0019 (idempotent; safe to re-run)
```

Or paste `0019_line_closer_bot.sql` into Dashboard → SQL Editor and run it. It creates `kr7_line_leads`, `kr7_line_turns`, `kr7_scouts` and `kr7_scout_results`, with RLS on and access for `service_role` only.

## 3. Collect each OA's credentials

For **each** of the 5 channels, open LINE Developers console → Provider → channel → **Messaging API** tab:

- **Channel secret**: Basic settings tab
- **Channel access token (long-lived)**: Messaging API tab → Issue
- **Bot user ID** (the `destination` LINE sends): run this once per channel on your own machine:
  ```bash
  curl -s -H "Authorization: Bearer <ACCESS_TOKEN>" https://api.line.me/v2/bot/info
  # → {"userId":"Uxxxxxxxx...", "basicId":"@304ikyuf", ...}
  ```
  `botUserId` is optional. Without it the function tries every secret until one verifies. With it, routing is exact and faster.

## 4. Set the secrets

Make a local file **outside git** (for example `~/kring-secrets/line-bot.env`). `LINE_OAS_JSON` must be on **one line**:

```dotenv
LINE_OAS_JSON=[{"basicId":"@304ikyuf","role":"host","channelSecret":"<SECRET>","accessToken":"<TOKEN>","botUserId":"<Uxxx>"},{"basicId":"@806oxwvj","role":"sup","channelSecret":"<SECRET>","accessToken":"<TOKEN>","botUserId":"<Uxxx>"},{"basicId":"@194hsqbc","role":"venue","channelSecret":"<SECRET>","accessToken":"<TOKEN>","botUserId":"<Uxxx>"},{"basicId":"@266jjwqh","role":"general","channelSecret":"<SECRET>","accessToken":"<TOKEN>","botUserId":"<Uxxx>","scoutApplications":true},{"basicId":"@825eyKYW","role":"general","channelSecret":"<SECRET>","accessToken":"<TOKEN>","botUserId":"<Uxxx>"}]
BOT_MODE=auto
AGENT_SECRET=<long random string, e.g. output of: openssl rand -hex 32>
# optional free LLM fallback (Google AI Studio). Sent as the x-goog-api-key header, never in the URL.
GEMINI_API_KEY=<AQ.... key from aistudio.google.com>
GEMINI_MODEL=gemini-2.5-flash
FOLLOWUP_DAILY_CAP=50
FOLLOWUP_MONTHLY_CAP_PER_OA=250
FOLLOWUP_CRON_SECRET=<long random string, e.g. output of: openssl rand -hex 32>
```

```bash
supabase secrets set --env-file ~/kring-secrets/line-bot.env
supabase secrets list        # check the names (values are hidden)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically. Do not set them yourself.

**Legacy fallback:** if `LINE_OAS_JSON` is missing or invalid, the function falls back to the old `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` and treats that channel as `@266jjwqh` with role `general`. Once `LINE_OAS_JSON` works you can remove the old ones: `supabase secrets unset LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN`.

## 5. Deploy the function

```bash
supabase functions deploy line-oa-webhook --no-verify-jwt
```

`--no-verify-jwt` is required because LINE doesn't send a Supabase JWT. Every request is authenticated by `x-line-signature` instead, and the follow-up endpoint by `x-cron-secret`.

Health check (it returns no data):
```bash
curl https://<PROJECT_REF>.supabase.co/functions/v1/line-oa-webhook
# {"ok":true,"service":"kring-line-oa-webhook",...}
```

## 6. Point each OA at the webhook (LINE Developers console)

Only OAs listed in `LINE_OAS_JSON` are accepted. A webhook from any other OA fails signature verification with a 401. If `@825eyKYW` should use the bot, add it to `LINE_OAS_JSON`. If not, don't point its webhook here.


Repeat for **all 5 channels**: Messaging API tab →

1. **Webhook URL** = `https://<PROJECT_REF>.supabase.co/functions/v1/line-oa-webhook` (the same URL for every OA)
2. Click **Verify**. It should say *Success*. Verify sends an empty event list, signed with that channel's secret.
3. Turn **Use webhook** ON.
4. Optional: turn **Webhook redelivery** ON. Redelivered events are de-duplicated by `webhookEventId`.

## 7. Stop LINE's own auto-messages so nothing replies twice

In **LINE Official Account Manager** (manager.line.biz) → each OA → **Settings → Response settings**:

- **Greeting message: OFF**. The bot sends its own greeting on `follow`.
- **Auto-response messages: OFF**
- **Webhooks: ON**
- **Chat: ON** is fine. You can still read conversations and reply by hand in OA Manager. (The bot can't see your manual replies; see step 10.)

The Messaging API tab in LINE Developers has the same "Auto-reply messages" and "Greeting messages" switches. Make sure they are disabled there too.

## 8. Schedule the follow-ups (day 4 / day 9, Push API)

The follow-ups run when someone POSTs to `…/line-oa-webhook/followups` with header `x-cron-secret`. Run this once in the SQL Editor, and put your real cron secret in place of the placeholder:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<SAME FOLLOWUP_CRON_SECRET AS STEP 4>', 'line_followup_cron_secret');

select cron.schedule(
  'kring-line-followups',
  '*/30 * * * *',              -- every 30 min; the function itself only sends 09:30–20:00 Asia/Bangkok
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/line-oa-webhook/followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'line_followup_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

Each run checks these rules:
- Bangkok time is between 09:30 and 20:00.
- The lead has not replied since our last message, has not opted out, is not paused, and has had fewer than 2 follow-ups.
- The day's total is under `FOLLOWUP_DAILY_CAP` (default 50, across all OAs).
- That OA's month total is under `FOLLOWUP_MONTHLY_CAP_PER_OA` (default 250; the free LINE plan allows 300 pushes per OA per month).

Replies use the Reply API, which is free and doesn't count toward the quota.

To stop the follow-ups: `select cron.unschedule('kring-line-followups');`

## 9. BOT_MODE

With no `ANTHROPIC_API_KEY`, `BOT_MODE=auto` is the intended setting: templates go out directly, and anything else gets the acknowledgement and is answered by the agent (9b). Shadow mode is still there if you want to review what the templates would send before going live:

- `BOT_MODE=shadow`: every lead gets only *"ขอบคุณค่ะ ทีมงานจะตอบกลับเร็วๆ นี้นะคะ 🙏"*. The reply the bot would have sent is stored as a draft for you to review. STOP confirmations are still sent in shadow mode. Follow-ups are stored as drafts and are not pushed.
- `BOT_MODE=auto`: the bot replies directly (this is the default if the variable isn't set).

Review drafts:
```sql
select l.oa_basic_id, l.display_name, l.role, l.stage, t.created_at, t.source, t.text
from kr7_line_turns t join kr7_line_leads l on l.id = t.lead_id
where t.direction = 'draft'
order by t.created_at desc limit 50;
```

Switch to auto when you're happy with the drafts:
```bash
supabase secrets set BOT_MODE=auto
supabase functions deploy line-oa-webhook --no-verify-jwt   # redeploy so the new value is picked up
```

## 9b. Agent API (the scheduled Claude agent is the brain)

**What happens without an LLM key.** When a lead sends free text the stage machine can't handle (a question, an objection, anything off-script):
- The bot replies at once through the free Reply API: *"ขอบคุณค่ะ 🙏 ได้รับข้อความแล้ว เดี๋ยวตอบกลับในแชทนี้นะคะ"*, or in English: *"Thank you 🙏 Got your message, we'll reply in this chat shortly."*
- It sends this **at most once per 10 minutes per lead**. Three messages in a row get one ack.
- It sets `notes.needs_human = true`, `notes.pending_question` (all their unanswered messages, newest last) and `notes.flagged_at` (the first time they were flagged).
- It never calls any LLM and never waits.

**Set the secret** (it's already in the env file from step 4):
```bash
supabase secrets set AGENT_SECRET=<long random string>
supabase functions deploy line-oa-webhook --no-verify-jwt
```
Give the same value to the scheduled Claude agent as a secret. If `AGENT_SECRET` isn't set, all three routes return **503**. A missing or wrong `x-agent-secret` header returns **401**; the comparison is constant-time.

Base URL: `https://<PROJECT_REF>.supabase.co/functions/v1/line-oa-webhook`

### POST /agent-queue: what needs an answer
```bash
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/line-oa-webhook/agent-queue" \
  -H "x-agent-secret: <AGENT_SECRET>" -H "Content-Type: application/json" -d '{}'
```
Returns `{ ok, leads: [...], counts }`.
- `leads`: up to 30 leads with `needs_human = true` that are not opted out and not paused, oldest flagged first. Each one has `id, oa_basic_id, role, stage, lang, display_name, zone, activity_idea, availability, scout_code, ref_code, followups_sent, last_inbound_at, last_outbound_at, notes` and the last 15 `turns` (`direction, text, source, created_at`).
- `counts`: `{ needs_human, total_leads, by_stage, scouts_by_status, today_inbound }`. `today_inbound` counts from 00:00 Bangkok time.
- Leads that asked for a human (`notes.paused = true`) are **not** in the queue. Those are for Barbie (step 10).

### POST /agent-reply: answer one lead (Push API)
```bash
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/line-oa-webhook/agent-reply" \
  -H "x-agent-secret: <AGENT_SECRET>" -H "Content-Type: application/json" \
  -d '{"leadId":"<LEAD_UUID>","text":"ไม่ต้องมีประสบการณ์ค่ะ 🙏\nอยากจัดกิจกรรมแบบไหนคะ?","fields":{"zone":"อารีย์"},"quickReplies":["เดินคาเฟ่","เวิร์กช็อป"]}'
```
Body fields:
- `leadId` and `text`: required.
- `stage`, `fields: {zone, activity_idea, availability}`, `quickReplies` (up to 13 labels of at most 20 characters each), `keepFlag`, `retryKey`: optional. `retryKey` is a UUID; reuse it when retrying so LINE doesn't deliver the same push twice.

What the server does:
1. Runs the **same guardrail** on the text and every quick-reply label. If anything fails it returns **422** `{violations}` and **nothing is sent**.
2. Returns **409** if the lead opted out or is paused (or their OA isn't configured), **404** if the lead doesn't exist, and **400** for bad input.
3. Checks the per-OA monthly push count. Follow-ups and agent replies share `FOLLOWUP_MONTHLY_CAP_PER_OA`. At the cap it returns **429** and sends nothing.
4. Pushes with that OA's access token, records the turn with `source = 'agent'`, sets `last_outbound_at`, and clears `needs_human`, `pending_question` and `flagged_at` unless `keepFlag: true`. If the push fails it returns 502, records nothing, and the lead stays flagged.
5. Applies `stage` only when it is a forward move. Otherwise it returns **422** `stage_not_allowed` and nothing is sent:
   - `won` is never allowed.
   - `lost` is allowed only for host/sup leads, and only when the text is a polite close (ขอบคุณ / ไว้โอกาสหน้า / thank you / no worries …).
   - `close` is allowed only for host leads in `new`, `qualify` or `pitch`. **The server appends the fixed sign-up link and 3-step template after the agent's text**, so the link (`https://kringapp.com/app/#hverify?ref=<scout code or oa>`) is always correct. Don't put a link in `text` yourself.
   - Other forward moves: host `new → qualify/pitch`, `qualify → pitch`, `close → onboarding`; sup `new → pitch`.

The reply is `{ ok: true, pushed: true, stage, stageApplied, messages, pushesUsedThisMonth }`. Agent replies are pushed even when `BOT_MODE=shadow`, because the agent is the reviewer.

### POST /agent-note: leave a note, send nothing
```bash
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/line-oa-webhook/agent-note" \
  -H "x-agent-secret: <AGENT_SECRET>" -H "Content-Type: application/json" \
  -d '{"leadId":"<LEAD_UUID>","note":"Asked about pricing for groups; needs Barbie"}'
```
Appends `{at, note}` to `notes.agent_log` (keeps the last 50). The lead stays flagged.

### Suggested agent loop
Run it every 15–30 minutes between 09:30 and 20:00 Bangkok time:
1. Call `agent-queue`.
2. For each lead, read `pending_question` and the turns, then answer using the locked playbook. Use `agent-reply`, or `agent-note` plus `keepFlag` if Barbie must decide.
3. Stop if you get a 429.

Each `agent-reply` is **one Push** and uses one unit of that OA's monthly quota.

## 9c. Guest waitlist (role `guest`)

Kring serves Thai guests as much as foreign ones. Guests go through 4 questions, one at a time, each with quick replies:
1. What would you like to do (เดินคาเฟ่ / ถ่ายรูปกับช่างภาพ / เดินตลาด-ของกิน / เวิร์กช็อป / บอร์ดเกม / อื่นๆ)
2. Which area (or ยังไม่แน่ใจ)
3. When (เสาร์-อาทิตย์ / วันธรรมดาเย็น / ยังไม่แน่ใจ)
4. How many people (1–2; anything above 2 is politely refused and asked again)

They then get *"ลงชื่อรอไว้แล้วค่ะ ✨ Kring เปิดเดือนพฤศจิกายน จะแจ้งในแชทนี้ทันทีที่มีโฮสต์ย่านที่คุณเลือกนะคะ"* and their stage becomes `waitlist`. Answers are stored in `notes.guest_activity / guest_area / guest_when / guest_size`.

Details:
- **Activity framing only.** A request for company or a date (หาเพื่อน, เพื่อนเที่ยว, ไม่มีใครไปด้วย, companion, date) gets redirected to "Kring is a 90-minute activity at a public place". The guardrail also blocks those words in every outbound message.
- **Guest FAQ (instant).** How booking works, price (the host sets it and is paid at the meeting point; tickets ฿199/฿299/฿499 or 7-Day Pass ฿590), *ฟรีไหม* (gets *ตั๋วใบแรกฟรีสำหรับผู้ใช้ใหม่*), safety, launch (November), languages (the app works in 7: Thai, English, Chinese, Korean, Hindi, Russian, Malay), and group size (max 2).
- **No automatic follow-ups for guests.** You message them when you choose to, for example when a host goes live in their area:
  ```sql
  select line_user_id, oa_basic_id, notes->>'guest_activity' activity, notes->>'guest_area' area, notes->>'guest_when' "when", notes->>'guest_size' size
  from kr7_line_leads where role = 'guest' and stage = 'waitlist' and not opted_out order by notes->>'guest_area';
  ```
  Send those messages with `agent-reply` (it's a Push, so it counts toward that OA's monthly cap).

## 9d. Host profile videos / photos

- **The request.** Right after a host gets the sign-up link (or reaches onboarding by any route, including an agent or LLM stage move), the bot sends the 🎥 request once. It asks for a 15–20 second phone video of their activity and says it will be used for their profile and Kring's social media. Typing **ไม่โปรโมต** sets `notes.promo_consent = false` and marks their existing videos as not for promotion.
- **When a host sends a video or image:**
  1. It's downloaded from `https://api-data.line.me/v2/bot/message/{id}/content` with that OA's token.
  2. It's uploaded to the **private** bucket `kring-creative` at `host_videos/<oa>/<lead_id>/<messageId>.mp4` (images go to the same folder as `.jpg`).
  3. It's recorded in `notes.videos[]` or `notes.photos[]` as `{path, at, message_id, bytes, promo_consent}`.
  4. The host gets *"ได้รับวิดีโอแล้วค่ะ ขอบคุณมากนะคะ ✨"* (or the photo version).
- **Edge cases:**
  - Files over 50 MB are not stored, and the host is asked for a shorter clip.
  - If the upload fails, the video is still transcoding on LINE's side (HTTP 202), or the video came from an external provider, the host is still thanked and the lead is flagged `needs_human` with `notes.media_issue.message_id`. You can re-fetch it from LINE or ask for it again.
  - Only `host` leads are processed. Opted-out hosts are ignored. For paused hosts the file is stored but there's no auto-reply.
- The bucket must already exist and stay private. Uploads use the service-role key, so no storage policy changes are needed.

## 10. Human takeover and the "needs you" queue

- If a lead types **คุยกับคน**, **ขอคุยกับแอดมิน**, "talk to a human" and so on, the bot replies *"ได้เลยค่ะ Barbie จะตอบในแชทนี้นะคะ 🙏"*, sets `notes.paused = true`, and stops auto-replying to that lead. Their messages are still logged. Answer them in OA Manager chat.
- To silence the bot for a lead yourself before you reply by hand:
  ```sql
  update kr7_line_leads set notes = notes || '{"paused":true}'
  where oa_basic_id = '@304ikyuf' and display_name = '<name>';
  ```
- To hand the lead back to the bot:
  ```sql
  update kr7_line_leads set notes = notes || '{"paused":false,"needs_human":false}' where id = '<lead id>';
  ```
- Everything waiting for an answer: the agent queue, plus paused leads, which only Barbie handles:
  ```sql
  select id, oa_basic_id, role, stage, display_name, updated_at, notes
  from kr7_line_leads where notes->>'needs_human' = 'true' order by updated_at desc;
  ```
- Every message is still mirrored into `kr6_oa_messages`, so the Control Room console keeps working.

## 11. Scouts and payouts

- A completed application creates a `kr7_scouts` row (`S-xxxx`, status `applicant`). To promote a scout: `update kr7_scouts set status = 'trial' where scout_code = 'S-xxxx';`
- When a referred host reaches the sign-up link, a `kr7_scout_results` row is written with `verified = false`. Once you've confirmed ID verification, a published activity and a weekly slot, mark it verified: `update kr7_scout_results set verified = true, verified_at = now() where id = '...';`
- Pay the previous day's verified results by PromptPay, then set `paid = true`. The table refuses `paid` unless `verified` is true.
- PromptPay phones are in `kr7_line_leads.notes->>'promptpay_phone'`. Long digit strings that look like bank account or ID numbers are redacted before anything is stored.

## 12. Rollback

- To make the bot go quiet without undeploying: set `BOT_MODE=shadow` and redeploy.
- To turn it off completely: switch **Use webhook** OFF for each channel in LINE Developers, and turn the OA Manager greeting and auto-response back ON if you want them.

## 13. Run the tests locally

```bash
cd linebot && npm install && npm test        # vitest, 473 tests, no network
npx tsc --noEmit                             # type-check
```

## Environment variables

| Name | Required | Default | Purpose |
|---|---|---|---|
| `LINE_OAS_JSON` | yes* | (none) | JSON array `{basicId, role, channelSecret, accessToken, botUserId?, scoutApplications?}` |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | *legacy* | (none) | Single-OA fallback (role `general`, `@266jjwqh`) |
| `ANTHROPIC_API_KEY` | **no (leave unset)** | (none) | Optional. If set, the bot answers free text itself with Claude. Unset (the intended setup): instant acknowledgement plus flag for the agent queue |
| `GEMINI_API_KEY` | no (optional) | (none) | Free LLM fallback, used only when `ANTHROPIC_API_KEY` is unset. Sent as the `x-goog-api-key` header |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | `gemini-2.0-flash` is retired (returns 404) |
| `AGENT_SECRET` | yes, for the agent | (none) | `x-agent-secret` for `/agent-queue`, `/agent-reply`, `/agent-note` (503 if unset) |
| `CLAUDE_MODEL` | no | `claude-sonnet-4-5` | Any Messages-API model id |
| `LLM_TIMEOUT_MS` | no | `8000` | Timeout per Claude call (at most 1 call plus 1 regeneration) |
| `BOT_MODE` | no | `auto` | `auto` or `shadow` |
| `FOLLOWUP_DAILY_CAP` | no | `50` | Follow-up pushes per Bangkok day, all OAs combined |
| `FOLLOWUP_MONTHLY_CAP_PER_OA` | no | `250` | Pushes per OA per month, follow-ups and agent replies combined (the free plan allows 300) |
| `FOLLOWUP_CRON_SECRET` | for follow-ups | (none) | Must match the `x-cron-secret` header the cron job sends |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | auto | (none) | Injected by Supabase |
