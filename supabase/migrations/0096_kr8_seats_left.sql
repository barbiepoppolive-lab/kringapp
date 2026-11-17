-- 0096_kr8_seats_left.sql  (17 Nov 2026)
-- "X of 50 paid seats left" line on the weekly board.
-- A paid seat = a Founding Local place: the first `founding_slots` (50) members whose first Reel Kring approves get ฿100.
-- 18 Nov (founder): seats left = founding_slots − PEOPLE who received a voucher code (one person = one seat, even with 2 codes).
-- (was: founding_slots − Founding Local prizes already given (kr8_prizes kind = 'founding'), the SAME count
-- kr8_my_rewards.founding_left uses. It never reads kr8_reward_codes: voucher/code stock is never shown to members.
-- Returns ONLY one integer (null when Founding Local is switched off). Test members see the test pool, real members the real one.
-- Re-runnable.
-- UNDO:
--   revoke all on function public.kr8_seats_left() from authenticated;
--   drop function if exists public.kr8_seats_left();

create or replace function public.kr8_seats_left() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.kr8_rcfg('founding_on', 1) <> 1 then null
    else greatest(0, public.kr8_rcfg('founding_slots', 50) - (
      select count(distinct assigned_to)::int from public.kr8_reward_codes
      where status <> 'available' and assigned_to is not null
        and is_test = coalesce(public.kr8_is_test_member(auth.uid()), false)))
  end
$$;
revoke all on function public.kr8_seats_left() from public, anon;
grant execute on function public.kr8_seats_left() to authenticated;
