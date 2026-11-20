-- 0185 · Ask BKK (20 Nov, founder-approved): 1) share an answer as a picture card with a tracked /q/<short> link,
-- 2) rich replies (photo / GIF must pass the automatic photo check before anyone else sees it), 3) quick reactions 😂 ❤️ 🔥 💯.
--
-- ADDITIVE. New tables / columns / functions only. Four existing functions change:
--   · kr8_ask_answer_json  adds media_check (author only), reactions and my reaction; hides a photo/GIF from others until it passed
--   · kr8_ask_a_ok         a photo-only answer is invisible to others until its photo passed
--   · kr8_share_open_confirm (anti-fraud helper's function) — patched IN PLACE from the live text (one line: for an Ask open the
--                          "owner" is the answer's author), so the hardened counting rules stay exactly as they are live
--   · kr8_week_board / kr8_task_rings_in — patched IN PLACE: ledger reason 'ask_open' counts next to 'task'
-- Reactions give NO Rings and never touch the ledger, rankings or Reel scores.
-- UNDO: 0185_ask_share_rich_react_UNDO.sql

begin;

-- ───────────── 1. reactions ─────────────
create table if not exists public.kr8_ask_reactions (
  answer_id uuid not null references public.kr8_ask_answers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('😂', '❤️', '🔥', '💯')),
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id)            -- one reaction per member per item
);
create index if not exists kr8_ask_reactions_user on public.kr8_ask_reactions (user_id, created_at desc);
alter table public.kr8_ask_reactions enable row level security;
create table if not exists public.kr8_ask_react_taps (user_id uuid not null, at timestamptz not null default now());
create index if not exists kr8_ask_react_taps_u on public.kr8_ask_react_taps (user_id, at desc);
alter table public.kr8_ask_react_taps enable row level security;
revoke all on public.kr8_ask_reactions, public.kr8_ask_react_taps from anon, authenticated;   -- RPC only
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'kr8_ask_reactions' and policyname = 'kr8_ask_reactions_none') then
    create policy kr8_ask_reactions_none on public.kr8_ask_reactions for all to authenticated using (false) with check (false);
  end if;
end $$;

