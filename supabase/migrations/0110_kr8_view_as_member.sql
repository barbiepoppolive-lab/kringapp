-- 0110 · View as member (18 Nov 2026, founder): admin → More → "View as member" shows the REAL member app in a phone frame,
--        as a Visitor (signed out), a New member (signed in, no card) or a Member (full card), so the founder can spot bugs himself.
--
-- WHAT THIS ADDS
--   · kr8_mirror_accounts: the two hidden "mirror" sign-ins the phone frame uses (persona 'member' and 'newmember').
--     Created here with NO password anybody knows; kr8_admin_mirror_signin() sets a fresh random one-time password each time the
--     admin opens the frame, and only an admin can call it (kr8_is_admin, read from the caller's own sign-in on the server).
--   · kr8_is_mirror(uuid): internal.
--   · The member mirror's card is a ghost card (kr8_members.ghost = true), so every member list already hides it (kr8_is_blocked,
--     feed, People, board, counts). The ghost SWITCH (kr8_admin_set_ghost, Ghost mode screen, duplicate robot) is not changed.
--   · kr8_my_ghost(): false for a mirror, so the mirror sees the app exactly like a normal member (no "paused" line).
--   · kr8_admin_v2_kind(): a mirror is 'mirror' (never 'real' / 'nocard'), so it is never in admin member lists, counts,
--     Morning brief, Activity, Removed list or real-member numbers. Only "Show test rows" lists it, labelled "mirror".
--   · Write blocking ON THE SERVER (BEFORE triggers, no client can go around them):
--       refused (KR8_MIRROR): likes, saves, follows, chats, messages, posts/Reels, answers, Ask a Thai answers + votes, reports,
--         reward claims, face checks + face prints, new places, push sign-ups, LINE links, hand-offs, new member card,
--         deleting the mirror card
--       silently not stored: views, shares, check-ins, Rings, prizes, week results, invite credits, link tries, Help events,
--         coach flags, app logs, "not interested", terms log, listing taps, translate usage
--       the member mirror's card never changes (edits are ignored), so the frame always shows the same full member.
--   · kr8_bug_spots + 3 admin RPCs: the "Spot a bug" notes (tap point, screen, persona, language, phone size, screenshot).
--     Shown in admin → Needs you, one case per card.
--
-- ADDITIVE. No function changes shape. Bodies replaced: kr8_my_ghost, kr8_admin_v2_kind (live bodies + only the "0110" lines).
-- Re-runnable.
--
-- UNDO (safe at any time):
--   drop function if exists public.kr8_admin_mirror_signin(text), public.kr8_admin_bug_spot_add(text,text,text,text,text,numeric,numeric,text),
--     public.kr8_admin_bug_spots(boolean), public.kr8_admin_bug_spot_set(uuid,text);
--   do $$ declare r record; begin for r in select tgrelid::regclass t, tgname from pg_trigger where tgname like 'kr8_mirror_%' loop
--     execute format('drop trigger %I on %s', r.tgname, r.t); end loop; end $$;
--   create or replace function public.kr8_my_ghost() ... (body without the "0110" line: select public.kr8_is_ghost(auth.uid()))
--   create or replace function public.kr8_admin_v2_kind(p uuid) ... (body without the "0110" line)
--   set local kr8.mirror_seed = '1'; delete from public.kr8_members where user_id in (select user_id from public.kr8_mirror_accounts);
--   delete from auth.identities where user_id in (select user_id from public.kr8_mirror_accounts);
--   delete from auth.users where id in (select user_id from public.kr8_mirror_accounts);
--   drop table if exists public.kr8_bug_spots; drop table if exists public.kr8_mirror_accounts;
--   drop function if exists public.kr8_mirror_guard_trg(), public.kr8_mirror_member_trg(), public.kr8_is_mirror(uuid);

begin;

-- ───────────────────────── 1. the mirror sign-ins ─────────────────────────
create table if not exists public.kr8_mirror_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  persona text not null unique check (persona in ('member', 'newmember')),
  created_at timestamptz not null default now()
);
alter table public.kr8_mirror_accounts enable row level security;   -- no policies: only SECURITY DEFINER functions read it
revoke all on public.kr8_mirror_accounts from anon, authenticated;

