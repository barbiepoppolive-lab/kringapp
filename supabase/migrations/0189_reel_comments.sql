-- 0189 (21 Nov, founder-approved): COMMENTS on Reels.
--   · Anyone can read the comments of an approved Reel (signed-out readers get the same photo privacy as Ask BKK: kr8_ask_person).
--   · Only face-checked (verified) members with a card can comment; banned (kr8_prize_bans scope 'all'), paused (ghost), mirror,
--     under-18-held and closed accounts (no card) cannot. Test cards (kr8_is_test_member) may only comment on test Reels, and
--     their comments are only ever seen by other test cards (members never see them).
--   · Server filter (kr8_comment_reason): max 300 characters; no phone numbers, LINE / contact apps, @handles, links,
--     rude / sexual / harassing words (Thai + English) or alcohol. A refused comment returns a reason; nothing is saved.
--   · Max 20 comments per member per Bangkok day, at least 10 s between two comments, no identical repeat on one Reel.
--   · The Reel's creator can delete any comment on it and turn comments off / on; authors delete their own. Anyone signed in can
--     report; 2+ reports from different verified members hide the comment automatically (no founder queue).
--   · The creator sees "X commented on your Reel" in Activity (kr8_my_activity gets one new 'comment' kind; no emails, no push).
--   · Comments earn NO Rings: nothing here touches kr8_post_likes / saves / share opens, kr8_reel_scores or kr8_week_board.
-- All tables have row-level security on and no policies: every read / write goes through the security-definer functions below.
-- Kill switch: insert into kr8_rings_config (key, value, note) values ('comments_on', 0, '...') stops new comments (reading stays).
-- UNDO: 0189_reel_comments_UNDO.sql
begin;

-- ───────────── tables ─────────────
create table if not exists public.kr8_reel_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.kr8_posts(id) on delete cascade,
  author uuid not null references public.kr8_members(user_id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now(),
  hidden boolean not null default false,          -- 2+ reports from different verified members
  hidden_at timestamptz,
  deleted_at timestamptz,                          -- deleted by its author, the Reel's creator or an admin (kept for the record)
  deleted_by uuid
);
create index if not exists kr8_reel_comments_post on public.kr8_reel_comments (post_id, created_at desc) where deleted_at is null and not hidden;
create index if not exists kr8_reel_comments_author on public.kr8_reel_comments (author, created_at desc);

create table if not exists public.kr8_reel_comment_reports (
  comment_id uuid not null references public.kr8_reel_comments(id) on delete cascade,
  reporter uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'other' check (reason in ('rude', 'spam', 'unsafe', 'other')),
  counts boolean not null default false,           -- the reporter was a verified, non-test member when reporting
  created_at timestamptz not null default now(),
  primary key (comment_id, reporter)
);

create table if not exists public.kr8_reel_comments_off (
  post_id uuid primary key references public.kr8_posts(id) on delete cascade,
  off_by uuid,
  off_at timestamptz not null default now()
);

alter table public.kr8_reel_comments enable row level security;
alter table public.kr8_reel_comment_reports enable row level security;
alter table public.kr8_reel_comments_off enable row level security;
revoke all on public.kr8_reel_comments, public.kr8_reel_comment_reports, public.kr8_reel_comments_off from anon, authenticated;

