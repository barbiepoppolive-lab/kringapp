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
--
-- Needs before it works (go-live): Supabase vault secret 'push_hook_secret' (same value as PUSH_HOOK_SECRET on Cloudflare).
-- Without it the queue still fills but nothing is poked (safe).
--
-- UNDO: begin;
--   drop trigger if exists kr8_push_verified on public.kr8_verifications; drop trigger if exists kr8_push_reward on public.kr8_reward_claims;
--   drop trigger if exists kr8_push_reel on public.kr8_posts;
--   drop function if exists public.kr8_push_on_verified(), public.kr8_push_on_reward(), public.kr8_push_on_reel(),
--     public.kr8_push_subscribe(text, text, text, text), public.kr8_push_unsubscribe(text), public.kr8_push_queue(text, uuid, boolean, text, text, text, uuid),
--     public.kr8_push_poke(), public.kr8_push_claim(int), public.kr8_push_done(jsonb), public.kr8_admin_push_send(int, boolean, text, text, text),
--     public.kr8_admin_push_stats(), public.kr8_push_endpoint_ok(text);
--   drop table if exists public.kr8_push_outbox, public.kr8_push_msgs, public.kr8_push_subs;
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
  state       text not null default 'queued' check (state in ('queued', 'sent', 'failed', 'gone')),
  tries       int not null default 0,
  http        int,
  claimed_at  timestamptz,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists kr8_push_outbox_queued on public.kr8_push_outbox(id) where state = 'queued';
create index if not exists kr8_push_outbox_msg on public.kr8_push_outbox(msg_id);
alter table public.kr8_push_msgs enable row level security;     -- no policies: only the functions below touch them
alter table public.kr8_push_outbox enable row level security;
revoke all on public.kr8_push_msgs, public.kr8_push_outbox from public, anon, authenticated;

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

create or replace function public.kr8_push_queue(p_kind text, p_user uuid, p_all boolean, p_title text, p_body text, p_url text, p_ref uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare mid bigint; n int;
begin
  if p_ref is not null and exists (select 1 from public.kr8_push_msgs where kind = p_kind and ref_id = p_ref) then
    return jsonb_build_object('msg', null, 'phones', 0, 'dup', true);
  end if;
  insert into public.kr8_push_msgs (kind, to_user, to_all, title, body, url, ref_id, created_by)
  values (p_kind, case when coalesce(p_all, false) then null else p_user end, coalesce(p_all, false), p_title, p_body, p_url, p_ref, auth.uid())
  returning id into mid;
  insert into public.kr8_push_outbox (msg_id, sub_id)
  select mid, s.id from public.kr8_push_subs s where coalesce(p_all, false) or s.user_id = p_user;
  get diagnostics n = row_count;
  update public.kr8_push_msgs set phones = n where id = mid;
  if n > 0 then perform public.kr8_push_poke(); end if;
  return jsonb_build_object('msg', mid, 'phones', n);
end $$;

-- ───────── sender side (service role only) ─────────
create or replace function public.kr8_push_claim(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  -- rows with no phone left (deleted subscription) are closed first
  update public.kr8_push_outbox set state = 'gone', done_at = now() where state = 'queued' and sub_id is null;
  with c as (
    select o.id from public.kr8_push_outbox o
     where o.state = 'queued' and o.tries < 3 and (o.claimed_at is null or o.claimed_at < now() - interval '2 minutes')
     order by o.id limit greatest(1, least(coalesce(p_limit, 10), 50)) for update skip locked),
  u as (
    update public.kr8_push_outbox o set claimed_at = now(), tries = o.tries + 1 from c where o.id = c.id returning o.id, o.msg_id, o.sub_id)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
           'kind', m.kind, 'title', m.title, 'body', m.body, 'url', m.url, 'msg', m.id) order by u.id), '[]'::jsonb)
    into r
    from u join public.kr8_push_subs s on s.id = u.sub_id join public.kr8_push_msgs m on m.id = u.msg_id;
  return r;
end $$;

-- p_results: [{"id": <outbox id>, "result": "sent"|"gone"|"retry"|"failed", "http": 201}]
create or replace function public.kr8_push_done(p_results jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare x jsonb; o public.kr8_push_outbox; res text; more boolean;
begin
  for x in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    select * into o from public.kr8_push_outbox where id = (x->>'id')::bigint for update;
    if o.id is null or o.state <> 'queued' then continue; end if;
    res := x->>'result';
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
create or replace function public.kr8_admin_push_send(p_member_no int, p_all boolean, p_title text, p_body text, p_url text default null) returns jsonb
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
  return public.kr8_push_queue('admin', uid, coalesce(p_all, false), t, b, coalesce(u, '/app/'), null)
    || jsonb_build_object('first_name', (select first_name from public.kr8_members where user_id = uid));
end $$;

create or replace function public.kr8_admin_push_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'phones', (select count(*) from public.kr8_push_subs),
    'members', (select count(distinct user_id) from public.kr8_push_subs),
    'recent', coalesce((select jsonb_agg(r order by r.at desc) from (
        select m.id, m.kind, m.title, m.to_all, m.created_at at, m.phones, mm.member_no, mm.first_name,
               (select count(*) from public.kr8_push_outbox o where o.msg_id = m.id and o.state = 'sent') sent,
               (select count(*) from public.kr8_push_outbox o where o.msg_id = m.id and o.state in ('failed', 'gone')) failed,
               (select count(*) from public.kr8_push_outbox o where o.msg_id = m.id and o.state = 'queued') waiting
          from public.kr8_push_msgs m left join public.kr8_members mm on mm.user_id = m.to_user
         order by m.created_at desc limit 20) r), '[]'::jsonb));
end $$;

-- ───────── grants ─────────
revoke all on function public.kr8_push_endpoint_ok(text), public.kr8_push_subscribe(text, text, text, text), public.kr8_push_unsubscribe(text),
  public.kr8_push_poke(), public.kr8_push_queue(text, uuid, boolean, text, text, text, uuid), public.kr8_push_claim(int), public.kr8_push_done(jsonb),
  public.kr8_push_on_verified(), public.kr8_push_on_reward(), public.kr8_push_on_reel(),
  public.kr8_admin_push_send(int, boolean, text, text, text), public.kr8_admin_push_stats() from public, anon, authenticated;
grant execute on function public.kr8_push_subscribe(text, text, text, text), public.kr8_push_unsubscribe(text),
  public.kr8_admin_push_send(int, boolean, text, text, text), public.kr8_admin_push_stats() to authenticated;
grant execute on function public.kr8_push_claim(int), public.kr8_push_done(jsonb) to service_role;

commit;