create or replace function public.kr8_is_mirror(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and exists (select 1 from public.kr8_mirror_accounts x where x.user_id = p)
$$;
revoke all on function public.kr8_is_mirror(uuid) from public, anon, authenticated;

-- ───────────────────────── 2. the mirror card never changes, and no other card is made ─────────────────────────
-- Runs after kr8_ghost_member (triggers run in name order), so the member mirror stays a ghost card whatever happens.
create or replace function public.kr8_mirror_member_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('kr8.mirror_seed', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if public.kr8_is_mirror(new.user_id) then raise exception 'KR8_MIRROR'; end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if public.kr8_is_mirror(old.user_id) then return old; end if;   -- edits are ignored: the frame always shows the same member
    return new;
  else
    if public.kr8_is_mirror(old.user_id) then raise exception 'KR8_MIRROR'; end if;
    return old;
  end if;
end $$;
revoke all on function public.kr8_mirror_member_trg() from public, anon, authenticated;
drop trigger if exists kr8_mirror_member on public.kr8_members;
create trigger kr8_mirror_member before insert or update or delete on public.kr8_members
  for each row execute function public.kr8_mirror_member_trg();

-- ───────────────────────── 3. nothing a mirror does reaches anyone ─────────────────────────
-- TG_ARGV[0]: the column holding the member doing the action ('auth' = the signed-in caller); TG_ARGV[1]: 'refuse' | 'skip'.
create or replace function public.kr8_mirror_guard_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid;
begin
  if tg_argv[0] = 'auth' then actor := auth.uid();
  else actor := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  end if;
  if actor is null or not public.kr8_is_mirror(actor) then return new; end if;
  if tg_argv[1] = 'skip' then return null; end if;
  raise exception 'KR8_MIRROR';
end $$;
revoke all on function public.kr8_mirror_guard_trg() from public, anon, authenticated;

do $$
declare
  r record;
  spec text[][] := array[
    -- table,               column,       mode
    ['kr8_post_likes',      'user_id',    'refuse'],
    ['kr8_post_saves',      'user_id',    'refuse'],
    ['kr8_follows',         'follower',   'refuse'],
    ['kr8_threads',         'opened_by',  'refuse'],
    ['kr8_messages',        'sender',     'refuse'],
    ['kr8_posts',           'author',     'refuse'],
    ['kr8_answers',         'author',     'refuse'],
    ['kr8_ask_answers',     'author',     'refuse'],
    ['kr8_ask_votes',       'user_id',    'refuse'],
    ['kr8_reports',         'reporter',   'refuse'],
    ['kr8_claims',          'user_id',    'refuse'],
    ['kr8_reward_claims',   'member_id',  'refuse'],
    ['kr8_verifications',   'user_id',    'refuse'],
    ['kr8_face_prints',     'user_id',    'refuse'],
    ['kr8_face_vectors',    'user_id',    'refuse'],
    ['kr8_places',          'created_by', 'refuse'],
    ['kr8_push_subs',       'user_id',    'refuse'],
    ['kr8_line_links',      'user_id',    'refuse'],
    ['kr8_handoff',         'user_id',    'refuse'],
    ['kr8_post_views',      'auth',       'skip'],
    ['kr8_post_shares',     'user_id',    'skip'],
    ['kr8_checkins',        'member_id',  'skip'],
    ['kr8_rings_ledger',    'member_id',  'skip'],
    ['kr8_prizes',          'member_id',  'skip'],
    ['kr8_week_results',    'member_id',  'skip'],
    ['kr8_ref_credits',     'user_id',    'skip'],
    ['kr8_ref_credit_log',  'user_id',    'skip'],
    ['kr8_link_tries',      'user_id',    'skip'],
    ['kr8_help_events',     'user_id',    'skip'],
    ['kr8_member_coach',    'user_id',    'skip'],
    ['kr8_client_events',   'user_id',    'skip'],
    ['kr8_post_hidden',     'user_id',    'skip'],
    ['kr8_terms_log',       'user_id',    'skip'],
    ['kr8_listing_taps',    'user_id',    'skip'],
    ['kr8_translate_usage', 'user_id',    'skip']];
  i int;
  tname text; col text; mode text;
begin
  for i in 1 .. array_length(spec, 1) loop
    tname := spec[i][1]; col := spec[i][2]; mode := spec[i][3];
    continue when to_regclass('public.' || tname) is null;   -- tables a copy does not have are skipped
    continue when col <> 'auth' and not exists (select 1 from information_schema.columns
                                                 where table_schema = 'public' and table_name = tname and column_name = col);
    execute format('drop trigger if exists %I on public.%I', 'kr8_mirror_' || tname, tname);
    execute format('create trigger %I before insert on public.%I for each row execute function public.kr8_mirror_guard_trg(%L, %L)',
                   'kr8_mirror_' || tname, tname, col, mode);
  end loop;
end $$;

-- share-link opens claimed by a mirror stop counting (same as a ghost's)
do $$ begin
  if to_regclass('public.kr8_share_opens') is not null then
    drop trigger if exists kr8_mirror_share_opens on public.kr8_share_opens;
    create trigger kr8_mirror_share_opens before insert or update of opener on public.kr8_share_opens
      for each row execute function public.kr8_mirror_guard_trg('opener', 'skip');
  end if;
end $$;

-- ───────────────────────── 4. the mirror looks like a normal member to itself; admin never counts it ─────────────────────────
create or replace function public.kr8_my_ghost()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.kr8_is_ghost(auth.uid())
     and not public.kr8_is_mirror(auth.uid())   -- 0110: the View-as-member mirror sees the normal app
$$;

create or replace function public.kr8_admin_v2_kind(p uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.kr8_is_mirror(p) then 'mirror'   -- 0110: View-as-member mirror, never a member
    when not exists (select 1 from public.kr8_members m where m.user_id = p) then
      case when exists (select 1 from public.kr6_staff s where s.user_id = p and s.role = 'admin')
             or exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = p)
           then 'admin' else 'nocard' end
    when public.kr8_is_team(p) then 'team'
    when public.kr8_is_test_member(p) then 'test'
    when exists (select 1 from public.kr8_members g where g.user_id = p and g.ghost) then 'ghost'
    else 'real' end
$$;
revoke all on function public.kr8_admin_v2_kind(uuid) from public, anon, authenticated;

-- ───────────────────────── 5. create the two mirror sign-ins (once) ─────────────────────────
do $$
declare
  p text; em text; uid uuid; trg boolean;
begin
  foreach p in array array['member', 'newmember'] loop
    em := case p when 'member' then 'mirror-member@kringapp.com' else 'mirror-new@kringapp.com' end;
    select user_id into uid from public.kr8_mirror_accounts where persona = p;
    if uid is null then
      select id into uid from auth.users where lower(email) = em;
      if uid is null then
        uid := gen_random_uuid();
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                confirmation_token, recovery_token, email_change_token_new, email_change,
                                raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
                extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf', 10)), now(),
                '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"email_verified":true}'::jsonb,
                '2026-01-01T00:00:00Z', now());
        insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true, 'phone_verified', false),
                'email', null, now(), now());
      end if;
      insert into public.kr8_mirror_accounts (user_id, persona) values (uid, p) on conflict do nothing;
    end if;

    if p = 'member' and not exists (select 1 from public.kr8_members where user_id = uid) then
      -- one full member card: verified, terms agreed, hidden (ghost). The new-member e-mail alert is not sent for it.
      select exists (select 1 from pg_trigger where tgname = 'kr8_notify_founder_member' and tgrelid = 'public.kr8_members'::regclass) into trg;
      if trg then execute 'alter table public.kr8_members disable trigger kr8_notify_founder_member'; end if;
      perform set_config('kr8.ghost_set', '1', true);
      perform set_config('kr8.mirror_seed', '1', true);
      insert into public.kr8_members (user_id, first_name, photo, langs, bio, area, who, age_ok_at, verified, created_at, updated_at,
                                      terms_accepted_at, terms_version, member_no, ghost, promo_ok, promo_ok_at)
      values (uid, 'Mirror', 'https://kringapp.com/app/icon-512.png', array['TH', 'EN'], '', 'Bangkok', 'local', now(), true,
              '2026-01-01T00:00:00Z', now(), now(), 'member-2026-11-17', null, true, true, now());
      perform set_config('kr8.mirror_seed', '', true);
      perform set_config('kr8.ghost_set', '', true);
      if trg then execute 'alter table public.kr8_members enable trigger kr8_notify_founder_member'; end if;
    end if;
  end loop;
