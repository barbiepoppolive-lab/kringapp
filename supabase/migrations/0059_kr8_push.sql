-- 0059 (16 Nov): phone push notifications ("dings"). ADDITIVE ONLY: three new tables, new functions, three AFTER UPDATE triggers
-- that never block the update they watch (every error is swallowed). Nothing existing is changed or dropped.
--
-- How a ding travels (outbox design, one path for every kind):
--   1. Something happens: an admin approves a face check (kr8_verifications pending → approved), a held reward gets its code
--      (kr8_reward_claims pending → assigned), an admin approves a Reel (kr8_posts status → approved), or an admin sends one by
--      hand (kr8_admin_push_send).
--   2. kr8_push_queue() writes one kr8_push_msgs row and one kr8_push_outbox row per phone (subscription) of the member(s),
--      then pokes https://kringapp.com/api/push through pg_net (async, sent after the transaction commits).
--   3. The Cloudflare Pages Function /api/push (site repo, functions/api/push.js) checks the shared secret, takes up to a small
--      batch with kr8_push_claim() (service role only), encrypts + sends each Web Push with VAPID, and reports back with
--      kr8_push_done(): sent → last_ok_at; 404/410 → the subscription is deleted; other failures → fail_count (deleted at 5).
--      If more rows are waiting, kr8_push_done() pokes the endpoint again, so big "send to all" jobs go out in batches.
--   A member with no subscription simply gets nothing (the admin screen shows "0 phones").
--   LINE dings: a member who signed in with LINE (kr8_line_links) and has NO phone subscription gets the same ding as a LINE
--   message from the Kring OA (Messaging API push, sent by the same /api/push). Only for the three automatic events and admin
--   sends that leave "LINE" ticked; capped per month by kr8_rings_config 'push_line_cap' (default 0 = LINE off until go-live).
--   A 400/403 from LINE (not a friend of the OA / blocked) is remembered in kr8_push_line and that member is skipped until
--   they sign in with LINE again (the sign-in offers "add Kring as a friend", bot_prompt=aggressive).
--
-- Sign-in hand-off (escaping an in-app browser): kr8_handoff_create() gives the signed-in member a one-time code (3 minutes,
-- single use, stored only as a SHA-256 hash). The app adds it to the link it opens in Chrome / Safari; there /api/handoff
-- (service role) swaps it with kr8_handoff_take() for a one-time sign-in, so the member lands signed in.
--
-- Needs before it works (go-live): Supabase vault secret 'push_hook_secret' (same value as PUSH_HOOK_SECRET on Cloudflare).
-- Without it the queue still fills but nothing is poked (safe). LINE dings also need kr8_rings_config push_line_cap > 0.
--
-- UNDO: begin;
--   drop trigger if exists kr8_push_verified on public.kr8_verifications; drop trigger if exists kr8_push_reward on public.kr8_reward_claims;
--   drop trigger if exists kr8_push_reel on public.kr8_posts;
--   drop function if exists public.kr8_push_on_verified(), public.kr8_push_on_reward(), public.kr8_push_on_reel(),
--     public.kr8_push_subscribe(text, text, text, text), public.kr8_push_unsubscribe(text), public.kr8_push_queue(text, uuid, boolean, text, text, text, uuid, boolean),
--     public.kr8_push_poke(), public.kr8_push_claim(int), public.kr8_push_done(jsonb), public.kr8_admin_push_send(int, boolean, text, text, text, boolean),
--     public.kr8_admin_push_stats(), public.kr8_push_endpoint_ok(text), public.kr8_handoff_create(), public.kr8_handoff_take(text);
--   drop table if exists public.kr8_push_outbox, public.kr8_push_msgs, public.kr8_push_subs, public.kr8_push_line, public.kr8_handoff;
-- commit;
begin;

-- ───────── subscriptions: one row per phone/browser ─────────
create table if not exists public.kr8_push_subs (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  ua          text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  int not null default 0
);
create index if not exists kr8_push_subs_user on public.kr8_push_subs(user_id);
alter table public.kr8_push_subs enable row level security;
revoke all on public.kr8_push_subs from public, anon, authenticated;
-- members read only their own rows (no insert/update/delete policy: writes go through the two functions below)
drop policy if exists kr8_push_subs_own on public.kr8_push_subs;
create policy kr8_push_subs_own on public.kr8_push_subs for select to authenticated using (user_id = auth.uid());
grant select on public.kr8_push_subs to authenticated;

