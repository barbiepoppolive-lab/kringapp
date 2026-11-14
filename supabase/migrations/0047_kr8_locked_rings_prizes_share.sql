-- 0047 · LOCKED rules (founder, 15 Nov 2026): Rings = a public score from likes, saves and share-link opens; weekly baht prizes for ranks 1–8;
-- share links (/r/<short>) with an open log; prize entitlements claimed in one tap; Founding Local (first 50); saved Reels list.
-- Replaces the interim Rings rules of 0044/0046 (check-in, react-to-3, +100 per Reel, friend bonuses, Rings → baht).
--
-- SAFE FOR THE LIVE APP: the live build never calls anything from 0044–0046. This file only
--   (a) adds new tables / columns / functions, (b) replaces or drops functions and triggers that 0044/0046 created,
--   (c) relaxes two CHECKs on the reward tables (amounts). No table the live build uses is altered; kr8_toggle_like / kr8_toggle_save /
--   kr8_feed / kr8_create_reel are untouched. The three interim triggers on kr8_post_likes / kr8_members / kr8_post_places are removed
--   (they only wrote interim Rings), and the kr8_posts trigger now only does Founding Local.
--
-- UNDO: drop the objects created here (kr8_share_opens, kr8_reel_links, kr8_prizes, kr8_week_results, kr8_checkins + the functions below),
--       then re-run 0044 and 0046. Scores are computed from kr8_post_likes / kr8_post_saves / kr8_share_opens, so nothing else stores them.

begin;

-- ───────────────────────── 1. config: one table for every number (kr8_rings_config) ─────────────────────────
delete from public.kr8_rings_config where key in ('rings_per_baht', 'checkin', 'streak_days', 'streak_bonus', 'react_goal', 'react', 'reel_place',
  'reel_place_week_cap', 'likes_50', 'friend', 'friend_welcome', 'weekly_1', 'weekly_2', 'weekly_3', 'weekly_4_10', 'claims_per_day');
insert into public.kr8_rings_config (key, value, note) values
  ('like', 1, 'Rings for a like from a member'),
  ('save', 3, 'Rings for a save from a member'),
  ('open', 5, 'Rings for each open of the Reel''s share link from outside (never LINE)'),
  ('traveller_mult', 2, 'a like or save from a visitor (who = traveller) counts this many times'),
  ('opens_day_cap', 30, 'max share-link opens counted per Reel per Bangkok day'),
  ('best_reels', 2, 'weekly score = this many best Reels of the week'),
  ('board_size', 10, 'ranks shown on the weekly board'),
  ('prize_1', 1500, 'weekly prize, baht, rank 1'), ('prize_2', 900, 'rank 2'), ('prize_3', 600, 'rank 3'), ('prize_4', 500, 'rank 4'),
  ('prize_5', 400, 'rank 5'), ('prize_6', 250, 'rank 6'), ('prize_7', 150, 'rank 7'), ('prize_8', 100, 'rank 8'),
  ('prize_9', 0, 'rank 9: shown with score, no prize'), ('prize_10', 0, 'rank 10: shown with score, no prize'),
  ('min_rings_for_paid_seat', 25, 'FOUNDER DECISION: a prize rank only pays when its holder has at least this many Rings (0 = no floor)'),
  ('min_posters_for_payout', 0, 'FOUNDER DECISION: weekly prizes only pay when at least this many members had a Reel on the board that week (0 = always pay)'),
  ('shopeepay_on', 0, '1 = ShopeePay shown as a way to get a prize; 0 = hidden'),
  ('founding_on', 1, '1 = Founding Local is open'),
  ('founding_slots', 50, 'first N members whose first Reel is approved'),
  ('founding_thb', 100, 'Founding Local prize, baht')
on conflict (key) do nothing;

create or replace function public.kr8_prize_for(p_rank int) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_rank between 1 and 10 then greatest(public.kr8_rcfg('prize_' || p_rank, 0), 0) else 0 end
$$;
-- the lowest rank that still pays (8)
create or replace function public.kr8_paid_ranks() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(max(r), 0)::int from generate_series(1, 10) r where public.kr8_prize_for(r) > 0
$$;

-- ───────────────────────── 2. share links + open log ─────────────────────────
create table if not exists public.kr8_reel_links (
  short text primary key check (short ~ '^[a-z0-9]{6,10}$'),
  post_id uuid not null unique references public.kr8_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.kr8_reel_links enable row level security;
revoke all on public.kr8_reel_links from public, anon, authenticated;

create table if not exists public.kr8_share_opens (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.kr8_posts(id) on delete cascade,
  bkk_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  session text not null,                 -- random id kept in the visitor's cookie
  device text not null,                  -- hash(secret + IP + browser) made by the website function; an IP address is never stored
  referrer text,
  ua text,
  country text,
  source text not null default 'other',  -- instagram | tiktok | facebook | x | youtube | line | other
  ok boolean not null,                   -- false = never counts: LINE, a link-preview robot, or a repeat by the same session/device that day
  why text,                              -- line | robot | repeat
  opener uuid,                           -- the member, when the visitor was signed in to the app (own opens count 0)
  created_at timestamptz not null default now()
);
create index if not exists kr8_share_opens_post_day on public.kr8_share_opens (post_id, bkk_date);
create index if not exists kr8_share_opens_opener on public.kr8_share_opens (opener) where opener is not null;
alter table public.kr8_share_opens enable row level security;
revoke all on public.kr8_share_opens from public, anon, authenticated;

-- the secret only the website function knows (Cloudflare Pages env SHARE_OPEN_KEY). Without it nobody can write an open.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'share_open_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'share_open_key', 'Kring /r/<short> share-open logger');
  end if;
end $$;

-- Share link for a Reel: the same short id every time. Anyone who can see the Reel can ask for it.
create or replace function public.kr8_reel_share_link(p_post uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare s text; i int := 0;
begin
  select short into s from public.kr8_reel_links where post_id = p_post;
  if s is not null then return s; end if;
  if not exists (select 1 from public.kr8_posts p where p.id = p_post and p.kind = 'reel' and not p.hidden
                   and (p.status = 'approved' or p.author = auth.uid())) then raise exception 'KR8_NO_REEL'; end if;
  loop
    i := i + 1;
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + (get_byte(b, g) % 31), 1), '') into s
    from (select extensions.gen_random_bytes(7) b) x, generate_series(0, 6) g;
    begin
      insert into public.kr8_reel_links (short, post_id) values (s, p_post);
      return s;
    exception when unique_violation then
      select short into s from public.kr8_reel_links where post_id = p_post;
      if s is not null then return s; end if;
      if i > 5 then raise exception 'KR8_TRY_AGAIN'; end if;
    end;
  end loop;