-- tap 😂/❤️/🔥/💯: same emoji again = take it back, another emoji = switch. 60 taps a minute per member. Returns the new counts.
create or replace function public.kr8_ask_react(p_answer uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); cur text; au uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_is_ghost(uid) then raise exception 'KR8_GHOST'; end if;
  if p_emoji is not null and p_emoji not in ('😂', '❤️', '🔥', '💯') then raise exception 'KR8_BAD_TEXT'; end if;
  select a.author into au from public.kr8_ask_answers a where a.id = p_answer;
  if au is null or not public.kr8_ask_a_ok(uid, p_answer) then raise exception 'KR8_NOT_FOUND'; end if;
  if public.kr8_is_blocked(uid, au) then raise exception 'KR8_BLOCKED'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_react:' || uid::text));
  if (select count(*) from public.kr8_ask_react_taps where user_id = uid and at > now() - interval '1 minute') >= 60 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_ask_react_taps (user_id) values (uid);
  delete from public.kr8_ask_react_taps where user_id = uid and at < now() - interval '10 minutes';
  select emoji into cur from public.kr8_ask_reactions where answer_id = p_answer and user_id = uid;
  if p_emoji is null or cur = p_emoji then
    delete from public.kr8_ask_reactions where answer_id = p_answer and user_id = uid;
  else
    insert into public.kr8_ask_reactions (answer_id, user_id, emoji) values (p_answer, uid, p_emoji)
    on conflict (answer_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
  return jsonb_build_object('reacts', public.kr8_ask_react_counts(p_answer),
    'mine', (select emoji from public.kr8_ask_reactions where answer_id = p_answer and user_id = uid));
end $$;

create or replace function public.kr8_ask_react_counts(p_answer uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(e.emoji, e.n), '{}'::jsonb)
  from (select r.emoji, count(*)::int n from public.kr8_ask_reactions r where r.answer_id = p_answer group by r.emoji) e
$$;

-- ───────────── 2. photo check on answer / reply photos and GIFs ─────────────
alter table public.kr8_ask_answers add column if not exists media_check text not null default 'ok';
alter table public.kr8_ask_answers add column if not exists media_why text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kr8_ask_answers_media_check_chk') then
    alter table public.kr8_ask_answers add constraint kr8_ask_answers_media_check_chk check (media_check in ('ok', 'pending', 'refused'));
  end if;
end $$;
-- every new photo / GIF starts 'pending' (whatever the insert says); only kr8_ask_media_record (service role) moves it on
create or replace function public.kr8_ask_media_pending_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.media_path is not null then new.media_check := 'pending'; new.media_why := null; else new.media_check := 'ok'; end if;
  return new;
end $$;
drop trigger if exists kr8_ask_media_pending on public.kr8_ask_answers;
create trigger kr8_ask_media_pending before insert on public.kr8_ask_answers for each row execute function public.kr8_ask_media_pending_trg();

-- the photo checker (edge function kr8-ask-photo, service role) writes its verdict here
create or replace function public.kr8_ask_media_record(p_answer uuid, p_ok boolean, p_why text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'KR8_FORBIDDEN'; end if;
  update public.kr8_ask_answers set media_check = case when p_ok then 'ok' else 'refused' end, media_why = left(p_why, 60)
   where id = p_answer and media_path is not null and media_check = 'pending';
  return (select media_check from public.kr8_ask_answers where id = p_answer);
end $$;
-- the checker reads what to check (path + author) through this, service role only
create or replace function public.kr8_ask_media_todo(p_answer uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when coalesce(auth.role(), '') <> 'service_role' then null else
    (select jsonb_build_object('author', a.author, 'path', a.media_path, 'kind', a.media_kind, 'check', a.media_check)
       from public.kr8_ask_answers a where a.id = p_answer) end
$$;

create or replace function public.kr8_ask_a_ok(p_viewer uuid, p_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_ask_answers a
    where a.id = p_id and not a.hidden
      and (btrim(a.body) <> '' or a.media_check = 'ok' or a.author = p_viewer)   -- 0185: photo-only reply waits for its check
      and (p_viewer is null or (not public.kr8_is_blocked(p_viewer, a.author)
           and not exists (select 1 from public.kr8_ask_answer_hidden h where h.user_id = p_viewer and h.answer_id = a.id))))
$$;

create or replace function public.kr8_ask_answer_json(a public.kr8_ask_answers, p_viewer uuid, p_salt text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', a.id, 'parent_id', a.parent_id, 'author_id', public.kr8_ask_key(a.author, p_salt), 'body', a.body,
    'media_path', case when p_viewer is null then null when a.media_check = 'ok' or a.author = p_viewer then a.media_path end,
    'media_kind', case when p_viewer is null then null when a.media_check = 'ok' or a.author = p_viewer then a.media_kind end,
    'media_check', case when a.author = p_viewer and a.media_path is not null then a.media_check end,
    'score', a.score, 'created_at', a.created_at,
    'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = p_viewer and v.target_kind = 'a' and v.target_id = a.id), 0),
    'reacts', public.kr8_ask_react_counts(a.id),
    'my_react', (select r.emoji from public.kr8_ask_reactions r where r.answer_id = a.id and r.user_id = p_viewer))
$$;

-- ───────────── 3. share an answer: /q/<short> ─────────────
create table if not exists public.kr8_ask_links (
  short text primary key,
  post_id uuid not null references public.kr8_posts(id) on delete cascade,
  answer_id uuid not null unique references public.kr8_ask_answers(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.kr8_ask_links enable row level security;
revoke all on public.kr8_ask_links from anon, authenticated;
alter table public.kr8_share_opens add column if not exists ask_answer_id uuid references public.kr8_ask_answers(id) on delete set null;
create index if not exists kr8_share_opens_ask on public.kr8_share_opens (ask_answer_id, bkk_date) where ask_answer_id is not null;

-- signed-in member asks for the answer's short link (one per answer, shared by everyone who shares it)
create or replace function public.kr8_ask_share_link(p_answer uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare s text; i int := 0; v_post uuid;
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  select short into s from public.kr8_ask_links where answer_id = p_answer;
  if s is not null then return s; end if;
  select a.post_id into v_post from public.kr8_ask_answers a where a.id = p_answer;
  if v_post is null or not public.kr8_ask_a_ok(auth.uid(), p_answer) or not public.kr8_ask_q_ok(auth.uid(), v_post) then raise exception 'KR8_NOT_FOUND'; end if;
  loop
    i := i + 1;
    select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + (get_byte(b, g) % 31), 1), '') into s
    from (select extensions.gen_random_bytes(7) b) x, generate_series(0, 6) g;
    begin
      insert into public.kr8_ask_links (short, post_id, answer_id) values (s, v_post, p_answer);
      return s;
    exception when unique_violation then
      select short into s from public.kr8_ask_links where answer_id = p_answer;
      if s is not null then return s; end if;
      if i > 5 then raise exception 'KR8_TRY_AGAIN'; end if;
    end;
  end loop;
end $$;

-- what the public question page and its picture card show (no ids). Hidden / ghost / test / held → null.
create or replace function public.kr8_ask_card_data(p_short text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('post_id', q.id, 'answer_id', a.id, 'q', q.body, 'area', coalesce(nullif(q.area, ''), 'Bangkok'),
           'a', a.body, 'name', left(split_part(btrim(m.first_name), ' ', 1), 24), 'local', m.who = 'local',
           'photo', case when coalesce(m.photo, '') ~ '^(data:image/|https://)' then m.photo end,
           'answers', (select count(*)::int from public.kr8_ask_answers x where x.post_id = q.id and not x.hidden and x.parent_id is null),
           'qtest', public.kr8_is_test_member(a.author))
  from public.kr8_ask_links l
  join public.kr8_posts q on q.id = l.post_id and q.kind = 'ask'
  join public.kr8_ask_answers a on a.id = l.answer_id
  join public.kr8_members m on m.user_id = a.author
  where l.short = lower(coalesce(p_short, '')) and not a.hidden and public.kr8_ask_q_ok(null, q.id)
    and not coalesce(m.ghost, false) and not public.kr8_minor_held(a.author)
$$;
-- kr8-og (service role) or kringapp.com (share_open_key)
create or replace function public.kr8_ask_card(p_short text, p_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  if coalesce(auth.role(), '') <> 'service_role' and (k is null or p_key is null or p_key <> k) then raise exception 'KR8_FORBIDDEN'; end if;
  return public.kr8_ask_card_data(p_short) - 'post_id' - 'answer_id' - 'qtest';
end $$;

-- /q/<short> logs an open: the SAME first-stage rules as kr8_share_open (source, LINE never counts, robots, repeats, device cap,
-- 'pending' until the 2-second visible beacon), then the SAME kr8_share_open_confirm decides. Credit goes to the answer's author.
create or replace function public.kr8_ask_share_open(p_short text, p_ref text, p_ua text, p_session text, p_device text, p_country text, p_key text, p_range text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; c jsonb; pid uuid; aid uuid; au uuid; oid uuid; v_ok boolean := true; v_why text; v_src text;
        ref text := left(coalesce(p_ref, ''), 300); ua text := left(coalesce(p_ua, ''), 300); v_test boolean;
        d date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  if k is null or p_key is null or p_key <> k then raise exception 'KR8_FORBIDDEN'; end if;
  c := public.kr8_ask_card_data(p_short);
  if c is null then return null; end if;
  pid := (c->>'post_id')::uuid; aid := (c->>'answer_id')::uuid; v_test := (c->>'qtest')::boolean;
  select author into au from public.kr8_ask_answers where id = aid;
  c := c - 'answer_id' - 'qtest';
  if coalesce(p_session, '') !~ '^[A-Za-z0-9-]{16,64}$' or coalesce(p_device, '') !~ '^[0-9a-f]{32,64}$' then return c; end if;
  v_src := case
    when ref ~* '(^|[/.])(line\.me|line\.naver\.jp|lin\.ee|liff\.line\.me)' or ua ~* '(^|[^a-z])line/' or ua ~* 'liff' then 'line'
    when ref ~* 'instagram\.' or ua ~* 'instagram' then 'instagram'
    when ref ~* 'tiktok\.' or ua ~* 'tiktok|musical_ly|bytedancewebview|trill' then 'tiktok'
    when ref ~* 'facebook\.|fb\.me|messenger\.' or ua ~* 'FBAN|FBAV|FB_IAB' then 'facebook'
    when ref ~* '(^|[/.])(t\.co|x\.com|twitter\.com)' then 'x'
    when ref ~* 'youtube\.|youtu\.be' then 'youtube'
    else 'other' end;
  if v_src = 'line' then v_ok := false; v_why := 'line';
  elsif public.kr8_open_is_robot(ua, case when v_test then null else p_country end) then v_ok := false; v_why := 'robot';
  end if;
  perform pg_advisory_xact_lock(hashtext('kr8_open:' || pid::text));
  if (select count(*) from public.kr8_share_opens where ask_answer_id = aid and bkk_date = d) >= 3000 then return c; end if;
  if v_ok and exists (select 1 from public.kr8_share_opens where ask_answer_id = aid and bkk_date = d and ok and (session = p_session or device = p_device)) then
    v_ok := false; v_why := 'repeat';
  end if;
  if v_ok and (select count(*) from public.kr8_share_opens o join public.kr8_ask_answers x on x.id = o.ask_answer_id
               where x.author = au and o.bkk_date = d and o.ok and (o.session = p_session or o.device = p_device))
              >= greatest(public.kr8_rcfg('opens_device_member_day', 1), 1) then
    v_ok := false; v_why := 'repeat';
  end if;
  if v_ok and public.kr8_rcfg('opens_beacon_on', 1) = 1 then v_ok := false; v_why := 'pending'; end if;
  if v_ok and (select count(*) from public.kr8_share_opens where ask_answer_id = aid and ok and created_at > now() - interval '1 hour') >= 12 then
    v_ok := false; v_why := 'burst';
  end if;
  insert into public.kr8_share_opens (post_id, ask_answer_id, bkk_date, session, device, referrer, ua, country, source, ok, why, net_range)
  values (pid, aid, d, p_session, p_device, nullif(ref, ''), nullif(ua, ''), nullif(left(coalesce(p_country, ''), 2), ''), v_src, v_ok, v_why,
          case when coalesce(p_range, '') ~ '^[0-9a-f]{32,64}$' then p_range end)
  returning id into oid;
  return c || jsonb_build_object('open_id', oid, 'ok', v_ok);
end $$;

-- the hardened confirm, patched in place: for an Ask open the owner is the answer's author (own / repeat / burst rules apply to them)
do $$
declare d text := pg_get_functiondef('public.kr8_share_open_confirm(uuid, text, text, text, text, text, jsonb, text)'::regprocedure);
        a text := 'select p.author into v_author from public.kr8_posts p where p.id = o.post_id;';
        b text := 'select coalesce((select x.author from public.kr8_ask_answers x where x.id = o.ask_answer_id), p.author) into v_author from public.kr8_posts p where p.id = o.post_id;   /*ask0185*/';
begin
  if position('/*ask0185*/' in d) > 0 then return; end if;
  if position(a in d) = 0 then raise exception '0185: kr8_share_open_confirm changed, re-check the author line'; end if;
  execute replace(d, a, b);
end $$;

-- +5 Rings (rcfg 'open') to the answer's author when an Ask open is counted; same daily cap per item as v2 Reels (v2_opens_day_cap)
alter table public.kr8_rings_ledger drop constraint if exists kr8_rings_ledger_reason_check;
alter table public.kr8_rings_ledger add constraint kr8_rings_ledger_reason_check check (reason = any (array['reel_place', 'likes_50', 'friend_join',
  'friend_welcome', 'checkin', 'streak', 'react3', 'weekly_top', 'reel_removed', 'claim', 'invite', 'invite_welcome', 'task', 'ask_open']));
create or replace function public.kr8_ask_open_ring_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare au uuid;
begin
  if new.ask_answer_id is null or not new.ok or (tg_op = 'UPDATE' and old.ok) then return new; end if;
  select a.author into au from public.kr8_ask_answers a where a.id = new.ask_answer_id and not a.hidden;
  if au is null or public.kr8_is_team(au) or public.kr8_fake_level(au) = 'red'
     or exists (select 1 from public.kr8_members m where m.user_id = au and m.ghost) then return new; end if;
  if (select count(*) from public.kr8_share_opens o where o.ask_answer_id = new.ask_answer_id and o.bkk_date = new.bkk_date and o.ok and o.id <> new.id)
     >= public.kr8_rcfg('v2_opens_day_cap', 10) then return new; end if;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (au, public.kr8_rcfg('open', 5), 'ask_open', new.id::text)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists kr8_ask_open_ring on public.kr8_share_opens;
create trigger kr8_ask_open_ring after insert or update of ok on public.kr8_share_opens for each row execute function public.kr8_ask_open_ring_trg();

do $$
declare d text;
begin
  d := pg_get_functiondef('public.kr8_week_board(timestamptz, boolean)'::regprocedure);
  if position('''ask_open''' in d) = 0 then
    if position('where l.reason = ''task'' and' in d) = 0 then raise exception '0185: kr8_week_board changed'; end if;
    execute replace(d, 'where l.reason = ''task'' and', 'where l.reason in (''task'', ''ask_open'') and');
  end if;
  d := pg_get_functiondef('public.kr8_task_rings_in(uuid, timestamptz, timestamptz)'::regprocedure);
  if position('''ask_open''' in d) = 0 then
    if position('l.reason = ''task''' in d) = 0 then raise exception '0185: kr8_task_rings_in changed'; end if;
    execute replace(d, 'l.reason = ''task''', 'l.reason in (''task'', ''ask_open'')');
  end if;
end $$;

-- ───────────── grants ─────────────
revoke all on function public.kr8_ask_react(uuid, text), public.kr8_ask_react_counts(uuid), public.kr8_ask_media_record(uuid, boolean, text),
  public.kr8_ask_media_todo(uuid), public.kr8_ask_share_link(uuid), public.kr8_ask_card_data(text), public.kr8_ask_card(text, text),
  public.kr8_ask_share_open(text, text, text, text, text, text, text, text), public.kr8_ask_open_ring_trg(), public.kr8_ask_media_pending_trg() from public, anon, authenticated;
grant execute on function public.kr8_ask_react(uuid, text), public.kr8_ask_share_link(uuid) to authenticated;
grant execute on function public.kr8_ask_react_counts(uuid) to authenticated, anon;
grant execute on function public.kr8_ask_card(text, text), public.kr8_ask_share_open(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.kr8_ask_media_record(uuid, boolean, text), public.kr8_ask_media_todo(uuid), public.kr8_ask_card(text, text) to service_role;

commit;
