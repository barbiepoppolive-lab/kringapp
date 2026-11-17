-- 0085 order report. TEST DATABASE ONLY, rolled back (ends with an exception that carries the report).
-- Rebuilds the 14 approved live Reels of 17 Nov 2026 ~10:00 UTC with their real numbers (age, views, likes split local/
-- traveller, saves, share-link opens, open reports, Feed-only, duplicate flag, food or not), then prints newest-first (today)
-- against the ranked order with the reason for every position. Members get English labels; nothing here is real data.
do $t$
declare
  d jsonb := $j$[
   ["Yok · Robinson Lat Krabang",   "Yok",    1.15, "Bangkok",   false,  8, 0, 0, 0, 0,  1, 0, true,  "mall walk"],
   ["Im · Siam Amazing Park",       "Im",     1.96, "Bangkok",   false,  0, 0, 0, 0, 0,  0, 0, true,  "theme park"],
   ["Eyes · Kong Ju (Feed only)",   "Eyes",  13.67, "Bangkok",   true,  12, 2, 0, 1, 0,  1, 0, true,  "kong ju"],
   ["Ice · Khlong floating market (Feed only)", "Ice", 14.39, "Bangkok", true, 7, 0, 0, 0, 0, 0, 0, false, "floating market"],
   ["Joob · CentralWorld",          "Joob",  16.78, "Siam",      false,  9, 0, 0, 0, 0,  0, 0, false, "centralworld"],
   ["JerJam · Wang Lang lunch",     "JerJam",18.85, "Riverside", false, 16, 1, 0, 0, 0,  0, 0, false, "อาหารมื้อเที่ยง lunch"],
   ["Pom · Suan Phueng",            "Pom",   19.03, "Bangkok",   false,  3, 0, 0, 0, 0,  0, 1, true,  "suan phueng"],
   ["Nok · Bangkapi Market",        "Nok",   20.21, "Bangkok",   false, 22, 1, 0, 0, 0,  0, 0, false, "market"],
   ["Mannie · Lotus Sukhumvit 50 snack", "Mannie", 20.42, "Bangkok", false, 11, 0, 0, 0, 0, 0, 0, false, "ขนมบ้าบิ่นอร่อย"],
   ["Joob · Wat Huay Mongkol",      "Joob",  20.50, "Bangkok",   false, 13, 1, 0, 1, 0,  7, 1, false, "temple hua hin"],
   ["Otop · Wat Suthat",            "Otop",  21.07, "Bangkok",   false, 24, 0, 0, 0, 0, 11, 0, false, "wat suthat"],
   ["Otop · mookata POV",           "Otop",  40.55, "Bangkok",   false, 81, 1, 0, 1, 0,  3, 0, false, "หมูกระทะ ไม่กินดูอย่างเดียว"],
   ["Nut · night ride Wat Phra Kaew", "Nut", 41.23, "Bangkok",   false, 31, 0, 0, 0, 0,  2, 0, false, "night bike"],
   ["Otop · Vanilla Moon friends",  "Otop",  43.33, "Bangkok",   false, 32, 1, 0, 1, 0,  6, 0, false, "เนื้อ+เบียร์ โคตรอร่อย"]
  ]$j$;
  authors text[] := array['Yok','Im','Eyes','Ice','Joob','JerJam','Pom','Nok','Mannie','Otop','Nut'];
  au uuid[] := '{}'; lik uuid[] := '{}'; trv uuid[] := '{}'; dupe uuid := '85500000-0000-4000-8000-000000000999';
  x jsonb; i int; j int; pid uuid; a uuid; rep text := ''; lab text; before uuid[]; after record; vis text;
  label_of jsonb := '{}';
begin
  update public.kr8_posts set hidden = true where not hidden;
  insert into public.kr8_rings_config (key, value) values ('feed_jitter_pct', 0) on conflict (key) do update set value = 0;
  perform set_config('request.path', '/rpc/kr8_feed_ranked', true);
  perform set_config('request.jwt.claims', '{}', true);
  for i in 1..array_length(authors, 1) loop au := au || ('85500000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid; end loop;
  for i in 1..10 loop lik := lik || ('85500000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid; end loop;
  insert into auth.users (id, email) select y, 's85_' || substr(y::text, 25) || '@example.com' from unnest(au || lik || dupe) y;
  insert into public.kr8_members (user_id, first_name, photo, langs, area, who, age_ok_at, created_at, verified)
  select y, 'S85', 'https://x/s.jpg', '{TH}', 'Bangkok', 'local', now(), now() - interval '30 days', false from unnest(au || lik || dupe) y;
  for i in 0..jsonb_array_length(d) - 1 loop
    x := d -> i;
    a := au[array_position(authors, x ->> 1)];
    insert into public.kr8_posts (author, kind, area, body, status, video_path, poster_path, duration_ms, width, height, created_at, views_count, board_off)
    values (a, 'reel', x ->> 3, x ->> 13, 'approved', a || '/' || gen_random_uuid() || '.mp4', a || '/' || gen_random_uuid() || '.jpg', 15000, 720, 1280,
            now() - make_interval(secs => (x ->> 2)::numeric * 3600), (x ->> 5)::int, (x ->> 4)::boolean) returning id into pid;
    label_of := label_of || jsonb_build_object(pid::text, x ->> 0);
    for j in 1..(x ->> 6)::int loop insert into public.kr8_post_likes (post_id, user_id) values (pid, lik[j]); end loop;
    for j in 1..(x ->> 8)::int loop insert into public.kr8_post_saves (post_id, user_id) values (pid, lik[j]); end loop;
    for j in 1..(x ->> 10)::int loop
      insert into public.kr8_share_opens (post_id, bkk_date, session, device, ok, source) values (pid, current_date, 's' || j, 'd' || j, true, 'sim');
    end loop;
    if (x ->> 11)::int > 0 then insert into public.kr8_reports (reporter, post_id, reason, category) values (lik[10], pid, 'wrong_place', 'wrong_place'); end if;
    if (x ->> 12)::boolean and not exists (select 1 from public.kr8_account_links l where l.a = least(dupe, au[array_position(authors, x ->> 1)]) and l.b = greatest(dupe, au[array_position(authors, x ->> 1)])) then
      insert into public.kr8_account_links (a, b, reason) values (least(dupe, a), greatest(dupe, a), 'face');
    end if;
  end loop;

  select array_agg(id order by created_at desc) into before from public.kr8_feed(null, 60);
  rep := E'\n#  | TODAY (newest first)                   | RANKED                                  | score | why\n';
  for after in select * from public.kr8_feed_order(null, 'report') order by pos loop
    rep := rep || format(E'%s | %s | %s | %s | %s\n', lpad(after.pos::text, 2), rpad(label_of ->> before[after.pos]::text, 38), rpad(label_of ->> after.post_id::text, 39),
                         to_char(after.score, '0.000'), after.why);
  end loop;
  update public.kr8_rings_config set value = 15 where key = 'feed_jitter_pct';
  for vis in select unnest(array['visitor-A', 'visitor-B']) loop
    rep := rep || E'\nwith ±15% session mix, ' || vis || ': ' ||
           (select string_agg(label_of ->> o.post_id::text, ' → ' order by o.pos) from public.kr8_feed_order(null, vis) o where o.pos <= 6);
  end loop;
  raise exception 'ORDER REPORT%', rep;
end $t$;
