# Retention 10 — audit before build (26 Nov 2026)

Base: live app = `join-prompt` c35cedc (release-25nov e3ef78d + join prompt). DB facts below were read from the live
database tonight (152 member rows, 100 face-verified, 129 of them have area = "Bangkok"; 7-day Reel uploads 7–40/day;
share opens 14 days: 167 counted, 865 robot, 210 repeat, 134 LINE in-app preview, 5 own).

Cross-cutting rules every feature below keeps:
- No LINE push, no email, no new web push. Everything is in-app (cards, rows, the existing Activity list).
- Rings: no rule loosened. New Rings exist only in two new daily tasks and they are clipped so a day's task Rings never
  pass today's daily maximum (12 = post 5 + ask 3 + vote 1 + watch 1 + bonus 2). Comments, follows, streaks, openers earn 0.
- Every new public read hides: ghosts, the Kring Team account, `kr8_minor_held` members, members either side blocked,
  test accounts from real members (and the other way round), deleted members (rows gone), unverified members where the
  existing rule hides them. No IP, device, phone or session value leaves the database.
- Live app keeps working before the new bundle ships: only new tables / columns / functions, plus two existing functions
  changed in a backwards-compatible way (`kr8_send_hello`: one new refusal that only fires when a member has switched on
  the new profile question, which only the new bundle can do; `kr8_profile`: unchanged — badges already flow through it).
- Week = `kr8_week_start` = **Monday 00:00 → Sunday 23:59 Bangkok** (this is what `kr8_week_board` and `kr8_close_week`
  use; the brief said Sunday→Saturday, which would not match the board — built Monday→Sunday).
- Leaderboard load: the newcomers league and the fair-play sheet read the existing 1-minute board cache / the same scoring
  function the board uses; no new recurring job except one weekly close (Mon 00:07 Bangkok).

| # | Feature | Verdict |
|---|---|---|
| 1 | Welcome new Locals task | **Build with changes** |
| 2 | "New on Kring" strip | **Build as a change to the existing "New in Bangkok" row** (no second strip) |
| 3 | Follow 3 at sign-up | **Build with changes** |
| 4 | Live on your profile | **Build with changes** |
| 5 | Bangkok at 5 | **Build reduced** (clips go through the normal Reel queue) |
| 6 | Profile question opens the chat | **Build with changes** |
| 7 | Playful openers | **Build as specced** (client only) |
| 8 | Bestie streak | **Build with changes** |
| 9 | Fair-play breakdown | **Build with changes** |
| 10 | Newcomers league | **Build with changes** |

## 1. Welcome new Locals (daily task)
- Fit: strongest evidence we have (5+ likes in 48 h → 80% vs 28% still active at day 3; 85 of 107 approved Reels have <5 likes).
- Holes found + fixes:
  - A list that re-sorts on every open lets a member reshuffle until they get easy Reels and makes "liked all 3" ambiguous →
    the 3 Reels are **picked once per member per Bangkok day and stored** (`kr8_task_welcome_picks`).
  - Three Reels from the same newcomer would be one person getting all the help → **one Reel per newcomer** (their least-liked).
  - Fewer than 3 eligible Reels is the normal case at our size → the task asks for as many as exist (1–3) and pays
    **1 Ring per Reel liked (max 3)**, not a flat +3. No eligible Reel → no task card.
  - "Like for Rings" pushing likes at one person → a Reel leaves the pool at 5 likes, so the task can add at most ~5
    Rings to any newcomer; likes still go through the normal board rules (only verified likers count; same-phone
    accounts count once — the pool also skips Reels whose author is linked to the viewer).
  - Unlike after claiming → claim checks the likes still exist at claim time.
  - Daily cap → the task's Rings are clipped to what is left of today's 12.
- Pool: approved, on the main feed (not profile-only), not hidden, no open report, author joined ≤7 days, Reel ≤48 h old,
  <5 likes, not own, not blocked either way, not ghost / Team / minor-held / test (unless the viewer is test).
  Fewest likes first, then oldest first (closest to the 48 h end).
- Tasks are already face-check gated (`kr8_task_claim`), unchanged.
- Thai: "ต้อนรับเพื่อนใหม่ 3 คน" / "Welcome 3 new Locals"; progress "ถูกใจแล้ว 2 จาก 5" / "2 of 5 likes".

