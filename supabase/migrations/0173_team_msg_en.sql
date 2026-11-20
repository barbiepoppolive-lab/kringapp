-- 0173 (20 Nov): Kring Team messages in one language. Team messages are written in Thai; the founder's English version
-- sits in kr8_help_ai.translation_en. Members reading Kring in English get that English text for team messages in
-- THEIR OWN threads only (no other rows are reachable).
create or replace function public.kr8_my_team_en()
returns table (thread_id uuid, message_id bigint, body_en text, is_last boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (
    select t.id from public.kr8_threads t
    where auth.uid() in (t.user_a, t.user_b) and (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
  ), last_ids as (
    select m.thread_id, max(m.id) as last_id from public.kr8_messages m join mine on mine.id = m.thread_id group by m.thread_id
  )
  select m.thread_id, m.id, h.translation_en, (m.id = l.last_id)
  from public.kr8_messages m
  join mine on mine.id = m.thread_id
  join last_ids l on l.thread_id = m.thread_id
  join public.kr8_help_ai h on h.message_id = m.id
  where public.kr8_is_team(m.sender) and nullif(btrim(coalesce(h.translation_en, '')), '') is not null
  order by m.id desc limit 300;
$$;
revoke all on function public.kr8_my_team_en() from public, anon;
grant execute on function public.kr8_my_team_en() to authenticated;
