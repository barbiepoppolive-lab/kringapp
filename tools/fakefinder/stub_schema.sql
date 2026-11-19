-- Throwaway LOCAL database only: the smallest copy of the live tables/functions 0124 reads or patches, so
-- 0124_fake_finder.sql + supabase/tests/0124_test.sql run without touching live or TEST.
-- Bodies of kr8_reel_scores (0095), kr8_people (0093), kr8_founding_try (0067), kr8_alert_raise / clear (0099),
-- kr8_link_add / kr8_linked / kr8_face_dist (0066/0076) and the ghost trigger (0061) are copied from the repo migrations so
-- the in-place patches are tested against the real text. kr8_claim_prize is a stand-in that only keeps the anchor line.
-- Run: tools/fakefinder/run_local_test.sh
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;

create table public.kr8_rings_config (key text primary key, value int not null, note text);
create or replace function public.kr8_rcfg(k text, dflt int default 0) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.kr8_rings_config where key = k), dflt) $$;

create table public.kr8_admin_emails (email text primary key);
create table public.kr8_team_accounts (user_id uuid primary key);
create table public.kr8_members (user_id uuid primary key references auth.users(id) on delete cascade, member_no int, first_name text,
  photo text, langs text[], bio text, area text, who text, here_until timestamptz, updated_at timestamptz default now(),
  ref_code text, src_code text, ref_set_at timestamptz, ghost boolean not null default false, verified boolean not null default false,
  last_active_at timestamptz, created_at timestamptz not null default now());