## 2. "New on Kring" strip → change the live "New in Bangkok 👋" row instead
- The founder approved and shipped "New in Bangkok 👋" yesterday (decision 47): first approved Reel per member + first
  Ask answer, round avatars over the top of the Feed. A second strip of the same thing would stack two rows of the same
  faces. **Change**: the existing row now covers **48 h** (was 24 h), shows **max 10 Reel tiles, fewest likes first**
  (unseen still first), keeps the existing gradient ring and first-answer tiles. Pure app change; the server function
  already takes `p_hours` and already applies every exclusion (ghost, Team, minor, blocked, hidden, profile-only, reported).

## 3. Follow 3 at sign-up
- Fit: follower in first 3 days → 42% vs 23%; only 82 follows exist.
- Holes / edge cases:
  - Following needs a face check (`kr8_follow`, m207). → The card only shows for verified members; unverified members see
    nothing new (their 4 steps are unchanged).
  - "Same area" is meaningless today (129 of 152 cards say "Bangkok") → suggestions are face-verified members with at
    least one approved Reel, same area first, then most recently active; never ghost / Team / minor / blocked / test /
    already followed / linked same-phone accounts. 4 shown.
  - Badge rules: the "Bangkok Local ✓" tag needs 4 steps (m216, live). **Change**: Follow 3 is an extra optional row under
    the 4 steps (skippable, progress "2 of 3"), it does not change the tag rule. Turning it into a required 5th step is a
    founder call.
  - "New follower" notice: already exists — every follow is a line in the followed member's Activity (kr8_my_activity
    'follow'). No new message, no push.

## 4. "Live on your profile" instead of "rejected"
- Fit: women's help chats ("I filmed Wat Phra Kaew carefully… didn't pass… I feel hurt", "why do others' clips with no
  person pass"); 99 hidden vs 115 approved in 14 days.
- Today the admin queue has: Approve · Feed / Approve · Profile only (no reason to the member) / Not yet (Reel hidden, tips
  text) / Hide (rule break, reason text).
- **Change**:
  - New one-tap button set in the Reel queue: "Profile only · why?" opens one row of quality reasons (Too dark, Blurry,
    No person, No place shown, Sideways, Too short, Hard to hear, Slow start, At home / indoors). One tap = approved +
    profile-only + that reason. Replaces the "Not yet" button (the not-yet server path stays for the old admin build).
  - Rule breaks stay in Hide with their own message (copied, not a real spot, fake engagement, not right for Kring,
    minors, nudity, unsafe — Hide sheet unchanged).
  - Member sees on their own Reel tile "On your profile" and, on tap, "Live on your profile · not on the main feed yet"
    + the one reason in their language + 2 example Reels from the main feed (approved, most liked in 14 days,
    face-verified author, never Team / ghost / minor / blocked) + "Post another clip". Shown once automatically.
  - Board: profile-only Reels already count (`kr8_reel_scores` does not look at `feed_off`) — unchanged.
- Privacy: examples are Reels already on the public feed.

## 5. Bangkok at 5 — reduced
- Problem with the brief as written: a row that shows every member's 5pm clip to everyone for 24 h is **unreviewed member
  video shown publicly**. "No face needed" street clips also film strangers' faces (PDPA) and could show minors; the
  child-face check (m203) and copy scan run on Reels only after upload and before approval. It would also add a second,
  daily review queue for the founder, and 10-s clips need their own storage clean-up.
- **Built instead (lightest safe handling)**:
  - 17:00–19:00 Bangkok: a slim in-app banner on the Feed ("It's 5pm in Bangkok · show us where you are · 10 seconds, no
    face needed"). No push of any kind. Dismissable for the day.
  - Tap = the normal Reel camera/upload (same trim, same place pin, same checks); the Reel is marked as a "Bangkok at 5"
    clip (`kr8_b5_clips`) and lands in the founder's **existing** Reel queue with a "Bangkok at 5" label. He approves it
    Feed / Profile only / Hide exactly like any Reel (one tap with the new buttons). Founder workload: +0–20 Reels on a
    busy day, in the queue he already works; no new screen.
  - "Bangkok at 5" row (Feed, 24 h): approved clips only, "N people posted their 5pm today" counts approved clips only.
  - Daily task "Bangkok at 5": done when today's 5pm clip is approved; +1 Ring, inside the 12/day cap (it also counts as
    the normal "post" task, as any approved Reel does).
  - Main feed / weekly board: only as the founder's normal approval decides (Feed vs Profile only), like any Reel.
  - Storage: no extra files beyond a normal Reel; hidden ones follow the existing clean-up.