end $$;

-- Called only by the website function behind /r/<short>. Logs the open and says where to send the visitor.
create or replace function public.kr8_share_open(p_short text, p_ref text, p_ua text, p_session text, p_device text, p_country text, p_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; pid uuid; oid uuid; v_ok boolean := true; v_why text; v_src text := 'other';
        ref text := left(coalesce(p_ref, ''), 300); ua text := left(coalesce(p_ua, ''), 300); po record;
        d date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  if k is null or p_key is null or p_key <> k then raise exception 'KR8_FORBIDDEN'; end if;
  select post_id into pid from public.kr8_reel_links where short = lower(coalesce(p_short, ''));
  if pid is null then return null; end if;
  select p.id, p.area, left(p.body, 160) as body, m.first_name into po
  from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
  where p.id = pid and p.kind = 'reel' and not p.hidden and p.status = 'approved';
  if po.id is null then return jsonb_build_object('post_id', null); end if;
  if coalesce(p_session, '') !~ '^[A-Za-z0-9-]{16,64}$' or coalesce(p_device, '') !~ '^[0-9a-f]{32,64}$' then
    return jsonb_build_object('post_id', pid, 'name', po.first_name, 'area', po.area, 'body', po.body);
  end if;
  v_src := case
    when ref ~* '(^|[/.])(line\.me|line\.naver\.jp|lin\.ee|liff\.line\.me)' or ua ~* '(^|[^a-z])line/' or ua ~* 'liff' then 'line'
    when ref ~* 'instagram\.' or ua ~* 'instagram' then 'instagram'
    when ref ~* 'tiktok\.' or ua ~* 'tiktok|musical_ly|bytedancewebview|trill' then 'tiktok'
    when ref ~* 'facebook\.|fb\.me|messenger\.' or ua ~* 'FBAN|FBAV|FB_IAB' then 'facebook'
    when ref ~* '(^|[/.])(t\.co|x\.com|twitter\.com)' then 'x'
    when ref ~* 'youtube\.|youtu\.be' then 'youtube'
    else 'other' end;
  if v_src = 'line' then v_ok := false; v_why := 'line';
  elsif ua = '' or ua ~* 'bot|crawl|spider|facebookexternalhit|meta-external|preview|whatsapp|telegram|slack|discord|embed|curl|wget|python|okhttp|headless|lighthouse|monitor|scan' then
    v_ok := false; v_why := 'robot';
  end if;
  perform pg_advisory_xact_lock(hashtext('kr8_open:' || pid::text));
  if (select count(*) from public.kr8_share_opens where post_id = pid and bkk_date = d) >= 3000 then   -- flood guard: stop storing, still redirect
    return jsonb_build_object('post_id', pid, 'name', po.first_name, 'area', po.area, 'body', po.body);
  end if;
  if v_ok and exists (select 1 from public.kr8_share_opens where post_id = pid and bkk_date = d and ok and (session = p_session or device = p_device)) then
    v_ok := false; v_why := 'repeat';
  end if;
  insert into public.kr8_share_opens (post_id, bkk_date, session, device, referrer, ua, country, source, ok, why)
  values (pid, d, p_session, p_device, nullif(ref, ''), nullif(ua, ''), nullif(left(coalesce(p_country, ''), 2), ''), v_src, v_ok, v_why)
  returning id into oid;
  return jsonb_build_object('post_id', pid, 'open_id', oid, 'ok', v_ok, 'name', po.first_name, 'area', po.area, 'body', po.body);
end $$;

-- The app tells us who the visitor is once they are signed in, so a member's own opens count 0.
create or replace function public.kr8_share_open_seen(p_open uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return false; end if;
  update public.kr8_share_opens set opener = auth.uid() where id = p_open and opener is null and created_at > now() - interval '2 days';
  return found;
end $$;

-- ───────────────────────── 3. the score, computed from the source tables every time ─────────────────────────
-- Reels that can score: approved, not hidden, at least one place tag, posted in [p_from, p_to). Actions count up to p_until.
-- Only members with a finished card (photo + first name) count; own likes/saves/opens count 0; one person once per Reel per action
-- (primary keys of kr8_post_likes / kr8_post_saves); un-like / un-save removes the row, so the Rings go with it.
-- Test and demo accounts live in their own board (p_test): they never touch real members' scores.
create or replace function public.kr8_reel_scores(p_from timestamptz, p_to timestamptz, p_until timestamptz, p_test boolean, p_author uuid default null)
returns table(post_id uuid, author uuid, posted_at timestamptz, l_local int, l_trav int, s_local int, s_trav int, opens int, score int)
language sql stable security definer set search_path = public, pg_temp as $$
  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('open', 5) w_open,
                      public.kr8_rcfg('traveller_mult', 2) mult, public.kr8_rcfg('opens_day_cap', 30) cap),
  reels as (
    select p.id, p.author, p.created_at
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not p.hidden
      and p.created_at >= p_from and p.created_at < p_to
      and (p_author is null or p.author = p_author)
      and exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)
      and exists (select 1 from public.kr8_members am where am.user_id = p.author)
      and public.kr8_is_test_member(p.author) = p_test
  ),
  ppl as (   -- members whose likes and saves count
    select m.user_id, (m.who = 'traveller') as trav
    from public.kr8_members m
    where coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and public.kr8_is_test_member(m.user_id) = p_test
  ),
  lk as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_likes l on l.post_id = r.id and l.user_id <> r.author and l.created_at < p_until
    join ppl c on c.user_id = l.user_id group by r.id
  ),
  sv as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_saves s on s.post_id = r.id and s.user_id <> r.author and s.created_at < p_until
    join ppl c on c.user_id = s.user_id group by r.id
  ),
  od as (
    select r.id, o.bkk_date, count(*)::int n
    from reels r join public.kr8_share_opens o on o.post_id = r.id and o.ok and o.created_at < p_until
    where o.opener is distinct from r.author
      and not exists (select 1 from public.kr8_share_opens mine where mine.opener = r.author and (mine.session = o.session or mine.device = o.device))
    group by r.id, o.bkk_date
  ),
  op as (select od.id, sum(least(od.n, cfg.cap))::int n from od, cfg group by od.id)
  select r.id, r.author, r.created_at,
         coalesce(lk.a, 0), coalesce(lk.b, 0), coalesce(sv.a, 0), coalesce(sv.b, 0), coalesce(op.n, 0),
         (coalesce(lk.a, 0) * cfg.w_like + coalesce(lk.b, 0) * cfg.w_like * cfg.mult
          + coalesce(sv.a, 0) * cfg.w_save + coalesce(sv.b, 0) * cfg.w_save * cfg.mult
          + coalesce(op.n, 0) * cfg.w_open)::int
  from reels r cross join cfg left join lk on lk.id = r.id left join sv on sv.id = r.id left join op on op.id = r.id
