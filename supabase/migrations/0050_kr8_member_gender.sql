-- 0050 · optional gender on the Kring card (founder, 15 Nov 2026): male · female · kathoey, or nothing.
--
-- ADDITIVE: two columns on kr8_members (gender: null by default; show_gender: false by default) and two new functions.
-- Nothing the live build calls is changed. Rules kept by the database, not by the app:
--   · only the member can set their own value (kr8_set_gender uses auth.uid(); the table itself has no grants to app roles)
--   · the value leaves the database for someone else ONLY when the member switched "Show on my card" on (kr8_gender_shown)
--   · it is never read by any ranking, reward, people-list or feed function (none of them was touched)
--   · never pre-filled: both columns start empty / off, also for every existing member
-- A member sees their own value through kr8_me (their own row), as with the rest of their card.
--
-- UNDO: drop function if exists public.kr8_set_gender(text, boolean), public.kr8_gender_shown(uuid);
--       alter table public.kr8_members drop column if exists show_gender, drop column if exists gender;

alter table public.kr8_members
  add column if not exists gender text,
  add column if not exists show_gender boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kr8_members_gender_check') then
    alter table public.kr8_members add constraint kr8_members_gender_check check (gender is null or gender in ('male', 'female', 'kathoey'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kr8_members_show_gender_check') then
    alter table public.kr8_members add constraint kr8_members_show_gender_check check (not show_gender or gender is not null);
  end if;
end $$;

-- The member's own choice. null / '' / 'none' = prefer not to say (which also switches "show" off).
create or replace function public.kr8_set_gender(p_gender text, p_show boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); g text := nullif(nullif(lower(btrim(coalesce(p_gender, ''))), ''), 'none'); s boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if g is not null and g not in ('male', 'female', 'kathoey') then raise exception 'KR8_BAD_GENDER'; end if;
  s := g is not null and coalesce(p_show, false);
  update public.kr8_members set gender = g, show_gender = s where user_id = uid;
  if not found then raise exception 'KR8_NO_CARD'; end if;
  return jsonb_build_object('gender', g, 'show_gender', s);
end $$;

-- What OTHER people may see: the value only when that member chose to show it (blocked pairs see nothing).
create or replace function public.kr8_gender_shown(p_user uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select m.gender from public.kr8_members m
  where m.user_id = p_user and m.show_gender and m.gender is not null
    and (auth.uid() is null or auth.uid() = p_user or not public.kr8_is_blocked(auth.uid(), p_user))
$$;

revoke all on function public.kr8_set_gender(text, boolean), public.kr8_gender_shown(uuid) from public;
grant execute on function public.kr8_set_gender(text, boolean) to authenticated;
grant execute on function public.kr8_gender_shown(uuid) to anon, authenticated;
