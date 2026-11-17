-- 0090 · chat link block + "show my Instagram / TikTok" switch (founder + Otop's advice, 17 Nov 2026)
--
-- 1) Private chat: web links can't be sent (Thais fear scam links that drain bank accounts).
--    Public text (posts, Reels, answers, asks, bio, the first hello) was already blocked by kr8_text_ok.
--    Chat still allows @handles and phone numbers: people swap Instagram once they trust each other.
--    A refused try is logged by the app through kr8_link_try (the refusal itself rolls back), for the trust score.
-- 2) Members choose whether their Instagram / TikTok show on their card. Off = the handles are parked in
--    *_hidden columns and the public ones are empty, so EVERY function that shows handles hides them with no
--    other change. The member still sees their own handles (kr8_me returns the whole own row).
--
-- UNDO: restore kr8_send_message / kr8_set_ig_handle / kr8_set_tiktok_handle from 0073 / earlier;
--       update kr8_members set ig_handle = coalesce(ig_handle, ig_handle_hidden), tiktok_handle = coalesce(tiktok_handle, tiktok_handle_hidden);
--       drop function kr8_has_web_link(text), kr8_link_try(text), kr8_set_socials_shown(boolean); drop table kr8_link_tries;
--       alter table kr8_members drop column show_socials, drop column ig_handle_hidden, drop column tiktok_handle_hidden;

create or replace function public.kr8_has_web_link(t text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(lower(t), '') ~ ('(https?://|www\.|\m(bit\.ly|line\.me|lin\.ee|t\.me|wa\.me|tinyurl\.com|shorturl\.at|cutt\.ly|s\.id)\M'
    || '|\m[a-z0-9-]{2,}\.(com|net|org|io|ly|th|info|xyz|shop|online|top|club|vip|cc|asia|biz|gg|link|site|co\.th|in\.th)(/|\M))')
$$;

create or replace function public.kr8_send_message(p_thread uuid, p_body text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t public.kr8_threads; mid bigint; n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into t from public.kr8_threads where id = p_thread for update;
  if t.id is null or uid not in (t.user_a, t.user_b) then raise exception 'KR8_NO_THREAD'; end if;
  if public.kr8_is_blocked(t.user_a, t.user_b) then raise exception 'KR8_BLOCKED'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'KR8_BAD_TEXT'; end if;
  if public.kr8_has_web_link(p_body) and not public.kr8_is_admin() then raise exception 'KR8_NO_LINKS'; end if;
  if t.status = 'pending' then
    if t.opened_by = uid then raise exception 'KR8_ONE_MESSAGE_RULE'; end if;
    update public.kr8_threads set status = 'open' where id = t.id;
  end if;
  select count(*) into n from public.kr8_messages where sender = uid and created_at > now() - interval '1 day';
  if n >= 500 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_messages (thread_id, sender, body) values (t.id, uid, btrim(p_body)) returning id into mid;
  update public.kr8_threads set last_at = now() where id = t.id;
  return mid;
end $$;

create table if not exists public.kr8_link_tries (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now(),
  place text not null default 'chat'
);
alter table public.kr8_link_tries enable row level security;
create index if not exists kr8_link_tries_user on public.kr8_link_tries (user_id, at desc);

create or replace function public.kr8_link_try(p_place text default 'chat')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return; end if;
  -- at most 20 rows a day per member, so the log can't be flooded
  if (select count(*) from public.kr8_link_tries where user_id = auth.uid() and at > now() - interval '1 day') >= 20 then return; end if;
  insert into public.kr8_link_tries (user_id, place) values (auth.uid(), left(coalesce(p_place, 'chat'), 20));
end $$;

alter table public.kr8_members
  add column if not exists show_socials boolean not null default true,
  add column if not exists ig_handle_hidden text,
  add column if not exists tiktok_handle_hidden text;

create or replace function public.kr8_set_socials_shown(p_show boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); m public.kr8_members;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if coalesce(p_show, true) then
    update public.kr8_members set show_socials = true,
      ig_handle = coalesce(ig_handle, ig_handle_hidden), tiktok_handle = coalesce(tiktok_handle, tiktok_handle_hidden),
      ig_handle_hidden = null, tiktok_handle_hidden = null, updated_at = now()
    where user_id = uid returning * into m;
  else
    update public.kr8_members set show_socials = false,
      ig_handle_hidden = coalesce(ig_handle, ig_handle_hidden), tiktok_handle_hidden = coalesce(tiktok_handle, tiktok_handle_hidden),
      ig_handle = null, tiktok_handle = null, updated_at = now()
    where user_id = uid returning * into m;
  end if;
  if m.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  return jsonb_build_object('show_socials', m.show_socials,
    'ig_handle', coalesce(m.ig_handle, m.ig_handle_hidden), 'tiktok_handle', coalesce(m.tiktok_handle, m.tiktok_handle_hidden));
end $$;

create or replace function public.kr8_set_ig_handle(p_handle text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v text := lower(nullif(btrim(regexp_replace(coalesce(p_handle, ''), '^(https?://(www\.)?instagram\.com/|@)', '', 'i'), ' /'), ''));
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  if v is not null and v !~ '^[a-z0-9_.]{1,30}$' then raise exception 'KR8_BAD_HANDLE'; end if;
  update public.kr8_members set
    ig_handle = case when show_socials then v end, ig_handle_hidden = case when show_socials then null else v end, updated_at = now()
  where user_id = auth.uid();
  if not found then raise exception 'KR8_NO_CARD'; end if;
  return v;
end $$;

create or replace function public.kr8_set_tiktok_handle(p_handle text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v text := btrim(coalesce(p_handle, ''));
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  v := regexp_replace(v, '^(https?://)?((www|m|vm)\.)?tiktok\.com/', '', 'i');
  v := lower(nullif(btrim(split_part(split_part(regexp_replace(v, '^@', ''), '?', 1), '/', 1), ' '), ''));
  if v is not null and v !~ '^[a-z0-9_.]{2,24}$' then raise exception 'KR8_BAD_HANDLE'; end if;
  update public.kr8_members set
    tiktok_handle = case when show_socials then v end, tiktok_handle_hidden = case when show_socials then null else v end, updated_at = now()
  where user_id = auth.uid();
  if not found then raise exception 'KR8_NO_CARD'; end if;
  return v;
end $$;

revoke all on function public.kr8_has_web_link(text), public.kr8_link_try(text), public.kr8_set_socials_shown(boolean) from public;
grant execute on function public.kr8_link_try(text), public.kr8_set_socials_shown(boolean) to authenticated;
grant execute on function public.kr8_has_web_link(text) to authenticated;
