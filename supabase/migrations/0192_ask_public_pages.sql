-- 0192 (21 Nov, founder): Ask BKK question pages for Google / ChatGPT. Two read-only functions for kringapp.com (anon key):
--   kr8_ask_public_page(p_post)  one question + up to 10 visible answers (display first name only, no photos, no ids of people),
--                                plus translations that ALREADY exist in kr8_ask_tr (nothing new is translated here)
--   kr8_ask_public_list()        every public question with at least one visible answer (for /sitemap-ask.xml)
-- Public = the same rules as signed-out readers (kr8_ask_q_ok / kr8_ask_a_ok with no viewer) AND the author is a real, visible member:
-- never ghost / paused, test, or under-18-held authors; photo-only answers waiting for their check are left out (empty text).
-- Nothing is written. UNDO: 0192_ask_public_pages_UNDO.sql
begin;

create or replace function public.kr8_ask_pub_author_ok(p_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_uid is not null and (public.kr8_is_team(p_uid) or (exists (select 1 from public.kr8_members m where m.user_id = p_uid)
    and not public.kr8_is_ghost(p_uid) and not public.kr8_is_test_member(p_uid) and not public.kr8_minor_held(p_uid)))
$$;
revoke all on function public.kr8_ask_pub_author_ok(uuid) from public, anon, authenticated;

create or replace function public.kr8_ask_pub_answers(p_post uuid)
returns setof public.kr8_ask_answers language sql stable security definer set search_path = public, pg_temp as $$
  select a.* from public.kr8_ask_answers a
  where a.post_id = p_post and a.parent_id is null and not a.hidden and btrim(coalesce(a.body, '')) <> ''
    and public.kr8_ask_a_ok(null, a.id) and public.kr8_ask_pub_author_ok(a.author)
$$;
revoke all on function public.kr8_ask_pub_answers(uuid) from public, anon, authenticated;

create or replace function public.kr8_ask_public_page(p_post uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with q as (select p.* from public.kr8_posts p
             where p.id = p_post and public.kr8_ask_q_ok(null, p.id) and public.kr8_ask_pub_author_ok(p.author)
               and btrim(coalesce(p.body, '')) <> ''),
       a as (select x.* from q, lateral public.kr8_ask_pub_answers(q.id) x)
  select case when not exists (select 1 from a) then null else (
    select jsonb_build_object('id', q.id, 'q', q.body, 'area', coalesce(nullif(q.area, ''), 'Bangkok'), 'at', q.created_at,
      'updated', (select max(created_at) from a), 'n', (select count(*)::int from a),
      'tr', (select coalesce(jsonb_object_agg(t.target, t.text), '{}'::jsonb) from public.kr8_ask_tr t
             where t.kind = 'q' and t.ref = q.id and nullif(btrim(t.text), '') is not null),
      'answers', (select coalesce(jsonb_agg(jsonb_build_object('body', x.body, 'at', x.created_at, 'score', x.score,
                    'name', nullif(public.kr8_ask_person(x.author) ->> 'name', ''), 'local', coalesce((public.kr8_ask_person(x.author) ->> 'local')::boolean, false),
                    'team', public.kr8_is_team(x.author),
                    'tr', (select coalesce(jsonb_object_agg(t.target, t.text), '{}'::jsonb) from public.kr8_ask_tr t
                           where t.kind = 'a' and t.ref = x.id and nullif(btrim(t.text), '') is not null))
                  order by x.score desc, x.created_at), '[]'::jsonb)
                  from (select * from a order by score desc, created_at limit 10) x))
    from q) end
$$;

create or replace function public.kr8_ask_public_list()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'updated', s.updated, 'tr', s.tr) order by s.updated desc), '[]'::jsonb)
  from (
    select p.id, (select max(x.created_at) from public.kr8_ask_pub_answers(p.id) x) as updated,
           (select coalesce(jsonb_agg(t.target), '[]'::jsonb) from public.kr8_ask_tr t where t.kind = 'q' and t.ref = p.id and nullif(btrim(t.text), '') is not null) as tr
    from public.kr8_posts p
    where p.kind = 'ask' and public.kr8_ask_q_ok(null, p.id) and public.kr8_ask_pub_author_ok(p.author) and btrim(coalesce(p.body, '')) <> ''
    order by p.created_at desc limit 5000
  ) s where s.updated is not null
$$;
revoke all on function public.kr8_ask_public_page(uuid), public.kr8_ask_public_list() from public;
grant execute on function public.kr8_ask_public_page(uuid), public.kr8_ask_public_list() to anon, authenticated;
commit;