create or replace function public.kr8_is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = auth.uid()) $$;
create or replace function public.kr8_is_test_member(p_user uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select m.first_name ilike '%test%' from public.kr8_members m where m.user_id = p_user), false) $$;
create or replace function public.kr8_is_team(p uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and exists (select 1 from public.kr8_team_accounts t where t.user_id = p) $$;
create or replace function public.kr8_is_ghost(p uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and exists (select 1 from public.kr8_members g where g.user_id = p and g.ghost) $$;
create table public.kr8_blocks (blocker uuid, blocked uuid);
create or replace function public.kr8_is_blocked(x uuid, y uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and auth.uid() in (x, y)
     and (exists (select 1 from public.kr8_blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x))
          or public.kr8_is_ghost(case when auth.uid() = x then y else x end)) $$;
create or replace function public.kr8_face_gate(p_user uuid) returns boolean language sql stable as $$ select false $$;
create or replace function public.kr8_caller_ip_hash() returns text language sql stable as $$
  select nullif(current_setting('t.ip', true), '') $$;

-- 0061 ghost trigger
create or replace function public.kr8_ghost_member_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('kr8.ghost_set', true), '') <> '1' then
    if tg_op = 'INSERT' then new.ghost := false;
    else new.ghost := old.ghost;
    end if;
  end if;
  return new;
end $$;
create trigger kr8_ghost_member before insert or update on public.kr8_members for each row execute function public.kr8_ghost_member_trg();

create table public.kr8_posts (id uuid primary key default gen_random_uuid(), author uuid, kind text not null default 'reel',
  status text not null default 'approved', hidden boolean not null default false, board_off boolean not null default false,
  created_at timestamptz not null default now());
create table public.kr8_places (id uuid primary key default gen_random_uuid(), outside_bkk boolean not null default false);
create table public.kr8_post_places (post_id uuid, place_id uuid);
create table public.kr8_post_likes (user_id uuid, post_id uuid, created_at timestamptz not null default now());
create table public.kr8_post_saves (user_id uuid, post_id uuid, created_at timestamptz not null default now());
create table public.kr8_share_opens (id uuid primary key default gen_random_uuid(), post_id uuid, bkk_date date not null default current_date,
  session text not null default 's', device text not null default 'd', ua text, ok boolean not null default true, why text, opener uuid,
  created_at timestamptz not null default now());
-- 0058
create table public.kr8_client_events (id bigserial primary key, user_id uuid, kind text not null, code text, detail text, ua text,
  created_at timestamptz not null default now());
create or replace function public.kr8_log_client(p_kind text, p_code text default null, p_detail text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$ begin return; end $$;

create table public.kr8_face_prints (id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade,
  descriptor real[] not null, source text not null, verification_id uuid, created_at timestamptz not null default now());
create table public.kr8_account_links (a uuid not null, b uuid not null, reason text not null, detail jsonb not null default '{}'::jsonb,
  first_at timestamptz not null default now(), last_at timestamptz not null default now(), dismissed_at timestamptz, dismissed_by uuid,
  primary key (a, b, reason), check (a < b), check (reason in ('face', 'face_maybe', 'device', 'network', 'line')));
create or replace function public.kr8_face_dist(x real[], y real[]) returns double precision
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select sqrt(sum((u - v)::double precision * (u - v)::double precision)) from unnest(x, y) as t(u, v) $$;
create or replace function public.kr8_linked(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select x is not null and y is not null and x <> y and exists (
    select 1 from public.kr8_account_links l where l.a = least(x, y) and l.b = greatest(x, y) and l.dismissed_at is null
                and l.reason in ('face', 'device')) $$;
create or replace function public.kr8_link_add(x uuid, y uuid, p_reason text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if x is null or y is null or x = y then return; end if;
  insert into public.kr8_account_links (a, b, reason, detail) values (least(x, y), greatest(x, y), p_reason, coalesce(p_detail, '{}'::jsonb))
  on conflict (a, b, reason) do update set last_at = now(),
    detail = case when p_reason in ('face', 'face_maybe') and (excluded.detail ->> 'dist')::float8 < coalesce((kr8_account_links.detail ->> 'dist')::float8, 9)
                  then excluded.detail else kr8_account_links.detail end;
end $$;
-- 0081 decisions (no vectors needed)
create table public.kr8_face_decisions (id uuid primary key default gen_random_uuid(), user_id uuid not null, verification_id uuid,
  decision text not null, reasons text[] not null default '{}', match numeric, dup_sim numeric, dup_user uuid, dup_source text,
  was_verified boolean not null default false, live jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());

create table public.kr8_reward_claims (id uuid primary key default gen_random_uuid(), member_id uuid, device text, ip_hash text,
  status text not null default 'pending', held boolean not null default false, created_at timestamptz not null default now());
create table public.kr8_prizes (id uuid primary key default gen_random_uuid(), member_id uuid, kind text not null default 'founding',
  founding_no int, amount_thb int, is_test boolean not null default false, status text not null default 'won', email_hash text, line_hash text,
  created_at timestamptz not null default now(), unique (member_id, kind));
create table public.kr8_prize_faces (id bigserial primary key, descriptor real[] not null, kept_at timestamptz not null default now());
create or replace function public.kr8_email_hash_of(p uuid) returns text language sql stable as $$ select null::text $$;
create or replace function public.kr8_line_hash_of(p uuid) returns text language sql stable as $$ select null::text $$;

-- 0098 / 0099 robots + alerts
create table public.kr8_robot (name text primary key, title text not null, note text not null default '', schedule text not null default 'manual',
  mode text not null default 'dry_run', daily_cap int not null default 50, last_run timestamptz, last_ok boolean, last_note text,
  updated_at timestamptz not null default now());
create table public.kr8_heartbeat (job text primary key, every_sec int, last_beat timestamptz, last_ok boolean, detail jsonb);
create table public.kr8_robot_alerts (id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
  robot text not null references public.kr8_robot(name) on update cascade on delete cascade, severity text not null, title text not null,
  body text not null default '', href text not null default '#inbox', detail jsonb not null default '{}'::jsonb,
  first_at timestamptz not null default now(), last_at timestamptz not null default now(), cleared_at timestamptz, cleared_by text);
create or replace function public.kr8_alert_raise(p_key text, p_robot text, p_severity text, p_title text, p_body text default '',
  p_href text default '#inbox', p_detail jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare aid uuid;
begin
  insert into public.kr8_robot_alerts (dedupe_key, robot, severity, title, body, href, detail)
  values (left(btrim(p_key), 120), p_robot, p_severity, left(btrim(p_title), 160), left(coalesce(p_body, ''), 500), p_href, coalesce(p_detail, '{}'::jsonb))
  on conflict (dedupe_key) do update set severity = excluded.severity, title = excluded.title, body = excluded.body, detail = excluded.detail,
    last_at = now(), cleared_at = null, cleared_by = null
  returning id into aid;
  return aid;
end $$;
create or replace function public.kr8_alert_clear(p_key text, p_by text default 'auto') returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0;
begin
  update public.kr8_robot_alerts set cleared_at = now(), cleared_by = left(coalesce(p_by, 'auto'), 40) where dedupe_key = p_key and cleared_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
create or replace function public.kr8_schedule_job(p_job text, p_cron text, p_sql text) returns boolean language plpgsql as $$
begin insert into public.kr8_heartbeat (job, detail) values ('cron:' || p_job, jsonb_build_object('cron', p_cron, 'sql', p_sql))
  on conflict (job) do update set detail = excluded.detail; return true; end $$;

-- ───── live bodies that 0124 patches (copied from the repo) ─────
-- 0095
create or replace function public.kr8_reel_scores(p_from timestamptz, p_to timestamptz, p_until timestamptz, p_test boolean, p_author uuid default null)
returns table (post_id uuid, author uuid, posted_at timestamptz, l_local int, l_trav int, s_local int, s_trav int, opens int, score int)
language sql stable security definer set search_path = public, pg_temp as $$
  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('open', 5) w_open,
                      public.kr8_rcfg('traveller_mult', 2) mult, public.kr8_rcfg('opens_day_cap', 30) cap),
  reels as (
    select p.id, p.author, p.created_at
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not p.hidden
      and p.created_at >= p_from and p.created_at < p_to
      and (p_author is null or p.author = p_author)
      and not p.board_off   -- 0074: admin "Feed only" (AI-made, not own footage, repost): stays in the feed, never on the board
      and exists (select 1 from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id   -- 0072: at least one Bangkok place
                  where pp.post_id = p.id and not pl.outside_bkk)
      and exists (select 1 from public.kr8_members am where am.user_id = p.author and not am.ghost)   -- 0095: hidden duplicates earn nothing
      and public.kr8_is_test_member(p.author) = p_test
      and not public.kr8_is_team(p.author)
  ),
  ppl as (   -- members whose likes and saves count
    select m.user_id, (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
    from public.kr8_members m
    where coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and public.kr8_is_test_member(m.user_id) = p_test and not public.kr8_is_team(m.user_id)
      and not m.ghost   -- 0095: a hidden duplicate's likes/saves earn nothing
      and (m.verified or m.created_at < now() - make_interval(hours => public.kr8_rcfg('liker_min_age_hours', 72)))
  ),
  lk as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_likes l on l.post_id = r.id and l.user_id <> r.author and l.created_at < p_until
    join ppl c on c.user_id = l.user_id
    where not public.kr8_linked(l.user_id, r.author)
    group by r.id
  ),
  sv as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_saves s on s.post_id = r.id and s.user_id <> r.author and s.created_at < p_until
    join ppl c on c.user_id = s.user_id
    where not public.kr8_linked(s.user_id, r.author)
    group by r.id
  ),
  od as (
    select r.id, o.bkk_date, count(*)::int n
    from reels r join public.kr8_share_opens o on o.post_id = r.id and o.ok and o.created_at < p_until
    where o.opener is distinct from r.author
      and (o.opener is null or not public.kr8_linked(o.opener, r.author))
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
-- 0093
create or replace function public.kr8_people(p_limit integer default 60)
returns table(user_id uuid, first_name text, photo text, langs text[], bio text, area text, who text, here boolean, verified boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, m.first_name, m.photo, m.langs, m.bio, m.area, m.who, coalesce(m.here_until > now(), false), m.verified
  from public.kr8_members m
  cross join (select auth.uid() is not null and public.kr8_is_admin() as yes) adm                       -- 0077
  where (exists (select 1 from public.kr8_members me where me.user_id = auth.uid()) or adm.yes)         -- 0077: "or adm.yes"
    and m.user_id <> auth.uid() and not public.kr8_is_blocked(auth.uid(), m.user_id)
    and not public.kr8_face_gate(m.user_id)                                                            -- 0093
  order by (m.here_until > now()) desc nulls last, m.updated_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
-- stand-in for 0111 kr8_claim_prize: only the hold decision (the anchor line is the exact 0111 text)
create or replace function public.kr8_claim_prize(p_prize uuid, p_brand text, p_device text default null, p_face real[] default null, p_selfie text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); others jsonb; review text[] := '{}'; held boolean := false; cid uuid := gen_random_uuid();
begin
  held := others is not null or cardinality(review) > 0;
  insert into public.kr8_reward_claims (id, member_id, device, held) values (cid, uid, p_device, held);
  return jsonb_build_object('held', held, 'review', to_jsonb(review), 'claim_id', cid);
end $$;
-- 0067
create or replace function public.kr8_founding_try(p_member uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare t boolean; n int; amt int := public.kr8_rcfg('founding_thb', 100); eh text; lh text; mx float8 := public.kr8_rcfg('face_same_max', 500) / 1000.0; o record;
begin
  if public.kr8_rcfg('founding_on', 1) <> 1 or amt <= 0 then return null; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_member) then return null; end if;
  if public.kr8_is_team(p_member) then return null; end if;
  if exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding') then return null; end if;
  if not exists (select 1 from public.kr8_posts where author = p_member and kind = 'reel' and status = 'approved' and not hidden) then return null; end if;
  -- same person as an earlier Founding Local (also a deleted account): same email, same LINE, or same face
  eh := public.kr8_email_hash_of(p_member); lh := public.kr8_line_hash_of(p_member);
  if exists (select 1 from public.kr8_prizes x where x.kind = 'founding' and x.member_id is distinct from p_member
             and ((eh is not null and x.email_hash = eh) or (lh is not null and x.line_hash = lh))) then return null; end if;
  for o in select x.member_id from public.kr8_prizes x where x.kind = 'founding' and x.member_id is not null and x.member_id <> p_member
             and x.status <> 'cancelled'
             and exists (select 1 from public.kr8_face_prints a join public.kr8_face_prints b on b.user_id = x.member_id
                         where a.user_id = p_member and public.kr8_face_dist(a.descriptor, b.descriptor) <= mx) loop
    perform public.kr8_link_add(p_member, o.member_id, 'face', jsonb_build_object('where', 'founding check'));
    return null;
  end loop;
  if exists (select 1 from public.kr8_face_prints a join public.kr8_prize_faces k on k.kept_at > now() - interval '1 year'
             where a.user_id = p_member and public.kr8_face_dist(a.descriptor, k.descriptor) <= mx) then return null; end if;
  t := public.kr8_is_test_member(p_member);
  perform pg_advisory_xact_lock(hashtext('kr8_founding:' || t::text));
  select coalesce(max(founding_no), 0) + 1 into n from public.kr8_prizes where kind = 'founding' and is_test = t;
  if n > public.kr8_rcfg('founding_slots', 50) then return null; end if;
  insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (p_member, 'founding', n, amt, t) on conflict do nothing;
  if not found then return null; end if;
  return n;
end $$;
