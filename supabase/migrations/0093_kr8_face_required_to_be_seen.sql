-- 0093 · One face, one account: the face check is required to be SEEN on Kring, not to look around (founder, 17 Nov 2026).
-- New members (member_no above 68, i.e. joined after 17 Nov 21:50 IST) who have not passed the face check:
--   · can browse Feed / People / Deals and watch Reels;
--   · do NOT appear in People, and can't post (Reels, posts, asks), answer, say hi or chat → KR8_VERIFY_FIRST.
-- Everyone who joined before (#1–#68) is exempt (founder: "let these 18 be the exception"). Admins and server jobs are never stopped.
-- UNDO: drop the five kr8_face_gate_* triggers; drop function kr8_face_gate(uuid), kr8_face_gate_trg(); re-run kr8_people from 0077.

create or replace function public.kr8_face_gate(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_members m
                  where m.user_id = p_user and not m.verified and not m.ghost
                    and coalesce(m.member_no, 0) > public.kr8_rcfg('face_gate_after_no', 68))
$$;
revoke all on function public.kr8_face_gate(uuid) from public;
grant execute on function public.kr8_face_gate(uuid) to authenticated;

create or replace function public.kr8_face_gate_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.kr8_is_admin() and public.kr8_face_gate(auth.uid()) then
    raise exception 'KR8_VERIFY_FIRST';
  end if;
  return new;
end $$;

drop trigger if exists kr8_face_gate_posts on public.kr8_posts;
create trigger kr8_face_gate_posts before insert on public.kr8_posts for each row execute function public.kr8_face_gate_trg();
drop trigger if exists kr8_face_gate_threads on public.kr8_threads;
create trigger kr8_face_gate_threads before insert on public.kr8_threads for each row execute function public.kr8_face_gate_trg();
drop trigger if exists kr8_face_gate_messages on public.kr8_messages;
create trigger kr8_face_gate_messages before insert on public.kr8_messages for each row execute function public.kr8_face_gate_trg();
drop trigger if exists kr8_face_gate_answers on public.kr8_answers;
create trigger kr8_face_gate_answers before insert on public.kr8_answers for each row execute function public.kr8_face_gate_trg();
drop trigger if exists kr8_face_gate_ask_answers on public.kr8_ask_answers;
create trigger kr8_face_gate_ask_answers before insert on public.kr8_ask_answers for each row execute function public.kr8_face_gate_trg();

-- People: a new member shows up only after the face check (same signature, default kept)
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
revoke all on function public.kr8_people(integer) from public, anon;
grant execute on function public.kr8_people(integer) to authenticated;