## 6. Profile question opens the chat
- What exists: `qa_q` / `qa_answer` = a prompt the member answers about themselves (14 members use it). Different thing;
  left untouched.
- **Built**: new `open_q` (≤100 chars, the bio checker `kr8_bio_ok` refuses phone numbers / handles / links) and
  `open_q_on` on `kr8_members`. Preset questions per language in the app, or own words.
- When a member has it on: a **new** chat with them can only start by answering (`kr8_open_q_answer`), and the first
  message is the question quoted + the answer, so it reads right in every app version. `kr8_send_hello` refuses a plain
  hello to such a member (`KR8_ANSWER_FIRST`); this can only happen after the new bundle ships (nobody can switch it on
  before). Existing chats, the Kring Team, admin replies: unaffected. All the old checks stay (face check both sides,
  blocks, 15 new chats/day, text check, one thread per pair).
- On/off switch on the member's own card.

## 7. Playful openers
- Client only: when Say hi is opened from a Reel, the 3 opener chips become place-aware (pinned place from the Reel's
  places, else "here"): "What's the one thing I can't miss at {place}?", "This or that: {place} or somewhere nearby?",
  "Two truths and a lie about {place}, go!" (Thai versions in the app), plus free text as today. They pass the existing
  first-hello check. If the member has a profile question on, the answer box replaces the chips (feature 6 wins).

## 8. Bestie streak
- Holes / fixes: invite only between members who follow each other and are both face-verified; max 3 active streaks
  per member; one pending invite per pair; blocked either way ends it. Streak day = a Bangkok day on which BOTH claimed at
  least one daily task (from `kr8_rings_ledger` 'task' rows; tasks are verified-only so this inherits the face check).
  Computed on read (no job). Broken when a full day is missed; "start again" makes a new one. No Rings.
- Nudge: one per sender per pair per Bangkok day, shown in-app to the friend on their bestie card (no push).
- Privacy: the streak shows on both profiles with the partner's first name; if either member has "keep my lists
  private" on, the profile shows the count only, not the name.

## 9. Fair-play breakdown
- Fit: board unfair complaints ("#1 bought views / sign-ups").
- **Exact reconciliation**: the sheet's total is built from the same pieces as `kr8_week_board`: the board's Reels
  (best Reel per posting day, `kr8_reel_scores_adj`), task + Ask-open Rings (ledger 'task' / 'ask_open'), and face-checked
  invite Rings (`kr8_invite_rings`). Raw counts × weights rarely equal a Reel's score (repeat likers count half after 3,
  visitor ×2, daily opens cap, farming cut, rounding), so the sheet shows one honest line "Fair-play adjustments" =
  board score − the plain sum, so the parts always add up to the exact board number (checked by a SQL test against
  `kr8_week_board` for every ranked member).
- Sections: likes from face-verified members / newer members (tap = first names + photo of the likers that counted),
  link opens from outside by app (Facebook / Instagram / TikTok / LINE / other) plus "not counted" lines with plain
  reasons (robot / link preview, same person opened again, the author's own phone, LINE in-app preview), daily tasks,
  face-checked invites, "See day by day".
- Board: tapping a member (photo, name or score) now opens this breakdown; "View profile" is inside it.
- Paid recruiters (m218): no invite line at all, invite Rings 0, the total still equals the board.
- Privacy: only counts per source app and reason; no IP / device / session / country; liker lists respect blocks and
  hide ghosts / Team; available for members on the board (verified), same as the old breakdown.

## 10. Newcomers league
- Board for members whose card was made in the current week (Monday→Sunday Bangkok), read from the existing 1-minute
  board cache (no new load), so it has exactly the main board's Rings and rules (face-verified only, ghosts / minors /
  bans out). Shows rank + "N Rings to #k".