-- ───────── messages + per-phone outbox ─────────
create table if not exists public.kr8_push_msgs (
  id          bigserial primary key,
  kind        text not null check (kind in ('admin', 'verified', 'reward', 'reel')),
  to_user     uuid references auth.users(id) on delete cascade,
  to_all      boolean not null default false,
  title       text check (title is null or length(title) between 1 and 80),
  body        text check (body is null or length(body) between 1 and 240),
  url         text check (url is null or (url ~ '^/app/' and length(url) <= 300)),
  ref_id      uuid,                       -- verification / claim / reel id (one automatic ding per event)
  phones      int not null default 0,
  lines       int not null default 0,        -- LINE messages queued (members with LINE and no phone subscription)
  line        boolean not null default true, -- LINE allowed for this send
  created_by  uuid,
  created_at  timestamptz not null default now(),
  check (to_all or to_user is not null)
);
create unique index if not exists kr8_push_msgs_once on public.kr8_push_msgs(kind, ref_id) where ref_id is not null;
create index if not exists kr8_push_msgs_recent on public.kr8_push_msgs(created_at desc);

create table if not exists public.kr8_push_outbox (
  id          bigserial primary key,
  msg_id      bigint not null references public.kr8_push_msgs(id) on delete cascade,
  sub_id      bigint references public.kr8_push_subs(id) on delete set null,
  channel     text not null default 'web' check (channel in ('web', 'line')),
  line_to     text check (line_to is null or line_to ~ '^U[0-9a-f]{32}$'),
  state       text not null default 'queued' check (state in ('queued', 'sent', 'failed', 'gone', 'notfriend')),
  tries       int not null default 0,
  http        int,
  claimed_at  timestamptz,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists kr8_push_outbox_queued on public.kr8_push_outbox(id) where state = 'queued';
create index if not exists kr8_push_outbox_msg on public.kr8_push_outbox(msg_id);
create index if not exists kr8_push_outbox_line_month on public.kr8_push_outbox(created_at) where channel = 'line';

-- LINE members the OA could not reach (not a friend / blocked): skipped until they sign in with LINE again
create table if not exists public.kr8_push_line (
  line_sub       text primary key,
  not_friend_at  timestamptz,
  last_ok_at     timestamptz
);

-- one-time sign-in hand-off to the phone's real browser (only the hash is kept)
create table if not exists public.kr8_handoff (
  code_hash   text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index if not exists kr8_handoff_user on public.kr8_handoff(user_id, created_at desc);

alter table public.kr8_push_msgs enable row level security;     -- no policies: only the functions below touch them
alter table public.kr8_push_outbox enable row level security;
alter table public.kr8_push_line enable row level security;
alter table public.kr8_handoff enable row level security;
revoke all on public.kr8_push_msgs, public.kr8_push_outbox, public.kr8_push_line, public.kr8_handoff from public, anon, authenticated;

-- Push services we send to. The sender POSTs to whatever endpoint a member stored, so only real browser push services are
-- accepted (no member can make our server call an address of their choosing). The Pages Function checks the same list.
create or replace function public.kr8_push_endpoint_ok(p text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p is not null and length(p) <= 1000 and p ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[!-~]+$'
$$;

-- ───────── member side ─────────
create or replace function public.kr8_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); sid bigint;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not public.kr8_push_endpoint_ok(p_endpoint) then raise exception 'KR8_PUSH_BAD_ENDPOINT'; end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    raise exception 'KR8_PUSH_BAD_KEYS';
  end if;
  -- the same phone signing in as another member moves to that member (a phone dings for whoever is signed in on it)
  insert into public.kr8_push_subs (user_id, endpoint, p256dh, auth, ua)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_ua, 160))
  on conflict (endpoint) do update set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fail_count = 0
  returning id into sid;
  -- at most 10 phones per member: the oldest go
  delete from public.kr8_push_subs where user_id = uid and id in (
    select id from public.kr8_push_subs where user_id = uid order by coalesce(last_ok_at, created_at) desc, id desc offset 10);
  return jsonb_build_object('ok', true, 'id', sid);
end $$;

create or replace function public.kr8_push_unsubscribe(p_endpoint text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  delete from public.kr8_push_subs where endpoint = p_endpoint and user_id = uid;
  return found;
end $$;

-- ───────── queue + poke (internal) ─────────
create or replace function public.kr8_push_poke() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'push_hook_secret' limit 1;
  if k is null then return; end if;   -- not set up yet: the queue waits
  perform net.http_post(
    url := 'https://kringapp.com/api/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', k),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000);