$$;

-- Weekly board: a member's score = their best N Reels posted that week. Ties: the earlier-posted Reel wins, then the older member number.
-- One row per member, so a person can only ever hold one rank.
create or replace function public.kr8_week_board(p_w0 timestamptz, p_test boolean)
returns table(member_id uuid, rings int, rk int, first_at timestamptz, reels jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select * from public.kr8_reel_scores(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
  r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n from s where s.score > 0),
  m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
        from r where r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) group by r.author)
  select m.author, m.rings, (row_number() over (order by m.rings desc, m.first_at asc, mm.member_no asc))::int, m.first_at, m.reels
  from m join public.kr8_members mm on mm.user_id = m.author
$$;

-- ───────────────────────── 4. prizes (entitlements) + frozen weekly results ─────────────────────────
create table if not exists public.kr8_week_results (
  week date not null,                     -- that week's Monday (Bangkok)
  is_test boolean not null default false,
  rank int not null check (rank >= 1),
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  rings int not null,
  reels jsonb not null default '[]'::jsonb,
  closed_at timestamptz not null default now(),
  primary key (week, is_test, rank),
  unique (week, is_test, member_id)
);
alter table public.kr8_week_results enable row level security;
revoke all on public.kr8_week_results from public, anon, authenticated;
create table if not exists public.kr8_week_closed (
  week date not null, is_test boolean not null default false, posters int not null default 0, closed_at timestamptz not null default now(),
  primary key (week, is_test)
);
alter table public.kr8_week_closed enable row level security;
revoke all on public.kr8_week_closed from public, anon, authenticated;

create table if not exists public.kr8_prizes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  kind text not null check (kind in ('weekly', 'founding')),
  week date,
  rank int,
  founding_no int,
  amount_thb int not null check (amount_thb between 1 and 100000),
  rings int,
  status text not null default 'won' check (status in ('won', 'claimed')),
  claim_id uuid,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  check ((kind = 'weekly' and week is not null and rank between 1 and 10 and founding_no is null)
      or (kind = 'founding' and founding_no >= 1 and week is null and rank is null))
);
create unique index if not exists kr8_prizes_week_rank on public.kr8_prizes (week, rank, is_test) where kind = 'weekly';
create unique index if not exists kr8_prizes_one_rank on public.kr8_prizes (member_id, week) where kind = 'weekly';      -- one person, one rank
create unique index if not exists kr8_prizes_founding_member on public.kr8_prizes (member_id) where kind = 'founding';
create unique index if not exists kr8_prizes_founding_no on public.kr8_prizes (founding_no, is_test) where kind = 'founding';
create index if not exists kr8_prizes_member on public.kr8_prizes (member_id, created_at desc);
alter table public.kr8_prizes enable row level security;
revoke all on public.kr8_prizes from public, anon, authenticated;

-- reward tables: any amount (the prize ladder decides), and a claim knows which prize it pays
alter table public.kr8_reward_codes drop constraint if exists kr8_reward_codes_amount_thb_check;
alter table public.kr8_reward_codes add constraint kr8_reward_codes_amount_thb_check check (amount_thb between 1 and 100000);
alter table public.kr8_reward_claims drop constraint if exists kr8_reward_claims_amount_thb_check;
alter table public.kr8_reward_claims add constraint kr8_reward_claims_amount_thb_check check (amount_thb between 1 and 100000);
alter table public.kr8_reward_claims add column if not exists prize_id uuid references public.kr8_prizes(id) on delete set null;
create unique index if not exists kr8_reward_claims_prize on public.kr8_reward_claims (prize_id) where prize_id is not null and status <> 'cancelled';

