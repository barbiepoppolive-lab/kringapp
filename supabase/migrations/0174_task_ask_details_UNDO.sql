create or replace function public.kr8_task_ask_pick(p_uid uuid) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p.id, 'body', left(p.body, 140))
  from public.kr8_posts p
  where p.kind = 'ask' and not coalesce(p.hidden, false) and p.author <> p_uid
    and not exists (select 1 from public.kr8_members g where g.user_id = p.author and (coalesce(g.ghost, false) or public.kr8_is_test_member(g.user_id) <> public.kr8_is_test_member(p_uid)))
    and not exists (select 1 from public.kr8_ask_answers a where a.post_id = p.id and a.author = p_uid)
  order by p.created_at desc limit 1
$$;
