-- m216 (25 Nov 2026, founder decision) first-visit steps become four, in this order:
--   1 vote on 1 This-or-That (no face check) · 2 answer 1 Ask BKK question (face check, as before) · 3 like 3 Reels ·
--   4 post your first clip. "Bangkok Local ✓" after all four (tag only, no Rings). Progress n/4.
-- Replaces 5 functions (exact old bodies in m216_onb_four_steps_RESTORE.sql; rollback m216_onb_four_steps_UNDO.sql):
--   kr8_onb_state      + 'vote' and 'steps' fields; the badge needs the vote too (tags already given stay)
--   kr8_task_vote      no face check (m207 gate removed for the vote only; the Rings claim stays face-gated)
--   kr8_tasks_today    an unchecked member gets today's vote card in a top-level 'vote' field (no tasks, no Rings)
--   kr8_task_vote_who  an unchecked viewer sees no voter names; unchecked voters are never listed
--   kr8_onb_alike      unchecked members are never offered in "answered like you"
-- Additive: same signatures and grants; old apps ignore the new fields.
begin;
CREATE OR REPLACE FUNCTION public.kr8_task_vote(p_pick text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); v public.kr8_task_votes;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  -- m216 (founder 25 Nov): the This-or-That vote needs no face check (first-visit step 1). Rings stay face-gated at the claim.
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  select * into v from public.kr8_task_votes where day = d;
  if v.day is null then raise exception 'KR8_TASK_NO_VOTE'; end if;
  if p_pick not in ('a', 'b', 'c') or (p_pick = 'c' and v.c_en is null) then raise exception 'KR8_TASK_BAD_PICK'; end if;
  -- 0177: one vote per member per question, locked for good (primary key (day, member_id) = one question a day)
  if exists (select 1 from public.kr8_task_vote_picks where day = d and member_id = uid) then raise exception 'KR8_ALREADY_VOTED'; end if;
  begin
    insert into public.kr8_task_vote_picks (day, member_id, pick) values (d, uid, p_pick);
  exception when unique_violation then raise exception 'KR8_ALREADY_VOTED';
  end;
  return public.kr8_tasks_today();
end $function$
;

CREATE OR REPLACE FUNCTION public.kr8_tasks_today()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); ver boolean; v public.kr8_task_votes; vp text; tot int; votes jsonb; gated boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then return jsonb_build_object('on', false); end if;
  gated := public.kr8_face_gate(uid);   -- m207
  -- m207: an unchecked account gets no task day row and no questions; one flag the app reads
  if gated then
    -- m216: an unchecked member still gets today's This-or-That (only the vote: no tasks, no Rings, no reasons)
    select * into v from public.kr8_task_votes where day = d and kind <> 'roast';
    select pick into vp from public.kr8_task_vote_picks where day = d and member_id = uid;
    if vp is not null and v.day is not null then
      select count(*) into tot from public.kr8_task_vote_picks where day = d;
      select jsonb_object_agg(k, round(100.0 * n / greatest(tot, 1))) into votes
        from (select pick k, count(*) n from public.kr8_task_vote_picks where day = d group by pick) x;
      votes := coalesce(votes, '{}'::jsonb) || jsonb_build_object('n', tot);
    end if;
    return jsonb_build_object('on', true, 'day', d, 'gated', true, 'verified', false,
      'vote', case when v.day is null then null else jsonb_build_object('kind', v.kind, 'q_en', v.q_en, 'q_th', v.q_th,
                'a_en', v.a_en, 'a_th', v.a_th, 'a_img', v.a_img, 'b_en', v.b_en, 'b_th', v.b_th, 'b_img', v.b_img,
                'c_en', v.c_en, 'c_th', v.c_th, 'img', v.img, 'pick', vp, 'pct', votes) end,
      'resets_at', ((d + 1)::timestamp at time zone 'Asia/Bangkok'),
      'max', public.kr8_rcfg('task_post', 5) + public.kr8_rcfg('task_ask', 3) + public.kr8_rcfg('task_vote', 1) + public.kr8_rcfg('task_watch', 1) + public.kr8_rcfg('task_bonus', 2),
      'rings_today', 0, 'streak', '[]'::jsonb, 'tasks', '[]'::jsonb);
  end if;
  insert into public.kr8_task_days (member_id, day, opened_at) values (uid, d, now())
    on conflict (member_id, day) do update set opened_at = coalesce(public.kr8_task_days.opened_at, excluded.opened_at);
  select coalesce(m.verified, false) into ver from public.kr8_members m where m.user_id = uid;
  select * into v from public.kr8_task_votes where day = d;
  select pick into vp from public.kr8_task_vote_picks where day = d and member_id = uid;
  if vp is not null then
    select count(*) into tot from public.kr8_task_vote_picks where day = d;
    select jsonb_object_agg(k, round(100.0 * n / greatest(tot, 1))) into votes
      from (select pick k, count(*) n from public.kr8_task_vote_picks where day = d group by pick) x;
    votes := coalesce(votes, '{}'::jsonb) || jsonb_build_object('n', tot);   -- 0177: total votes (only after this member voted)
  end if;
  return jsonb_build_object(
    'on', true, 'day', d, 'gated', false,
    'resets_at', ((d + 1)::timestamp at time zone 'Asia/Bangkok'),
    'verified', ver,
    'max', public.kr8_rcfg('task_post', 5) + public.kr8_rcfg('task_ask', 3) + public.kr8_rcfg('task_vote', 1) + public.kr8_rcfg('task_watch', 1) + public.kr8_rcfg('task_bonus', 2),
    'rings_today', coalesce((select sum(delta)::int from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id like d::text || ':%'), 0),
    'streak', (select jsonb_agg(exists (select 1 from public.kr8_rings_ledger l where l.member_id = uid and l.reason = 'task' and l.ref_id like (d - g)::text || ':%')
                                order by g desc) from generate_series(0, 6) g),
    'tasks', jsonb_build_array(
      jsonb_build_object('id', 'post', 'rings', public.kr8_task_rings('post'), 'done', public.kr8_task_done(uid, d, 'post'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':post')),
      jsonb_build_object('id', 'ask', 'rings', public.kr8_task_rings('ask'), 'done', public.kr8_task_done(uid, d, 'ask'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':ask'),
        'question', public.kr8_task_ask_pick(uid), 'min_chars', public.kr8_rcfg('task_ask_min_chars', 15)),
      jsonb_build_object('id', 'vote', 'rings', public.kr8_task_rings('vote'), 'done', vp is not null,
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':vote'),
        'vote', case when v.day is null then null else jsonb_build_object('kind', v.kind, 'q_en', v.q_en, 'q_th', v.q_th,
                  'a_en', v.a_en, 'a_th', v.a_th, 'a_img', v.a_img, 'b_en', v.b_en, 'b_th', v.b_th, 'b_img', v.b_img,
                  'c_en', v.c_en, 'c_th', v.c_th, 'img', v.img, 'pick', vp, 'pct', votes,
                  'reasons', public.kr8_task_reason_presets(d),
                  'my_reason', (select jsonb_build_object('id', r.id, 'key', r.reason_key, 'text', r.free_text, 'ups', r.ups)
                                  from public.kr8_task_vote_reasons r where r.day = d and r.member_id = uid)) end),
      jsonb_build_object('id', 'watch', 'rings', public.kr8_task_rings('watch'), 'progress', least(public.kr8_task_watch_n(uid, d), public.kr8_rcfg('task_watch_goal', 3)),
        'goal', public.kr8_rcfg('task_watch_goal', 3), 'done', public.kr8_task_done(uid, d, 'watch'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':watch')),
      jsonb_build_object('id', 'bonus', 'rings', public.kr8_task_rings('bonus'), 'done', public.kr8_task_done(uid, d, 'bonus'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':bonus'))
    ));