-- Weekly close. Server only (service role / cron). Idempotent: the first run freezes the top 10 and creates one "prize won" per paid rank;
-- later runs change nothing. p_week = that week's Monday (Bangkok); default = the week that ended most recently.
drop function if exists public.kr8_close_week(date);
create or replace function public.kr8_week_posters(p_w0 timestamptz, p_test boolean) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(distinct author)::int from public.kr8_reel_scores(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)
$$;
create or replace function public.kr8_close_week(p_week date default null, p_test boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w0 timestamptz; wk date; n_rank int := 0; n_prize int := 0; posters int; flr int := public.kr8_rcfg('min_rings_for_paid_seat', 25);
        first_run boolean := false;
begin
  w0 := case when p_week is null then public.kr8_week_start(now()) - interval '7 days' else (p_week::timestamp at time zone 'Asia/Bangkok') end;
  if extract(isodow from (w0 at time zone 'Asia/Bangkok')) <> 1 then raise exception 'KR8_NOT_MONDAY'; end if;
  if now() < w0 + interval '7 days' then raise exception 'KR8_WEEK_OPEN'; end if;
  wk := (w0 at time zone 'Asia/Bangkok')::date;
  perform pg_advisory_xact_lock(hashtext('kr8_close_week:' || wk::text || ':' || p_test::text));
  if not exists (select 1 from public.kr8_week_closed where week = wk and is_test = p_test) then
    first_run := true;
    posters := public.kr8_week_posters(w0, p_test);
    insert into public.kr8_week_closed (week, is_test, posters) values (wk, p_test, posters);
    insert into public.kr8_week_results (week, is_test, rank, member_id, rings, reels)
    select wk, p_test, b.rk, b.member_id, b.rings, b.reels
    from public.kr8_week_board(w0, p_test) b where b.rk <= greatest(public.kr8_rcfg('board_size', 10), public.kr8_paid_ranks());
    -- a "prize won" for each paid rank whose holder passed the floor (only in weeks with enough posters)
    if posters >= public.kr8_rcfg('min_posters_for_payout', 0) then
      insert into public.kr8_prizes (member_id, kind, week, rank, amount_thb, rings, is_test)
      select r.member_id, 'weekly', wk, r.rank, public.kr8_prize_for(r.rank), r.rings, p_test
      from public.kr8_week_results r
      where r.week = wk and r.is_test = p_test and public.kr8_prize_for(r.rank) > 0 and r.rings >= flr
      on conflict do nothing;
      get diagnostics n_prize = row_count;
    end if;
  end if;
  select count(*) into n_rank from public.kr8_week_results where week = wk and is_test = p_test;
  return jsonb_build_object('week', wk, 'first_run', first_run, 'ranked', n_rank, 'prizes_created', n_prize,
    'posters', (select c.posters from public.kr8_week_closed c where c.week = wk and c.is_test = p_test),
    'prizes_total', (select count(*) from public.kr8_prizes where kind = 'weekly' and week = wk and is_test = p_test));
end $$;

-- Founding Local: the first N members whose first Reel is approved. Number is permanent (shown on the card).
create or replace function public.kr8_founding_try(p_member uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare t boolean; n int; amt int := public.kr8_rcfg('founding_thb', 100);
begin
  if public.kr8_rcfg('founding_on', 1) <> 1 or amt <= 0 then return null; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_member) then return null; end if;
  if exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding') then return null; end if;
  if not exists (select 1 from public.kr8_posts where author = p_member and kind = 'reel' and status = 'approved' and not hidden) then return null; end if;
  t := public.kr8_is_test_member(p_member);
  perform pg_advisory_xact_lock(hashtext('kr8_founding:' || t::text));
  select coalesce(max(founding_no), 0) + 1 into n from public.kr8_prizes where kind = 'founding' and is_test = t;
  if n > public.kr8_rcfg('founding_slots', 50) then return null; end if;
  insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (p_member, 'founding', n, amt, t) on conflict do nothing;
  if not found then return null; end if;
  return n;
end $$;

-- kr8_posts trigger: now only Founding Local. Never blocks a post or a review.
create or replace function public.kr8_rings_post_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind <> 'reel' or new.status <> 'approved' or new.hidden then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and not old.hidden then return new; end if;
  begin perform public.kr8_founding_try(new.author); exception when others then raise warning 'kr8_founding_try: %', sqlerrm; end;
  return new;
end $$;
drop trigger if exists kr8_rings_post_trg on public.kr8_posts;
create trigger kr8_rings_post_trg after insert or update of status, hidden on public.kr8_posts
  for each row execute function public.kr8_rings_post_trg();

-- interim earn rules: gone (they only wrote interim Rings)
drop trigger if exists kr8_react_trg on public.kr8_post_likes;
drop trigger if exists kr8_rings_ref_trg on public.kr8_members;
drop trigger if exists kr8_post_places_rings on public.kr8_post_places;
drop function if exists public.kr8_react_trg();
drop function if exists public.kr8_rings_ref_trg();
drop function if exists public.kr8_post_places_rings();
drop function if exists public.kr8_rings_try_reel(uuid);
drop function if exists public.kr8_rings_try_friend(uuid);
drop function if exists public.kr8_claim_reward(int, text, text);          -- Rings no longer convert to baht
drop function if exists public.kr8_week_ranked(timestamptz, text, uuid);
drop function if exists public.kr8_week_scores(timestamptz);
drop function if exists public.kr8_rings_totals(uuid);

-- kr8_create_reel_v2 used to report the interim Rings; same result shape, rings = 0
create or replace function public.kr8_create_reel_v2(p_video_path text, p_poster_path text, p_duration_ms integer, p_width integer, p_height integer,
  p_area text, p_body text default null, p_here boolean default false, p_place_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; pid uuid; n int := 0;
begin
  if p_place_ids is not null and (select count(distinct x) from unnest(p_place_ids) x) > 2 then raise exception 'KR8_TOO_MANY_PLACES'; end if;
  r := public.kr8_create_reel(p_video_path, p_poster_path, p_duration_ms, p_width, p_height, p_area, p_body, p_here);
  pid := (r->>'id')::uuid;
  if p_place_ids is not null and cardinality(p_place_ids) > 0 then
    insert into public.kr8_post_places (post_id, place_id, position)
    select pid, x.id, row_number() over (order by x.ord)::smallint
    from (select distinct on (u.id) u.id, u.ord from unnest(p_place_ids) with ordinality u(id, ord)
          join public.kr8_places pl on pl.id = u.id order by u.id, u.ord) x;
    get diagnostics n = row_count;
  end if;
  return r || jsonb_build_object('places', n, 'rings', 0);
end $$;

-- ───────────────────────── 5. streak badge (no Rings) ─────────────────────────
create table if not exists public.kr8_checkins (
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  day date not null,
  primary key (member_id, day)
);
alter table public.kr8_checkins enable row level security;
revoke all on public.kr8_checkins from public, anon, authenticated;

create or replace function public.kr8_streak(p_user uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  with d as (select (now() at time zone 'Asia/Bangkok')::date today),
       g as (select day, day - (row_number() over (order by day))::int grp from public.kr8_checkins where member_id = p_user),
       last as (select max(day) mx from g)
  select case when (select mx from last) >= (select today from d) - 1
              then (select count(*)::int from g where grp = (select grp from g where day = (select mx from last))) else 0 end
$$;

-- Last closed week, for the member: rank (top 10 only), Rings, the prize if any, and how far #9/#10 were from the prize line
create or replace function public.kr8_last_week_me(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select public.kr8_is_test_member(p_user) v, public.kr8_paid_ranks() paid, public.kr8_rcfg('min_rings_for_paid_seat', 25) flr),
       w as (select max(c.week) wk from public.kr8_week_closed c, t where c.is_test = t.v),
       me as (select r.* from public.kr8_week_results r, t, w where r.week = w.wk and r.is_test = t.v and r.member_id = p_user)
  select (select jsonb_build_object('week', me.week, 'rank', me.rank, 'rings', me.rings, 'reel', me.reels->>0,
            'prize', (select jsonb_build_object('id', p.id, 'amount', p.amount_thb, 'status', p.status) from public.kr8_prizes p
                      where p.member_id = p_user and p.kind = 'weekly' and p.week = me.week),
            'line_need', (select greatest(1, coalesce(l.rings, 0) - me.rings + 1, t.flr - me.rings) from t left join public.kr8_week_results l
                            on l.week = me.week and l.is_test = t.v and l.rank = t.paid),
            'line_prize', (select public.kr8_prize_for(t.paid) from t))
          from me)
$$;

-- The app calls this when a member with a card opens it: marks today for the streak badge (no Rings), returns held codes that arrived,
-- and last week's result (shown once).
create or replace function public.kr8_checkin() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); d date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  insert into public.kr8_checkins (member_id, day) values (uid, d) on conflict do nothing;
  return jsonb_build_object('added', 0, 'bonus', 0, 'streak', public.kr8_streak(uid),
    'ready', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'brand', brand, 'amount', amount_thb, 'assigned_at', assigned_at))
                       from public.kr8_reward_claims where member_id = uid and status = 'assigned' and assigned_at > created_at + interval '1 minute'
                         and assigned_at > now() - interval '7 days'), '[]'::jsonb),
    'prizes', (select count(*) from public.kr8_prizes where member_id = uid and status = 'won'),
    'result', public.kr8_last_week_me(uid));
