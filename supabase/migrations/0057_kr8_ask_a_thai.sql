-- 0057 · Ask a Thai: an open question-and-answer timeline on the Feed (founder-approved "Screen 2", 16 Nov 2026).
--
-- NOT APPLIED. Written 16 Nov with the app build that shows Feed › "Reels · Ask a Thai". Until this runs, the app keeps the
-- Ask a Thai screen on a local store in the phone's tab (nothing is saved), so applying it is what makes posts real.
--
-- ADDITIVE. Nothing is dropped, renamed or re-created with a different signature. One existing body changes by one line:
--   kr8_feed (section 9) leaves out kind 'ask', so questions cannot crowd Reels out of the Reels feed.
--   Questions stay in public.kr8_posts (kind = 'ask', the kind already used by kr8_create_post / kr8_feed). New columns only,
--   all nullable or with defaults, so every existing row stays exactly as it is:
--     kr8_posts.ask_details     text      optional details under the question
--     kr8_posts.ask_media_path  text      photo or GIF in storage bucket kr8-ask (<uid>/<uuid>.<ext>)
--     kr8_posts.ask_media_kind  text      'photo' | 'gif'
--     kr8_posts.ask_score       int  0    upvotes minus downvotes (kept by kr8_ask_vote)
--   New tables (RLS on, no policies: read and written only through the SECURITY DEFINER functions below):
--     kr8_ask_answers  answers and one level of replies (parent_id), text / photo / GIF, score
--     kr8_ask_votes    one vote per member per question or answer (+1 / -1)
--   New public storage bucket kr8-ask (5 MB, jpeg / png / webp / gif); members upload only into their own folder.
--   New functions:
--     kr8_ask_feed(before, limit)                      → jsonb {items, people}   anyone (visitors can read)
--     kr8_ask_thread(post)                             → jsonb {q, answers, people}
--     kr8_ask_create(body, details, area, media_path, media_kind) → uuid   members with a card and the 20+ check done
--     kr8_ask_answer(post, parent, body, media_path, media_kind)  → uuid
--     kr8_ask_vote(kind 'q'|'a', id, value -1|0|1)     → int new score
--   People are returned once per call in "people" (member photos are inline images; this keeps each one to one copy).
--
-- CHECKED AGAINST LIVE (16 Nov, read-only):
--   1. live kr8_create_post(p_kind, p_area, p_body, p_photo, p_event_id, p_here) returns uuid and accepts p_kind 'plan' | 'ask'
--      (card check, kr8_area_ok, kr8_text_ok 280, 20 posts a day). kr8_ask_create calls it unchanged.
--   2. it inserts without a status, so the row takes the column default 'approved'. kr8_ask_create now ALSO sets
--      status = 'approved' itself, so a question can never come out "pending" even if that default changes for Reels later.
--   3. live has 0 kind 'ask' rows and 0 kr8_answers rows (the old 280-char answers table stays as it is, unused by this screen).
--   4. kr8_reel*, rankings and Rings only read kind 'reel', and the kr8_posts triggers (kr8_rings_post_trg, kr8_push_reel)
--      return at once for kind 'ask'. kr8_feed DID return kind 'ask' rows (the app hides them, but they used up its 40 rows),
--      so section 9 leaves them out. Note: live kr8_level_of counts non-Reel posts, so questions add to a member's post count.
--   5. no kr8_ask_* table / function, no ask_* column, no kr8-ask bucket and no kr8_ask_* storage policy exists on live.
--   Blocks: a signed-in viewer does not see questions / answers from someone either of them blocked (kr8_is_blocked), and
--   cannot answer the question of someone they blocked. With 0061 (ghost mode) this also hides a ghost, and the ghost guard
--   triggers are added to kr8_ask_answers / kr8_ask_votes whichever of 0057 / 0061 runs second.
--
-- UNDO (only while nothing uses it yet):
--   begin;
--   drop function if exists public.kr8_ask_feed(timestamptz, int);
--   drop function if exists public.kr8_ask_thread(uuid);
--   drop function if exists public.kr8_ask_create(text, text, text, text, text);
--   drop function if exists public.kr8_ask_answer(uuid, uuid, text, text, text);
--   drop function if exists public.kr8_ask_vote(text, uuid, int);
--   drop function if exists public.kr8_ask_person(uuid);
--   drop function if exists public.kr8_ask_answer_json(public.kr8_ask_answers, uuid);
--   drop function if exists public.kr8_ask_media_ok(text, text);
--   drop table if exists public.kr8_ask_votes; drop table if exists public.kr8_ask_answers;
--   drop policy if exists kr8_ask_upload on storage.objects; drop policy if exists kr8_ask_delete_own on storage.objects;
--   (the kr8-ask bucket can stay; delete its files first if it must go)
--   (the four kr8_posts.ask_* columns can stay; they have defaults / are null)
--   kr8_feed: re-run section 9 without the "and p.kind <> 'ask'" line
--   commit;

