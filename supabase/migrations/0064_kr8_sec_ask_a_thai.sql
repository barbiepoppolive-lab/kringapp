-- 0064 · SECURITY AUDIT 16 Nov (finding H3) for Ask a Thai. WRITTEN, NOT APPLIED. Apply right after 0057.
-- Reconciled with 0057 (16 Nov): the SAFE SECTION below is byte-identical to the one inside 0057, so
--   · 0057 (this branch) then 0064: 0064 re-states the same objects, nothing changes;
--   · an older 0057 (branch ask-a-thai, 1b768cb) then 0064: 0064 brings it to exactly the same end state.
-- It refuses to run before 0057 (the Ask a Thai tables must exist).
-- Photos: the GPS location inside photo files is removed on the phone (src/v8/askThai.ts re-saves every photo), not here.
-- UNDO: see the UNDO list at the top of 0057 (the objects are the same).
begin;
do $$ begin
  if to_regclass('public.kr8_ask_answers') is null then raise exception 'Apply 0057_kr8_ask_a_thai.sql first'; end if;
end $$;

-- ═══════════════ SAFE SECTION (security audit 16 Nov, H3) ═══════════════
-- This whole section is byte-identical in 0057 and 0064, so 0057 alone, 0057 + 0064, or an older 0057 + this 0064 all end
-- in the same state (supabase/tests/0064_ask_safe_test.sql checks that the function bodies match).
--   · blocks (and ghost mode, via kr8_is_blocked) both ways: no seeing, answering, replying or voting (KR8_BLOCKED)
--   · signed-out visitors: no member ids (a per-call stand-in key instead), no member photos, no photo paths (they hold the id)
--   · report a question (existing kr8_report_reel flow, kr8_reports.post_id) or an answer (kr8_reports.ask_answer_id);
--     the reporter stops seeing it at once, 3 different reporters hide it for everyone until the admin decides
--   · two quick taps on a vote cannot count twice

alter table public.kr8_reports add column if not exists ask_answer_id uuid references public.kr8_ask_answers(id) on delete set null;
create index if not exists kr8_reports_ask_answer on public.kr8_reports (ask_answer_id) where ask_answer_id is not null;
create table if not exists public.kr8_ask_answer_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_id uuid not null references public.kr8_ask_answers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, answer_id)
);
alter table public.kr8_ask_answer_hidden enable row level security;
revoke all on public.kr8_ask_answer_hidden, public.kr8_ask_answers, public.kr8_ask_votes from anon, authenticated;   -- RPCs only

-- the older 2-argument helper is replaced by the 3-argument one below
drop function if exists public.kr8_ask_answer_json(public.kr8_ask_answers, uuid);