end $$;

-- ───────────────────────── 6. claim a prize: one tap, Grab (full) or TrueMoney (75%) ─────────────────────────
create or replace function public.kr8_claim_prize(p_prize uuid, p_brand text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pz public.kr8_prizes; c public.kr8_reward_codes; cl public.kr8_reward_claims; cid uuid := gen_random_uuid();
        dev text := nullif(left(btrim(coalesce(p_device, '')), 64), '');
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_brand is null or not (p_brand in ('grab', 'truemoney') or (p_brand = 'shopeepay' and public.kr8_rcfg('shopeepay_on', 0) = 1)) then raise exception 'KR8_BAD_REWARD'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || uid::text));
  select * into pz from public.kr8_prizes where id = p_prize and member_id = uid for update;
  if pz.id is null then raise exception 'KR8_NO_PRIZE'; end if;
  if pz.status = 'claimed' then      -- tapped twice: same answer, nothing new
    select * into cl from public.kr8_reward_claims where id = pz.claim_id;
    select * into c from public.kr8_reward_codes where id = cl.code_id;
    return jsonb_build_object('status', cl.status, 'claim_id', cl.id, 'brand', cl.brand, 'amount', cl.amount_thb, 'again', true,
      'value', case when cl.brand = 'truemoney' then cl.amount_thb * 3 / 4 else cl.amount_thb end, 'code', c.code, 'activation_url', c.activation_url);
  end if;
  -- one person, one account: a phone that claimed for another account in the last 30 days can't claim again
  if dev is not null and exists (select 1 from public.kr8_reward_claims where device = dev and member_id <> uid and created_at > now() - interval '30 days') then
    raise exception 'KR8_ONE_ACCOUNT';
  end if;
  select * into c from public.kr8_reward_codes
    where brand = p_brand and amount_thb = pz.amount_thb and status = 'available' and is_test = pz.is_test
    order by added_at, id limit 1 for update skip locked;
  insert into public.kr8_reward_claims (id, member_id, brand, amount_thb, rings, status, code_id, device, ip_hash, is_test, assigned_at, prize_id)
  values (cid, uid, p_brand, pz.amount_thb, 0, case when c.id is null then 'pending' else 'assigned' end, c.id, dev, public.kr8_caller_ip_hash(), pz.is_test,
          case when c.id is null then null else now() end, pz.id);
  update public.kr8_prizes set status = 'claimed', claim_id = cid, claimed_at = now() where id = pz.id;
  if c.id is null then      -- no code of that exact amount in stock: HELD; the founder is emailed; the code goes out by itself when stock is added
    return jsonb_build_object('status', 'pending', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb,
      'value', case when p_brand = 'truemoney' then pz.amount_thb * 3 / 4 else pz.amount_thb end);
  end if;
  update public.kr8_reward_codes set status = 'assigned', assigned_to = uid, assigned_at = now(), claim_id = cid where id = c.id;
  return jsonb_build_object('status', 'assigned', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb, 'value', c.value_thb,
                            'code', c.code, 'activation_url', c.activation_url);
end $$;

-- New stock fills held claims, oldest first
create or replace function public.kr8_fill_pending_claims() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; c public.kr8_reward_codes; n int := 0;
begin
  for p in select * from public.kr8_reward_claims where status = 'pending' order by created_at limit 500 for update skip locked loop
    c := null;
    select * into c from public.kr8_reward_codes where brand = p.brand and amount_thb = p.amount_thb and status = 'available' and is_test = p.is_test
      order by added_at, id limit 1 for update skip locked;
    if c.id is null then continue; end if;
    update public.kr8_reward_codes set status = 'assigned', assigned_to = p.member_id, assigned_at = now(), claim_id = p.id where id = c.id;
    update public.kr8_reward_claims set status = 'assigned', code_id = c.id, assigned_at = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Founder email on every claim: now says which prize it pays