end $$;

-- ───────────────────────── 6. admin: sign the phone frame in as a mirror ─────────────────────────
-- Returns the mirror's e-mail and a NEW random password (the old one stops working). Admin only. Nothing secret ships in the app.
create or replace function public.kr8_admin_mirror_signin(p_persona text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid; em text; pw text;
begin
  if not public.kr8_is_admin() or auth.uid() is null then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_persona not in ('member', 'newmember') then raise exception 'KR8_BAD_PERSONA'; end if;
  select x.user_id, u.email into uid, em from public.kr8_mirror_accounts x join auth.users u on u.id = x.user_id where x.persona = p_persona;
  if uid is null then raise exception 'KR8_NO_MIRROR'; end if;
  if p_persona = 'newmember' then   -- always a fresh "no card yet" sign-in
    perform set_config('kr8.mirror_seed', '1', true);
    delete from public.kr8_members where user_id = uid;
    perform set_config('kr8.mirror_seed', '', true);
  end if;
  pw := encode(extensions.gen_random_bytes(24), 'hex');
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf', 10)), banned_until = null, updated_at = now()
   where id = uid;
  return jsonb_build_object('persona', p_persona, 'email', em, 'password', pw);
end $$;
revoke all on function public.kr8_admin_mirror_signin(text) from public, anon;
grant execute on function public.kr8_admin_mirror_signin(text) to authenticated;

-- ───────────────────────── 7. "Spot a bug" ─────────────────────────
create table if not exists public.kr8_bug_spots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  note text not null check (char_length(btrim(note)) between 1 and 300),
  persona text not null check (persona in ('visitor', 'newmember', 'member')),
  lang text not null check (lang in ('th', 'en')),
  viewport text not null check (viewport in ('390x844', '360x780')),
  route text check (route is null or char_length(route) <= 300),
  tap_x numeric check (tap_x is null or (tap_x >= 0 and tap_x <= 1)),
  tap_y numeric check (tap_y is null or (tap_y >= 0 and tap_y <= 1)),
  shot text check (shot is null or (shot like 'data:image/jpeg;base64,%' and char_length(shot) <= 900000)),
  status text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  handled_at timestamptz
);
create index if not exists kr8_bug_spots_open on public.kr8_bug_spots (created_at desc) where status = 'open';
alter table public.kr8_bug_spots enable row level security;   -- no policies: admin RPCs only
revoke all on public.kr8_bug_spots from anon, authenticated;

