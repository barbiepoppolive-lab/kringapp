-- m208 (25 Nov, open onboarding, ADDITIVE, safe to apply now): nothing a live member sees changes.
--   · kr8_my_unv_stats(): for the signed-in member only, whether they are still before the face check, and how many Reels they have
--     watched / liked / saved. The app uses it for the "You can see them, they can't see you yet" prompt (fires once after N likes).
--     Reads only the caller's own rows. No Rings, no board, no other member's data.
--   · two new config keys with defaults that change nothing:
--       open_join_like_prompt = 5   (likes before the prompt; read only by kr8_my_unv_stats)
--       open_join_on          = 0   (read by m209 once it is applied ON GO; nothing reads it before that)
-- UNDO: m208_open_join_stats_UNDO.sql
begin;

insert into public.kr8_rings_config (key, value) values ('open_join_like_prompt', 5) on conflict (key) do nothing;
insert into public.kr8_rings_config (key, value) values ('open_join_on', 0) on conflict (key) do nothing;

create or replace function public.kr8_my_unv_stats()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); m public.kr8_members; vk text;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = uid;
  if m.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  vk := 'u:' || replace(uid::text, '-', '');
  return jsonb_build_object(
    'gated', public.kr8_face_gate(uid),
    'verified', coalesce(m.verified, false),
    'views', (select count(distinct v.post_id) from public.kr8_post_views v where v.viewer_key = vk),
    'likes', (select count(*) from public.kr8_post_likes l where l.user_id = uid),
    'saves', (select count(*) from public.kr8_post_saves s where s.user_id = uid),
    'prompt_at', greatest(public.kr8_rcfg('open_join_like_prompt', 5), 1)
  );
end $$;
revoke execute on function public.kr8_my_unv_stats() from public, anon;
grant execute on function public.kr8_my_unv_stats() to authenticated;

commit;