create or replace function public.kr8_claim_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; pz public.kr8_prizes;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  select * into pz from public.kr8_prizes where id = new.prize_id;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/notify-reward',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
    body := jsonb_build_object('type', 'INSERT', 'table', 'kr8_reward_claims',
      'record', jsonb_build_object('id', new.id, 'brand', new.brand, 'amount_thb', new.amount_thb, 'rings', new.rings, 'status', new.status,
                                   'is_test', new.is_test, 'created_at', new.created_at,
                                   'prize_kind', pz.kind, 'prize_week', pz.week, 'prize_rank', pz.rank, 'founding_no', pz.founding_no,
                                   'first_name', (select first_name from public.kr8_members where user_id = new.member_id),
                                   'member_no', (select member_no from public.kr8_members where user_id = new.member_id)),
      'stock', (select coalesce(jsonb_object_agg(brand || '_' || amount_thb, n), '{}'::jsonb) from (
                  select brand, amount_thb, count(*) n from public.kr8_reward_codes where status = 'available' and not is_test group by 1, 2) s)),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  return new;   -- never block a claim
end $$;

-- Admin: stock per brand / amount for every amount on the prize ladder (+ anything already in stock or waiting)
create or replace function public.kr8_admin_reward_stock()
returns table(brand text, amount_thb int, available int, held int, given_7d int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
    with amts as (
      select distinct a from (
        select public.kr8_prize_for(r) a from generate_series(1, 10) r
        union select public.kr8_rcfg('founding_thb', 100)
        union select k.amount_thb from public.kr8_reward_codes k where not k.is_test
        union select c.amount_thb from public.kr8_reward_claims c where not c.is_test and c.status = 'pending') z where a > 0),
    brands as (select b from (values ('grab'), ('truemoney'), ('shopeepay')) v(b)
               where b <> 'shopeepay' or public.kr8_rcfg('shopeepay_on', 0) = 1
                  or exists (select 1 from public.kr8_reward_codes k where k.brand = 'shopeepay' and not k.is_test))
    select b.b, a.a::int,
      (select count(*)::int from public.kr8_reward_codes k where k.brand = b.b and k.amount_thb = a.a and k.status = 'available' and not k.is_test),
      (select count(*)::int from public.kr8_reward_claims c where c.brand = b.b and c.amount_thb = a.a and c.status = 'pending' and not c.is_test),
      (select count(*)::int from public.kr8_reward_claims c where c.brand = b.b and c.amount_thb = a.a and c.status = 'assigned' and not c.is_test and c.assigned_at > now() - interval '7 days')
    from brands b cross join amts a
    order by 1, 2 desc;
end $$;

-- ───────────────────────── 7. what the screens read ─────────────────────────
-- Level from lifetime Rings (the member's Reel scores, all time): thresholds unchanged (kr8_rings_level)
create or replace function public.kr8_member_rings(p_user uuid)
returns table(lifetime int, week int, week_rank int) language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select public.kr8_is_test_member(p_user) v)
  select coalesce((select sum(s.score)::int from t, public.kr8_reel_scores('-infinity', 'infinity', 'infinity', t.v, p_user) s), 0),
         coalesce((select b.rings from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user), 0),
         (select b.rk from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user)
$$;

create or replace function public.kr8_card_extras(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; t record;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  select * into t from public.kr8_member_rings(tgt);
  return jsonb_build_object('member_no', m.member_no, 'ig_handle', m.ig_handle, 'tiktok_handle', m.tiktok_handle,
    'lifetime', t.lifetime, 'level', public.kr8_rings_level(t.lifetime), 'week', t.week, 'week_rank', t.week_rank,
    'founding_no', (select founding_no from public.kr8_prizes where member_id = tgt and kind = 'founding'),
    'founding_left', case when uid = tgt and public.kr8_rcfg('founding_on', 1) = 1 then greatest(0, public.kr8_rcfg('founding_slots', 50)
        - (select count(*)::int from public.kr8_prizes where kind = 'founding' and is_test = public.kr8_is_test_member(tgt))) end,
    'founding_thb', public.kr8_rcfg('founding_thb', 100),
    'has_reel', case when uid = tgt then exists (select 1 from public.kr8_posts where author = tgt and kind = 'reel' and not hidden) end,
    'prizes', case when uid = tgt then (select count(*) from public.kr8_prizes where member_id = tgt and status = 'won') end);
end $$;

-- Where a member stands this week and the next step: Rings to the next paid rank and what it pays (the pinned row).
-- state: top (#1, paid) · paid · floor (in a prize rank, under the floor) · board (#9–10) · far (below the board) · off (no Rings yet)
create or replace function public.kr8_rank_gap(p_w0 timestamptz, p_test boolean, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare paid int := public.kr8_paid_ranks(); flr int := public.kr8_rcfg('min_rings_for_paid_seat', 25); top int := greatest(public.kr8_rcfg('board_size', 10), 3);
        b jsonb; my_rk int; my_r int; n int; others int; tgt int; tr int; need int; is_open boolean := false; st text; ab jsonb; bh jsonb; t10 int;
begin
  if p_user is null then return null; end if;
  select coalesce(jsonb_object_agg(x.rk::text, jsonb_build_object('m', x.member_id, 'r', x.rings, 'n', mm.first_name)), '{}'::jsonb) into b
  from public.kr8_week_board(p_w0, p_test) x join public.kr8_members mm on mm.user_id = x.member_id;
  select e.key::int, (e.value->>'r')::int into my_rk, my_r from jsonb_each(b) e where e.value->>'m' = p_user::text;
  my_r := coalesce(my_r, 0);
  select count(*) into n from jsonb_object_keys(b);
  others := n - (case when my_rk is null then 0 else 1 end);
  if my_rk is not null and my_rk <= paid and my_r < flr then
    tgt := my_rk; need := flr - my_r; st := 'floor';
  elsif my_rk = 1 then
    st := 'top';
  elsif my_rk is not null and my_rk <= paid then
    tgt := my_rk - 1; tr := (b->(tgt::text)->>'r')::int; need := greatest(1, tr - my_r + 1, flr - my_r); st := 'paid';
  elsif others >= paid then
    tgt := paid; tr := (b->(paid::text)->>'r')::int; need := greatest(1, tr - my_r + 1, flr - my_r);
    st := case when my_rk is null then 'off' when my_rk <= top then 'board' else 'far' end;
  else
    tgt := others + 1; need := greatest(1, flr - my_r); is_open := true; st := 'off';
  end if;
  if my_rk > 1 then ab := jsonb_build_object('rank', my_rk - 1, 'name', b->((my_rk - 1)::text)->>'n', 'need', (b->((my_rk - 1)::text)->>'r')::int - my_r + 1); end if;
  if my_rk is not null and b ? ((my_rk + 1)::text) then bh := jsonb_build_object('rank', my_rk + 1, 'diff', my_r - (b->((my_rk + 1)::text)->>'r')::int); end if;
  if my_rk is null or my_rk > top then t10 := case when b ? (top::text) then greatest(1, (b->(top::text)->>'r')::int - my_r + 1) else 1 end; end if;
  return jsonb_build_object('state', st, 'rank', my_rk, 'rings', my_r, 'floor', flr,
    'prize_now', case when my_rk <= paid and my_r >= flr then public.kr8_prize_for(my_rk) else 0 end,
    'target', case when tgt is null then null else jsonb_build_object('rank', tgt, 'need', need, 'prize', public.kr8_prize_for(tgt), 'open', is_open) end,
    'above', ab, 'behind', bh, 'top10_need', t10);
end $$;

-- Weekly ranking: always the top 10 of the tab (All Bangkok / My area / Friends). Prizes follow the All Bangkok rank.
create or replace function public.kr8_weekly_ranking(p_scope text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); r jsonb; t boolean; top int := greatest(public.kr8_rcfg('board_size', 10), 3);
        paid int := public.kr8_paid_ranks(); flr int := public.kr8_rcfg('min_rings_for_paid_seat', 25); posters int; minp int := public.kr8_rcfg('min_posters_for_payout', 0);
begin
  if p_scope not in ('all', 'area', 'friends') then raise exception 'KR8_BAD_SCOPE'; end if;
  if p_scope <> 'all' and uid is null then raise exception 'KR8_SIGN_IN'; end if;
  t := uid is not null and public.kr8_is_test_member(uid);
  posters := public.kr8_week_posters(w0, t);
  with allb as materialized (select * from public.kr8_week_board(w0, t)),
       my as (select area from public.kr8_members where user_id = uid),
       line as (select rings from allb where rk = paid),
       cur as (select b.*, m.first_name, m.photo, m.area, m.created_at as joined
               from allb b join public.kr8_members m on m.user_id = b.member_id
               where (p_scope = 'all'
                      or (p_scope = 'area' and m.area = (select area from my))
                      or (p_scope = 'friends' and (b.member_id = uid or exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = b.member_id))))
                 and (uid is null or b.member_id = uid or not public.kr8_is_blocked(uid, b.member_id))),
       rws as (select c.*, (row_number() over (order by c.rk))::int as srk from cur c),
       prev as (select member_id, rank from public.kr8_week_results where week = ((w0 - interval '7 days') at time zone 'Asia/Bangkok')::date and is_test = t)
  select jsonb_build_object(
    'week_start', w0, 'ends_at', w0 + interval '7 days', 'scope', p_scope,
    'area', (select area from my),
    'total', (select count(*) from rws),
    'paid_ranks', paid, 'floor', flr, 'posters', posters, 'min_posters', minp, 'payout_on', posters >= minp,
    'open_seats', greatest(0, paid - (select count(*)::int from allb)),
    'prizes', (select jsonb_agg(public.kr8_prize_for(g) order by g) from generate_series(1, top) g),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', x.srk, 'all_rank', x.rk, 'rings', x.rings, 'prize', public.kr8_prize_for(x.rk),
                       'paid', (x.rk <= paid and x.rings >= flr and public.kr8_prize_for(x.rk) > 0),
                       'needs', case when x.rk <= paid and x.rings < flr then flr end,
                       'to_line', case when x.rk > paid then greatest(1, coalesce((select rings from line), 0) - x.rings + 1, flr - x.rings) end,
                       'is_new', x.joined >= w0,
                       'user_id', x.member_id, 'first_name', x.first_name, 'photo', case when uid is null then null else x.photo end,
                       'area', x.area, 'move', (select p.rank - x.rk from prev p where p.member_id = x.member_id), 'is_me', x.member_id = uid) order by x.srk)
                      from rws x where x.srk <= top), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', x.srk, 'all_rank', x.rk, 'rings', x.rings, 'prize', public.kr8_prize_for(x.rk),
                                     'move', (select p.rank - x.rk from prev p where p.member_id = x.member_id)) from rws x where x.member_id = uid),
    'gap', public.kr8_rank_gap(w0, t, uid),
    'mine', case when uid is null then null else (select jsonb_build_object(
              'pending', count(*) filter (where p.status = 'pending'),
              'live', count(*) filter (where p.status = 'approved' and exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)),
              'no_place', count(*) filter (where p.status = 'approved' and not exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)))
            from public.kr8_posts p where p.author = uid and p.kind = 'reel' and not p.hidden and p.created_at >= w0) end)
  into r;
  return r;