begin;

-- ───────────────────────── 1. columns on kr8_posts ─────────────────────────
alter table public.kr8_posts add column if not exists ask_details text;
alter table public.kr8_posts add column if not exists ask_media_path text;
alter table public.kr8_posts add column if not exists ask_media_kind text;
alter table public.kr8_posts add column if not exists ask_score int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kr8_posts_ask_media_kind_chk') then
    alter table public.kr8_posts add constraint kr8_posts_ask_media_kind_chk check (ask_media_kind is null or ask_media_kind in ('photo', 'gif'));
  end if;
end $$;
create index if not exists kr8_posts_ask_time on public.kr8_posts (created_at desc) where kind = 'ask';

-- ───────────────────────── 2. answers + votes ─────────────────────────
create table if not exists public.kr8_ask_answers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.kr8_posts(id) on delete cascade,
  parent_id uuid references public.kr8_ask_answers(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  media_path text,
  media_kind text check (media_kind is null or media_kind in ('photo', 'gif')),
  score int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (length(body) <= 1000),
  check (btrim(body) <> '' or media_path is not null)
);
create index if not exists kr8_ask_answers_post on public.kr8_ask_answers (post_id, created_at);
create index if not exists kr8_ask_answers_author on public.kr8_ask_answers (author, created_at desc);
alter table public.kr8_ask_answers enable row level security;

create table if not exists public.kr8_ask_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('q', 'a')),
  target_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);
alter table public.kr8_ask_votes enable row level security;

-- ───────────────────────── 3. storage bucket for photos / GIFs ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kr8-ask', 'kr8-ask', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kr8_ask_upload') then
    create policy kr8_ask_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'kr8-ask' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kr8_ask_delete_own') then
    create policy kr8_ask_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'kr8-ask' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ───────────────────────── 4. helpers ─────────────────────────
-- the file must be the caller's own upload in kr8-ask, and its real type must match photo / gif
create or replace function public.kr8_ask_media_ok(p_path text, p_kind text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_mime text; v_size bigint;
begin
  if p_path is null then return p_kind is null; end if;
  if p_kind not in ('photo', 'gif') then return false; end if;
  if split_part(p_path, '/', 1) <> auth.uid()::text or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$' then return false; end if;
  select metadata->>'mimetype', (metadata->>'size')::bigint into v_mime, v_size from storage.objects where bucket_id = 'kr8-ask' and name = p_path;
  if v_mime is null or coalesce(v_size, 0) > 5242880 then return false; end if;
  return (p_kind = 'gif' and v_mime = 'image/gif') or (p_kind = 'photo' and v_mime in ('image/jpeg', 'image/png', 'image/webp'));
end $$;

create or replace function public.kr8_ask_person(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', coalesce(m.first_name, ''), 'photo', nullif(m.photo, ''), 'local', m.who = 'local')
  from public.kr8_members m where m.user_id = p_uid
$$;

create or replace function public.kr8_ask_answer_json(a public.kr8_ask_answers, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', a.id, 'parent_id', a.parent_id, 'author_id', a.author, 'body', a.body, 'media_path', a.media_path,
    'media_kind', a.media_kind, 'score', a.score, 'created_at', a.created_at,
    'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = p_viewer and v.target_kind = 'a' and v.target_id = a.id), 0))
$$;

-- ───────────────────────── 5. read ─────────────────────────
create or replace function public.kr8_ask_feed(p_before timestamptz default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with q as (
    select p.* from public.kr8_posts p
    where p.kind = 'ask' and not coalesce(p.hidden, false) and coalesce(p.status::text, 'approved') not in ('hidden', 'rejected', 'pending')
      and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), p.author))
      and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ),
  top as (
    select distinct on (a.post_id) a.*
    from public.kr8_ask_answers a join q on q.id = a.post_id
    where a.parent_id is null and not a.hidden and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), a.author))
    order by a.post_id, a.score desc, a.created_at asc
  ),
  items as (
    select q.created_at, jsonb_build_object(
      'id', q.id, 'author_id', q.author, 'area', q.area, 'body', q.body, 'details', q.ask_details,
      'media_path', q.ask_media_path, 'media_kind', q.ask_media_kind, 'score', q.ask_score, 'created_at', q.created_at,
      'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = auth.uid() and v.target_kind = 'q' and v.target_id = q.id), 0),
      'answers', (select count(*)::int from public.kr8_ask_answers a where a.post_id = q.id and not a.hidden
                    and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), a.author))),
      'top', (select public.kr8_ask_answer_json(t, auth.uid()) from top t where t.post_id = q.id)) as j,
      q.author, (select t.author from top t where t.post_id = q.id) as top_author
    from q
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(i.j order by i.created_at desc) from items i), '[]'::jsonb),
    'people', coalesce((select jsonb_object_agg(u.id, public.kr8_ask_person(u.id))
                        from (select author as id from items union select top_author from items where top_author is not null) u), '{}'::jsonb))