exception when others then
  return;   -- never block the caller
end $$;

create or replace function public.kr8_push_queue(p_kind text, p_user uuid, p_all boolean, p_title text, p_body text, p_url text, p_ref uuid, p_line boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare mid bigint; n int; nl int := 0; room int;
begin
  if p_ref is not null and exists (select 1 from public.kr8_push_msgs where kind = p_kind and ref_id = p_ref) then
    return jsonb_build_object('msg', null, 'phones', 0, 'dup', true);
  end if;
  insert into public.kr8_push_msgs (kind, to_user, to_all, title, body, url, ref_id, line, created_by)
  values (p_kind, case when coalesce(p_all, false) then null else p_user end, coalesce(p_all, false), p_title, p_body, p_url, p_ref, coalesce(p_line, true), auth.uid())
  returning id into mid;
  insert into public.kr8_push_outbox (msg_id, sub_id)
  select mid, s.id from public.kr8_push_subs s where coalesce(p_all, false) or s.user_id = p_user;
  get diagnostics n = row_count;
  -- LINE: members with a LINE link and no phone subscription, the OA can reach them, inside this month's cap
  room := public.kr8_rcfg('push_line_cap', 0) - (select count(*)::int from public.kr8_push_outbox
            where channel = 'line' and created_at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  if coalesce(p_line, true) and room > 0 then
    insert into public.kr8_push_outbox (msg_id, channel, line_to)
    select mid, 'line', l.line_sub from public.kr8_line_links l
     where (coalesce(p_all, false) or l.user_id = p_user)
       and not exists (select 1 from public.kr8_push_subs s where s.user_id = l.user_id)
       and not exists (select 1 from public.kr8_push_line x where x.line_sub = l.line_sub and x.not_friend_at is not null and l.last_login_at <= x.not_friend_at)
     order by l.last_login_at desc
     limit room;
    get diagnostics nl = row_count;
  end if;
  update public.kr8_push_msgs set phones = n, lines = nl where id = mid;
  if n + nl > 0 then perform public.kr8_push_poke(); end if;
  return jsonb_build_object('msg', mid, 'phones', n, 'lines', nl);
end $$;

-- ───────── sender side (service role only) ─────────
create or replace function public.kr8_push_claim(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  -- rows with no phone left (deleted subscription) are closed first
  update public.kr8_push_outbox set state = 'gone', done_at = now() where state = 'queued' and channel = 'web' and sub_id is null;
  with c as (
    select o.id from public.kr8_push_outbox o
     where o.state = 'queued' and o.tries < 3 and (o.claimed_at is null or o.claimed_at < now() - interval '2 minutes')
     order by o.id limit greatest(1, least(coalesce(p_limit, 10), 50)) for update skip locked),
  u as (
    update public.kr8_push_outbox o set claimed_at = now(), tries = o.tries + 1 from c where o.id = c.id returning o.id, o.msg_id, o.sub_id, o.channel, o.line_to)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'channel', u.channel, 'line_to', u.line_to, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
           'kind', m.kind, 'title', m.title, 'body', m.body, 'url', m.url, 'msg', m.id) order by u.id), '[]'::jsonb)
    into r
    from u left join public.kr8_push_subs s on s.id = u.sub_id join public.kr8_push_msgs m on m.id = u.msg_id
   where u.channel = 'line' or s.id is not null;
  return r;
end $$;