create or replace function public.kr8_admin_bug_spot_add(p_note text, p_persona text, p_lang text, p_viewport text, p_route text,
                                                        p_x numeric, p_y numeric, p_shot text)
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare id uuid;
begin
  if not public.kr8_is_admin() or auth.uid() is null then raise exception 'KR8_ADMIN_ONLY'; end if;
  insert into public.kr8_bug_spots (note, persona, lang, viewport, route, tap_x, tap_y, shot)
  values (btrim(p_note), p_persona, p_lang, p_viewport, left(p_route, 300), p_x, p_y, nullif(p_shot, ''))
  returning kr8_bug_spots.id into id;
  return id;
end $$;
revoke all on function public.kr8_admin_bug_spot_add(text, text, text, text, text, numeric, numeric, text) from public, anon;
grant execute on function public.kr8_admin_bug_spot_add(text, text, text, text, text, numeric, numeric, text) to authenticated;

create or replace function public.kr8_admin_bug_spots(p_open boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'at', b.created_at, 'note', b.note, 'persona', b.persona, 'lang', b.lang,
      'viewport', b.viewport, 'route', b.route, 'x', b.tap_x, 'y', b.tap_y, 'shot', b.shot, 'status', b.status, 'handled_at', b.handled_at)
      order by b.created_at desc)
    from (select * from public.kr8_bug_spots where (p_open and status = 'open') or (not p_open and status <> 'open')
          order by created_at desc limit 50) b), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_bug_spots(boolean) from public, anon;
grant execute on function public.kr8_admin_bug_spots(boolean) to authenticated;

create or replace function public.kr8_admin_bug_spot_set(p_id uuid, p_status text)
returns boolean language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() or auth.uid() is null then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_status not in ('open', 'fixed', 'dismissed') then raise exception 'KR8_BAD_STATUS'; end if;
  update public.kr8_bug_spots set status = p_status, handled_at = case when p_status = 'open' then null else now() end where id = p_id;
  return found;
end $$;
revoke all on function public.kr8_admin_bug_spot_set(uuid, text) from public, anon;
grant execute on function public.kr8_admin_bug_spot_set(uuid, text) to authenticated;

commit;