$$;

create or replace function public.kr8_ask_thread(p_post uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with q as (
    select p.* from public.kr8_posts p
    where p.id = p_post and p.kind = 'ask' and not coalesce(p.hidden, false) and coalesce(p.status::text, 'approved') not in ('hidden', 'rejected', 'pending')
      and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), p.author))
  ),
  ans as (
    select a.* from public.kr8_ask_answers a join q on q.id = a.post_id
    where not a.hidden and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), a.author))
  )
  select case when not exists (select 1 from q) then null else jsonb_build_object(
    'q', (select jsonb_build_object('id', q.id, 'author_id', q.author, 'area', q.area, 'body', q.body, 'details', q.ask_details,
            'media_path', q.ask_media_path, 'media_kind', q.ask_media_kind, 'score', q.ask_score, 'created_at', q.created_at,
            'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = auth.uid() and v.target_kind = 'q' and v.target_id = q.id), 0),
            'answers', (select count(*)::int from ans), 'top', null) from q),
    'answers', coalesce((select jsonb_agg(public.kr8_ask_answer_json(a, auth.uid()) order by a.created_at) from ans a), '[]'::jsonb),
    'people', coalesce((select jsonb_object_agg(u.id, public.kr8_ask_person(u.id))
                        from (select author as id from q union select author from ans) u), '{}'::jsonb)) end
$$;

-- ───────────────────────── 6. write ─────────────────────────
create or replace function public.kr8_ask_create(p_body text, p_details text default null, p_area text default 'Bangkok',
  p_media_path text default null, p_media_kind text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pid uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid and age_ok_at is not null) then raise exception 'KR8_NO_CARD'; end if;   -- 20+ confirmed on the card
  if length(btrim(coalesce(p_body, ''))) < 3 or length(p_body) > 200 or not public.kr8_text_ok(p_body, 200) then raise exception 'KR8_BAD_TEXT'; end if;
  if coalesce(btrim(p_details), '') <> '' and not public.kr8_text_ok(p_details, 1000) then raise exception 'KR8_BAD_TEXT'; end if;
  if not public.kr8_ask_media_ok(p_media_path, p_media_kind) then raise exception 'KR8_BAD_FILE'; end if;
  if (select count(*) from public.kr8_posts where author = uid and kind = 'ask' and created_at > now() - interval '1 day') >= 20 then raise exception 'KR8_SLOW_DOWN'; end if;
  pid := public.kr8_create_post(p_kind => 'ask', p_area => coalesce(p_area, 'Bangkok'), p_body => btrim(p_body), p_photo => null, p_event_id => null, p_here => false)::uuid;
  update public.kr8_posts set ask_details = nullif(btrim(coalesce(p_details, '')), ''), ask_media_path = p_media_path, ask_media_kind = p_media_kind, ask_score = 1,
         status = 'approved'   -- open forum: a question is live at once, never "pending" (Reels moderation does not apply)
   where id = pid and kind = 'ask';
  insert into public.kr8_ask_votes (user_id, target_kind, target_id, value) values (uid, 'q', pid, 1) on conflict do nothing;   -- your own question starts at +1
  return pid;