- Weekly close (Mon 00:07 Bangkok, new job): top 3 newcomers of the week that just closed with at least 1 Ring get the
  "Rising Local" tag for the week (stored in `kr8_member_badges`, last week's tags removed first, results kept in
  `kr8_newcomer_results`). No cash, no prize rows. Test accounts never mixed with real ones.

## Added during the build (CoS, founder-approved): m218
- Paid-recruiter rule: `kr8_paid_recruiters` (seeded: member #14 Pich). `kr8_invite_rings` returns 0 for them, so the board,
  the old math sheet, the fair-play sheet, lifetime Rings / level and the Invite screen all drop their invite Rings; ledger rows
  stay. Their invited friends keep their own +10 welcome.
  - Effect on THIS week's board (week started **Mon 23 Nov** 00:00 Bangkok — the board week is Monday→Sunday, not Sunday):
    none. Her two invite rows (+10, +10) are from Sun 22 Nov 19:02–19:11 Bangkok = last week. Dry-run with the rule on: no
    rank or Rings change for anyone this week; #14 stays #1 with 73 (as of the dry-run). Her lifetime Rings 184 → 164.
  - Last week (16–22 Nov, closed): stored results are frozen and not recomputed (she finished #6 with 111 incl. the 20; without
    them 91, which would have been below #7's 103). Her ฿250 prize was already claimed; nothing is clawed back.
- Honorary Founding Local: `kr8_honorary_founding` (seeded: #14 → Founding Local #51, the next number after the 50 real ones).
  `kr8_card_extras.founding_no` shows it; no `kr8_prizes` row, so seats left (0), payouts and claims are untouched;
  `kr8_founding_try` never gives her a ฿100 seat and never re-uses an honorary number; the "Not yet" note never promises her ฿100.
- Both are OFF for real members until go-live (rings_config `paid_recruiter_on`, `honorary_founding_on` = 0; test accounts
  always follow them).

## QA (26 Nov, qa.kringapp.pages.dev)
- 4 throwaway test accounts (qa-r10-*@example.com, kr8_is_test_member = true; only on the test board). Seed `qa_seed.sql`,
  clean-up `qa_unseed.sql` (explore/_r10/).
- Server checks as those accounts (tools/retention10/rpc_tests.mjs): welcome picks / claim / cap, 5pm mark refusals + row +
  claim, opening question refusal + answer + one per pair, normal hello unaffected, bestie mutual-only + streak + nudge +
  profile line, fair play adds up for every ranked test member, no device/IP fields, newcomers league, follow suggestions,
  profile-only reason + examples, admin RPC refused for members, anon refused. All pass.
- The 5pm window was moved to 02:00–04:00 for the screenshots and set back to 17:00 (rings_config `b5_hour` = 17).

---
# Round 2 (26 Nov): test isolation, daily photo, Ask BKK awards, leaderboard orb, rule cards, attention rule

## Test content never reaches real members — m225 (applied)
- Cause: the QA seed Reels were approved and visible; the signed-in feed (`kr8_feed_order`), People, the New in Bangkok row and
  place pages had no test-author filter (the visitor feed and the board already had one).
- Fix at the data level: `kr8_test_hidden(viewer, author)` = the author is a test account and the viewer is not (visitors and the
  founder included). Added to `kr8_feed_order` (→ `kr8_feed_ranked`), `kr8_people`, `kr8_feed_new_faces`, `kr8_ask_q_ok` /
  `kr8_ask_a_ok` (→ Ask feed, threads, vote cards, public Ask pages), `kr8_place_page`, `kr8_onb_alike`. Test accounts still see
  each other, so QA keeps working.
- Proof: `tools/retention10/test_leak_check.sql` runs 21 member reads as a real verified member and as a visitor and searches every
  result for any test account or test post id. Before m225: 8 leaks (feed, People, New in Bangkok, place pages). After: **0**,
  even with the QA posts visible and a promoted test photo on the feed. The QA posts are hidden again anyway (belt and braces).

## Daily photo — m226 (applied)
- One photo a Bangkok day (`kr8_create_photo`; face-checked members only; in-app camera JPEG ≤ 400 KB, no links). It is live on the
  member's profile at once and completes the "Post a photo or Reel" task: **+3 on a photo-only day**, +5 if a Reel is approved that
  day (one claim a day, as before). Photo likes earn no board Rings (the board counts Reels), so a photo's Rings are exactly its +3.
- The tasks sheet shows "Today's photo · +3" first. The sheet shows 3 example shots (back / side / outfit) and the line "Show your
  vibe, your face is optional" in the member's language only.
- Admin: photos wait in the same Reel queue (test photos never). **Feed** = full-screen photo card between Reels (the live app
  already draws these); **Profile only** (no "why"); **Profile only · why?** (one reason); **Hide (rule break)** = hidden + the
  day's photo-rate +3 taken back (one −3 ledger row).
- Feed rule fixed: `feed_off` now applies to photos too, so an unpromoted photo never reaches the main feed.

## Ask BKK awards — m227 (applied, OFF for real members until go-live)
- Daily at 20:00 Bangkok, over the 24 h of top-level answers: "Most helpful" (❤️ 💯) and "Funniest" (😂), +5 each (`ask_award`).
- Votes: face-checked members only, never the author, never an account linked to the author; linked voters (same phone / face /
  look-alike face) count as one; at least 2 voters; reactions after 20:00 count the next day. Answers need 40+ characters (the
  daily task still needs 15+). At most 2 awards per member per week, one award per answer a day. Reactions still give 0.
- Counted by the weekly board, lifetime Rings and the fair-play sheet ("Ask BKK award" line); not under the 12/day task cap.
  A scored day is never rescored, and nothing before go-live is scored (switch `ask_awards_on`).
- App: "Most helpful" / "Funniest" tags on answers; under 40 characters a soft line ("Add your why to be in the running for
  today's award"); a light kindness check on insults ("Want to rephrase?" · Edit · Post anyway).

## Leaderboard orb (Me)
- A round orb (blue + gold ring, soft glow, gentle float; no float with reduced motion) shows this week's rank and the next step
  ("14 to #3", "14 to a prize seat" below the 25-Ring minimum, "Top of the week"). Tap = the weekly board (fair play + newcomers
  league). Without a face check: "Join the board" → the face check.
- Placed top-right in the free space between the header icons and the stats row. Overlap check at 360 / 390 / 430 px, Thai and
  English, two members: no overlap with the photo, stats, icons, Rings chip, name, tabs or grid; always inside the screen.
- It is the one always-on glow in Me: the Rings chip's glow is off next to it, and its red badge hides while a next-step card shows.

## Rule cards (D)
- "How Rings work", the "How to win" sheet (all 3 layouts), the tasks list, the help bot (6 new answers + the Rings answer) and the
  rules page (kringapp.com/rules, in the live-ready folder) now say: best Reel **of each day** counts (board v2 since 23 Nov; the old
  text said "of the week"), opens max **10** a day (help said 30), photo +3 / Reel +5 / Ask BKK +3, Ask BKK awards +5 at 8pm,
  newcomers league + Rising Local tag, bestie streaks give no Rings, Bangkok at 5, where the board orb is.
- Removed false promises found in the live "How to win" sheet and tasks list: "streak day 3 +5 / day 5 +10 / day 7 +20",
  "+1 per person who comments or waves", "friend joins +5 / active 3 days +10", "today's prompt +2". None of these are paid by the
  server (ledger, last 10 days: only task, invite, invite_welcome, ask_award).
- No public text about the paid-recruiter rule. The honorary Founding Local shows only the badge. TrueMoney wording kept.

## Attention rule (B) — fixes, before → after (shots/clutter/*_before.png vs *_after.png)
| Screen | Before | After |
|---|---|---|
| Feed, day 0–3 | 5pm banner over the first-visit steps **and** the "4 tasks left" bubble at once | One item: first-visit steps; the task bubble and the 5pm banner wait |
| Feed, returning member 17–19h | 5pm banner and the task bubble together | Order: task bubble (6 s) → then the 5pm banner |
| Feed after posting | "Your Reel is live · Share" pill stacked over the New in Bangkok row | The row waits until the pill closes |
| Me, day 3 | "Claim ฿100" card + red "1" on the Rings chip (same action twice) + "Show on Google?" card (third coloured button) | One call to action (the card); chip badge quiet; Google card waits until no next step and after the first 3 days; orb added as the only glow |
Order everywhere: face check > first-visit steps / first post > today's task reminder > 5pm banner > streak nudge (in-app dot in Me) >
league (inside the board). The orb is the one always-on element in Me.

## Retention per day (one next action, a reaction within 48 h)
| Day | Next action on screen | Reaction within 48 h |
|---|---|---|
| 0 | First-visit steps strip (vote → Ask → 3 likes → first clip); Follow 3 row | First clip/photo → "Welcome new Locals" task puts it in front of every active member (≤5 likes, fewest first); New in Bangkok row 48 h; followed members get the Activity line |
| 1–2 | Steps strip until done; tasks orb (photo +3 first) | Welcome task (likes), Ask BKK answer replies / awards at 8pm, bestie nudges |
| 3 | Steps end; tasks orb; Me next-step card | Same + newcomers league rank on the board orb |
| 7 | Tasks orb, board orb ("N to #k"), 5pm banner in the evening | Board / fair-play, Rising Local tag for last week's top 3 newcomers |
Dead ends found and closed: a member with no Reel and no photo had nothing that brings likes (now the photo +3 and the welcome
task); an unchecked member had no board entry point in Me (now "Join the board" orb → face check).
Known gap: there is no reaction guarantee for a member who posts nothing; the evening summary (off) and pushes are out of scope (no LINE).

## Farming paths (every way to gain Rings, and its cap)
| Source | Cap / guard |
|---|---|
| Likes on Reels | face-checked likers full (same liker counts half after 3 of your Reels a week); unchecked likers 1 each, max 2/day per creator, only after 24 h; linked accounts (same phone / face) never; best Reel of each day only |
| Saves ×3 | face-checked savers only; same repeat rule |
| Link opens ×5 | max 10/day per Reel; robots, LINE previews, repeats, the poster's own phone/session never |
| Visitor ×2 | face-checked travellers only |
| Daily tasks (post / ask / vote / watch / bonus, welcome, 5pm) | face-checked only; each once a day; welcome + 5pm clipped so the day never passes 12 |
| Photo +3 | 1 a day, in-app camera JPEG; shares the post task slot with Reels (one claim); rule-break Hide takes it back |
| Welcome task | picks fixed per day; one Reel per newcomer; only Reels under 5 likes; linked authors excluded; 1 Ring per Reel |
| Bangkok at 5 +1 | only after the founder approves the clip; 1 a day; within the 12 |
| Ask BKK awards +5 | 2 a day site-wide; face-checked voters, linked voters count once, no self-votes, ≥2 voters, 40+ chars, max 2 a member a week |
| Invites +10 | after the friend's face check; 20 a day; 0 for paid recruiters |
| Follows, comments, reactions, openers, bestie streaks, question answers | 0 Rings |
Residual risk: two real face-checked friends can vote for each other's answers (max +10 a week each, by the weekly cap).

## Combined re-audit (E) — pass/fail
| # | Check | Result |
|---|---|---|
| 1 | Rings math end to end | **PASS**: fair play = board for all 22 ranked real members (0 mismatches, 0 lag) and all 4 test members incl. photo +3 and award +5; photo pays 3 not 5; second photo refused; award day not rescored. Note: 2 real members had 13 task Rings on 23 Nov from the old "open +1" task (before this release, since switched off) |
| 2 | Farming paths listed + capped | **PASS** (table above; one residual risk noted) |
| 3 | One attention item per screen, priority with the orb | **PASS** (before/after pairs; orb is the only Me glow) |
| 4 | Language mode | **PASS**: automated scan of every new UI block in all Thai and English shots: no English words in Thai mode, no Thai in English mode (the ฿ sign only). Other app languages (zh/hi/ja/ko) read English on new screens |
| 5 | Zero test content in live reads | **PASS**: 21 reads × member + visitor = 42 calls, 0 leaks |
| 6 | Live app unchanged until deploy | **PASS**: board md5 identical before/after m226 + m227; every changed live function only acts on things the live app cannot create (photos, opening questions) or sits behind a switch that is off (paid recruiter, honorary badge, awards). One intended live change: m225 (test content hidden from real members) |
| 7 | Rollback | **PASS**: all 10 UNDO files applied newest-first in one transaction: every new function gone, the board still computes (22 rows); rolled back |
