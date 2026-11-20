-- 0177 (20 Nov): This or that: one locked vote per member per question (KR8_ALREADY_VOTED), total votes only after voting, seed.
create or replace function public.kr8_task_vote(p_pick text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); v public.kr8_task_votes;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
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
end $$;

CREATE OR REPLACE FUNCTION public.kr8_tasks_today()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); ver boolean; v public.kr8_task_votes; vp text; tot int; votes jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then return jsonb_build_object('on', false); end if;
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
    'on', true, 'day', d,
    'resets_at', ((d + 1)::timestamp at time zone 'Asia/Bangkok'),
    'verified', ver,
    'max', public.kr8_rcfg('task_ask', 3) + public.kr8_rcfg('task_vote', 1) + public.kr8_rcfg('task_watch', 1) + public.kr8_rcfg('task_open', 1),
    'rings_today', coalesce((select sum(delta)::int from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id like d::text || ':%'), 0),
    'streak', (select jsonb_agg(exists (select 1 from public.kr8_rings_ledger l where l.member_id = uid and l.reason = 'task' and l.ref_id like (d - g)::text || ':%')
                                order by g desc) from generate_series(0, 6) g),
    'tasks', jsonb_build_array(
      jsonb_build_object('id', 'ask', 'rings', public.kr8_task_rings('ask'), 'done', public.kr8_task_done(uid, d, 'ask'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':ask'),
        'question', public.kr8_task_ask_pick(uid), 'min_chars', public.kr8_rcfg('task_ask_min_chars', 15)),
      jsonb_build_object('id', 'say', 'rings', 2, 'soon', true),
      jsonb_build_object('id', 'vote', 'rings', public.kr8_task_rings('vote'), 'done', vp is not null,
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':vote'),
        'vote', case when v.day is null then null else jsonb_build_object('kind', v.kind, 'q_en', v.q_en, 'q_th', v.q_th,
                  'a_en', v.a_en, 'a_th', v.a_th, 'a_img', v.a_img, 'b_en', v.b_en, 'b_th', v.b_th, 'b_img', v.b_img,
                  'c_en', v.c_en, 'c_th', v.c_th, 'img', v.img, 'pick', vp, 'pct', votes) end),
      jsonb_build_object('id', 'watch', 'rings', public.kr8_task_rings('watch'), 'progress', least(public.kr8_task_watch_n(uid, d), public.kr8_rcfg('task_watch_goal', 3)),
        'goal', public.kr8_rcfg('task_watch_goal', 3), 'done', public.kr8_task_done(uid, d, 'watch'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':watch')),
      jsonb_build_object('id', 'open', 'rings', public.kr8_task_rings('open'), 'done', true,
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':open'))
    ));
end $function$;

-- 0177 "This or that" (founder 20 Nov): Kring-made only, one a day. Go-live question first, then the queue.
delete from public.kr8_task_votes where day >= date '2026-11-20';
insert into public.kr8_task_votes (day, kind, q_en, q_th, a_en, a_th, a_img, b_en, b_th, b_img, c_en, c_th, img) values
 (date '2026-11-20', 'pair', 'Rooftop bar or soi street party?', 'รูฟท็อปบาร์ หรือ ปาร์ตี้ในซอย?', 'Rooftop bar', 'รูฟท็อปบาร์', 'tot-rooftop-bar.jpg', 'Soi street party', 'ปาร์ตี้ในซอย', 'tot-soi-party.jpg', null, null, null),
 (date '2026-11-21', 'pair', 'BTS or Grab bike?', 'BTS หรือ แกร็บไบค์?', 'BTS', 'BTS', 'tot-bts.jpg', 'Grab bike', 'แกร็บไบค์', 'tot-motorbike-taxi.jpg', null, null, null),
 (date '2026-11-22', 'pair', 'Chatuchak or Jodd Fairs?', 'จตุจักร หรือ จ๊อดแฟร์?', 'Chatuchak', 'จตุจักร', 'chatuchak-weekend-market.jpg', 'Jodd Fairs', 'จ๊อดแฟร์', 'tot-jodd-fairs.jpg', null, null, null),
 (date '2026-11-23', 'pair', 'Sukhumvit or Ari for a first date?', 'เดตแรก สุขุมวิท หรือ อารีย์?', 'Sukhumvit', 'สุขุมวิท', 'tot-sukhumvit-night.jpg', 'Ari', 'อารีย์', 'tot-ari.jpg', null, null, null),
 (date '2026-11-24', 'pair', 'Temple at sunrise or mall at night?', 'วัดตอนเช้าตรู่ หรือ ห้างตอนกลางคืน?', 'Temple at sunrise', 'วัดตอนเช้าตรู่', 'tot-temple-dawn.jpg', 'Mall at night', 'ห้างตอนกลางคืน', 'tot-mall-night.jpg', null, null, null),
 (date '2026-11-25', 'pair', 'Songkran: water gun or stay home?', 'สงกรานต์: ปืนฉีดน้ำ หรือ อยู่บ้าน?', 'Water gun', 'ปืนฉีดน้ำ', 'tot-songkran.jpg', 'Stay home', 'อยู่บ้าน', 'tot-stay-home.jpg', null, null, null),
 (date '2026-11-26', 'price', 'Price check: Grab from Asok to Silom. What should it cost?', 'เช็กราคา: แกร็บจากอโศกไปสีลม ควรราคาเท่าไหร่?', '฿80', '฿80', null, '฿150', '฿150', null, '฿250', '฿250', 'silom-road.jpg');
