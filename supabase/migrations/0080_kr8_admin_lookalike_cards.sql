-- 0080 (17 Nov 2026): Face checks screen, "Possible second account" block.
--
-- The founder was confused by two "same person" lines with opposite meanings. The look-alike block now shows the OTHER
-- account's card photo next to this member's selfie, with both accounts' referrer code and join date. This function gives
-- the admin page those few fields for a short list of members.
--
-- ADMIN-ONLY + READ-ONLY. One new function, nothing else changes: no table, column, rule (RLS) or existing function is touched.
--   * kr8_is_admin() is checked on the server from the caller's own sign-in (0077 admin-view rule); everyone else gets KR8_ADMIN_ONLY.
--   * stable, select-only: it writes nothing, so the 0077 cardless admin view stays read-only and invisible.
--   * returns only fields the admin Members list (0053) already shows: member no, first name, card photo, ref code, join date.
--   * at most 20 members per call.
-- RE-RUNNABLE. UNDO: drop function public.kr8_admin_lookalike_cards(uuid[]);
begin;

create or replace function public.kr8_admin_lookalike_cards(p_users uuid[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_object_agg(m.user_id, jsonb_build_object(
      'member_no', m.member_no,
      'first_name', m.first_name,
      'photo', nullif(m.photo, ''),
      'ref_code', nullif(m.ref_code, ''),
      'joined_at', m.created_at))
    from public.kr8_members m
    where m.user_id = any ((coalesce(p_users, '{}'::uuid[]))[1:20])), '{}'::jsonb);
end $$;
revoke all on function public.kr8_admin_lookalike_cards(uuid[]) from public, anon;
grant execute on function public.kr8_admin_lookalike_cards(uuid[]) to authenticated;

commit;
