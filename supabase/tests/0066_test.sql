-- 0066 + 0067 (one person, one account; prize trail). SCRATCH DATABASE ONLY, never the live project:
-- a private Postgres with 0001–0065 + 0066 + 0067 (see /home/claude/dupdb/up.sh). Prints PASS/FAIL; everything is rolled back.
--   psql -X -q -v ON_ERROR_STOP=0 -f supabase/tests/0066_test.sql | grep -E 'PASS|FAIL'
\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
-- run q as a signed-in user (role authenticated, auth.uid() = u); returns the error text or 'no error'
create or replace function pg_temp.as_err(u uuid, q text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin execute q; exception when others then execute 'reset role'; perform set_config('request.jwt.claims', '', true); return sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  return 'no error';
end $$;
create or replace function pg_temp.as_json(u uuid, q text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute q into r;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  return r;
exception when others then execute 'reset role'; perform set_config('request.jwt.claims', '', true); return jsonb_build_object('error', sqlerrm);
end $$;
-- a fake 128-number face code: same seed = same face; noise = how far from it
create or replace function pg_temp.face(seed int, noise real default 0, salt int default 0) returns real[] language sql as $$
  select array_agg(((('x' || substr(md5(seed || ':' || i), 1, 8))::bit(32)::int / 2147483648.0) * 0.09 + noise * sin(salt * 3.1 + i * 1.7))::real order by i) from generate_series(1, 128) i $$;
grant execute on function pg_temp.face(int, real, int) to authenticated;

create or replace function pg_temp.reel(p_author uuid, p_id uuid default gen_random_uuid(), p_at timestamptz default now()) returns uuid language sql as $$
  insert into public.kr8_posts (id, author, kind, status, hidden, created_at, video_path, poster_path, duration_ms, width, height)
  values (p_id, p_author, 'reel', 'approved', false, p_at, p_author || '/' || p_id || '.mp4', p_author || '/' || p_id || '.jpg', 10000, 540, 960) returning id $$;

begin;
\set A  'a0000000-0000-4000-8000-00000000000a'
\set B  'b0000000-0000-4000-8000-00000000000b'
\set C  'c0000000-0000-4000-8000-00000000000c'
\set D  'd0000000-0000-4000-8000-00000000000d'
\set T  'e0000000-0000-4000-8000-00000000000e'
\set X  'f0000000-0000-4000-8000-00000000000f'
\set PL 'aa000000-0000-4000-8000-0000000000aa'
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-000000000000', :'A', 'authenticated', 'authenticated', 'joob@example.test', now(), now() - interval '20 days'),
  ('00000000-0000-0000-0000-000000000000', :'B', 'authenticated', 'authenticated', 'joob2@example.test', now(), now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000000000', :'C', 'authenticated', 'authenticated', 'ploy@example.test', now(), now() - interval '9 days'),
  ('00000000-0000-0000-0000-000000000000', :'D', 'authenticated', 'authenticated', 'nok@example.test', now(), now() - interval '9 days'),
  ('00000000-0000-0000-0000-000000000000', :'T', 'authenticated', 'authenticated', 'team@example.test', now(), now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000000', :'X', 'authenticated', 'authenticated', 'boss@example.test', now(), now() - interval '30 days');
insert into public.kr8_admin_emails (email) values ('boss@example.test') on conflict do nothing;
insert into public.kr8_members (user_id, first_name, photo, age_ok_at, who, created_at, member_no, langs) values
  (:'A', 'Joob', 'https://x/a.jpg', now(), 'local', now() - interval '20 days', 901, '{TH}'),
  (:'B', 'Joobie', 'https://x/b.jpg', now(), 'local', now() - interval '5 days', 902, '{TH}'),
  (:'C', 'Ploy', 'https://x/c.jpg', now(), 'local', now() - interval '9 days', 903, '{TH}'),
  (:'D', 'Nok', 'https://x/d.jpg', now(), 'local', now() - interval '9 days', 904, '{TH}'),
  (:'T', 'Kring Team', 'https://x/t.jpg', now(), 'local', now() - interval '30 days', 905, '{TH}');
update public.kr8_rings_config set value = 0 where key = 'liker_min_age_hours';
update public.kr8_rings_config set value = 100 where key = 'truemoney_payout_pct';
insert into public.kr8_places (id, name_en, lat, lng) values (:'PL', 'Test Café', 13.75, 100.5);
insert into public.kr8_reward_codes (brand, amount_thb, code, is_test) select 'truemoney', 100, 'TM-CODE-' || g, false from generate_series(1, 6) g;
-- consent with the face code (face-2026-11-17), old consent for D
insert into public.kr8_verifications (user_id, consent_version, status, selfie_path) values
  (:'A', 'face-2026-11-17', 'approved', :'A' || '/11111111-1111-4111-8111-111111111111.jpg'),
  (:'B', 'face-2026-11-17', 'approved', :'B' || '/22222222-2222-4222-8222-222222222222.jpg'),
  (:'C', 'face-2026-11-17', 'approved', :'C' || '/33333333-3333-4333-8333-333333333333.jpg'),
  (:'D', 'face-2026-11-10', 'approved', :'D' || '/44444444-4444-4444-8444-444444444444.jpg');

-- ── A. face prints ──
select pg_temp.ok(pg_temp.as_err(:'A', 'select pg_temp.face(1)') = 'no error', 'test helper callable');
select pg_temp.ok(pg_temp.as_err(:'A', 'select count(*) from public.kr8_face_prints') ~ 'permission denied', 'member cannot read face prints');
select pg_temp.ok(pg_temp.as_err(:'A', 'select count(*) from public.kr8_account_links') ~ 'permission denied', 'member cannot read account links');
select pg_temp.ok(pg_temp.as_err(:'A', 'select count(*) from public.kr8_claim_holds') ~ 'permission denied', 'member cannot read hold reasons');
select pg_temp.ok(pg_temp.as_err(:'A', 'insert into public.kr8_face_prints (user_id, descriptor, source) values (auth.uid(), pg_temp.face(1), ''verify'')') ~ 'permission denied', 'member cannot write face prints directly');
select pg_temp.ok(pg_temp.as_err(:'D', 'select public.kr8_save_face_print(pg_temp.face(4))') ~ 'KR8_CONSENT_REQUIRED', 'old consent (no face code) → refused');
select pg_temp.ok(pg_temp.as_err(:'A', 'select public.kr8_save_face_print(array[0.1,0.2]::real[])') ~ 'KR8_BAD_FACE', 'short descriptor refused');
select pg_temp.ok(pg_temp.as_err(:'A', 'select public.kr8_save_face_print(array_fill(0::real, array[128]))') ~ 'KR8_BAD_FACE', 'all-zero descriptor refused');
select pg_temp.ok(pg_temp.as_err(:'A', 'select public.kr8_save_face_print(pg_temp.face(1))') = 'no error', 'A saves face print');
select pg_temp.ok(pg_temp.as_err(:'B', 'select public.kr8_save_face_print(pg_temp.face(1, 0.02, 7))') = 'no error', 'B (same face, other photo) saves print');
select pg_temp.ok(pg_temp.as_err(:'C', 'select public.kr8_save_face_print(pg_temp.face(3))') = 'no error', 'C (other person) saves print');
select pg_temp.ok(exists (select 1 from public.kr8_account_links where a = least(:'A'::uuid, :'B'::uuid) and b = greatest(:'A'::uuid, :'B'::uuid) and reason = 'face'), 'A + B linked as same face');
select pg_temp.ok(not exists (select 1 from public.kr8_account_links where :'C'::uuid in (a, b)), 'C not linked to anyone');
select pg_temp.ok((select (detail ->> 'dist')::float8 between 0.1 and 0.5 from public.kr8_account_links where reason = 'face' limit 1), 'face link keeps the distance');
select pg_temp.ok(pg_temp.as_err(:'A', 'select public.kr8_admin_face_todo()') ~ 'KR8_ADMIN_ONLY', 'member cannot list selfies to print');
select pg_temp.ok(pg_temp.as_err(:'X', 'select count(*) from public.kr8_admin_face_todo()') = 'no error', 'admin lists selfies to print');
select pg_temp.ok(pg_temp.as_json(:'X', 'select to_jsonb(count(*)) from public.kr8_admin_face_todo()')::int = 4, 'all 4 selfies need a selfie print');
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_save_face_print(%L, pg_temp.face(4))', (select id from public.kr8_verifications where user_id = :'D'))) ->> 'saved') = 'true', 'admin backfill saves D''s print');
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_save_face_print(%L, null)', (select id from public.kr8_verifications where user_id = :'C'))) ->> 'saved') = 'false', 'no face in a selfie is noted');
select pg_temp.ok(pg_temp.as_json(:'X', 'select to_jsonb(count(*)) from public.kr8_admin_face_todo()')::int = 2, 'done ones leave the to-do list');

-- ── Founding prizes for A, B, C (B is A's 2nd account) ──
insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (:'A', 'founding', 1, 100, false), (:'C', 'founding', 3, 100, false), (:'D', 'founding', 4, 100, false);
select pg_temp.ok((select count(*) = 3 from public.kr8_prizes where email_hash is not null and member_no_copy is not null), 'new prizes carry email hash + member no');

-- ── B. claims ──
select pg_temp.ok(pg_temp.as_err(:'A', format('select public.kr8_claim_prize(%L, ''truemoney'', ''devA-0000000000000001'', pg_temp.face(1, 0.03, 2))', (select id from public.kr8_prizes where member_id = :'A'))) = 'no error', 'A claims');
select pg_temp.ok((select status = 'assigned' and not held from public.kr8_reward_claims where member_id = :'A'), 'A (first account, face matches) gets the code at once');
insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (:'B', 'founding', 2, 100, false);
select pg_temp.ok((pg_temp.as_json(:'B', format('select public.kr8_claim_prize(%L, ''truemoney'', ''devB-0000000000000002'', pg_temp.face(1, 0.03, 5))', (select id from public.kr8_prizes where member_id = :'B'))) ->> 'status') = 'pending', 'B (2nd account) claim → member just sees "on the way"');
select pg_temp.ok((select held and code_id is null from public.kr8_reward_claims where member_id = :'B'), 'B''s claim is held, no code');
select pg_temp.ok((select reason = 'linked' and detail -> 'others' -> 0 ->> 'first_name' = 'Joob' and detail -> 'others' -> 0 -> 'reasons' ? 'face'
                   from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where c.member_id = :'B'), 'hold says: linked to Joob by face');
select pg_temp.ok(not (pg_temp.as_json(:'B', 'select public.kr8_my_rewards()')::text ~ '"linked"|hold_reason|face_dist|"others"|face_mismatch'), 'B''s own rewards show nothing about the hold');
select pg_temp.ok((select body -> 'record' ->> 'held' = 'true' and body -> 'record' ->> 'hold_reason' = 'linked' and body -> 'record' -> 'others' -> 0 ->> 'first_name' = 'Joob'
                     and body -> 'record' ->> 'payout_pct' = '100' and body -> 'record' -> 'others' -> 0 ->> 'selfie_path' like :'A' || '/%'
                   from net.calls where url ~ 'notify-reward' order by id desc limit 1), 'alert payload: held, linked, Joob, her selfie, payout 100%');
select pg_temp.ok(exists (select 1 from public.kr8_push_msgs where kind = 'admin' and to_user = :'X' and title ~ 'held' and body ~ 'Joob #901'), 'founder push queued: linked to Joob #901');
-- C: face does not match her own print
select pg_temp.ok((pg_temp.as_json(:'C', format('select public.kr8_claim_prize(%L, ''truemoney'', ''devC-0000000000000003'', pg_temp.face(8))', (select id from public.kr8_prizes where member_id = :'C'))) ->> 'status') = 'pending', 'C with a different face → pending');
select pg_temp.ok((select h.reason = 'face_mismatch' and h.face_dist > 0.6 from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where c.member_id = :'C'), 'C held: face mismatch');
-- D: no face sent
select pg_temp.ok((pg_temp.as_json(:'D', format('select public.kr8_claim_prize(%L, ''truemoney'', ''devD-0000000000000004'', null)', (select id from public.kr8_prizes where member_id = :'D'))) ->> 'status') = 'pending', 'D with no face → pending');
select pg_temp.ok((select h.reason = 'no_face' from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where c.member_id = :'D'), 'D held: no face');
-- same phone for another account still refused outright (0063 rule kept)
insert into public.kr8_prizes (member_id, kind, week, rank, amount_thb, is_test) values (:'C', 'weekly', '2026-11-02', 3, 600, false);
insert into public.kr8_week_closed (week, is_test, posters, closed_at) values ('2026-11-02', false, 5, now() - interval '30 hours');
select pg_temp.ok(pg_temp.as_err(:'C', format('select public.kr8_claim_prize(%L, ''grab'', ''devA-0000000000000001'', pg_temp.face(3))', (select id from public.kr8_prizes where member_id = :'C' and kind = 'weekly'))) ~ 'KR8_ONE_ACCOUNT', 'phone used by another account → ONE_ACCOUNT');

-- ── Pay / Refuse ──
select pg_temp.ok(pg_temp.as_err(:'A', format('select public.kr8_admin_refuse_claim(%L, ''dup'')', (select id from public.kr8_reward_claims where member_id = :'B'))) ~ 'KR8_ADMIN_ONLY', 'member cannot refuse');
select pg_temp.ok(pg_temp.as_err(:'X', format('select public.kr8_admin_refuse_claim(%L, ''x'')', (select id from public.kr8_reward_claims where member_id = :'B'))) ~ 'KR8_REASON_REQUIRED', 'refuse needs a reason');
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_refuse_claim(%L, ''One person, one account'')', (select id from public.kr8_reward_claims where member_id = :'B'))) ->> 'prize') = 'cancelled', 'admin refuses B');
select pg_temp.ok((select p.status = 'cancelled' and p.cancel_reason ~ 'one account' from public.kr8_prizes p where p.member_id = :'B'), 'B''s prize cancelled with the reason');
select pg_temp.ok(jsonb_array_length(pg_temp.as_json(:'B', 'select public.kr8_my_rewards()') -> 'prizes') = 0 and jsonb_array_length(pg_temp.as_json(:'B', 'select public.kr8_my_rewards()') -> 'claims') = 0, 'B no longer sees the prize or claim');
select pg_temp.ok((select status = 'available' from public.kr8_reward_codes where code = 'TM-CODE-2'), 'no code was used for B');
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_refuse_claim(%L, ''Try again with a clear face'', true)', (select id from public.kr8_reward_claims where member_id = :'D'))) ->> 'prize') = 'won', 'refuse + return: D''s prize back to won');
select pg_temp.ok((pg_temp.as_json(:'D', 'select public.kr8_my_rewards()') -> 'prizes' -> 0 ->> 'status') = 'won', 'D can claim again');
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_release_claim(%L)', (select id from public.kr8_reward_claims where member_id = :'C' and status = 'pending'))) ->> 'status') = 'assigned', 'Pay: C''s held claim gets a code');
select pg_temp.ok((select decided = 'paid' from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where c.member_id = :'C'), 'hold marked paid');

-- ── C. LINE switch ──
update public.kr8_rings_config set value = 1 where key = 'claim_needs_line';
select pg_temp.ok(pg_temp.as_err(:'D', format('select public.kr8_claim_prize(%L, ''truemoney'', ''devD-0000000000000004'', pg_temp.face(4))', (select id from public.kr8_prizes where member_id = :'D'))) ~ 'KR8_NEED_LINE', 'claim_needs_line=1 and no LINE → NEED_LINE');
select pg_temp.ok((pg_temp.as_json(:'D', 'select public.kr8_my_rewards()') ->> 'claim_needs_line') = 'true' and (pg_temp.as_json(:'D', 'select public.kr8_my_rewards()') ->> 'line_linked') = 'false', 'rewards tell the app: LINE needed, not linked');
insert into public.kr8_line_links (line_sub, user_id) values ('U' || repeat('d', 32), :'D');
select pg_temp.ok((pg_temp.as_json(:'D', format('select public.kr8_claim_prize(%L, ''truemoney'', ''devD-0000000000000004'', pg_temp.face(4, 0.02, 3))', (select id from public.kr8_prizes where member_id = :'D'))) ->> 'status') = 'assigned', 'with LINE linked and a matching face → code at once');
update public.kr8_rings_config set value = 0 where key = 'claim_needs_line';
select pg_temp.ok((select line_hash is not null from public.kr8_prizes where member_id = :'D' and kind = 'founding'), 'LINE linked later → prize gets the LINE hash');

-- ── F. weekly review ──
insert into public.kr8_prizes (member_id, kind, week, rank, amount_thb, is_test) values (:'D', 'weekly', '2026-11-09', 1, 1500, false);
insert into public.kr8_week_closed (week, is_test, posters, closed_at) values ('2026-11-09', false, 5, now() - interval '2 hours');
insert into public.kr8_week_results (week, is_test, rank, member_id, rings, reels) values ('2026-11-09', false, 1, :'D', 90, '[]');
select pg_temp.ok(pg_temp.as_err(:'D', format('select public.kr8_claim_prize(%L, ''grab'', ''devD-0000000000000004'', pg_temp.face(4))', (select id from public.kr8_prizes where member_id = :'D' and week = '2026-11-09'))) ~ 'KR8_WEEK_REVIEW', 'week closed 2 h ago, not approved → WEEK_REVIEW');
select pg_temp.ok((select (p ->> 'opens_at') is not null from jsonb_array_elements(pg_temp.as_json(:'D', 'select public.kr8_my_rewards()') -> 'prizes') p where p ->> 'week' = '2026-11-09'), 'rewards show when it opens');
select pg_temp.ok(pg_temp.as_err(:'D', 'select public.kr8_admin_approve_week(''2026-11-09'')') ~ 'KR8_ADMIN_ONLY', 'member cannot approve a week');
select pg_temp.ok((pg_temp.as_json(:'X', 'select public.kr8_admin_week_review(''2026-11-09'')') -> 'rows' -> 0 ->> 'first_name') = 'Nok', 'admin review shows the top rows');
select pg_temp.ok((pg_temp.as_json(:'X', 'select public.kr8_admin_approve_week(''2026-11-09'')') ->> 'week') = '2026-11-09', 'admin approves the week');
select pg_temp.ok((pg_temp.as_json(:'D', format('select public.kr8_claim_prize(%L, ''grab'', ''devD-0000000000000004'', pg_temp.face(4, 0.02, 4))', (select id from public.kr8_prizes where member_id = :'D' and week = '2026-11-09'))) ->> 'status') = 'pending', 'after approval the claim goes through (no Grab ฿1500 code → waits for stock)');
select pg_temp.ok((select not held from public.kr8_reward_claims c join public.kr8_prizes p on p.id = c.prize_id where p.week = '2026-11-09'), 'waiting for stock, not held');
select pg_temp.ok(pg_temp.as_err(:'C', format('select public.kr8_claim_prize(%L, ''grab'', ''devC-0000000000000099'', pg_temp.face(3, 0.02, 1))', (select id from public.kr8_prizes where member_id = :'C' and kind = 'weekly'))) = 'no error', 'week closed 30 h ago (past 24 h) opens by itself');

-- ── E. Rings ignore linked accounts; team accounts never count ──
insert into public.kr8_team_accounts (user_id, note) values (:'T', 'Kring Team');
select pg_temp.reel(:'A', '11110000-0000-4000-8000-000000000001', now() - interval '1 hour') is not null as x \gset
select pg_temp.reel(:'T', '11110000-0000-4000-8000-000000000002', now() - interval '1 hour') is not null as x \gset
insert into public.kr8_post_places (post_id, place_id, position) values ('11110000-0000-4000-8000-000000000001', :'PL', 1), ('11110000-0000-4000-8000-000000000002', :'PL', 1);
insert into public.kr8_post_likes (post_id, user_id) values ('11110000-0000-4000-8000-000000000001', :'B'), ('11110000-0000-4000-8000-000000000001', :'C'), ('11110000-0000-4000-8000-000000000001', :'T'),
  ('11110000-0000-4000-8000-000000000002', :'C');
insert into public.kr8_post_saves (post_id, user_id) values ('11110000-0000-4000-8000-000000000001', :'B');
select pg_temp.ok((select l_local = 1 and s_local = 0 and score = 1 from public.kr8_reel_scores(now() - interval '1 day', now() + interval '1 day', now() + interval '1 day', false) where post_id = '11110000-0000-4000-8000-000000000001'),
  'A''s Reel: B''s like + save (linked) and the team''s like do not count, C''s like does (1 Ring)');
select pg_temp.ok(not exists (select 1 from public.kr8_reel_scores(now() - interval '1 day', now() + interval '1 day', now() + interval '1 day', false) where author = :'T'), 'team account''s Reel is not on the board');
select pg_temp.ok((pg_temp.as_json(:'X', 'select public.kr8_admin_dup_overview()') -> 'mutual' -> 0 ->> 'saves') = '1', 'admin sees B''s like + save on A''s Reel');
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_dup_resolve(%L, array[%L]::uuid[], ''not_same'')', :'A', :'B')) ->> 'n')::int >= 1, 'admin: not the same person');
select pg_temp.ok((select score = 5 from public.kr8_reel_scores(now() - interval '1 day', now() + interval '1 day', now() + interval '1 day', false) where post_id = '11110000-0000-4000-8000-000000000001'), 'dismissed link → B''s like + save count again (1+1+3)');
update public.kr8_account_links set dismissed_at = null;
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_dup_resolve(%L, array[%L]::uuid[], ''move_reels'')', :'C', :'A')) ->> 'n') = '1', 'move Reels to the kept account');
select pg_temp.ok((select author = :'C' from public.kr8_posts where id = '11110000-0000-4000-8000-000000000001'), 'Reel now belongs to the kept account');
update public.kr8_posts set author = :'A' where id = '11110000-0000-4000-8000-000000000001';
insert into public.kr8_prizes (member_id, kind, week, rank, amount_thb, is_test) values (:'B', 'weekly', '2026-11-09', 2, 900, false);
select pg_temp.ok((pg_temp.as_json(:'X', format('select public.kr8_admin_dup_resolve(%L, array[%L]::uuid[], ''hide'')', :'A', :'B')) ->> 'n') = '1', 'hide the other account');
select pg_temp.ok((select ghost from public.kr8_members where user_id = :'B') and (select status = 'cancelled' from public.kr8_prizes where member_id = :'B' and kind = 'weekly'), 'hidden account: ghost on, unclaimed prize cancelled');
select pg_temp.ok(pg_temp.as_err(:'A', format('select public.kr8_admin_dup_resolve(%L, array[%L]::uuid[], ''hide'')', :'A', :'C')) ~ 'KR8_ADMIN_ONLY', 'member cannot hide others');
select pg_temp.ok(pg_temp.as_err(:'A', 'select public.kr8_admin_dup_overview()') ~ 'KR8_ADMIN_ONLY', 'member cannot open Same person?');
select pg_temp.ok(pg_temp.as_err(:'A', 'select public.kr8_refresh_links(null)') ~ 'permission denied', 'member cannot call internal link functions');
select pg_temp.ok(pg_temp.as_err(:'A', format('select public.kr8_note_line_taken(%L, %L)', :'A', :'C')) ~ 'permission denied', 'member cannot write a LINE link note');

-- ── 0067. records survive deletion; Founding once per person ──
select pg_temp.reel(:'T') is not null as x \gset
select pg_temp.ok(public.kr8_founding_try(:'T') is null, 'team account never gets Founding Local');
delete from auth.users where id = :'A';
select pg_temp.ok((select member_id is null and member_no_copy = 901 and email_hash = public.kr8_id_hash('joob@example.test') and member_deleted_at is not null from public.kr8_prizes where founding_no = 1 and kind = 'founding'), 'deleted account: prize kept, name gone, number + email hash kept');
select pg_temp.ok((select c.member_id is null and c.member_no_copy = 901 and k.code like 'TM-CODE-%' and k.assigned_to = :'A' from public.kr8_reward_claims c join public.kr8_reward_codes k on k.id = c.code_id where c.member_no_copy = 901), 'deleted account: which code went where is kept');
select pg_temp.ok((select count(*) >= 1 from public.kr8_prize_faces where member_no_copy = 901), 'prize winner''s face print kept');
select pg_temp.ok(not exists (select 1 from public.kr8_face_prints where user_id = :'A'), 'the account''s own face rows are gone');
-- comes back with the same email
\set A2 'a2000000-0000-4000-8000-0000000000a2'
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at) values ('00000000-0000-0000-0000-000000000000', :'A2', 'authenticated', 'authenticated', 'JOOB@example.test', now());
insert into public.kr8_members (user_id, first_name, photo, age_ok_at, member_no, langs) values (:'A2', 'Joob', 'https://x/a.jpg', now(), 950, '{TH}');
select pg_temp.reel(:'A2') is not null as x \gset
select pg_temp.ok(public.kr8_founding_try(:'A2') is null, 'same email after deleting → no 2nd Founding Local');
-- comes back with a new email but the same face
\set A3 'a3000000-0000-4000-8000-0000000000a3'
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at) values ('00000000-0000-0000-0000-000000000000', :'A3', 'authenticated', 'authenticated', 'new@example.test', now());
insert into public.kr8_members (user_id, first_name, photo, age_ok_at, member_no, langs) values (:'A3', 'J', 'https://x/a.jpg', now(), 951, '{TH}');
insert into public.kr8_face_prints (user_id, descriptor, source) values (:'A3', pg_temp.face(1, 0.02, 9), 'verify');
select pg_temp.reel(:'A3') is not null as x \gset
select pg_temp.ok(public.kr8_founding_try(:'A3') is null, 'new email, same face → no 2nd Founding Local');
-- same LINE as a Founding winner (D)
\set D2 'd2000000-0000-4000-8000-0000000000d2'
delete from auth.users where id = :'D';
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at) values ('00000000-0000-0000-0000-000000000000', :'D2', 'authenticated', 'authenticated', 'line_u' || repeat('d', 32) || '@users.kringapp.com', now());
insert into public.kr8_members (user_id, first_name, photo, age_ok_at, member_no, langs) values (:'D2', 'Nok', 'https://x/d.jpg', now(), 952, '{TH}');
insert into public.kr8_line_links (line_sub, user_id) values ('U' || repeat('d', 32), :'D2');
select pg_temp.reel(:'D2') is not null as x \gset
select pg_temp.ok(public.kr8_founding_try(:'D2') is null, 'same LINE after deleting → no 2nd Founding Local');
-- a genuinely new person still gets one
\set N 'ab000000-0000-4000-8000-0000000000ab'
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at) values ('00000000-0000-0000-0000-000000000000', :'N', 'authenticated', 'authenticated', 'fresh@example.test', now());
insert into public.kr8_members (user_id, first_name, photo, age_ok_at, member_no, langs) values (:'N', 'Fah', 'https://x/n.jpg', now(), 953, '{TH}');
insert into public.kr8_face_prints (user_id, descriptor, source) values (:'N', pg_temp.face(21), 'verify');
select pg_temp.reel(:'N') is not null as x \gset
select pg_temp.ok(exists (select 1 from public.kr8_prizes where member_id = :'N' and kind = 'founding'), 'a new person still gets Founding Local');
-- card deleted on its own (admin keeps sign-in)
delete from public.kr8_members where user_id = :'C';
select pg_temp.ok((select count(*) >= 1 from public.kr8_prizes where member_no_copy = 903 and member_id is null and email_hash is not null), 'card-only delete keeps prize rows too');
rollback;
