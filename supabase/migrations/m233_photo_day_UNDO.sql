-- m233 UNDO: restores the six functions exactly as they were before m233 and removes the config key.
begin;
CREATE OR REPLACE FUNCTION public.kr8_task_rings(p_task text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select case p_task when 'ask' then public.kr8_rcfg('task_ask', 3) when 'vote' then public.kr8_rcfg('task_vote', 1)
                         when 'watch' then public.kr8_rcfg('task_watch', 1) when 'open' then public.kr8_rcfg('task_open', 1) when 'post' then public.kr8_rcfg('task_post', 5) when 'bonus' then public.kr8_rcfg('task_bonus', 2) else 0 end $function$;

CREATE OR REPLACE FUNCTION public.kr8_task_done(p_uid uuid, p_day date, p_task text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_task
    when 'ask' then public.kr8_task_ask_done(p_uid, p_day)
    when 'vote' then exists (select 1 from public.kr8_task_vote_picks v where v.member_id = p_uid and v.day = p_day)
    when 'watch' then public.kr8_task_watch_n(p_uid, p_day) >= public.kr8_rcfg('task_watch_goal', 3)
    when 'open' then exists (select 1 from public.kr8_task_days d where d.member_id = p_uid and d.day = p_day and d.opened_at is not null)
    when 'post' then exists (select 1 from public.kr8_posts x where x.author = p_uid and x.kind in ('reel', 'photo') and x.status = 'approved' and not coalesce(x.hidden, false)
                             and (x.created_at at time zone 'Asia/Bangkok')::date = p_day)   -- m226: a photo counts too (+3, a Reel +5)
    when 'bonus' then (select count(distinct split_part(l.ref_id, ':', 2)) from public.kr8_rings_ledger l where l.member_id = p_uid and l.reason = 'task'
                       and l.ref_id in (p_day::text || ':post', p_day::text || ':ask', p_day::text || ':vote', p_day::text || ':watch')) = 4
    else false end
$function$;

CREATE OR REPLACE FUNCTION public.kr8_task_claim(p_task text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); n int; ver boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then raise exception 'KR8_TASKS_OFF'; end if;
  if p_task not in ('post', 'ask', 'vote', 'watch', 'bonus', 'open') then raise exception 'KR8_TASK_BAD'; end if;
  select coalesce(m.verified, false) into ver from public.kr8_members m where m.user_id = uid;
  if not coalesce(ver, false) then raise exception 'KR8_TASK_FACE'; end if;
  if p_task = 'open' then perform public.kr8_tasks_today(); end if;
  if not public.kr8_task_done(uid, d, p_task) then raise exception 'KR8_TASK_NOT_DONE'; end if;
  n := public.kr8_task_rings(p_task);
  -- m226: a photo-only day pays the photo rate (task_photo, 3); an approved Reel the Reel rate
  if p_task = 'post' and not exists (select 1 from public.kr8_posts x where x.author = uid and x.kind = 'reel' and x.status = 'approved' and not coalesce(x.hidden, false)
                                       and (x.created_at at time zone 'Asia/Bangkok')::date = d) then
    n := public.kr8_rcfg('task_photo', 3);
  end if;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, n, 'task', d::text || ':' || p_task)
    on conflict (member_id, reason, ref_id) do nothing;
  return public.kr8_tasks_today();
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_task_cap_left(p_uid uuid, p_day date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select greatest(0, public.kr8_rcfg('task_post', 5) + public.kr8_rcfg('task_ask', 3) + public.kr8_rcfg('task_vote', 1)
                   + public.kr8_rcfg('task_watch', 1) + public.kr8_rcfg('task_bonus', 2)
                   - coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l
                                where l.member_id = p_uid and l.reason = 'task' and l.ref_id like p_day::text || ':%'), 0))
$function$;

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
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_task_post_autopay_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d date; ver boolean; n int; paid int;
begin
  if new.kind not in ('reel', 'photo') or new.status <> 'approved' or coalesce(new.hidden, false) then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and not coalesce(old.hidden, false) then return new; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then return new; end if;
  select coalesce(m.verified, false) into ver from public.kr8_members m where m.user_id = new.author;
  if not coalesce(ver, false) or public.kr8_is_test_member(new.author) then return new; end if;
  d := (new.created_at at time zone 'Asia/Bangkok')::date;
  if d < public.kr8_bkk_day() - 1 then return new; end if;   -- only today's or yesterday's posts
  n := case when new.kind = 'reel' then public.kr8_rcfg('task_post', 5) else public.kr8_rcfg('task_photo', 3) end;
  select delta into paid from public.kr8_rings_ledger where member_id = new.author and reason = 'task' and ref_id = d::text || ':post';
  if paid is null then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (new.author, n, 'task', d::text || ':post')
      on conflict (member_id, reason, ref_id) do nothing;
  elsif new.kind = 'reel' and paid < n then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (new.author, n - paid, 'task', d::text || ':post_up')
      on conflict (member_id, reason, ref_id) do nothing;
  end if;
  return new;
exception when others then raise warning 'kr8_task_post_autopay: %', sqlerrm; return new;
end $function$;
delete from public.kr8_rings_config where key = 'task_photo_day';
commit;