end $$;

-- Tap any score → the math: the member's best Reels this week with every line of the sum
create or replace function public.kr8_score_breakdown(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); m public.kr8_members; t boolean; best int := greatest(public.kr8_rcfg('best_reels', 2), 1); r jsonb;
begin
  select * into m from public.kr8_members where user_id = p_user;
  if m.user_id is null or (uid is not null and uid <> p_user and public.kr8_is_blocked(uid, p_user)) then raise exception 'KR8_NO_PERSON'; end if;
  t := public.kr8_is_test_member(p_user);
  with s as (select x.*, row_number() over (order by x.score desc, x.posted_at asc, x.post_id) n
             from public.kr8_reel_scores(w0, w0 + interval '7 days', w0 + interval '7 days', t, p_user) x where x.score > 0)
  select jsonb_build_object(
    'user_id', p_user, 'first_name', m.first_name, 'is_me', uid = p_user,
    'rings', coalesce((select sum(score) from s where n <= best), 0),
    'rank', (select rk from public.kr8_week_board(w0, t) where member_id = p_user),
    'weights', jsonb_build_object('like', public.kr8_rcfg('like', 1), 'save', public.kr8_rcfg('save', 3), 'open', public.kr8_rcfg('open', 5),
                                  'mult', public.kr8_rcfg('traveller_mult', 2), 'cap', public.kr8_rcfg('opens_day_cap', 30), 'best', best),
    'more', (select count(*) from s where n > best),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('post_id', s.post_id, 'posted_at', s.posted_at, 'poster_path', p.poster_path,
                 'place', (select pl.name_en from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = s.post_id order by pp.position limit 1),
                 'place_th', (select pl.name_th from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = s.post_id order by pp.position limit 1),
                 'l_local', s.l_local, 'l_trav', s.l_trav, 's_local', s.s_local, 's_trav', s.s_trav, 'opens', s.opens, 'score', s.score) order by s.n)
               from s join public.kr8_posts p on p.id = s.post_id where s.n <= best), '[]'::jsonb))
  into r;
  return r;
