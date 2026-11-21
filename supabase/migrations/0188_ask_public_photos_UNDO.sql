-- UNDO 0188: back to the 0073 version (no photos for signed-out readers)
begin;
create or replace function public.kr8_ask_person(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.kr8_is_team(p_uid)
    then jsonb_build_object('name', 'Kring Team', 'photo', null, 'local', false, 'official', true)
    else jsonb_build_object('name', coalesce(m.first_name, ''), 'photo', case when auth.uid() is null then null else nullif(m.photo, '') end, 'local', m.who = 'local')
  end
  from public.kr8_members m where m.user_id = p_uid
$$;
revoke all on function public.kr8_ask_person(uuid) from public, anon, authenticated;
commit;