-- member id for signed-in callers; for visitors a stand-in that only groups one answer's rows (new salt every call)
create or replace function public.kr8_ask_key(p_uid uuid, p_salt text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_uid is null then null when auth.uid() is null then 'v' || left(md5(coalesce(p_salt, '') || p_uid::text), 16) else p_uid::text end
$$;

-- can this viewer see this question / answer? (null viewer = signed-out visitor)
create or replace function public.kr8_ask_q_ok(p_viewer uuid, p_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_posts p
    where p.id = p_id and p.kind = 'ask' and not coalesce(p.hidden, false) and coalesce(p.status::text, 'approved') not in ('hidden', 'rejected', 'pending')
      and (p_viewer is null or (not public.kr8_is_blocked(p_viewer, p.author)
           and not exists (select 1 from public.kr8_post_hidden h where h.user_id = p_viewer and h.post_id = p.id))))
$$;
create or replace function public.kr8_ask_a_ok(p_viewer uuid, p_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_ask_answers a
    where a.id = p_id and not a.hidden
      and (p_viewer is null or (not public.kr8_is_blocked(p_viewer, a.author)
           and not exists (select 1 from public.kr8_ask_answer_hidden h where h.user_id = p_viewer and h.answer_id = a.id))))
$$;

create or replace function public.kr8_ask_person(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', coalesce(m.first_name, ''), 'photo', case when auth.uid() is null then null else nullif(m.photo, '') end, 'local', m.who = 'local')
  from public.kr8_members m where m.user_id = p_uid
$$;

create or replace function public.kr8_ask_answer_json(a public.kr8_ask_answers, p_viewer uuid, p_salt text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', a.id, 'parent_id', a.parent_id, 'author_id', public.kr8_ask_key(a.author, p_salt), 'body', a.body,
    'media_path', case when p_viewer is null then null else a.media_path end, 'media_kind', case when p_viewer is null then null else a.media_kind end,
    'score', a.score, 'created_at', a.created_at,
    'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = p_viewer and v.target_kind = 'a' and v.target_id = a.id), 0))
$$;

create or replace function public.kr8_ask_feed(p_before timestamptz default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with s as materialized (select auth.uid() as v, gen_random_uuid()::text as salt),
  q as (
    select p.* from public.kr8_posts p
    where p.kind = 'ask' and public.kr8_ask_q_ok((select v from s), p.id) and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ),
  vis as (
    select a.* from public.kr8_ask_answers a join q on q.id = a.post_id
    where public.kr8_ask_a_ok((select v from s), a.id) and (a.parent_id is null or public.kr8_ask_a_ok((select v from s), a.parent_id))
  ),
  top as (select distinct on (vis.post_id) vis.* from vis where vis.parent_id is null order by vis.post_id, vis.score desc, vis.created_at asc),
  items as (
    select q.created_at, jsonb_build_object(
      'id', q.id, 'author_id', public.kr8_ask_key(q.author, s.salt), 'area', q.area, 'body', q.body, 'details', q.ask_details,
      'media_path', case when s.v is null then null else q.ask_media_path end, 'media_kind', case when s.v is null then null else q.ask_media_kind end,
      'score', q.ask_score, 'created_at', q.created_at,
      'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = s.v and v.target_kind = 'q' and v.target_id = q.id), 0),
      'answers', (select count(*)::int from vis where vis.post_id = q.id),
      'top', (select public.kr8_ask_answer_json(t, s.v, s.salt) from top t where t.post_id = q.id)) as j,
      q.author, (select t.author from top t where t.post_id = q.id) as top_author
    from q cross join s
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(i.j order by i.created_at desc) from items i), '[]'::jsonb),
    'people', coalesce((select jsonb_object_agg(public.kr8_ask_key(u.id, s.salt), public.kr8_ask_person(u.id))
                        from (select author as id from items union select top_author from items where top_author is not null) u cross join s), '{}'::jsonb))
$$;

create or replace function public.kr8_ask_thread(p_post uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with s as materialized (select auth.uid() as v, gen_random_uuid()::text as salt),
  q as (select p.* from public.kr8_posts p where p.id = p_post and public.kr8_ask_q_ok((select v from s), p.id)),
  ans as (
    select a.* from public.kr8_ask_answers a join q on q.id = a.post_id
    where public.kr8_ask_a_ok((select v from s), a.id) and (a.parent_id is null or public.kr8_ask_a_ok((select v from s), a.parent_id))
  )
  select case when not exists (select 1 from q) then null else jsonb_build_object(
    'q', (select jsonb_build_object('id', q.id, 'author_id', public.kr8_ask_key(q.author, s.salt), 'area', q.area, 'body', q.body, 'details', q.ask_details,
            'media_path', case when s.v is null then null else q.ask_media_path end, 'media_kind', case when s.v is null then null else q.ask_media_kind end,
            'score', q.ask_score, 'created_at', q.created_at,
            'my_vote', coalesce((select v.value from public.kr8_ask_votes v where v.user_id = s.v and v.target_kind = 'q' and v.target_id = q.id), 0),
            'answers', (select count(*)::int from ans), 'top', null) from q cross join s),
    'answers', coalesce((select jsonb_agg(public.kr8_ask_answer_json(a, s.v, s.salt) order by a.created_at) from ans a cross join s), '[]'::jsonb),
    'people', coalesce((select jsonb_object_agg(public.kr8_ask_key(u.id, s.salt), public.kr8_ask_person(u.id))
                        from (select author as id from q union select author from ans) u cross join s), '{}'::jsonb)) end
$$;

create or replace function public.kr8_ask_answer(p_post uuid, p_parent uuid default null, p_body text default '',
  p_media_path text default null, p_media_kind text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); aid uuid; v_au uuid; v_parent uuid; v_pau uuid; v_tau uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid and age_ok_at is not null) then raise exception 'KR8_NO_CARD'; end if;
  select author into v_au from public.kr8_posts where id = p_post and kind = 'ask';
  if v_au is null then raise exception 'KR8_NOT_FOUND'; end if;
  if public.kr8_is_blocked(uid, v_au) then raise exception 'KR8_BLOCKED'; end if;
  if not public.kr8_ask_q_ok(uid, p_post) then raise exception 'KR8_NOT_FOUND'; end if;
  if p_parent is not null then   -- replies stay one level deep: a reply to a reply hangs under the same answer
    select coalesce(a.parent_id, a.id), a.author into v_parent, v_pau from public.kr8_ask_answers a where a.id = p_parent and a.post_id = p_post;
    if v_parent is null then raise exception 'KR8_NOT_FOUND'; end if;
    select author into v_tau from public.kr8_ask_answers where id = v_parent;
    if public.kr8_is_blocked(uid, v_pau) or public.kr8_is_blocked(uid, v_tau) then raise exception 'KR8_BLOCKED'; end if;
    if not public.kr8_ask_a_ok(uid, p_parent) or not public.kr8_ask_a_ok(uid, v_parent) then raise exception 'KR8_NOT_FOUND'; end if;
  end if;
  if coalesce(btrim(p_body), '') = '' and p_media_path is null then raise exception 'KR8_BAD_TEXT'; end if;
  if coalesce(btrim(p_body), '') <> '' and (length(p_body) > 1000 or not public.kr8_text_ok(p_body, 1000)) then raise exception 'KR8_BAD_TEXT'; end if;
  if not public.kr8_ask_media_ok(p_media_path, p_media_kind) then raise exception 'KR8_BAD_FILE'; end if;
  if (select count(*) from public.kr8_ask_answers where author = uid and created_at > now() - interval '1 day') >= 100 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_ask_answers (post_id, parent_id, author, body, media_path, media_kind, score)
  values (p_post, v_parent, uid, btrim(coalesce(p_body, '')), p_media_path, p_media_kind, 1) returning id into aid;
  insert into public.kr8_ask_votes (user_id, target_kind, target_id, value) values (uid, 'a', aid, 1) on conflict do nothing;
  return aid;
end $$;

create or replace function public.kr8_ask_vote(p_kind text, p_id uuid, p_value int)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); old_v int; delta int; s int; v_au uuid; v_post uuid; v_par uuid; v_qau uuid; v_pau uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_kind not in ('q', 'a') or p_value not in (-1, 0, 1) then raise exception 'KR8_BAD_VOTE'; end if;
  if p_kind = 'q' then
    select author into v_au from public.kr8_posts where id = p_id and kind = 'ask';
    if v_au is null then raise exception 'KR8_NOT_FOUND'; end if;
    if public.kr8_is_blocked(uid, v_au) then raise exception 'KR8_BLOCKED'; end if;
    if not public.kr8_ask_q_ok(uid, p_id) then raise exception 'KR8_NOT_FOUND'; end if;
  else
    select author, post_id, parent_id into v_au, v_post, v_par from public.kr8_ask_answers where id = p_id;
    if v_au is null then raise exception 'KR8_NOT_FOUND'; end if;
    select author into v_qau from public.kr8_posts where id = v_post;
    select author into v_pau from public.kr8_ask_answers where id = v_par;
    if public.kr8_is_blocked(uid, v_au) or public.kr8_is_blocked(uid, v_qau) or (v_pau is not null and public.kr8_is_blocked(uid, v_pau)) then raise exception 'KR8_BLOCKED'; end if;
    if not public.kr8_ask_a_ok(uid, p_id) or not public.kr8_ask_q_ok(uid, v_post) or (v_par is not null and not public.kr8_ask_a_ok(uid, v_par)) then raise exception 'KR8_NOT_FOUND'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('kr8_ask_vote:' || uid::text || p_id::text));   -- two quick taps cannot count twice
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