end $function$
;

CREATE OR REPLACE FUNCTION public.kr8_task_vote_who(p_day date DEFAULT NULL::date)
 RETURNS TABLE(first_name text, photo text, pick text, n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); d date := coalesce(p_day, public.kr8_bkk_day()); tot int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  -- the member sees other voters only after voting themselves
  if not exists (select 1 from public.kr8_task_vote_picks p where p.day = d and p.member_id = uid) then return; end if;
  -- m216: unchecked members can vote now; they see no names, and their own name/photo is never listed
  if public.kr8_face_gate(uid) then return; end if;

  select count(*)::int into tot
    from public.kr8_task_vote_picks p
    join public.kr8_members m on m.user_id = p.member_id
   where p.day = d
     and p.member_id is distinct from uid
     and not coalesce(m.ghost, false)
     and not coalesce(m.qa, false)
     and coalesce(btrim(m.first_name), '') <> ''
     and not public.kr8_face_gate(m.user_id);

  return query
    select btrim(m.first_name),
           case when length(coalesce(m.photo, '')) between 1 and 120000 then m.photo else null end,
           p.pick,
           tot
      from public.kr8_task_vote_picks p
      join public.kr8_members m on m.user_id = p.member_id
     where p.day = d
       and p.member_id is distinct from uid
       and not coalesce(m.ghost, false)
       and not coalesce(m.qa, false)
       and coalesce(btrim(m.first_name), '') <> ''
     and not public.kr8_face_gate(m.user_id)
     order by p.at desc
     limit 3;
end $function$
;

