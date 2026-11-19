-- 0124 · Fake Finder (19 Nov 2026). WRITTEN, NOT APPLIED. ADDITIVE + RE-RUNNABLE.
--
-- WHAT IT DOES
--   A robot (kr8_fake_score_run, pg_cron every 15 min) gives every member active in the last 14 days a "fake account" score
--   0-100 with plain-English reasons, stored in kr8_fake_scores. green < 30 · amber 30-60 · red > 60, and RED only when at
--   least two INDEPENDENT kinds of evidence agree (else it stops at amber). Nothing is deleted and nobody is ghosted by the
--   robot: ghosting is only the founder's "Ghost" button (kr8_admin_fake_decide).
--
--   Effects (reversible: the founder's Clear, or the switch fake_effects_on = 0, turns them all off at once):
--     amber  their likes / saves / share-opens give no Rings until they pass the face check (verified).
--     red    hidden from People, their Reels are off the board, their likes / saves / opens give no Rings,
--            a prize claim is held for the founder ('fake_red' review reason), and a red alert 'fake:<user_id>' is raised.
--   One helper decides all of it: kr8_fake_level(user) (+ kr8_fake_counts(user) for "do their likes count").
--   The four live functions that use it (kr8_reel_scores, kr8_people, kr8_claim_prize, kr8_founding_try) are patched IN PLACE
--   from their LIVE bodies (kr8_fake_patch: exact text anchors, each must occur once, else nothing is changed and the
--   result says why). Results are in kr8_fake_log (action 'patch') and in kr8_admin_fake_list() -> patches.
--
--   Face matching fix (bug: #98's live-check face code was 'same' (0.48-0.50) as three different women, and
--   kr8_founding_try refused her Founding prize on the single 0.50 face_same_max):
--     per-source thresholds (thousandths of face-api distance), conservative until the calibration script is run on live:
--       face check vs face check  (vv)  same <= face_same_max_vv 0.40 · looks alike <= face_maybe_max_vv 0.50
--       card photo vs card photo  (cc)  same: never (0)               · looks alike <= face_maybe_max_cc 0.45
--       card photo vs face check  (cv)  same: never (0)               · looks alike <= face_maybe_max_cv 0.45
--       ('claim' face codes count as face checks.) 0 = this pair kind is never 'same'.
--     Only 'same' writes a 'face' LINK (no Rings between them, claims held, Founding refused). Anything below 'same' is a
--     'face_maybe' FLAG only (never holds, never removes Rings): kr8_face_nearest, kr8_face_match_links, kr8_founding_try.
--     Old 'face' links made under the 0.50 rule are NOT changed automatically: kr8_face_relink_0124(false) lists the ones the
--     new rule would downgrade; kr8_face_relink_0124(true) downgrades them to 'face_maybe' (logged, undoable).
--
--   Client device id: the app keeps localStorage 'kr8_did' (same value as the older 'kr8_device' used for claims) and sends it
--   with every client event; kr8_log_client gains p_did and stores the caller's network hash. Once a day the app logs
--   'device_seen' so every active member has a device id on file.
--
--   Photo AI hook: table kr8_photo_ai(user_id, verdict 'ok'|'suspect'|'fake', reason, photo, ...) for a future edge function.
--
-- SWITCHES (kr8_rings_config): fake_on (robot runs), fake_effects_on (amber/red effects), fake_amber_min 30, fake_red_min 61,
--   face_*_vv / _cc / _cv thresholds, face_self_card_max 600, fake_sface_card_min 300.
--
-- UNDO: supabase/undo/0124_fake_finder_UNDO.sql  (quick: update kr8_rings_config set value = 0 where key in ('fake_on','fake_effects_on');)
begin;

-- ───────────── switches + thresholds ─────────────
insert into public.kr8_rings_config (key, value, note) values
  ('face_same_max_vv', 400, 'face-api distance (thousandths): face check vs face check at or under this = SAME person (link) (0124)'),
  ('face_maybe_max_vv', 500, 'face check vs face check at or under this = looks alike (flag only) (0124)'),
  ('face_same_max_cc', 0, 'card photo vs card photo at or under this = SAME person; 0 = never (0124)'),
  ('face_maybe_max_cc', 450, 'card photo vs card photo at or under this = looks alike (flag only) (0124)'),
  ('face_same_max_cv', 0, 'card photo vs face check at or under this = SAME person; 0 = never (0124)'),
  ('face_maybe_max_cv', 450, 'card photo vs face check at or under this = looks alike (flag only) (0124)'),
  ('face_self_card_max', 600, 'own card photo vs own face check further than this = "photo does not look like the live face" (0124)'),
  ('fake_sface_card_min', 300, 'backup face engine: own selfie vs own card photo similarity (thousandths) under this = photo mismatch (0124)'),
  ('fake_on', 1, '1 = the Fake Finder robot scores members every 15 min (0124)'),
  ('fake_effects_on', 1, '1 = amber: likes give no Rings until verified; red: hidden from People + board, claims held (0124)'),
  ('fake_amber_min', 30, 'fake score at or above this = amber (0124)'),
  ('fake_red_min', 61, 'fake score at or above this AND 2+ independent checks = red (0124)')
on conflict (key) do nothing;

-- ───────────── tables (admin-only: RLS on, no policies, no grants) ─────────────
create table if not exists public.kr8_fake_scores (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  score         int not null default 0 check (score between 0 and 100),
  level         text not null default 'green' check (level in ('green', 'amber', 'red')),   -- the robot's level
  reasons       jsonb not null default '[]'::jsonb,                                        -- [{code, points, text, group, with}]
  groups        int not null default 0,                                                    -- independent kinds of evidence
  updated_at    timestamptz not null default now(),
  cleared_by    uuid,
  cleared_at    timestamptz,
  cleared_codes text[] not null default '{}',                                              -- reasons the founder already saw on Clear
  override      text check (override in ('clear', 'keep_red', 'ghost'))                     -- the founder's decision (wins over level)
);
create index if not exists kr8_fake_scores_level on public.kr8_fake_scores (level, score desc);
alter table public.kr8_fake_scores enable row level security;
revoke all on public.kr8_fake_scores from public, anon, authenticated;

create table if not exists public.kr8_fake_log (
  id         bigserial primary key,
  user_id    uuid,                -- no FK: the log survives the account
  action     text not null,       -- level | reflag | clear | keep_red | ghost | reset | relink | patch | run
  from_level text,
  to_level   text,
  score      int,
  detail     jsonb not null default '{}'::jsonb,
  by_user    uuid,
  at         timestamptz not null default now()
);
create index if not exists kr8_fake_log_user on public.kr8_fake_log (user_id, at desc);
alter table public.kr8_fake_log enable row level security;
revoke all on public.kr8_fake_log from public, anon, authenticated;
revoke all on sequence public.kr8_fake_log_id_seq from public, anon, authenticated;

-- hook for a later edge function (AI look at the card photo). Nothing fills it yet.
create table if not exists public.kr8_photo_ai (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  verdict    text not null check (verdict in ('ok', 'suspect', 'fake')),
  reason     text,                 -- plain English, e.g. 'AI-made face', 'stock photo', 'celebrity'
  photo      text,                 -- the card photo path that was checked (a newer photo makes the verdict stale)
  model      text,
  checked_at timestamptz not null default now()
);
alter table public.kr8_photo_ai enable row level security;
revoke all on public.kr8_photo_ai from public, anon, authenticated;

-- client events: the app's own device id + the caller's network hash
alter table public.kr8_client_events add column if not exists did text;
alter table public.kr8_client_events add column if not exists ip_hash text;
create index if not exists kr8_client_events_did on public.kr8_client_events (did) where did is not null;
create index if not exists kr8_client_events_user on public.kr8_client_events (user_id, created_at desc);

-- 0058 body + p_did + network hash. The 4-argument version is dropped so old app builds (4 named arguments) resolve to this one.
drop function if exists public.kr8_log_client(text, text, text, text);
create or replace function public.kr8_log_client(p_kind text, p_code text default null, p_detail text default null, p_ua text default null,
                                                 p_did text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); ip text; d text := nullif(left(btrim(coalesce(p_did, '')), 64), '');
begin
  if uid is null or p_kind is null or p_kind !~ '^[a-z_]{2,30}$' then return; end if;
  if (select count(*) from public.kr8_client_events where user_id = uid and created_at > now() - interval '1 hour') >= 60 then return; end if;
  if d is not null and d !~ '^[A-Za-z0-9-]{16,64}$' then d := null; end if;
  begin ip := public.kr8_caller_ip_hash(); exception when others then ip := null; end;   -- live-only helper; never blocks the log
  insert into public.kr8_client_events (user_id, kind, code, detail, ua, did, ip_hash)
  values (uid, p_kind, left(p_code, 60), left(p_detail, 300), left(p_ua, 160), d, ip);
end $$;
revoke all on function public.kr8_log_client(text, text, text, text, text) from public;
grant execute on function public.kr8_log_client(text, text, text, text, text) to authenticated;

-- ───────────── face matching: per-source thresholds ─────────────
/** 'v' = a live face check (verify / selfie / claim / backfill-selfie), 'c' = a card photo */
create or replace function public.kr8_face_cls(p_source text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_source in ('card', 'backfill-card') then 'c' else 'v' end
$$;

/** 'same' | 'maybe' | 'no' for two face codes of these sources at this face-api distance */
create or replace function public.kr8_face_strength(p_a text, p_b text, p_d double precision) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  with k as (select case when public.kr8_face_cls(p_a) = 'v' and public.kr8_face_cls(p_b) = 'v' then 'vv'
                         when public.kr8_face_cls(p_a) = 'c' and public.kr8_face_cls(p_b) = 'c' then 'cc' else 'cv' end x),
  t as (select public.kr8_rcfg('face_same_max_' || k.x, case k.x when 'vv' then 400 else 0 end) / 1000.0 same_max,
               public.kr8_rcfg('face_maybe_max_' || k.x, case k.x when 'vv' then 500 else 450 end) / 1000.0 maybe_max from k)
  select case when p_d is null then 'no'
              when t.same_max > 0 and p_d <= t.same_max then 'same'
              when p_d <= t.maybe_max then 'maybe' else 'no' end from t
$$;

/** the closest other members to this member's face codes (all sources), nearest first. Team-only. Same shape as 0076. */
create or replace function public.kr8_face_nearest(p_user uuid, p_limit int default 3)
returns table (user_id uuid, member_no int, first_name text, verified boolean, dist double precision, mine_source text, their_source text, strength text)
language sql stable security definer set search_path = public, pg_temp as $$
  with pairs as (
    select o.user_id, public.kr8_face_dist(m.descriptor, o.descriptor) d, m.source ms, o.source os
    from public.kr8_face_prints m join public.kr8_face_prints o on o.user_id <> m.user_id
    where m.user_id = p_user
  ), rated as (select p.*, public.kr8_face_strength(p.ms, p.os, p.d) s from pairs p),
  best as (
    select distinct on (r.user_id) r.user_id, r.d, r.ms, r.os, r.s from rated r
    order by r.user_id, case r.s when 'same' then 0 when 'maybe' then 1 else 2 end, r.d
  )
  select b.user_id, mb.member_no::int, mb.first_name, mb.verified, round(b.d::numeric, 3)::float8, b.ms, b.os, b.s
  from best b join public.kr8_members mb on mb.user_id = b.user_id
  where not public.kr8_is_team(b.user_id)
  order by case b.s when 'same' then 0 when 'maybe' then 1 else 2 end, b.d
  limit greatest(1, least(coalesce(p_limit, 3), 20))
$$;

/** 'same' → 'face' LINK; 'maybe' → 'face_maybe' FLAG only. Same arguments / result as 0066 / 0076. */
create or replace function public.kr8_face_match_links(p_user uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in
    select distinct on (x.user_id) x.user_id, x.d, x.ms, x.os, x.s
    from (select o.user_id, public.kr8_face_dist(m.descriptor, o.descriptor) d, m.source ms, o.source os
          from public.kr8_face_prints m join public.kr8_face_prints o on o.user_id <> m.user_id where m.user_id = p_user) p
    cross join lateral (select p.user_id, p.d, p.ms, p.os, public.kr8_face_strength(p.ms, p.os, p.d) s) x
    where x.s <> 'no'
    order by x.user_id, (x.s = 'same') desc, x.d
  loop
    perform public.kr8_link_add(p_user, r.user_id, case when r.s = 'same' then 'face' else 'face_maybe' end,
      jsonb_build_object('dist', round(r.d::numeric, 3), 'sources',
        case public.kr8_face_cls(r.ms) || public.kr8_face_cls(r.os) when 'vv' then 'face check vs face check'
             when 'cc' then 'card photo vs card photo' else 'card photo vs face check' end, 'rule', '0124'));
    n := n + 1;
  end loop;
  return n;
end $$;

/** old 'face' links (face-api, before 0124) that the new rule no longer calls 'same'. p_apply = false: list only.
    true: each becomes a 'face_maybe' flag (the 'face' row is marked dismissed with detail '0124'; undo = clear that dismissal). */
create or replace function public.kr8_face_relink_0124(p_apply boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare l record; bst record; out jsonb := '[]'::jsonb;
begin
  for l in select * from public.kr8_account_links where reason = 'face' and dismissed_at is null and not (detail ? 'sface_sim') loop
    select x.d, x.ms, x.os, public.kr8_face_strength(x.ms, x.os, x.d) s into bst
      from (select public.kr8_face_dist(p.descriptor, q.descriptor) d, p.source ms, q.source os
              from public.kr8_face_prints p join public.kr8_face_prints q on q.user_id = l.b where p.user_id = l.a) x
     order by (public.kr8_face_strength(x.ms, x.os, x.d) = 'same') desc, x.d limit 1;
    if bst.s is null or bst.s = 'same' then continue; end if;   -- no codes to judge by, or still the same person: keep
    out := out || jsonb_build_object('a', l.a, 'b', l.b, 'a_no', (select member_no from public.kr8_members where user_id = l.a),
                                     'b_no', (select member_no from public.kr8_members where user_id = l.b),
                                     'dist', round(bst.d::numeric, 3), 'sources', bst.ms || ' vs ' || bst.os, 'now', bst.s);
    if p_apply then
      update public.kr8_account_links set dismissed_at = now(),
             detail = detail || jsonb_build_object('0124', jsonb_build_object('was', 'face', 'now', bst.s, 'at', now()))
       where a = l.a and b = l.b and reason = 'face';
      if bst.s = 'maybe' then
        perform public.kr8_link_add(l.a, l.b, 'face_maybe', jsonb_build_object('dist', round(bst.d::numeric, 3), 'sources', bst.ms || ' vs ' || bst.os, 'rule', '0124'));
      end if;
      insert into public.kr8_fake_log (user_id, action, detail) values (l.a, 'relink',
        jsonb_build_object('other', l.b, 'was', 'face', 'now', bst.s, 'dist', round(bst.d::numeric, 3)));
    end if;
  end loop;
  return jsonb_build_object('applied', p_apply, 'count', jsonb_array_length(out), 'links', out);
end $$;

revoke all on function public.kr8_face_cls(text), public.kr8_face_strength(text, text, double precision),
  public.kr8_face_nearest(uuid, int), public.kr8_face_match_links(uuid), public.kr8_face_relink_0124(boolean)
  from public, anon, authenticated;

-- ───────────── the level everyone reads ─────────────
/** effective level: the founder's decision wins over the robot; fake_effects_on = 0 → always green */
create or replace function public.kr8_fake_level(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_user is null or public.kr8_rcfg('fake_effects_on', 1) <> 1 then 'green'
              else coalesce((select case s.override when 'clear' then 'green' when 'keep_red' then 'red' when 'ghost' then 'red' else s.level end
                               from public.kr8_fake_scores s where s.user_id = p_user), 'green') end
$$;
/** do this member's likes / saves / opens give Rings? green yes · amber only once verified · red no */
create or replace function public.kr8_fake_counts(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case public.kr8_fake_level(p_user) when 'green' then true
              when 'amber' then coalesce((select m.verified from public.kr8_members m where m.user_id = p_user), false)
              else false end
$$;
revoke all on function public.kr8_fake_level(uuid), public.kr8_fake_counts(uuid) from public, anon, authenticated;

-- ───────────── the robot ─────────────
create or replace function public.kr8_fake_who(p uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('user_id', m.user_id, 'member_no', m.member_no, 'first_name', m.first_name) from public.kr8_members m where m.user_id = p
$$;
create or replace function public.kr8_fake_name(p uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce('#' || m.member_no::text || ' ', '') || coalesce(nullif(btrim(m.first_name), ''), 'member') from public.kr8_members m where m.user_id = p
$$;
/** accounts the robot never looks at, and never names as "the other account": team, test, admin, ghost */
create or replace function public.kr8_fake_skip(p uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p is null or not exists (select 1 from public.kr8_members m where m.user_id = p)
      or public.kr8_is_team(p) or public.kr8_is_test_member(p)
      or exists (select 1 from auth.users u join public.kr8_admin_emails e on e.email = lower(u.email) where u.id = p)
$$;
/** the founder said "not the same person" about these two (a dismissed face / face_maybe / device link, none active) */
create or replace function public.kr8_fake_pair_ok(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_account_links l where l.a = least(x, y) and l.b = greatest(x, y) and l.dismissed_at is not null
                   and not (l.detail ? '0124'))
     and not exists (select 1 from public.kr8_account_links l where l.a = least(x, y) and l.b = greatest(x, y) and l.dismissed_at is null
                       and l.reason in ('face', 'device'))
$$;

create or replace function public.kr8_fake_score_run() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  amber_min int := public.kr8_rcfg('fake_amber_min', 30); red_min int := public.kr8_rcfg('fake_red_min', 61);
  rec record; prev record; lvl text; eff_before text; eff_after text; n_scored int := 0; n_red int := 0; n_amber int := 0;
  unk text;
  bot_re text := '(headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver|electron/|bluestacks|genymotion|android sdk built for|sdk_gphone|google_sdk|\memulator\M|ldplayer|memu|\mnox)';
begin
  if public.kr8_rcfg('fake_on', 1) <> 1 then return jsonb_build_object('ok', true, 'off', true); end if;
  perform pg_advisory_xact_lock(hashtext('kr8_fake_score_run'));
  begin unk := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex'); exception when others then unk := '-'; end;

  drop table if exists _fk_a, _fk_r, _fk_g, _fk_inv;
  -- who is scored: members active in the last 14 days (not ghost / team / test / admin)
  create temp table _fk_a on commit drop as
  select m.user_id, m.member_no, m.first_name, coalesce(m.verified, false) verified, m.created_at, m.last_active_at, m.ref_code
    from public.kr8_members m
   where not coalesce(m.ghost, false) and not public.kr8_fake_skip(m.user_id)
     and (m.created_at > now() - interval '14 days' or m.last_active_at > now() - interval '14 days'
          or exists (select 1 from public.kr8_post_likes l where l.user_id = m.user_id and l.created_at > now() - interval '14 days')
          or exists (select 1 from public.kr8_post_saves s where s.user_id = m.user_id and s.created_at > now() - interval '14 days')
          or exists (select 1 from public.kr8_client_events e where e.user_id = m.user_id and e.created_at > now() - interval '14 days'));
  create temp table _fk_r (user_id uuid, code text, grp text, points int, txt text, with_user uuid) on commit drop;

  -- likes + saves given in the last 30 days (not to own posts), with the post's author
  create temp table _fk_g on commit drop as
  select x.user_id giver, p.author, x.post_id, x.created_at, x.k
    from (select user_id, post_id, created_at, 'like'::text k from public.kr8_post_likes where created_at > now() - interval '30 days'
          union all select user_id, post_id, created_at, 'save' from public.kr8_post_saves where created_at > now() - interval '30 days') x
    join public.kr8_posts p on p.id = x.post_id
   where p.author is not null and p.author <> x.user_id;
  -- who invited whom (ref_code 'k000NN' = the invite link of member NN)
  create temp table _fk_inv on commit drop as
  select f.user_id friend, i.user_id inviter
    from public.kr8_members f join public.kr8_members i on i.member_no = substring(f.ref_code from 2)::int
   where coalesce(f.ref_code, '') ~ '^k[0-9]{1,7}$' and i.user_id <> f.user_id;

  -- 1 · face code looks like another member's (face-api, per-source thresholds)
  insert into _fk_r
  select x.uid, 'face_match', 'face', case when x.s = 'same' then 40 else 20 end,
         format('Face looks %s %s (distance %s, %s)', case when x.s = 'same' then 'the same as' else 'like' end, public.kr8_fake_name(x.oid),
                to_char(x.d, 'FM0.00'), case public.kr8_face_cls(x.ms) || public.kr8_face_cls(x.os) when 'vv' then 'face check vs face check'
                                         when 'cc' then 'card photo vs card photo' else 'card photo vs face check' end), x.oid
    from (select distinct on (q.uid, q.oid) q.* from (
            select p.*, public.kr8_face_strength(p.ms, p.os, p.d) s
              from (select m.user_id uid, o.user_id oid, public.kr8_face_dist(m.descriptor, o.descriptor) d, m.source ms, o.source os
                      from public.kr8_face_prints m join _fk_a a on a.user_id = m.user_id
                      join public.kr8_face_prints o on o.user_id <> m.user_id) p) q
           order by q.uid, q.oid, (q.s = 'same') desc, q.d) x
   where x.s <> 'no' and not public.kr8_fake_skip(x.oid) and not public.kr8_fake_pair_ok(x.uid, x.oid);

  -- 3 · the backup face engine (SFace instant check) found a look-alike
  if to_regclass('public.kr8_face_decisions') is not null then
    insert into _fk_r
    select d.user_id, 'face_check_lookalike', 'face',
           case when d.dup_source = 'check' and d.dup_sim >= public.kr8_rcfg('verify_block_min', 600) / 1000.0 then 35
                when d.dup_source = 'check' then 20 else 15 end,
           format('Backup face check looks like %s (similarity %s%s)', public.kr8_fake_name(d.dup_user), to_char(d.dup_sim, 'FM0.00'),
                  case when d.dup_source = 'card' then ', to their card photo' else '' end), d.dup_user
      from public.kr8_face_decisions d join _fk_a a on a.user_id = d.user_id
     where d.dup_user is not null and d.dup_user <> d.user_id and d.dup_sim >= public.kr8_rcfg('verify_review_min', 500) / 1000.0
       and not public.kr8_fake_skip(d.dup_user) and not public.kr8_fake_pair_ok(d.user_id, d.dup_user);
  end if;

  -- 5 · AI look at the card photo (filled later by an edge function; a newer photo makes the verdict stale)
  insert into _fk_r
  select a.user_id, 'photo_ai', 'photo', case p.verdict when 'fake' then 25 else 10 end,
         'Card photo: AI check says ' || case p.verdict when 'fake' then 'fake' else 'suspicious' end || coalesce(' (' || nullif(btrim(p.reason), '') || ')', ''), null
    from _fk_a a join public.kr8_photo_ai p on p.user_id = a.user_id join public.kr8_members m on m.user_id = a.user_id
   where p.verdict in ('fake', 'suspect') and (p.photo is null or p.photo = m.photo);

  -- 6 · card photo doesn't look like the member's own live face check
  insert into _fk_r
  select x.user_id, 'photo_mismatch', 'photo', 20,
         format('Card photo does not look like their own live face check (distance %s)', to_char(x.d, 'FM0.00')), null
    from (select c.user_id, min(public.kr8_face_dist(c.descriptor, v.descriptor)) d
            from public.kr8_face_prints c join _fk_a a on a.user_id = c.user_id
            join public.kr8_face_prints v on v.user_id = c.user_id and public.kr8_face_cls(v.source) = 'v'
           where public.kr8_face_cls(c.source) = 'c' group by c.user_id) x
   where x.d > public.kr8_rcfg('face_self_card_max', 600) / 1000.0;
  if to_regclass('public.kr8_face_decisions') is not null then
    insert into _fk_r
    select d.user_id, 'photo_mismatch', 'photo', 20,
           format('Card photo does not look like their own live face check (backup engine similarity %s)', to_char(d.match, 'FM0.00')), null
      from (select distinct on (fd.user_id) fd.user_id, fd.match from public.kr8_face_decisions fd join _fk_a a on a.user_id = fd.user_id
             where fd.decision in ('pass', 'review', 'block') and fd.match is not null order by fd.user_id, fd.created_at desc) d
     where d.match < public.kr8_rcfg('fake_sface_card_min', 300) / 1000.0;
  end if;

  -- 7 · same phone as another account (app device id in client events, claims, share links, existing device links)
  insert into _fk_r
  select x.u1, 'same_device', 'device', 30, format('Same phone as %s (%s)', public.kr8_fake_name(x.u2), x.src), x.u2
    from (select e1.user_id u1, e2.user_id u2, 'app device id' src from public.kr8_client_events e1
            join public.kr8_client_events e2 on e2.did = e1.did and e2.user_id <> e1.user_id
           where e1.did is not null and e1.user_id in (select user_id from _fk_a)
          union select c1.member_id, c2.member_id, 'prize claim' from public.kr8_reward_claims c1
            join public.kr8_reward_claims c2 on c2.device = c1.device and c2.member_id <> c1.member_id
           where c1.device is not null and c1.member_id in (select user_id from _fk_a)
          union select o1.opener, o2.opener, 'share link, same browser' from public.kr8_share_opens o1
            join public.kr8_share_opens o2 on o2.session = o1.session and o2.opener <> o1.opener
           where o1.opener in (select user_id from _fk_a)
          union select case when l.a = a.user_id then l.a else l.b end, case when l.a = a.user_id then l.b else l.a end, 'device link'
            from public.kr8_account_links l join _fk_a a on a.user_id in (l.a, l.b)
           where l.reason = 'device' and l.dismissed_at is null) x
   where x.u2 is not null and not public.kr8_fake_skip(x.u2) and not public.kr8_fake_pair_ok(x.u1, x.u2);

  -- 8 · same network AND same browser/phone model, joined within 6 hours of another account
  insert into _fk_r
  select x.u1, 'same_network_join', 'network', 15,
         format('Same Wi-Fi/network and same phone model as %s, joined %s apart', public.kr8_fake_name(x.u2),
                case when abs(extract(epoch from m1.created_at - m2.created_at)) < 3600
                     then round(abs(extract(epoch from m1.created_at - m2.created_at)) / 60) || ' min'
                     else round(abs(extract(epoch from m1.created_at - m2.created_at)) / 3600.0, 1) || ' h' end), x.u2
    from (select e1.user_id u1, e2.user_id u2 from public.kr8_client_events e1
            join public.kr8_client_events e2 on e2.ip_hash = e1.ip_hash and e2.ua = e1.ua and e2.user_id <> e1.user_id
           where e1.ip_hash is not null and e1.ip_hash <> unk and coalesce(e1.ua, '') <> '' and e1.user_id in (select user_id from _fk_a)
          union select o1.opener, o2.opener from public.kr8_share_opens o1
            join public.kr8_share_opens o2 on o2.device = o1.device and o2.opener <> o1.opener
           where o1.opener in (select user_id from _fk_a)) x
    join public.kr8_members m1 on m1.user_id = x.u1 join public.kr8_members m2 on m2.user_id = x.u2
   where abs(extract(epoch from m1.created_at - m2.created_at)) <= 6 * 3600
     and not public.kr8_fake_skip(x.u2) and not public.kr8_fake_pair_ok(x.u1, x.u2);

  -- 9 · robot browser or phone emulator
  insert into _fk_r
  select distinct on (x.user_id) x.user_id, 'bot_browser', 'bot', 20,
         'Uses a robot browser or a phone emulator (' || substring(lower(x.ua) from bot_re) || ')', null
    from (select e.user_id, e.ua from public.kr8_client_events e join _fk_a a on a.user_id = e.user_id where e.ua is not null
          union all select o.opener, o.ua from public.kr8_share_opens o join _fk_a a on a.user_id = o.opener where o.ua is not null) x
   where lower(x.ua) ~ bot_re;

  -- 11 · joined, liked within 10 minutes, then nothing else for 24 hours
  insert into _fk_r
  select a.user_id, 'join_like_leave', 'join_like', 20,
         format('Joined, gave %s like(s)/save(s) within 10 minutes, then did nothing else for 24 hours',
                (select count(*) from _fk_g g where g.giver = a.user_id and g.created_at <= a.created_at + interval '10 minutes')), null
    from _fk_a a
   where a.created_at < now() - interval '24 hours'
     and exists (select 1 from _fk_g g where g.giver = a.user_id and g.created_at <= a.created_at + interval '10 minutes')
     and not exists (select 1 from _fk_g g where g.giver = a.user_id and g.created_at > a.created_at + interval '10 minutes'
                       and g.created_at < a.created_at + interval '24 hours')
     and not exists (select 1 from public.kr8_posts p where p.author = a.user_id and p.created_at < a.created_at + interval '24 hours')
     and coalesce(a.last_active_at, a.created_at) < a.created_at + interval '24 hours';

  -- 12 · 80%+ of likes/saves go to one member (3+ given), or to the member who invited them (2+ given)
  insert into _fk_r
  select t.giver, 'one_target', 'target', 20,
         format('%s of %s likes/saves (%s%%) went to %s%s', t.n, t.total, round(100.0 * t.n / t.total), public.kr8_fake_name(t.author),
                case when exists (select 1 from _fk_inv i where i.friend = t.giver and i.inviter = t.author) then ', who invited them' else '' end), t.author
    from (select g.giver, g.author, count(*) n, sum(count(*)) over (partition by g.giver) total
            from _fk_g g join _fk_a a on a.user_id = g.giver group by g.giver, g.author) t
   where t.n >= 0.8 * t.total and not public.kr8_fake_skip(t.author)
     and (t.total >= 3 or (t.total >= 2 and exists (select 1 from _fk_inv i where i.friend = t.giver and i.inviter = t.author)));

  -- 13 · 3+ accounts with the exact same likes/saves (same Reels, all to one member, 2+ each)
  insert into _fk_r
  select s.giver, 'clone_pattern', 'clone', 20,
         format('Liked/saved exactly the same %s Reels of %s as %s other account(s)', s.cnt, public.kr8_fake_name(s.author), s.k - 1), s.author
    from (select x.giver, x.author, x.cnt, count(*) over (partition by x.author, x.sig) k
            from (select g.giver, min(g.author::text)::uuid author, count(distinct g.post_id) cnt,
                         string_agg(distinct g.post_id::text, ',' order by g.post_id::text) sig
                    from _fk_g g group by g.giver having count(distinct g.author) = 1 and count(distinct g.post_id) >= 2) x) s
   where s.k >= 3 and s.giver in (select user_id from _fk_a);

  -- 14 · two accounts give most of their likes/saves to each other
  insert into _fk_r
  select t1.giver, 'mutual_pair', 'pair', 15,
         format('Swaps likes with %s: most of each one''s likes/saves go to the other (%s and %s)', public.kr8_fake_name(t1.author), t1.n, t2.n), t1.author
    from (select g.giver, g.author, count(*) n, sum(count(*)) over (partition by g.giver) total from _fk_g g group by g.giver, g.author) t1
    join (select g.giver, g.author, count(*) n, sum(count(*)) over (partition by g.giver) total from _fk_g g group by g.giver, g.author) t2
      on t2.giver = t1.author and t2.author = t1.giver
   where t1.n >= 3 and t2.n >= 3 and t1.n >= 0.6 * t1.total and t2.n >= 0.6 * t2.total
     and t1.giver in (select user_id from _fk_a) and not public.kr8_fake_skip(t1.author);

  -- 15 · never came back after the first day (weak: never counts as an independent check)
  insert into _fk_r
  select a.user_id, 'no_return', 'weak', 5, 'Never came back after the first day', null
    from _fk_a a
   where a.created_at < now() - interval '48 hours' and coalesce(a.last_active_at, a.created_at) < a.created_at + interval '24 hours';

  -- 16 · joined in a burst (5+ joins on one invite link within 6 h) AND acts like a booster (11 / 12 / 13). A burst alone = 0.
  insert into _fk_r
  select a.user_id, 'burst_booster', 'burst', 15,
         format('Joined in a burst of %s sign-ups on the same invite link (%s) within 6 hours, and boosts one member',
                (select max(c) from (select count(*) c from public.kr8_members y join public.kr8_members z on z.ref_code = y.ref_code
                                        and z.created_at between y.created_at and y.created_at + interval '6 hours'
                                      where y.ref_code = a.ref_code and y.created_at between a.created_at - interval '6 hours' and a.created_at
                                      group by y.user_id) q), a.ref_code), null
    from _fk_a a
   where coalesce(a.ref_code, '') <> ''
     and exists (select 1 from _fk_r r where r.user_id = a.user_id and r.code in ('join_like_leave', 'one_target', 'clone_pattern'))
     and exists (select 1 from public.kr8_members y where y.ref_code = a.ref_code
                   and y.created_at between a.created_at - interval '6 hours' and a.created_at
                   and (select count(*) from public.kr8_members z where z.ref_code = a.ref_code
                          and z.created_at between y.created_at and y.created_at + interval '6 hours') >= 5);

  -- 17 · invite chains: 3+ people invited by a member (directly or down a chain, up to 3 steps) who mostly boost that member
  insert into _fk_r
  with recursive ch as (
    select i.inviter root, i.friend, 1 depth from _fk_inv i
    union select ch.root, i.friend, ch.depth + 1 from ch join _fk_inv i on i.inviter = ch.friend where ch.depth < 3 and i.friend <> ch.root
  ), giv as (
    select ch.root, ch.friend, count(*) total, count(*) filter (where g.author = ch.root) to_root
      from (select distinct root, friend from ch) ch join _fk_g g on g.giver = ch.friend group by ch.root, ch.friend
  ), roots as (
    select root, count(*) active, count(*) filter (where total >= 2 and to_root >= 0.8 * total) boosters from giv group by root
  )
  select x.uid, x.code, 'chain', x.pts, x.txt, x.w from (
    select r.root uid, 'chain_root' code, 25 pts,
           format('%s of the %s people they invited (or who were invited down their chain) give them almost all their likes/saves', r.boosters, r.active) txt,
           null::uuid w
      from roots r where r.boosters >= 3 and r.boosters >= 0.8 * r.active
    union all
    select g.friend, 'chain_member', 15, format('Part of an invite chain that boosts %s (almost all their likes/saves go to them)', public.kr8_fake_name(g.root)), g.root
      from giv g join roots r on r.root = g.root
     where r.boosters >= 3 and r.boosters >= 0.8 * r.active and g.total >= 2 and g.to_root >= 0.8 * g.total
  ) x where x.uid in (select user_id from _fk_a);

  -- ───── score: per check the strongest finding counts once; per member the checks add up (max 100) ─────
  for rec in
    with per_code as (
      select r.user_id, r.code, max(r.grp) grp, max(r.points) pts,
             (array_agg(r.txt order by r.points desc, r.txt))[1] txt, count(distinct coalesce(r.with_user::text, r.txt)) nn,
             coalesce(jsonb_agg(distinct public.kr8_fake_who(r.with_user)) filter (where r.with_user is not null), '[]'::jsonb) w
        from _fk_r r group by r.user_id, r.code
    )
    select a.user_id, least(100, coalesce(sum(p.pts), 0))::int score,
           count(distinct p.grp) filter (where p.pts >= 10 and p.grp <> 'weak')::int grps,
           coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'points', p.pts, 'group', p.grp,
                      'text', p.txt || case when p.nn > 1 then format(' (+%s more)', p.nn - 1) else '' end, 'with', p.w)
                    order by p.pts desc, p.code) filter (where p.code is not null), '[]'::jsonb) reasons,
           coalesce(array_agg(p.code) filter (where p.code is not null and p.pts >= 15), '{}') strong_codes
      from _fk_a a left join per_code p on p.user_id = a.user_id group by a.user_id
  loop
    lvl := case when rec.score >= red_min and rec.grps >= 2 then 'red' when rec.score >= amber_min then 'amber' else 'green' end;
    select * into prev from public.kr8_fake_scores where user_id = rec.user_id;
    eff_before := public.kr8_fake_level(rec.user_id);
    insert into public.kr8_fake_scores (user_id, score, level, reasons, groups, updated_at)
    values (rec.user_id, rec.score, lvl, rec.reasons, rec.grps, now())
    on conflict (user_id) do update set score = excluded.score, level = excluded.level, reasons = excluded.reasons,
      groups = excluded.groups, updated_at = now();
    -- a Clear holds until NEW strong evidence appears that the founder did not see
    if prev.override = 'clear' and lvl <> 'green' and exists (select 1 from unnest(rec.strong_codes) c where c <> all (prev.cleared_codes)) then
      update public.kr8_fake_scores set override = null where user_id = rec.user_id;
      insert into public.kr8_fake_log (user_id, action, from_level, to_level, score, detail)
      values (rec.user_id, 'reflag', 'green', lvl, rec.score, jsonb_build_object('new', rec.strong_codes, 'seen', prev.cleared_codes));
    end if;
    eff_after := public.kr8_fake_level(rec.user_id);
    if prev.user_id is null or prev.level is distinct from lvl then
      insert into public.kr8_fake_log (user_id, action, from_level, to_level, score, detail)
      values (rec.user_id, 'level', prev.level, lvl, rec.score, jsonb_build_object('reasons', rec.reasons));
    end if;
    -- red alert: raised on entering red or when the score goes up; cleared when no longer red
    if to_regprocedure('public.kr8_alert_raise(text,text,text,text,text,text,jsonb)') is not null then
      if eff_after = 'red' and (eff_before <> 'red' or rec.score > coalesce(prev.score, 0)) then
        perform public.kr8_alert_raise('fake:' || rec.user_id, 'fake_finder', 'red',
          format('Fake account? %s · score %s', public.kr8_fake_name(rec.user_id), rec.score),
          (select string_agg(x ->> 'text', ' · ' order by (x ->> 'points')::int desc) from jsonb_array_elements(rec.reasons) x),
          '#inbox', jsonb_build_object('user_id', rec.user_id, 'score', rec.score, 'reasons', rec.reasons, 'kind', 'fake'));
      elsif eff_after <> 'red' and eff_before = 'red' then
        perform public.kr8_alert_clear('fake:' || rec.user_id, 'auto');
      end if;
    end if;
    n_scored := n_scored + 1;
    if eff_after = 'red' then n_red := n_red + 1; elsif eff_after = 'amber' then n_amber := n_amber + 1; end if;
  end loop;

  if to_regclass('public.kr8_robot') is not null then
    update public.kr8_robot set last_run = now(), last_ok = true,
           last_note = format('%s scored · %s red · %s amber', n_scored, n_red, n_amber) where name = 'fake_finder';
  end if;
  if to_regclass('public.kr8_heartbeat') is not null then
    update public.kr8_heartbeat set last_beat = now(), last_ok = true where job = 'kr8_fake_finder';
  end if;
  return jsonb_build_object('ok', true, 'scored', n_scored, 'red', n_red, 'amber', n_amber, 'at', now());
end $$;
revoke all on function public.kr8_fake_who(uuid), public.kr8_fake_name(uuid), public.kr8_fake_skip(uuid), public.kr8_fake_pair_ok(uuid, uuid),
  public.kr8_fake_score_run() from public, anon, authenticated;

-- ───────────── admin ─────────────
/** red / amber members (and anyone the founder decided on) with reasons, photos and linked accounts; + live patch status */
create or replace function public.kr8_admin_fake_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'at', now(),
    'effects_on', public.kr8_rcfg('fake_effects_on', 1) = 1,
    'robot_on', public.kr8_rcfg('fake_on', 1) = 1,
    'last_run', (select max(updated_at) from public.kr8_fake_scores),
    'patches', coalesce((select jsonb_object_agg(fn, res) from (
        select distinct on (l.detail ->> 'fn') l.detail ->> 'fn' fn, l.detail ->> 'result' res
          from public.kr8_fake_log l where l.action = 'patch' order by l.detail ->> 'fn', l.at desc) p), '{}'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'member_no', m.member_no, 'first_name', m.first_name, 'photo', m.photo,
        'verified', coalesce(m.verified, false), 'ghost', coalesce(m.ghost, false), 'joined_at', m.created_at, 'last_active_at', m.last_active_at,
        'score', s.score, 'level', s.level, 'effective', public.kr8_fake_level(s.user_id), 'groups', s.groups, 'reasons', s.reasons,
        'override', s.override, 'cleared_at', s.cleared_at, 'updated_at', s.updated_at,
        'held_claims', (select count(*) from public.kr8_reward_claims c where c.member_id = s.user_id and c.held and c.status = 'pending'),
        'linked', coalesce((select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'member_no', o.member_no, 'first_name', o.first_name,
                     'photo', o.photo, 'verified', coalesce(o.verified, false), 'ghost', coalesce(o.ghost, false),
                     'reasons', x.reasons, 'dismissed', x.dismissed) order by o.member_no)
                   from (select case when l.a = s.user_id then l.b else l.a end u, jsonb_agg(jsonb_build_object('reason', l.reason, 'detail', l.detail)
                                  order by l.reason) reasons, bool_and(l.dismissed_at is not null) dismissed
                           from public.kr8_account_links l where s.user_id in (l.a, l.b) group by 1) x
                   join public.kr8_members o on o.user_id = x.u), '[]'::jsonb))
      order by case public.kr8_fake_level(s.user_id) when 'red' then 0 when 'amber' then 1 else 2 end, s.score desc, m.member_no)
      from public.kr8_fake_scores s join public.kr8_members m on m.user_id = s.user_id
     where s.level <> 'green' or s.override is not null), '[]'::jsonb));