-- ───────────── the filter: null = fine, else the reason ─────────────
create or replace function public.kr8_comment_reason(p_text text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  s text := lower(coalesce(p_text, ''));
begin
  s := regexp_replace(s, '[' || chr(8203) || chr(8204) || chr(8205) || chr(65279) || chr(173) || ']', '', 'g');   -- invisible characters
  s := translate(s, '๐๑๒๓๔๕๖๗๘๙＠：．／', '0123456789@:./');
  if length(btrim(s)) = 0 then return 'empty'; end if;
  if length(p_text) > 300 then return 'long'; end if;
  -- links
  if s ~ '(https?:|www\.|bit\.ly|line\.me|lin\.ee|t\.me/|wa\.me|\.(com|net|org|co|th|io|ly|gg|app|link|shop|xyz|info|asia|cc|tv|site|online|page)(/|\M))' then
    return 'link';
  end if;
  -- phone numbers (9+ digits, spaces / dots / dashes allowed between them)
  if s ~ '\d([\s.()/-]*\d){8,}' then return 'phone'; end if;
  -- LINE IDs and other contact apps
  if s ~ '(\mline\s*(id)?\s*[:=@]|\mid\s*line\M|\mline\s*id\M|\madd\s+(me\s+)?(on\s+)?line\M|ไลน์|ไอดีไลน์|แอดไลน์|\mwhatsapp\M|\mtelegram\M|\mwechat\M|\mkakao|\mig\s*[:=]|\minstagram\s*[:=]|ไอจี\s*[:=]|\mtiktok\s*[:=]|\mfb\s*[:=]|\mdm\s+me\M|\minbox\s+me\M)' then
    return 'contact';
  end if;
  -- @handles
  if s ~ '@\s*[a-z0-9_.ก-๙]{2,}' then return 'handle'; end if;
  -- rude, sexual or harassing (English)
  if s ~ '\m(fuck\w*|fck\w*|fuk\w*|motherf\w*|shit\w*|bullshit|bitch\w*|cunt\w*|dick|dickhead|cock|pussy|whore\w*|slut\w*|bastard\w*|asshole\w*|arsehole\w*|nigg\w*|retard\w*|fag|faggot\w*|wtf|stfu|kys|idiot\w*|stupid|moron\w*|loser\w*|ugly|dumbass|sex|sexy|sexual|nude\w*|naked|porn\w*|horny|boob\w*|tit|tits|titties|blowjob\w*|onlyfans|escort\w*|hooker\w*|prostitut\w*|rape\w*|rapist|cum|milf|thot)\M'
     or s ~ 'f[^a-z0-9ก-๙]*[u*@0v][^a-z0-9ก-๙]*c[^a-z0-9ก-๙]*k'
     or s ~ '(kill\s+(your\s*self|urself)|go\s+die\M)' then
    return 'rude';
  end if;
  -- rude, sexual or harassing (Thai)
  if s ~ '(ควย|เหี้ย|เหี่ย|เฮี้ย|เย็ด|มึง|สัส|ไอ้สัด|อีสัด|ส้นตีน|อีดอก|ดอกทอง|กะหรี่|โสเภณี|ร่าน|อีตัว|ขายตัว|ขายบริการ|เงี่ยน|หี(?![บด])|แตด|จัญไร|ระยำ|ชาติหมา|สันดาน|สัตว์นรก|ไอ้สัตว์|อีสัตว์|ไอ้ควาย|อีควาย|ไอ้โง่|อีโง่|ปัญญาอ่อน|อีบ้า|ไอ้บ้า|เสือก|แม่ง(?!าน)|พ่อง|อีเวร|ไอ้เวร|ชักว่าว|โป๊(?!ะ)|เปลือย|หื่น|ลามก|ข่มขืน|ตายซะ|ไปตาย|xxx|18\+)' then
    return 'rude';
  end if;
  -- alcohol (no alcohol promotion on Kring)
  if s ~ '\m(beer|beers|alcohol\w*|booze|liquor\w*|whisk(e)?y|vodka|wine|wines|cocktail\w*|tequila|rum|gin|soju|happy\s*hour|drunk|bottomless|free\s*flow|freeflow)\M'
     or s ~ '(เบียร์|เหล้า|แอลกอฮอ|ค็อกเทล|ค๊อกเทล|คอกเทล|ไวน์|วิสกี้|วอดก้า|โซจู|สุรา(?!ษ)|เมา(?!ส์)|ฟรีโฟลว์)' then
    return 'alcohol';
  end if;
  return null;
end $$;

-- ───────────── who can see what ─────────────
-- the Reel's author when the Reel is open for comments to this viewer (approved, not hidden, not blocked); test cards see test Reels
create or replace function public.kr8_comment_reel(p_post uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.kr8_reel_open(p_post),
    (select p.author from public.kr8_posts p
      where p.id = p_post and p.kind = 'reel' and not p.hidden and p.status = 'approved'
        and auth.uid() is not null and public.kr8_is_test_member(auth.uid()) and public.kr8_is_test_member(p.author)))
$$;

-- a comment's author is visible to this viewer (members never see ghost / test / held authors; blocks both ways)
create or replace function public.kr8_comment_author_ok(p_author uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_author = auth.uid()
      or (auth.uid() is not null and public.kr8_is_test_member(auth.uid()) and public.kr8_is_test_member(p_author))
      or (not public.kr8_is_ghost(p_author) and not public.kr8_is_test_member(p_author) and not public.kr8_minor_held(p_author)
          and not public.kr8_is_blocked(auth.uid(), p_author))
$$;

-- why this viewer can't comment right now (null = can)
create or replace function public.kr8_comment_block(p_post uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); m record; v_author uuid;
begin
  if uid is null then return 'signin'; end if;
  v_author := public.kr8_comment_reel(p_post);
  if v_author is null then return 'no_reel'; end if;
  if exists (select 1 from public.kr8_reel_comments_off o where o.post_id = p_post) then return 'off'; end if;
  if public.kr8_rcfg('comments_on', 1) <> 1 then return 'off'; end if;
  select * into m from public.kr8_members where user_id = uid;
  if not found then return 'no_card'; end if;
  if public.kr8_is_mirror(uid) then return 'banned'; end if;
  if exists (select 1 from public.kr8_prize_bans b where b.user_id = uid and b.scope = 'all') then return 'banned'; end if;
  if public.kr8_minor_held(uid) then return 'banned'; end if;
  if coalesce(m.ghost, false) and not public.kr8_is_test_member(uid) then return 'banned'; end if;
  if public.kr8_is_test_member(uid) and not public.kr8_is_test_member(v_author) then return 'banned'; end if;   -- test cards never comment on real Reels
  if not coalesce(m.verified, false) then return 'verify'; end if;
  return null;
end $$;

-- ───────────── read ─────────────
-- {post_id, n, off, can ('ok' | reason), creator (I made this Reel), items: [{id, author_id, name, photo, official, body, at, mine}]}
create or replace function public.kr8_reel_comments(p_post uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_author uuid; v_items jsonb; v_n int; v_block text;
begin
  v_author := public.kr8_comment_reel(p_post);
  if v_author is null then return jsonb_build_object('post_id', p_post, 'n', 0, 'off', false, 'can', 'no_reel', 'creator', false, 'items', '[]'::jsonb); end if;
  select count(*)::int into v_n from public.kr8_reel_comments c
   where c.post_id = p_post and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
     and not exists (select 1 from public.kr8_reel_comment_reports r where r.comment_id = c.id and r.reporter = uid);
  select coalesce(jsonb_agg(x order by (x ->> 'at')), '[]'::jsonb) into v_items from (
    select jsonb_build_object('id', c.id, 'author_id', c.author, 'body', c.body, 'at', c.created_at, 'mine', c.author = uid)
           || jsonb_build_object('name', pp ->> 'name', 'photo', pp ->> 'photo', 'official', coalesce((pp ->> 'official')::boolean, false)) x
    from public.kr8_reel_comments c
    cross join lateral (select public.kr8_ask_person(c.author) pp) a
    where c.post_id = p_post and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
      and not exists (select 1 from public.kr8_reel_comment_reports r where r.comment_id = c.id and r.reporter = uid)
    order by c.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) q;
  v_block := public.kr8_comment_block(p_post);
  return jsonb_build_object('post_id', p_post, 'n', v_n,
    'off', exists (select 1 from public.kr8_reel_comments_off o where o.post_id = p_post),
    'can', coalesce(v_block, 'ok'), 'creator', uid is not null and v_author = uid, 'items', v_items);
end $$;

-- comment counts for a batch of feed Reels: [{post_id, n, off}]
create or replace function public.kr8_comment_counts(p_posts uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id,
      'n', (select count(*) from public.kr8_reel_comments c
             where c.post_id = p.id and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
               and not exists (select 1 from public.kr8_reel_comment_reports r where r.comment_id = c.id and r.reporter = auth.uid())),
      'off', exists (select 1 from public.kr8_reel_comments_off o where o.post_id = p.id))), '[]'::jsonb)
  from public.kr8_posts p
  where p.id = any ((coalesce(p_posts, '{}'::uuid[]))[1:100]) and p.kind = 'reel' and not p.hidden and p.status = 'approved'
$$;

-- ───────────── write ─────────────
-- {ok: true, comment: {...}, n} or {ok: false, reason: 'signin' | 'no_card' | 'verify' | 'banned' | 'off' | 'no_reel' | 'empty' |
--  'long' | 'link' | 'phone' | 'contact' | 'handle' | 'rude' | 'alcohol' | 'daily' | 'slow' | 'repeat'}
create or replace function public.kr8_comment_add(p_post uuid, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_block text; v_reason text; v_body text; v_last timestamptz; v_day int; v_id uuid; v_at timestamptz; pp jsonb;
begin
  v_block := public.kr8_comment_block(p_post);
  if v_block is not null then return jsonb_build_object('ok', false, 'reason', v_block); end if;
  v_body := btrim(regexp_replace(coalesce(p_body, ''), '\s*\n\s*\n[\s\n]*', E'\n\n', 'g'));
  v_reason := public.kr8_comment_reason(v_body);
  if v_reason is not null then return jsonb_build_object('ok', false, 'reason', v_reason); end if;
  perform pg_advisory_xact_lock(hashtext('kr8_comment:' || uid::text));
  select max(created_at) into v_last from public.kr8_reel_comments where author = uid;
  if v_last is not null and v_last > now() - interval '10 seconds' then return jsonb_build_object('ok', false, 'reason', 'slow'); end if;
  select count(*)::int into v_day from public.kr8_reel_comments
   where author = uid and created_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  if v_day >= 20 then return jsonb_build_object('ok', false, 'reason', 'daily'); end if;
  if exists (select 1 from public.kr8_reel_comments where author = uid and post_id = p_post and lower(body) = lower(v_body)
              and deleted_at is null and created_at > now() - interval '1 day') then
    return jsonb_build_object('ok', false, 'reason', 'repeat');
  end if;
  insert into public.kr8_reel_comments (post_id, author, body) values (p_post, uid, v_body) returning id, created_at into v_id, v_at;
  pp := public.kr8_ask_person(uid);
  return jsonb_build_object('ok', true, 'n', (select count(*) from public.kr8_reel_comments c where c.post_id = p_post and c.deleted_at is null
                                                  and not c.hidden and public.kr8_comment_author_ok(c.author)),
    'comment', jsonb_build_object('id', v_id, 'author_id', uid, 'body', v_body, 'at', v_at, 'mine', true,
      'name', pp ->> 'name', 'photo', pp ->> 'photo', 'official', coalesce((pp ->> 'official')::boolean, false)));
end $$;

-- the comment's author, the Reel's creator or an admin
create or replace function public.kr8_comment_delete(p_comment uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c record;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_is_mirror(uid) then raise exception 'KR8_MIRROR'; end if;
  select rc.*, p.author as reel_author into c from public.kr8_reel_comments rc join public.kr8_posts p on p.id = rc.post_id where rc.id = p_comment;
  if not found or c.deleted_at is not null then return jsonb_build_object('ok', true); end if;
  if c.author <> uid and c.reel_author <> uid and not public.kr8_is_admin() then raise exception 'KR8_NOT_YOURS'; end if;
  update public.kr8_reel_comments set deleted_at = now(), deleted_by = uid where id = p_comment;
  return jsonb_build_object('ok', true);
end $$;

-- any signed-in member with a card; 2+ reports from different verified (non-test) members hide it for everyone
create or replace function public.kr8_comment_report(p_comment uuid, p_reason text default 'other')
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); c record; v_counts boolean; v_n int; v_hidden boolean := false;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_is_mirror(uid) then raise exception 'KR8_MIRROR'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  select * into c from public.kr8_reel_comments where id = p_comment;
  if not found or c.deleted_at is not null then return jsonb_build_object('ok', true, 'hidden', true); end if;
  if c.author = uid then raise exception 'KR8_OWN_COMMENT'; end if;
  if public.kr8_comment_reel(c.post_id) is null then raise exception 'KR8_NO_REEL'; end if;
  -- a test card's report only counts on test comments; a member's report only on member comments
  v_counts := exists (select 1 from public.kr8_members m where m.user_id = uid and m.verified
                        and (not coalesce(m.ghost, false) or public.kr8_is_test_member(uid)))
              and not exists (select 1 from public.kr8_prize_bans b where b.user_id = uid and b.scope = 'all')
              and public.kr8_is_test_member(uid) = public.kr8_is_test_member(c.author);
  insert into public.kr8_reel_comment_reports (comment_id, reporter, reason, counts)
  values (p_comment, uid, case when p_reason in ('rude', 'spam', 'unsafe', 'other') then p_reason else 'other' end, v_counts)
  on conflict (comment_id, reporter) do nothing;
  select count(*)::int into v_n from public.kr8_reel_comment_reports where comment_id = p_comment and counts;
  if v_n >= 2 and not c.hidden then
    update public.kr8_reel_comments set hidden = true, hidden_at = now() where id = p_comment;
    v_hidden := true;
  end if;
  return jsonb_build_object('ok', true, 'hidden', v_hidden or c.hidden);
end $$;

-- the Reel's creator (or an admin) turns comments off / on for that Reel. Existing comments stay; nobody can add new ones.
create or replace function public.kr8_comments_set_off(p_post uuid, p_off boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_author uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_is_mirror(uid) then raise exception 'KR8_MIRROR'; end if;
  select author into v_author from public.kr8_posts where id = p_post and kind = 'reel';
  if v_author is null then raise exception 'KR8_NO_REEL'; end if;
  if v_author <> uid and not public.kr8_is_admin() then raise exception 'KR8_NOT_YOURS'; end if;
  if p_off then
    insert into public.kr8_reel_comments_off (post_id, off_by) values (p_post, uid) on conflict (post_id) do nothing;
  else
    delete from public.kr8_reel_comments_off where post_id = p_post;
  end if;
  return jsonb_build_object('ok', true, 'off', p_off);
end $$;

revoke all on function public.kr8_comment_reason(text) from public, anon, authenticated;
revoke all on function public.kr8_comment_reel(uuid) from public, anon, authenticated;
revoke all on function public.kr8_comment_author_ok(uuid) from public, anon, authenticated;
revoke all on function public.kr8_comment_block(uuid) from public, anon, authenticated;
revoke all on function public.kr8_reel_comments(uuid, int) from public;
revoke all on function public.kr8_comment_counts(uuid[]) from public;
revoke all on function public.kr8_comment_add(uuid, text) from public, anon;
revoke all on function public.kr8_comment_delete(uuid) from public, anon;
revoke all on function public.kr8_comment_report(uuid, text) from public, anon;
revoke all on function public.kr8_comments_set_off(uuid, boolean) from public, anon;
grant execute on function public.kr8_reel_comments(uuid, int) to anon, authenticated;
grant execute on function public.kr8_comment_counts(uuid[]) to anon, authenticated;
grant execute on function public.kr8_comment_add(uuid, text) to authenticated;
grant execute on function public.kr8_comment_delete(uuid) to authenticated;
grant execute on function public.kr8_comment_report(uuid, text) to authenticated;
grant execute on function public.kr8_comments_set_off(uuid, boolean) to authenticated;

-- ───────────── Activity: "X commented on your Reel" (one line per Reel per Bangkok day: latest commenter + how many) ─────────────
-- Same as the live version (0182) plus the 'comment' branch; "prize" carries the latest comment's first 80 characters.
create or replace function public.kr8_my_activity(p_limit integer default 50)
 returns table(kind text, at timestamp with time zone, actor_id uuid, actor_name text, actor_photo text, post_id uuid, poster_path text, n integer, rank integer, prize text, i_follow boolean)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  return query
  select * from (
    -- someone followed me
    select 'follow'::text, f.created_at, f.follower, m.first_name, m.photo, null::uuid, null::text, 1, null::int, null::text,
           exists (select 1 from public.kr8_follows x where x.follower = uid and x.followee = f.follower)
    from public.kr8_follows f join public.kr8_members m on m.user_id = f.follower
    where f.followee = uid and not public.kr8_is_blocked(uid, f.follower)
    union all
    -- likes on my Reels, one line per Reel per Bangkok day: latest liker + how many
    select 'like', max(l.created_at), (array_agg(l.user_id order by l.created_at desc))[1],
           (array_agg(m.first_name order by l.created_at desc))[1], (array_agg(m.photo order by l.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, null, null, null
    from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members m on m.user_id = l.user_id
    where p.author = uid and not public.kr8_is_blocked(uid, l.user_id)
    group by p.id, p.poster_path, (l.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- 0189: comments on my Reels, one line per Reel per Bangkok day: latest commenter + how many (never my own comments)
    select 'comment', max(c.created_at), (array_agg(c.author order by c.created_at desc))[1],
           (array_agg(m.first_name order by c.created_at desc))[1], (array_agg(m.photo order by c.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, null, left((array_agg(c.body order by c.created_at desc))[1], 80), null
    from public.kr8_reel_comments c join public.kr8_posts p on p.id = c.post_id join public.kr8_members m on m.user_id = c.author
    where p.author = uid and c.author <> uid and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
    group by p.id, p.poster_path, (c.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- 0182: at most ONE friend-verify line per Bangkok day: an unverified member liked one of my board-v2 Reels
    select 'friend_verify', max(l.created_at) + interval '1 second', (array_agg(l.user_id order by l.created_at desc))[1],
           (array_agg(m.first_name order by l.created_at desc))[1], (array_agg(m.photo order by l.created_at desc))[1],
           (array_agg(p.id order by l.created_at desc))[1], (array_agg(p.poster_path order by l.created_at desc))[1],
           count(distinct l.user_id)::int, null, null, null
    from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members m on m.user_id = l.user_id
    where p.author = uid and l.user_id <> uid and public.kr8_rcfg('friend_verify_nudge_on', 1) = 1
      and not coalesce(m.verified, false) and not coalesce(m.ghost, false) and not public.kr8_is_team(l.user_id)
      and not public.kr8_is_blocked(uid, l.user_id) and not public.kr8_linked(l.user_id, uid)
      and (p.created_at >= to_timestamp(public.kr8_rcfg('board_v2_from', 2147483647)) or public.kr8_is_test_member(uid))
    group by (l.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- Top 5 gifts won (old manual awards)
    select 'gift', a.awarded_at, null, null, null, p.id, p.poster_path, 1, a.rank, a.prize, null
    from public.kr8_reel_awards a join public.kr8_posts p on p.id = a.reel_id where p.author = uid
    union all
    -- my Reel was approved by the team
    select 'approved', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, null, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'approved' and p.reviewed_at is not null and not p.hidden
    union all
    -- my Reel was hidden by the team (audit P2-3): the reason travels in "prize"
    select 'hidden', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, p.review_note, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'hidden' and p.reviewed_at is not null
  ) a
  order by 2 desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $function$;

commit;
