-- 0077 · Admin view (17 Nov 2026): one link (kringapp.com/app/?admin=1) for the founder to see the whole app as members see it,
--        from an admin sign-in that has NO member card, read-only and invisible.
--
-- ADDITIVE ONLY. Nothing is dropped or renamed; no function changes shape (same arguments, same return type), RLS untouched.
--   · 2 new functions: kr8_admin_view_ok() (the phone asks "am I an admin?") and kr8_is_cardless_admin(uuid) (internal)
--   · kr8_people: an admin may read the People list without a card (before: a card was required). Read-only, same columns.
--   · kr8_log_reel_view / kr8_log_reel_share / kr8_share_open_seen: an admin's view, share or link open is never stored
--     (no views_count, shares_count or opener for the founder's own looking around).
--   · kr8_ghost_guard_trg (0061 triggers on likes, saves, follows, threads, messages, posts, answers, Ask a Thai answers and votes,
--     views): a signed-in admin WITHOUT a card is treated like a ghost: likes / saves / follows / hellos / posts are refused
--     (KR8_GHOST) and views are silently not stored. An admin who HAS a card (e.g. Kring Team) is not affected.
-- Nothing here gives a non-admin anything new: every new path is behind kr8_is_admin() (staff admin or a confirmed email in
-- kr8_admin_emails), read on the server from the caller's own sign-in.
--
-- CHECKED AGAINST LIVE / kring-test (17 Nov, read-only): kr8_people, kr8_log_reel_view, kr8_log_reel_share, kr8_share_open_seen and
-- kr8_ghost_guard_trg below are the live bodies plus only the lines marked "0077".
--
-- UNDO (safe at any time; the old app never calls kr8_admin_view_ok):
--   put back the five bodies without the "0077" lines, then
--   drop function public.kr8_admin_view_ok(), public.kr8_is_cardless_admin(uuid);

begin;

-- ───────────────────────── helpers ─────────────────────────
-- The phone asks once after sign-in when it was opened with ?admin=1. True only for an admin; everyone else gets false.
create or replace function public.kr8_admin_view_ok()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and public.kr8_is_admin()
$$;
revoke all on function public.kr8_admin_view_ok() from public, anon;
grant execute on function public.kr8_admin_view_ok() to authenticated;

-- p is an admin sign-in (staff admin, or a confirmed email listed in kr8_admin_emails) that has no member card.
-- A member with a card returns false at the first lookup (one primary-key read), so the like / save triggers stay cheap.
create or replace function public.kr8_is_cardless_admin(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null
     and not exists (select 1 from public.kr8_members m where m.user_id = p)
     and (exists (select 1 from public.kr6_staff s where s.user_id = p and s.role = 'admin')
          or exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email)
                     where u.id = p and u.email_confirmed_at is not null))
$$;
revoke all on function public.kr8_is_cardless_admin(uuid) from public, anon, authenticated;

-- ───────────────────────── People: admins may read it without a card ─────────────────────────
create or replace function public.kr8_people(p_limit integer default 60)
returns table(user_id uuid, first_name text, photo text, langs text[], bio text, area text, who text, here boolean, verified boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, m.first_name, m.photo, m.langs, m.bio, m.area, m.who, coalesce(m.here_until > now(), false), m.verified
  from public.kr8_members m
  cross join (select auth.uid() is not null and public.kr8_is_admin() as yes) adm                       -- 0077
  where (exists (select 1 from public.kr8_members me where me.user_id = auth.uid()) or adm.yes)         -- 0077: "or adm.yes"
    and m.user_id <> auth.uid() and not public.kr8_is_blocked(auth.uid(), m.user_id)
  order by (m.here_until > now()) desc nulls last, m.updated_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

-- ───────────────────────── an admin's looking around is never counted ─────────────────────────
create or replace function public.kr8_log_reel_view(p_post uuid, p_device text default null::text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_author uuid; v_key text;
begin
  if uid is not null and public.kr8_is_admin() then return false; end if;   -- 0077
  v_author := public.kr8_reel_open(p_post);
  if v_author is null or v_author = uid then return false; end if;
  if uid is not null then v_key := 'u:' || replace(uid::text, '-', '');
  elsif p_device ~ '^[A-Za-z0-9-]{16,64}$' then v_key := 'd:' || md5('kr8-dev|' || p_device);
  else return false; end if;
  insert into public.kr8_post_views (post_id, viewer_key) values (p_post, v_key) on conflict do nothing;
  if not found then return false; end if;
  update public.kr8_posts set views_count = views_count + 1 where id = p_post;
  return true;
end $$;

create or replace function public.kr8_log_reel_share(p_post uuid, p_channel text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ip text := public.kr8_caller_ip_hash(); n int;
begin
  if p_channel not in ('line', 'copy', 'native') then raise exception 'KR8_BAD_CHANNEL'; end if;
  if public.kr8_is_ghost(auth.uid()) then return false; end if;
  if auth.uid() is not null and public.kr8_is_admin() then return false; end if;   -- 0077
  if public.kr8_reel_open(p_post) is null then return false; end if;
  select count(*) into n from public.kr8_post_shares where ip_hash = v_ip and created_at > now() - interval '1 day';
  if n >= 100 then return false; end if;
  insert into public.kr8_post_shares (post_id, user_id, ip_hash, channel) values (p_post, auth.uid(), v_ip, p_channel);
  update public.kr8_posts set shares_count = shares_count + 1 where id = p_post;
  return true;
end $$;

create or replace function public.kr8_share_open_seen(p_open uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return false; end if;
  if public.kr8_is_admin() then return false; end if;   -- 0077
  update public.kr8_share_opens set opener = auth.uid() where id = p_open and opener is null and created_at > now() - interval '2 days';
  return found;
end $$;

-- ───────────────────────── a card-less admin leaves no trace (0061 triggers) ─────────────────────────
create or replace function public.kr8_ghost_guard_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid;
begin
  if tg_argv[0] = 'auth' then actor := auth.uid();
  else actor := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  end if;
  if not public.kr8_is_ghost(actor) and not public.kr8_is_cardless_admin(actor) then return new; end if;   -- 0077: cardless admin
  if tg_argv[1] = 'skip' then return null; end if;
  raise exception 'KR8_GHOST';
end $$;

commit;