end $$;
revoke all on function public.kr8_admin_fake_list() from public, anon;
grant execute on function public.kr8_admin_fake_list() to authenticated;

/** the founder's decision. clear = not fake (no effects until NEW evidence) · keep_red = stays red whatever the score ·
    ghost = ghost mode (kr8.ghost_set) + red · reset = back to the robot's own level (undo). Ghost is undone with
    kr8_admin_set_ghost(false, user) + reset. Logged in kr8_fake_log (+ kr8_admin_actions_log when present). */
create or replace function public.kr8_admin_fake_decide(p_user uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.kr8_fake_scores; before text; after text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_decision is null or p_decision not in ('clear', 'keep_red', 'ghost', 'reset') then raise exception 'KR8_BAD_DECISION'; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_user) then raise exception 'KR8_NO_PERSON'; end if;
  before := public.kr8_fake_level(p_user);
  insert into public.kr8_fake_scores (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into s from public.kr8_fake_scores where user_id = p_user for update;
  if p_decision = 'clear' then
    update public.kr8_fake_scores set override = 'clear', cleared_by = auth.uid(), cleared_at = now(),
           cleared_codes = coalesce((select array_agg(x ->> 'code') from jsonb_array_elements(s.reasons) x), '{}')
     where user_id = p_user;
  elsif p_decision = 'reset' then
    update public.kr8_fake_scores set override = null where user_id = p_user;
  else
    update public.kr8_fake_scores set override = p_decision, cleared_by = auth.uid(), cleared_at = now() where user_id = p_user;
    if p_decision = 'ghost' then
      perform set_config('kr8.ghost_set', '1', true);
      update public.kr8_members set ghost = true, here_until = null where user_id = p_user;
      perform set_config('kr8.ghost_set', '', true);
    end if;
  end if;
  after := public.kr8_fake_level(p_user);
  if to_regprocedure('public.kr8_alert_clear(text,text)') is not null and (after <> 'red' or p_decision = 'ghost') then
    perform public.kr8_alert_clear('fake:' || p_user, 'admin');
  end if;
  insert into public.kr8_fake_log (user_id, action, from_level, to_level, score, detail, by_user)
  values (p_user, p_decision, before, after, s.score, jsonb_build_object('reasons', s.reasons, 'override_was', s.override), auth.uid());
  if to_regclass('public.kr8_admin_actions_log') is not null then
    insert into public.kr8_admin_actions_log (action, detail)
    values ('fake_' || p_decision, jsonb_build_object('user_id', p_user, 'by', auth.uid(), 'from', before, 'to', after, 'score', s.score));
  end if;
  return jsonb_build_object('ok', true, 'user_id', p_user, 'decision', p_decision, 'level', after,
                            'ghost', (select ghost from public.kr8_members where user_id = p_user));
end $$;
revoke all on function public.kr8_admin_fake_decide(uuid, text) from public, anon;
grant execute on function public.kr8_admin_fake_decide(uuid, text) to authenticated;

/** admin "Run now" */
create or replace function public.kr8_admin_fake_run() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return public.kr8_fake_score_run();
end $$;
revoke all on function public.kr8_admin_fake_run() from public, anon;
grant execute on function public.kr8_admin_fake_run() to authenticated;

-- ───────────── patch the LIVE bodies in place (exact anchors; nothing changes when an anchor is missing) ─────────────
/** p_pairs = [old1, new1, old2, new2, ...]. Each old text must occur exactly once in the live definition, and each new text
    carries the marker fake0124 (so a re-run says 'already'). Returns patched | already | missing | anchor N found K times: … */
create or replace function public.kr8_fake_patch(p_fn text, p_pairs text[]) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare f regprocedure; src text; i int; n int; o text; res text;
begin
  f := to_regprocedure(p_fn);
  if f is null then res := 'missing';
  else
    src := pg_get_functiondef(f);
    if position('fake0124' in src) > 0 then res := 'already';
    else
      for i in 1 .. coalesce(array_length(p_pairs, 1), 0) / 2 loop
        o := p_pairs[2 * i - 1];
        n := (length(src) - length(replace(src, o, ''))) / greatest(length(o), 1);
        if n <> 1 then res := format('anchor %s found %s times: %s', i, n, left(o, 90)); exit; end if;
        src := replace(src, o, p_pairs[2 * i]);
      end loop;
      if res is null then execute src; res := 'patched'; end if;
    end if;
  end if;
  insert into public.kr8_fake_log (action, detail) values ('patch', jsonb_build_object('fn', split_part(p_fn, '(', 1), 'result', res));
  if res not in ('patched', 'already') then raise notice 'PATCH BY HAND: % → %', p_fn, res; else raise notice '%: %', p_fn, res; end if;
  return res;
end $$;
revoke all on function public.kr8_fake_patch(text, text[]) from public, anon, authenticated;

do $$ begin
  -- board: red authors' Reels off the board; amber (not verified) / red likes, saves and share-opens give no Rings
  perform public.kr8_fake_patch('public.kr8_reel_scores(timestamptz,timestamptz,timestamptz,boolean,uuid)', array[
    'and exists (select 1 from public.kr8_members am where am.user_id = p.author and not am.ghost)',
    'and exists (select 1 from public.kr8_members am where am.user_id = p.author and not am.ghost)
      and public.kr8_fake_level(p.author) <> ''red''   /*fake0124: red = off the board*/',
    'and not m.ghost',
    'and not m.ghost and public.kr8_fake_counts(m.user_id)   /*fake0124: amber unverified / red likes+saves give no Rings*/',
    'where o.opener is distinct from r.author',
    'where o.opener is distinct from r.author and (o.opener is null or public.kr8_fake_counts(o.opener))   /*fake0124*/']);
  -- People: red is hidden
  perform public.kr8_fake_patch('public.kr8_people(integer)', array[
    'and not public.kr8_face_gate(m.user_id)',
    'and not public.kr8_face_gate(m.user_id) and public.kr8_fake_level(m.user_id) <> ''red''   /*fake0124*/']);
  -- prize claim: red → held for the founder (review reason 'fake_red')
  perform public.kr8_fake_patch('public.kr8_claim_prize(uuid,text,text,real[],text)', array[
    'held := others is not null or cardinality(review) > 0;',
    'if public.kr8_fake_level(uid) = ''red'' then review := array_append(review, ''fake_red''); end if;   /*fake0124*/
  held := others is not null or cardinality(review) > 0;']);
  -- Founding Local: only a SAME face (per-source thresholds) refuses it; look-alikes no longer do (#98)
  perform public.kr8_fake_patch('public.kr8_founding_try(uuid)', array[
    'public.kr8_face_dist(a.descriptor, b.descriptor) <= mx',
    'public.kr8_face_strength(a.source, b.source, public.kr8_face_dist(a.descriptor, b.descriptor)) = ''same''   /*fake0124*/',
    'public.kr8_face_dist(a.descriptor, k.descriptor) <= mx',
    'public.kr8_face_strength(a.source, ''verify'', public.kr8_face_dist(a.descriptor, k.descriptor)) = ''same''']);
end $$;

-- ───────────── robot registration + schedule (every 15 min, offset from Protect) ─────────────
do $$ begin
  if to_regclass('public.kr8_robot') is not null then
    insert into public.kr8_robot (name, title, note, mode, daily_cap, schedule)
    values ('fake_finder', 'Fake Finder', 'Scores members active in 14 days for fake-account signs (face, phone, network, like patterns). Never deletes or ghosts.',
            'on', 50, '7-59/15 * * * *')
    on conflict (name) do update set title = excluded.title, note = excluded.note, schedule = excluded.schedule;
  end if;
  if to_regclass('public.kr8_heartbeat') is not null then
    insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
    values ('kr8_fake_finder', 900, now(), true, '{"note":"0124 registered"}'::jsonb) on conflict (job) do nothing;
  end if;
  if to_regprocedure('public.kr8_schedule_job(text,text,text)') is not null then
    perform public.kr8_schedule_job('kr8_fake_finder', '7-59/15 * * * *', 'select public.kr8_fake_score_run()');
  elsif to_regclass('cron.job') is not null then
    perform cron.schedule('kr8_fake_finder', '7-59/15 * * * *', 'select public.kr8_fake_score_run()');
  end if;
end $$;

commit;
