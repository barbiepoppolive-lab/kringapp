-- 0061 · Ghost mode (16 Nov 2026): an admin-only flag on a member card. A ghost can open and browse everything
--        (Feed, Reels, People, Deals, profiles) but nobody can see him and nothing he does reaches anyone.
--
-- ADDITIVE ONLY. Written, NOT applied. Nothing is dropped or renamed; no function changes shape (same arguments, same
-- return type), so the live build keeps working before and after this file.
--   · kr8_members gains one column: ghost boolean not null default false (every existing member stays false)
--   · 5 new functions: kr8_is_ghost, kr8_my_ghost, kr8_admin_ghost_me, kr8_admin_set_ghost, kr8_ghost_guard_trg (+ kr8_ghost_member_trg)
--   · kr8_is_blocked: same arguments and result; it now ALSO answers "hidden" when the other person is a ghost.
--     Every list that shows another member already filters through it (People / nearby / online, search and tagging,
--     followers / following lists, Activity "who liked / followed", profile, Reels feed and Reel open, ranking boards,
--     chat inbox and threads, the kr8_members read policy), so one change hides the ghost everywhere at once.
--   · kr8_log_reel_share: returns false for a ghost before anything is stored (same body otherwise)
--   · triggers (BEFORE INSERT / UPDATE, so no client can go around them):
--       kr8_post_likes, kr8_post_saves, kr8_follows, kr8_threads, kr8_messages, kr8_posts, kr8_answers → refused with KR8_GHOST
--       kr8_post_views (a ghost's view) → silently not stored (so views_count is not raised either)
--       kr8_share_opens: an open later claimed by a ghost (kr8_share_open_seen) is marked ok = false, why = 'ghost'
--       kr8_members: a ghost's last_active_at and here_until never move; only kr8_admin_set_ghost can change the flag
--
-- UNDO (safe at any time; the old app never reads any of this):
--   drop trigger if exists kr8_ghost_likes on public.kr8_post_likes;   drop trigger if exists kr8_ghost_saves on public.kr8_post_saves;
--   drop trigger if exists kr8_ghost_follows on public.kr8_follows;    drop trigger if exists kr8_ghost_threads on public.kr8_threads;
--   drop trigger if exists kr8_ghost_messages on public.kr8_messages;  drop trigger if exists kr8_ghost_posts on public.kr8_posts;
--   drop trigger if exists kr8_ghost_answers on public.kr8_answers;    drop trigger if exists kr8_ghost_views on public.kr8_post_views;
--   drop trigger if exists kr8_ghost_opens on public.kr8_share_opens;  drop trigger if exists kr8_ghost_member on public.kr8_members;
--   then re-run the kr8_is_blocked body from 0022 and the kr8_log_reel_share body from 0026 (unchanged since),
--   drop function public.kr8_admin_set_ghost(boolean, uuid), public.kr8_admin_ghost_me(), public.kr8_my_ghost(),
--     public.kr8_ghost_guard_trg(), public.kr8_ghost_member_trg(), public.kr8_ghost_open_trg(), public.kr8_is_ghost(uuid);
--   alter table public.kr8_members drop column ghost;
--
-- What it cannot hide: likes / saves / follows the account made BEFORE ghost mode was switched on still count in the
-- like / save totals (the names are hidden). A share link opened while NOT signed in to Kring cannot be told apart from
-- anyone else's open (it is only marked once the app on that phone is signed in as the ghost).

begin;

alter table public.kr8_members add column if not exists ghost boolean not null default false;
create index if not exists kr8_members_ghost on public.kr8_members (user_id) where ghost;

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.kr8_is_ghost(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and exists (select 1 from public.kr8_members g where g.user_id = p and g.ghost)
$$;
revoke all on function public.kr8_is_ghost(uuid) from public, anon, authenticated;

-- the signed-in member's own flag (the app shows a small "Ghost mode" line on Me; nobody else can ask about anyone)
create or replace function public.kr8_my_ghost()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.kr8_is_ghost(auth.uid())
$$;
revoke all on function public.kr8_my_ghost() from public, anon;
grant execute on function public.kr8_my_ghost() to authenticated;

-- ───────────────────────── hide the ghost from everyone else ─────────────────────────
-- Callers pass (viewer, other) or, for chats, (user_a, user_b) with the viewer as one of them. Blocks work as before.
-- New: when the other person (the one who is not the viewer) is a ghost, the answer is "blocked", so every list drops him.
-- A ghost looking at anyone else is never affected (the other person is not a ghost).
create or replace function public.kr8_is_blocked(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.uid() is not null and auth.uid() in (x, y)
          and exists (select 1 from public.kr8_blocks where (blocker = x and blocked = y) or (blocker = y and blocked = x)))
      or (auth.uid() is not null and auth.uid() in (x, y) and x is distinct from y
          and public.kr8_is_ghost(case when auth.uid() = x then y else x end))
$$;

-- ───────────────────────── a ghost leaves no trace ─────────────────────────
-- TG_ARGV[0]: the column that holds the member doing the action ('auth' = the signed-in caller).
-- TG_ARGV[1]: 'refuse' raises KR8_GHOST (the app says "Ghost mode is on…"), 'skip' silently stores nothing.
create or replace function public.kr8_ghost_guard_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid;
begin
  if tg_argv[0] = 'auth' then actor := auth.uid();
  else actor := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  end if;
  if not public.kr8_is_ghost(actor) then return new; end if;
  if tg_argv[1] = 'skip' then return null; end if;
  raise exception 'KR8_GHOST';
end $$;
revoke all on function public.kr8_ghost_guard_trg() from public, anon, authenticated;

drop trigger if exists kr8_ghost_likes on public.kr8_post_likes;
create trigger kr8_ghost_likes before insert on public.kr8_post_likes for each row execute function public.kr8_ghost_guard_trg('user_id', 'refuse');
drop trigger if exists kr8_ghost_saves on public.kr8_post_saves;
create trigger kr8_ghost_saves before insert on public.kr8_post_saves for each row execute function public.kr8_ghost_guard_trg('user_id', 'refuse');
drop trigger if exists kr8_ghost_follows on public.kr8_follows;
create trigger kr8_ghost_follows before insert on public.kr8_follows for each row execute function public.kr8_ghost_guard_trg('follower', 'refuse');
drop trigger if exists kr8_ghost_threads on public.kr8_threads;
create trigger kr8_ghost_threads before insert on public.kr8_threads for each row execute function public.kr8_ghost_guard_trg('opened_by', 'refuse');
drop trigger if exists kr8_ghost_messages on public.kr8_messages;
create trigger kr8_ghost_messages before insert on public.kr8_messages for each row execute function public.kr8_ghost_guard_trg('sender', 'refuse');
drop trigger if exists kr8_ghost_posts on public.kr8_posts;
create trigger kr8_ghost_posts before insert on public.kr8_posts for each row execute function public.kr8_ghost_guard_trg('author', 'refuse');
drop trigger if exists kr8_ghost_answers on public.kr8_answers;
create trigger kr8_ghost_answers before insert on public.kr8_answers for each row execute function public.kr8_ghost_guard_trg('author', 'refuse');
drop trigger if exists kr8_ghost_views on public.kr8_post_views;
create trigger kr8_ghost_views before insert on public.kr8_post_views for each row execute function public.kr8_ghost_guard_trg('auth', 'skip');

-- share-link opens: stored by the /r server (no sign-in there); the app then claims the open (opener). A ghost's open stops counting.
create or replace function public.kr8_ghost_open_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.opener is not null and public.kr8_is_ghost(new.opener) then new.ok := false; new.why := 'ghost'; end if;
  return new;
end $$;
revoke all on function public.kr8_ghost_open_trg() from public, anon, authenticated;
drop trigger if exists kr8_ghost_opens on public.kr8_share_opens;
create trigger kr8_ghost_opens before insert or update of opener on public.kr8_share_opens for each row execute function public.kr8_ghost_open_trg();

-- member row: a ghost is never "online" or "here", and only the admin setter can switch the flag
create or replace function public.kr8_ghost_member_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('kr8.ghost_set', true), '') <> '1' then
    if tg_op = 'INSERT' then new.ghost := false;
    else new.ghost := old.ghost;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.ghost and old.ghost then
    new.last_active_at := old.last_active_at;
    new.here_until := old.here_until;
  end if;
  return new;
end $$;
revoke all on function public.kr8_ghost_member_trg() from public, anon, authenticated;
drop trigger if exists kr8_ghost_member on public.kr8_members;
create trigger kr8_ghost_member before insert or update on public.kr8_members for each row execute function public.kr8_ghost_member_trg();

-- shares of a Reel by a ghost: not logged, shares_count not raised (same body as before otherwise)
create or replace function public.kr8_log_reel_share(p_post uuid, p_channel text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ip text := public.kr8_caller_ip_hash(); n int;
begin
  if p_channel not in ('line', 'copy', 'native') then raise exception 'KR8_BAD_CHANNEL'; end if;
  if public.kr8_is_ghost(auth.uid()) then return false; end if;
  if public.kr8_reel_open(p_post) is null then return false; end if;
  select count(*) into n from public.kr8_post_shares where ip_hash = v_ip and created_at > now() - interval '1 day';
  if n >= 100 then return false; end if;
  insert into public.kr8_post_shares (post_id, user_id, ip_hash, channel) values (p_post, auth.uid(), v_ip, p_channel);
  update public.kr8_posts set shares_count = shares_count + 1 where id = p_post;
  return true;
end $$;

-- ───────────────────────── admin ─────────────────────────
-- The admin's own member card (the account signed in to the admin page) and its ghost flag.
create or replace function public.kr8_admin_ghost_me()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.kr8_members;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into m from public.kr8_members where user_id = auth.uid();
  if m.user_id is null then return jsonb_build_object('card', false); end if;
  return jsonb_build_object('card', true, 'user_id', m.user_id, 'first_name', m.first_name, 'member_no', m.member_no, 'ghost', m.ghost);
end $$;
revoke all on function public.kr8_admin_ghost_me() from public, anon;
grant execute on function public.kr8_admin_ghost_me() to authenticated;

-- Switch ghost mode on / off. p_member null = the admin's own card. Switching on also ends any "I'm here".
create or replace function public.kr8_admin_set_ghost(p_on boolean, p_member uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare tgt uuid := coalesce(p_member, auth.uid()); m public.kr8_members;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if tgt is null or p_on is null then raise exception 'KR8_NO_PERSON'; end if;
  perform set_config('kr8.ghost_set', '1', true);
  update public.kr8_members set ghost = p_on, here_until = case when p_on then null else here_until end
  where user_id = tgt returning * into m;
  perform set_config('kr8.ghost_set', '', true);
  if m.user_id is null then raise exception 'KR8_NO_PERSON'; end if;
  return jsonb_build_object('ok', true, 'user_id', m.user_id, 'first_name', m.first_name, 'member_no', m.member_no, 'ghost', m.ghost);
end $$;
revoke all on function public.kr8_admin_set_ghost(boolean, uuid) from public, anon;
grant execute on function public.kr8_admin_set_ghost(boolean, uuid) to authenticated;

commit;