end $$;

create or replace function public.kr8_ask_answer(p_post uuid, p_parent uuid default null, p_body text default '',
  p_media_path text default null, p_media_kind text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); aid uuid; v_parent uuid; v_au uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid and age_ok_at is not null) then raise exception 'KR8_NO_CARD'; end if;
  select author into v_au from public.kr8_posts where id = p_post and kind = 'ask' and not coalesce(hidden, false);
  if v_au is null then raise exception 'KR8_NOT_FOUND'; end if;
  if public.kr8_is_blocked(uid, v_au) then raise exception 'KR8_BLOCKED'; end if;
  if coalesce(btrim(p_body), '') = '' and p_media_path is null then raise exception 'KR8_BAD_TEXT'; end if;
  if coalesce(btrim(p_body), '') <> '' and (length(p_body) > 1000 or not public.kr8_text_ok(p_body, 1000)) then raise exception 'KR8_BAD_TEXT'; end if;
  if not public.kr8_ask_media_ok(p_media_path, p_media_kind) then raise exception 'KR8_BAD_FILE'; end if;
  if (select count(*) from public.kr8_ask_answers where author = uid and created_at > now() - interval '1 day') >= 100 then raise exception 'KR8_SLOW_DOWN'; end if;
  if p_parent is not null then   -- replies stay one level deep: a reply to a reply hangs under the same answer
    select coalesce(a.parent_id, a.id) into v_parent from public.kr8_ask_answers a where a.id = p_parent and a.post_id = p_post;
    if v_parent is null then raise exception 'KR8_NOT_FOUND'; end if;
  end if;
  insert into public.kr8_ask_answers (post_id, parent_id, author, body, media_path, media_kind, score)
  values (p_post, v_parent, uid, btrim(coalesce(p_body, '')), p_media_path, p_media_kind, 1) returning id into aid;
  insert into public.kr8_ask_votes (user_id, target_kind, target_id, value) values (uid, 'a', aid, 1) on conflict do nothing;
  return aid;
end $$;

create or replace function public.kr8_ask_vote(p_kind text, p_id uuid, p_value int)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); old_v int; delta int; s int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_kind not in ('q', 'a') or p_value not in (-1, 0, 1) then raise exception 'KR8_BAD_VOTE'; end if;
  if p_kind = 'q' and not exists (select 1 from public.kr8_posts where id = p_id and kind = 'ask') then raise exception 'KR8_NOT_FOUND'; end if;
  if p_kind = 'a' and not exists (select 1 from public.kr8_ask_answers where id = p_id) then raise exception 'KR8_NOT_FOUND'; end if;
  select value into old_v from public.kr8_ask_votes where user_id = uid and target_kind = p_kind and target_id = p_id for update;
  delta := p_value - coalesce(old_v, 0);
  if p_value = 0 then
    delete from public.kr8_ask_votes where user_id = uid and target_kind = p_kind and target_id = p_id;
  else
    insert into public.kr8_ask_votes (user_id, target_kind, target_id, value) values (uid, p_kind, p_id, p_value)
    on conflict (user_id, target_kind, target_id) do update set value = excluded.value, created_at = now();
  end if;
  if p_kind = 'q' then
    update public.kr8_posts set ask_score = ask_score + delta where id = p_id returning ask_score into s;
  else
    update public.kr8_ask_answers set score = score + delta where id = p_id returning score into s;
  end if;
  return s;
end $$;