CREATE OR REPLACE FUNCTION public.kr8_onb_alike(p_kind text DEFAULT 'any'::text, p_ref text DEFAULT NULL::text, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); v_day date; v_post uuid; n_av int; lim int := greatest(1, least(coalesce(p_limit, 12), 20)); r jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind is null or p_kind not in ('any', 'vote', 'ask') then raise exception 'KR8_BAD_INPUT'; end if;
  if p_ref is not null and length(p_ref) > 40 then raise exception 'KR8_BAD_INPUT'; end if;
  begin
    if p_kind = 'vote' and p_ref is not null then v_day := p_ref::date; end if;
    if p_kind = 'ask' and p_ref is not null then v_post := p_ref::uuid; end if;
  exception when others then raise exception 'KR8_BAD_INPUT';
  end;
  if not exists (select 1 from public.kr8_members where user_id = uid) then return jsonb_build_object('eligible', false, 'answers', 0, 'people', '[]'::jsonb); end if;
  select (select count(*) from public.kr8_ask_answers a where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false))
       + (select count(*) from public.kr8_task_vote_picks v where v.member_id = uid) into n_av;
  if n_av < 2 or public.kr8_face_gate(uid) then
    return jsonb_build_object('eligible', false, 'answers', n_av, 'people', '[]'::jsonb);
  end if;
  with my_votes as (
    select v.day, v.pick from public.kr8_task_vote_picks v
     where v.member_id = uid and p_kind in ('any', 'vote') and (v_day is null or v.day = v_day)
  ), my_asks as (
    select distinct a.post_id from public.kr8_ask_answers a
     where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false)
       and p_kind in ('any', 'ask') and (v_post is null or a.post_id = v_post)
  ), hits as (
    select p.member_id as who, 'v' as k, p.day::text as ref from public.kr8_task_vote_picks p
      join my_votes v on v.day = p.day and v.pick = p.pick
     where p.member_id <> uid
    union
    select a.author, 'a', a.post_id::text from public.kr8_ask_answers a
      join my_asks q on q.post_id = a.post_id
     where a.author <> uid and a.parent_id is null and not coalesce(a.hidden, false)
  ), agg as (
    select who, count(*) filter (where k = 'v')::int as nv, count(*) filter (where k = 'a')::int as na from hits group by who
  ), pick as (
    select m.user_id, m.first_name, m.photo, coalesce(m.verified, false) as verified, agg.nv, agg.na, m.last_active_at
      from agg join public.kr8_members m on m.user_id = agg.who
     where not coalesce(m.ghost, false)
       and not public.kr8_face_gate(m.user_id)   -- m216: unchecked members can vote now; never offered for Follow
       and not public.kr8_is_blocked(uid, m.user_id)
       and not exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = m.user_id)
     order by coalesce(m.verified, false) desc, agg.nv + agg.na desc, m.last_active_at desc nulls last
     limit lim
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'first_name', first_name, 'photo', photo, 'verified', verified,
                                               'same_votes', nv, 'same_questions', na)
                            order by verified desc, nv + na desc, last_active_at desc nulls last), '[]'::jsonb)
    into r from pick;
  return jsonb_build_object('eligible', true, 'answers', n_av, 'people', r);
end $function$
;

CREATE OR REPLACE FUNCTION public.kr8_onb_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); m public.kr8_members; n_ask int; n_like int; n_clip int; n_av int; n_vote int; ok boolean; has boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = uid;
  if m.user_id is null then return jsonb_build_object('on', false); end if;
  select count(*) into n_ask from public.kr8_ask_answers a
   where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false);
  select count(*) into n_like from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id
   where l.user_id = uid and p.kind = 'reel' and p.author is distinct from uid;
  select count(*) into n_clip from public.kr8_posts p where p.author = uid and p.kind = 'reel' and not coalesce(p.hidden, false);
  select count(*) into n_vote from public.kr8_task_vote_picks v where v.member_id = uid;
  n_av := n_ask + n_vote;
  -- m216 (founder 25 Nov): four steps, in this order: 1 This-or-That vote · 1 Ask BKK answer · 3 Reel likes · first clip
  ok := n_vote >= 1 and n_ask >= 1 and n_like >= 3 and n_clip >= 1;
  if ok and not coalesce(m.ghost, false) then
    insert into public.kr8_member_badges (user_id, badge) values (uid, 'bangkok_local') on conflict do nothing;
  end if;
  has := exists (select 1 from public.kr8_member_badges b where b.user_id = uid and b.badge = 'bangkok_local');
  return jsonb_build_object(
    'on', true, 'steps', 4,
    'new', m.created_at > now() - interval '3 days',          -- the app shows the steps only in the first 3 days
    'ends_at', m.created_at + interval '3 days',
    'vote', n_vote >= 1, 'ask', n_ask >= 1, 'likes', least(n_like, 3), 'clip', n_clip >= 1,
    'done', ok, 'badge', has,
    'answers', n_av,                                          -- Ask answers + votes (the "answered like you" list needs 2)
    'streak', public.kr8_onb_answer_streak(uid));
end $function$
;

revoke execute on function public.kr8_task_vote(text) from public, anon;
revoke execute on function public.kr8_tasks_today() from public, anon;
revoke execute on function public.kr8_task_vote_who(date) from public, anon;
revoke execute on function public.kr8_onb_alike(text, text, integer) from public, anon;
revoke execute on function public.kr8_onb_state() from public, anon;
grant execute on function public.kr8_task_vote(text) to authenticated, service_role;
grant execute on function public.kr8_tasks_today() to authenticated, service_role;
grant execute on function public.kr8_task_vote_who(date) to authenticated, service_role;
grant execute on function public.kr8_onb_alike(text, text, integer) to authenticated, service_role;
grant execute on function public.kr8_onb_state() to authenticated, service_role;
commit;
