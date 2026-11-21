-- 0188 (21 Nov, founder): Ask BKK shows the member's real photo instead of the letter circle, also to signed-out readers and the
-- admin "View as member" visitor. Privacy: a signed-out reader only gets a photo that is ALREADY public on that member's share
-- card (kr8_profile_card rules: face-verified, real photo with a face, not hidden / test / team / possible under 18).
-- Signed-in members: unchanged (they already saw every photo). UNDO: 0188_ask_public_photos_UNDO.sql
begin;
create or replace function public.kr8_ask_person(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.kr8_is_team(p_uid)
    then jsonb_build_object('name', 'Kring Team', 'photo', null, 'local', false, 'official', true)
    else jsonb_build_object('name', coalesce(m.first_name, ''),
      'photo', case
        when auth.uid() is not null then nullif(m.photo, '')
        when m.verified and not coalesce(m.ghost, false) and coalesce(m.photo, '') ~ '^(data:image/|https://)'
             and m.photo_check is distinct from 'no_face'
             and not public.kr8_is_test_member(m.user_id) and not public.kr8_minor_held(m.user_id) then m.photo
      end,
      'local', m.who = 'local')
  end
  from public.kr8_members m where m.user_id = p_uid
$$;
revoke all on function public.kr8_ask_person(uuid) from public, anon, authenticated;
commit;