end $$;

-- Rewards screen: this week's Rings + rank, the ladder, my prizes, my codes
create or replace function public.kr8_my_rewards()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t boolean; mr record; w0 timestamptz := public.kr8_week_start(now()); d date := (now() at time zone 'Asia/Bangkok')::date; r jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  t := public.kr8_is_test_member(uid);
  select * into mr from public.kr8_member_rings(uid);
  select jsonb_build_object(
    'week', mr.week, 'rank', mr.week_rank, 'lifetime', mr.lifetime, 'level', public.kr8_rings_level(mr.lifetime),
    'gap', public.kr8_rank_gap(w0, t, uid), 'ends_at', w0 + interval '7 days',
    'member_no', (select member_no from public.kr8_members where user_id = uid),
    'founding_no', (select founding_no from public.kr8_prizes where member_id = uid and kind = 'founding'),
    'founding_left', greatest(0, public.kr8_rcfg('founding_slots', 50) - (select count(*)::int from public.kr8_prizes where kind = 'founding' and is_test = t)),
    'floor', public.kr8_rcfg('min_rings_for_paid_seat', 25),
    'rules', public.kr8_rings_rules(),
    'ladder', (select jsonb_agg(public.kr8_prize_for(g) order by g) from generate_series(1, greatest(public.kr8_rcfg('board_size', 10), 3)) g),
    'streak', public.kr8_streak(uid),
    'checked_in_today', exists (select 1 from public.kr8_checkins where member_id = uid and day = d),
    'prizes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'week', p.week, 'rank', p.rank, 'founding_no', p.founding_no,
                 'amount', p.amount_thb, 'rings', p.rings, 'status', p.status, 'claim_id', p.claim_id, 'created_at', p.created_at)
                 order by (p.status = 'won') desc, p.created_at desc)
               from public.kr8_prizes p where p.member_id = uid), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand, 'amount', c.amount_thb, 'status', c.status,
                 'value', coalesce(k.value_thb, case when c.brand = 'truemoney' then c.amount_thb * 3 / 4 else c.amount_thb end),
                 'code', k.code, 'activation_url', k.activation_url, 'used_at', c.used_at, 'created_at', c.created_at, 'assigned_at', c.assigned_at,
                 'kind', p.kind, 'week', p.week, 'rank', p.rank, 'founding_no', p.founding_no)
                 order by c.created_at desc)
               from public.kr8_reward_claims c left join public.kr8_reward_codes k on k.id = c.code_id and k.assigned_to = uid
               left join public.kr8_prizes p on p.id = c.prize_id
               where c.member_id = uid and c.status <> 'cancelled'), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Saved Reels for the Me tab (newest save first). Only Reels the member may still see.
create or replace function public.kr8_my_saved_reels(p_limit int default 60)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'poster_path', x.poster_path, 'video_path', x.video_path, 'likes', x.likes_count,
                                               'name', x.first_name, 'saved_at', x.saved_at) order by x.saved_at desc), '[]'::jsonb)
  from (select p.id, p.poster_path, p.video_path, p.likes_count, m.first_name, s.created_at as saved_at
        from public.kr8_post_saves s join public.kr8_posts p on p.id = s.post_id join public.kr8_members m on m.user_id = p.author
        where s.user_id = auth.uid() and p.kind = 'reel' and not p.hidden and (p.status = 'approved' or p.author = auth.uid())
          and not public.kr8_is_blocked(auth.uid(), p.author)
        order by s.created_at desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) x
$$;

-- ───────────────────────── 8. who may call what ─────────────────────────
revoke execute on function public.kr8_prize_for(int), public.kr8_paid_ranks(), public.kr8_reel_scores(timestamptz, timestamptz, timestamptz, boolean, uuid),
  public.kr8_week_board(timestamptz, boolean), public.kr8_close_week(date, boolean), public.kr8_founding_try(uuid), public.kr8_rings_post_trg(),
  public.kr8_streak(uuid), public.kr8_fill_pending_claims(), public.kr8_claim_notify(), public.kr8_member_rings(uuid),
  public.kr8_rank_gap(timestamptz, boolean, uuid), public.kr8_week_posters(timestamptz, boolean), public.kr8_last_week_me(uuid) from public, anon, authenticated;
grant execute on function public.kr8_close_week(date, boolean) to service_role;

revoke execute on function public.kr8_claim_prize(uuid, text, text), public.kr8_checkin(), public.kr8_my_rewards(), public.kr8_my_saved_reels(int),
  public.kr8_share_open_seen(uuid), public.kr8_admin_reward_stock(), public.kr8_create_reel_v2(text, text, integer, integer, integer, text, text, boolean, uuid[]) from public, anon;
grant execute on function public.kr8_claim_prize(uuid, text, text), public.kr8_checkin(), public.kr8_my_rewards(), public.kr8_my_saved_reels(int),
  public.kr8_share_open_seen(uuid), public.kr8_admin_reward_stock(), public.kr8_create_reel_v2(text, text, integer, integer, integer, text, text, boolean, uuid[]) to authenticated;

revoke execute on function public.kr8_share_open(text, text, text, text, text, text, text), public.kr8_reel_share_link(uuid), public.kr8_weekly_ranking(text),
  public.kr8_score_breakdown(uuid), public.kr8_card_extras(uuid) from public;
grant execute on function public.kr8_share_open(text, text, text, text, text, text, text), public.kr8_reel_share_link(uuid), public.kr8_weekly_ranking(text),
  public.kr8_score_breakdown(uuid), public.kr8_card_extras(uuid) to anon, authenticated;

commit;