-- Report: p_kind 'q' | 'a', p_reason 'spam' | 'unsafe' | 'block' ('block' also blocks the person).
-- A question goes through the existing Reel report flow (kr8_reports.post_id → admin Reports: Keep / Remove).
-- An answer is a kr8_reports row with ask_answer_id; its reason starts "Ask a Thai answer" (admin Reports: Keep / Remove
-- through kr8_admin_ask_answer). Either way the reporter stops seeing it at once.
create or replace function public.kr8_ask_report(p_kind text, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_au uuid; v_body text; n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind not in ('q', 'a') or p_reason not in ('spam', 'unsafe', 'block') then raise exception 'KR8_BAD_REASON'; end if;
  if p_kind = 'q' then
    if not exists (select 1 from public.kr8_posts where id = p_id and kind = 'ask') then raise exception 'KR8_NOT_FOUND'; end if;
    perform public.kr8_report_reel(p_id, p_reason, null);
    return;
  end if;
  select author, body into v_au, v_body from public.kr8_ask_answers where id = p_id;
  if v_au is null then raise exception 'KR8_NOT_FOUND'; end if;
  if v_au = uid then raise exception 'KR8_OWN'; end if;
  if not exists (select 1 from public.kr8_reports where reporter = uid and ask_answer_id = p_id and handled_at is null) then
    if (select count(*) from public.kr8_reports where reporter = uid and created_at > now() - interval '1 day') >= 30 then raise exception 'KR8_SLOW_DOWN'; end if;
    insert into public.kr8_reports (reporter, target_user, ask_answer_id, category, reason)
    values (uid, v_au, p_id, p_reason, left('Ask a Thai answer · ' || p_reason || ': “' || left(coalesce(nullif(btrim(v_body), ''), '(photo)'), 200) || '”', 300));
    select count(distinct reporter) into n from public.kr8_reports where ask_answer_id = p_id and handled_at is null;
    if n >= 3 then update public.kr8_ask_answers set hidden = true where id = p_id; end if;
  end if;
  insert into public.kr8_ask_answer_hidden (user_id, answer_id) values (uid, p_id) on conflict do nothing;
  if p_reason = 'block' then insert into public.kr8_blocks (blocker, blocked) values (uid, v_au) on conflict do nothing; end if;
end $$;

-- admin: keep (show the answer again) or remove (hide it for everyone); closes every open report on that answer
create or replace function public.kr8_admin_ask_answer(p_report uuid, p_action text)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_a uuid; n int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_action not in ('keep', 'remove') then raise exception 'KR8_BAD_ACTION'; end if;
  select ask_answer_id into v_a from public.kr8_reports where id = p_report;
  if v_a is null then raise exception 'KR8_NO_REPORT'; end if;
  update public.kr8_ask_answers set hidden = (p_action = 'remove') where id = v_a;
  update public.kr8_reports set handled_at = now(), handled_by = auth.uid(), resolution = case when p_action = 'remove' then 'removed' else 'kept' end
   where ask_answer_id = v_a and handled_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.kr8_ask_key(uuid, text) from public, anon, authenticated;
revoke all on function public.kr8_ask_q_ok(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kr8_ask_a_ok(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kr8_ask_person(uuid) from public, anon, authenticated;
revoke all on function public.kr8_ask_answer_json(public.kr8_ask_answers, uuid, text) from public, anon, authenticated;
grant execute on function public.kr8_ask_feed(timestamptz, int) to anon, authenticated;
grant execute on function public.kr8_ask_thread(uuid) to anon, authenticated;
revoke all on function public.kr8_ask_answer(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.kr8_ask_vote(text, uuid, int) from public, anon;
revoke all on function public.kr8_ask_report(text, uuid, text) from public, anon;
revoke all on function public.kr8_admin_ask_answer(uuid, text) from public, anon;
grant execute on function public.kr8_ask_answer(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.kr8_ask_vote(text, uuid, int) to authenticated;
grant execute on function public.kr8_ask_report(text, uuid, text) to authenticated;
grant execute on function public.kr8_admin_ask_answer(uuid, text) to authenticated;
-- ═══════════════ end of SAFE SECTION ═══════════════

commit;