-- ───────────────────────── 7. who can call what ─────────────────────────
revoke all on function public.kr8_ask_media_ok(text, text) from public, anon;
revoke all on function public.kr8_ask_person(uuid) from public, anon, authenticated;
revoke all on function public.kr8_ask_answer_json(public.kr8_ask_answers, uuid) from public, anon, authenticated;
grant execute on function public.kr8_ask_feed(timestamptz, int) to anon, authenticated;
grant execute on function public.kr8_ask_thread(uuid) to anon, authenticated;
revoke all on function public.kr8_ask_create(text, text, text, text, text) from public, anon;
revoke all on function public.kr8_ask_answer(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.kr8_ask_vote(text, uuid, int) from public, anon;
grant execute on function public.kr8_ask_create(text, text, text, text, text) to authenticated;
grant execute on function public.kr8_ask_answer(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.kr8_ask_vote(text, uuid, int) to authenticated;
grant execute on function public.kr8_ask_media_ok(text, text) to authenticated;

-- ───────────────────────── 8. ghost mode (0061) ─────────────────────────
-- If 0061 is already on, a ghost cannot answer or vote here either. (If 0061 runs after this file, 0061 adds the same two.)
do $$ begin
  if to_regprocedure('public.kr8_ghost_guard_trg()') is not null then
    drop trigger if exists kr8_ghost_ask_answers on public.kr8_ask_answers;
    create trigger kr8_ghost_ask_answers before insert on public.kr8_ask_answers for each row execute function public.kr8_ghost_guard_trg('author', 'refuse');
    drop trigger if exists kr8_ghost_ask_votes on public.kr8_ask_votes;
    create trigger kr8_ghost_ask_votes before insert on public.kr8_ask_votes for each row execute function public.kr8_ghost_guard_trg('user_id', 'refuse');
  end if;
end $$;


-- ───────────────────────── 9. keep questions out of the Reels feed ─────────────────────────
-- kr8_feed returns every kind except unapproved Reels, newest first, 40 rows. The app already drops kind 'ask' rows from the
-- Reels screen, but they would still use up those 40 rows (and carry the asker's inline photo), so a busy Ask a Thai would
-- push Reels out of the feed. Same live body (read 16 Nov; byte-identical to the repo's latest kr8_feed), plus ONE line: and p.kind <> 'ask'.
-- Same arguments, same result columns, same grants. UNDO: re-run this block without that line.
CREATE OR REPLACE FUNCTION public.kr8_feed(p_area text DEFAULT NULL::text, p_limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, kind text, area text, body text, photo text, event_id text, here boolean, created_at timestamp with time zone, author_id uuid, author_name text, author_photo text, author_langs text[], author_who text, mine boolean, answers jsonb, video_path text, poster_path text, duration_ms integer, reel_status text, likes integer, liked boolean, saved boolean, views integer, ig_handle text, venue_id text, venue_name text, venue_name_th text, deal_id text, deal_en text, deal_th text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.id, p.kind, p.area, p.body, p.photo, p.event_id, coalesce(p.here_until > now(), false), p.created_at,
         case when auth.uid() is null then null else p.author end,
         m.first_name,
         case when auth.uid() is null then null else m.photo end,
         m.langs, m.who, p.author = auth.uid(),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'name', am.first_name, 'who', am.who,
                                                       'photo', case when auth.uid() is null then null else am.photo end)
                                    order by a.created_at)
                   from public.kr8_answers a join public.kr8_members am on am.user_id = a.author
                   where a.post_id = p.id and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), a.author))), '[]'::jsonb),
         p.video_path, p.poster_path, p.duration_ms, case when p.kind = 'reel' then p.status end,
         p.likes_count,
         exists (select 1 from public.kr8_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.kr8_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
         case when p.author = auth.uid() or adm.yes then p.views_count end,   -- views: creator + team only
         m.ig_handle,
         v.id, v.name, v.name_th, t.id, t.deal_en, t.deal_th
  from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
  cross join (select public.kr8_is_admin() as yes) adm
  left join public.kr8_venues v on v.id = p.venue_id and v.status = 'live'
  left join lateral (select t.id, t.deal_en, t.deal_th from public.kr8_treats t
                     where t.venue_id = v.id and t.active and (t.ends_at is null or t.ends_at > now())
                     order by t.created_at desc limit 1) t on true
  where not p.hidden
    and (p.kind <> 'reel' or p.status = 'approved' or (p.status = 'pending' and p.author = auth.uid()))
    and p.kind <> 'ask'   -- 0057: questions live in kr8_ask_feed; without this they would push Reels out of the 40-row feed
    and p.created_at > now() - interval '14 days'
    and (p_area is null or p.area = p_area)
    and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), p.author))
    and (auth.uid() is null or not exists (select 1 from public.kr8_post_hidden h where h.user_id = auth.uid() and h.post_id = p.id))
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$function$;

commit;