-- p_results: [{"id": <outbox id>, "result": "sent"|"gone"|"retry"|"failed"|"notfriend", "http": 201}]
create or replace function public.kr8_push_done(p_results jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare x jsonb; o public.kr8_push_outbox; res text; more boolean;
begin
  for x in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    select * into o from public.kr8_push_outbox where id = (x->>'id')::bigint for update;
    if o.id is null or o.state <> 'queued' then continue; end if;
    res := x->>'result';
    if o.channel = 'line' then
      if res = 'sent' then
        update public.kr8_push_outbox set state = 'sent', http = (x->>'http')::int, done_at = now() where id = o.id;
        insert into public.kr8_push_line (line_sub, last_ok_at) values (o.line_to, now())
        on conflict (line_sub) do update set last_ok_at = now(), not_friend_at = null;
      elsif res = 'notfriend' then   -- not a friend of the OA / blocked it: stop until the next LINE sign-in
        update public.kr8_push_outbox set state = 'notfriend', http = (x->>'http')::int, done_at = now() where id = o.id;
        insert into public.kr8_push_line (line_sub, not_friend_at) values (o.line_to, now())
        on conflict (line_sub) do update set not_friend_at = now();
      elsif res = 'retry' and o.tries < 3 then
        update public.kr8_push_outbox set http = (x->>'http')::int where id = o.id;
      else
        update public.kr8_push_outbox set state = 'failed', http = (x->>'http')::int, done_at = now() where id = o.id;
      end if;
      continue;
    end if;
    if res = 'sent' then
      update public.kr8_push_outbox set state = 'sent', http = (x->>'http')::int, done_at = now() where id = o.id;
      update public.kr8_push_subs set last_ok_at = now(), fail_count = 0 where id = o.sub_id;
    elsif res = 'gone' then
      update public.kr8_push_outbox set state = 'gone', http = (x->>'http')::int, done_at = now() where id = o.id;
      delete from public.kr8_push_subs where id = o.sub_id;   -- expired / unsubscribed phone (404 / 410)
    elsif res = 'retry' and o.tries < 3 then
      update public.kr8_push_outbox set http = (x->>'http')::int where id = o.id;   -- stays queued, picked again after 2 min
    else
      update public.kr8_push_outbox set state = 'failed', http = (x->>'http')::int, done_at = now() where id = o.id;
      update public.kr8_push_subs set fail_count = fail_count + 1 where id = o.sub_id;
      delete from public.kr8_push_subs where id = o.sub_id and fail_count >= 5;
    end if;
  end loop;
  delete from public.kr8_push_outbox where done_at < now() - interval '30 days';
  more := exists (select 1 from public.kr8_push_outbox where state = 'queued' and tries < 3 and claimed_at is null);
  if more then perform public.kr8_push_poke(); end if;   -- next batch (a big "send to all")
  return jsonb_build_object('more', more);
end $$;

-- ───────── automatic dings (AFTER UPDATE triggers, never block the update) ─────────
create or replace function public.kr8_push_on_verified() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.kr8_push_queue('verified', new.user_id, false, null, null, '/app/?tab=me', new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists kr8_push_verified on public.kr8_verifications;
create trigger kr8_push_verified after update of status on public.kr8_verifications
  for each row when (new.status = 'approved' and old.status is distinct from 'approved') execute function public.kr8_push_on_verified();

-- A claim is 'assigned' at once when a code is in stock (the member is looking at it in the app: no ding). A held claim
-- (pending) that gets its code later, when the team adds stock, dings: "your reward is ready".
create or replace function public.kr8_push_on_reward() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.kr8_push_queue('reward', new.member_id, false, null, null, '/app/?tab=me&open=rewards', new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists kr8_push_reward on public.kr8_reward_claims;
create trigger kr8_push_reward after update of status on public.kr8_reward_claims
  for each row when (new.status = 'assigned' and old.status = 'pending') execute function public.kr8_push_on_reward();

-- Reels approved on upload (trusted members) are not dinged: the member is in the app. Approved later by the team → ding.
create or replace function public.kr8_push_on_reel() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.kr8_push_queue('reel', new.author, false, null, null, '/app/?reel=' || new.id::text, new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists kr8_push_reel on public.kr8_posts;
create trigger kr8_push_reel after update of status on public.kr8_posts
  for each row when (new.kind = 'reel' and new.status = 'approved' and old.status is distinct from 'approved' and not coalesce(new.hidden, false))
  execute function public.kr8_push_on_reel();

-- ───────── admin ─────────
-- One member (by member no) or everyone with dings on. Title + body as typed; link optional and inside the app (/app/...).
create or replace function public.kr8_admin_push_send(p_member_no int, p_all boolean, p_title text, p_body text, p_url text default null, p_line boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid; t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); u text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if length(t) < 1 or length(t) > 80 then raise exception 'KR8_PUSH_TITLE'; end if;
  if length(b) < 1 or length(b) > 240 then raise exception 'KR8_PUSH_BODY'; end if;
  if u is not null and (u !~ '^/app/[A-Za-z0-9_./?=&%#~+-]*$' or length(u) > 300) then raise exception 'KR8_PUSH_URL'; end if;
  if coalesce(p_all, false) = (p_member_no is not null) then raise exception 'KR8_PUSH_TARGET'; end if;   -- exactly one of the two
  if not coalesce(p_all, false) then
    select user_id into uid from public.kr8_members where member_no = p_member_no;
    if uid is null then raise exception 'KR8_NO_MEMBER'; end if;
  end if;
  return public.kr8_push_queue('admin', uid, coalesce(p_all, false), t, b, coalesce(u, '/app/'), null, coalesce(p_line, true))
    || jsonb_build_object('first_name', (select first_name from public.kr8_members where user_id = uid));
end $$;

create or replace function public.kr8_admin_push_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'phones', (select count(*) from public.kr8_push_subs),
    'members', (select count(distinct user_id) from public.kr8_push_subs),
    'line_members', (select count(*) from public.kr8_line_links l where not exists (select 1 from public.kr8_push_subs s where s.user_id = l.user_id)
                       and not exists (select 1 from public.kr8_push_line x where x.line_sub = l.line_sub and x.not_friend_at is not null and l.last_login_at <= x.not_friend_at)),
    'line_month', (select count(*) from public.kr8_push_outbox where channel = 'line'
                     and created_at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'),
    'line_cap', public.kr8_rcfg('push_line_cap', 0),
    'recent', coalesce((select jsonb_agg(r order by r.at desc) from (
        select m.id, m.kind, m.title, m.to_all, m.created_at at, m.phones, m.lines, mm.member_no, mm.first_name,
               (select count(*) from public.kr8_push_outbox o where o.msg_id = m.id and o.state = 'sent') sent,
               (select count(*) from public.kr8_push_outbox o where o.msg_id = m.id and o.state in ('failed', 'gone', 'notfriend')) failed,
               (select count(*) from public.kr8_push_outbox o where o.msg_id = m.id and o.state = 'queued') waiting
          from public.kr8_push_msgs m left join public.kr8_members mm on mm.user_id = m.to_user
         order by m.created_at desc limit 20) r), '[]'::jsonb));
end $$;

-- ───────── sign-in hand-off to the real browser ─────────
create or replace function public.kr8_handoff_create() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); code text;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if (select count(*) from public.kr8_handoff where user_id = uid and created_at > now() - interval '10 minutes') >= 5 then raise exception 'KR8_TOO_MANY'; end if;
  code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');   -- 244 random bits
  insert into public.kr8_handoff (code_hash, user_id, expires_at) values (encode(sha256(convert_to(code, 'UTF8')), 'hex'), uid, now() + interval '3 minutes');
  delete from public.kr8_handoff where expires_at < now() - interval '1 day';
  return code;
end $$;

-- service role only (/api/handoff): one use, 3 minutes → the member's email, for a one-time sign-in link made server side
create or replace function public.kr8_handoff_take(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare h public.kr8_handoff;
begin
  if p_code is null or p_code !~ '^[0-9a-f]{64}$' then return null; end if;
  update public.kr8_handoff set used_at = now()
   where code_hash = encode(sha256(convert_to(p_code, 'UTF8')), 'hex') and used_at is null and expires_at > now()
  returning * into h;
  if h.code_hash is null then return null; end if;
  return jsonb_build_object('user_id', h.user_id, 'email', (select email from auth.users where id = h.user_id));
end $$;

-- ───────── grants ─────────
revoke all on function public.kr8_push_endpoint_ok(text), public.kr8_push_subscribe(text, text, text, text), public.kr8_push_unsubscribe(text),
  public.kr8_push_poke(), public.kr8_push_queue(text, uuid, boolean, text, text, text, uuid, boolean), public.kr8_push_claim(int), public.kr8_push_done(jsonb),
  public.kr8_push_on_verified(), public.kr8_push_on_reward(), public.kr8_push_on_reel(),
  public.kr8_admin_push_send(int, boolean, text, text, text, boolean), public.kr8_admin_push_stats(),
  public.kr8_handoff_create(), public.kr8_handoff_take(text) from public, anon, authenticated;
grant execute on function public.kr8_push_subscribe(text, text, text, text), public.kr8_push_unsubscribe(text),
  public.kr8_admin_push_send(int, boolean, text, text, text, boolean), public.kr8_admin_push_stats(), public.kr8_handoff_create() to authenticated;
grant execute on function public.kr8_push_claim(int), public.kr8_push_done(jsonb), public.kr8_handoff_take(text) to service_role;

commit;
