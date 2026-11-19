-- 0136a (19 Nov): the canary's phone pushes go out through the database (pg_net); ntfy.sh drops pushes sent straight from Cloudflare
create or replace function public.kr8_ntfy(p_topic text, p_title text, p_message text, p_priority int default 3, p_tags text[] default '{}')
returns bigint language sql security definer set search_path = public, extensions, pg_temp as $$
  select net.http_post(url := 'https://ntfy.sh/', body := jsonb_build_object('topic', p_topic, 'title', left(p_title, 200), 'message', left(p_message, 3000),
    'priority', least(greatest(coalesce(p_priority, 3), 1), 5), 'tags', to_jsonb(coalesce(p_tags, '{}')), 'click', 'https://kringapp.com/app/admin.html#autopilot'))
$$;
revoke all on function public.kr8_ntfy(text, text, text, int, text[]) from public, anon, authenticated;
grant execute on function public.kr8_ntfy(text, text, text, int, text[]) to service_role;
