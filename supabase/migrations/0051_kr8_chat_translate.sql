-- 0051 · automatic chat translation (founder, 15 Nov 2026).
--
-- ADDITIVE: 3 new tables, 4 new functions. No existing table, function or policy is changed (chat, rewards and ranking untouched).
--   kr8_message_translations  one row per message + reader language, so each message is translated once (server route only;
--                             translations made on the phone by the browser's own language pack are never sent here)
--   kr8_translate_usage       how many translations a member asked for today / this minute (numbers only, no text)
--   kr8_translate_config      the switches and caps, so a bug or abuse cannot run up a bill
-- Only the edge function kr8-translate (service role) can call claim / store. The app can only read cached translations of
-- threads the signed-in member is in (kr8_thread_translations).
--
-- Change a cap:  update public.kr8_translate_config set value = 5000 where key = 'daily_total';
-- Switch off:    update public.kr8_translate_config set value = 0 where key = 'server_on';
-- UNDO: drop function if exists public.kr8_translate_claim(uuid, bigint, text), public.kr8_translate_store(bigint, text, text, text, text),
--         public.kr8_thread_translations(uuid, text), public.kr8_translate_cfg(text, int);
--       drop table if exists public.kr8_message_translations, public.kr8_translate_usage, public.kr8_translate_config;

create table if not exists public.kr8_translate_config (
  key text primary key, value int not null, note text, updated_at timestamptz not null default now()
);
insert into public.kr8_translate_config (key, value, note) values
  ('server_on', 1, '1 = the server translates for phones that cannot use the free on-device pack; 0 = off (chat still works, untranslated)'),
  ('per_member_minute', 20, 'most server translations one member can ask for in a minute'),
  ('per_member_day', 300, 'most server translations one member can ask for in a day (Bangkok day)'),
  ('daily_total', 3000, 'most server translations for ALL members in a day: the bill cap'),
  ('max_chars', 600, 'longer messages are not sent to the translation provider')
on conflict (key) do nothing;
alter table public.kr8_translate_config enable row level security;
revoke all on public.kr8_translate_config from public, anon, authenticated;

create table if not exists public.kr8_message_translations (
  message_id bigint not null references public.kr8_messages(id) on delete cascade,
  target     text not null check (target ~ '^[a-z]{2}$'),
  source     text not null check (source ~ '^[a-z]{2}$'),
  provider   text not null,
  body       text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  primary key (message_id, target)
);
alter table public.kr8_message_translations enable row level security;
revoke all on public.kr8_message_translations from public, anon, authenticated;

create table if not exists public.kr8_translate_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  n       int not null default 0,
  chars   int not null default 0,
  minute  timestamptz,
  n_min   int not null default 0,
  primary key (user_id, day)
);
alter table public.kr8_translate_usage enable row level security;
revoke all on public.kr8_translate_usage from public, anon, authenticated;

create or replace function public.kr8_translate_cfg(k text, dflt int)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.kr8_translate_config where key = k), dflt)
$$;

-- Step 1 (edge function, service role): may this member have this message translated into p_target?
-- Answers: forbidden (not in that chat / blocked / no such message) · own (their own message) · cached · off · too_long ·
--          limit_minute · limit_member · limit_day · go (and the count is taken). The message text is returned only for "go".
create or replace function public.kr8_translate_claim(p_user uuid, p_message bigint, p_target text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.kr8_messages; th public.kr8_threads; tr public.kr8_message_translations; u public.kr8_translate_usage;
        d date := (now() at time zone 'Asia/Bangkok')::date; mn timestamptz := date_trunc('minute', now()); total int; tgt text := lower(btrim(coalesce(p_target, '')));
begin
  if p_user is null or p_message is null or tgt !~ '^[a-z]{2}$' then return jsonb_build_object('status', 'forbidden'); end if;
  select * into m from public.kr8_messages where id = p_message;
  if m.id is null then return jsonb_build_object('status', 'forbidden'); end if;
  select * into th from public.kr8_threads where id = m.thread_id;
  if th.id is null or p_user not in (th.user_a, th.user_b) or public.kr8_is_blocked(th.user_a, th.user_b) then return jsonb_build_object('status', 'forbidden'); end if;
  if m.sender = p_user then return jsonb_build_object('status', 'own'); end if;
  select * into tr from public.kr8_message_translations where message_id = p_message and target = tgt;
  if tr.message_id is not null then return jsonb_build_object('status', 'cached', 'text', tr.body, 'source', tr.source); end if;
  if public.kr8_translate_cfg('server_on', 1) <> 1 then return jsonb_build_object('status', 'off'); end if;
  if length(m.body) > public.kr8_translate_cfg('max_chars', 600) then return jsonb_build_object('status', 'too_long'); end if;
  perform pg_advisory_xact_lock(hashtext('kr8_translate:' || p_user::text));
  insert into public.kr8_translate_usage (user_id, day) values (p_user, d) on conflict do nothing;
  select * into u from public.kr8_translate_usage where user_id = p_user and day = d for update;
  if u.minute = mn and u.n_min >= public.kr8_translate_cfg('per_member_minute', 20) then return jsonb_build_object('status', 'limit_minute'); end if;
  if u.n >= public.kr8_translate_cfg('per_member_day', 300) then return jsonb_build_object('status', 'limit_member'); end if;
  select coalesce(sum(n), 0) into total from public.kr8_translate_usage where day = d;
  if total >= public.kr8_translate_cfg('daily_total', 3000) then return jsonb_build_object('status', 'limit_day'); end if;
  update public.kr8_translate_usage set n = n + 1, chars = chars + length(m.body),
         n_min = case when minute = mn then n_min + 1 else 1 end, minute = mn
   where user_id = p_user and day = d;
  return jsonb_build_object('status', 'go', 'text', m.body,
    'sender_langs', (select coalesce(to_jsonb(langs), '[]'::jsonb) from public.kr8_members where user_id = m.sender));
end $$;

-- Step 2 (edge function, service role): keep the result so nobody pays for the same message twice
create or replace function public.kr8_translate_store(p_message bigint, p_target text, p_source text, p_provider text, p_text text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_text is null or btrim(p_text) = '' then return false; end if;
  insert into public.kr8_message_translations (message_id, target, source, provider, body)
  values (p_message, lower(p_target), lower(p_source), left(p_provider, 40), left(p_text, 4000)) on conflict do nothing;
  return true;
end $$;

-- The app: translations already made for a chat I am in (never anyone else's chat)
create or replace function public.kr8_thread_translations(p_thread uuid, p_target text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.message_id, 'text', t.body, 'source', t.source)), '[]'::jsonb)
  from public.kr8_message_translations t
  join public.kr8_messages m on m.id = t.message_id
  join public.kr8_threads th on th.id = m.thread_id
  where th.id = p_thread and t.target = lower(p_target) and auth.uid() in (th.user_a, th.user_b)
    and not public.kr8_is_blocked(th.user_a, th.user_b) and m.sender <> auth.uid()
$$;

revoke all on function public.kr8_translate_cfg(text, int), public.kr8_translate_claim(uuid, bigint, text),
  public.kr8_translate_store(bigint, text, text, text, text), public.kr8_thread_translations(uuid, text) from public, anon, authenticated;
grant execute on function public.kr8_translate_claim(uuid, bigint, text), public.kr8_translate_store(bigint, text, text, text, text),
  public.kr8_translate_cfg(text, int) to service_role;
grant execute on function public.kr8_thread_translations(uuid, text) to authenticated;
