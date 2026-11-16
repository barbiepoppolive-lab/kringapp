-- SCRATCH DATABASE ONLY. Proves 0071 (audit 16 Nov P2-5): the blink fallback is stored as "no blink seen".
\set QUIET on
create or replace function pg_temp.ok(c boolean, what text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FAIL: %', what; end if; raise notice 'PASS: %', what; end $$;
create or replace function pg_temp.err(sqlt text) returns text language plpgsql as $$
begin execute sqlt; return 'no error'; exception when others then return sqlerrm; end $$;
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blink@example.com', now()) on conflict do nothing;
insert into public.kr8_members (user_id, first_name, langs, area, who, age_ok_at, photo) values ('71000000-0000-0000-0000-000000000001', 'Nok', array['TH'], 'Bangkok', 'local', now(), 'data:image/jpeg;base64,AAAA') on conflict do nothing;
insert into storage.buckets (id, name, public) values ('kr8-verify', 'kr8-verify', false) on conflict do nothing;
insert into storage.objects (bucket_id, name) values
  ('kr8-verify', '71000000-0000-0000-0000-000000000001/71000000-0000-0000-0000-0000000000a1.jpg'),
  ('kr8-verify', '71000000-0000-0000-0000-000000000001/71000000-0000-0000-0000-0000000000a2.jpg') on conflict do nothing;
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;
select public.kr8_request_verification('71000000-0000-0000-0000-000000000001/71000000-0000-0000-0000-0000000000a1.jpg', 'face-2026-11-14',
  '{"straight":true,"left":true,"right":true,"blink":false,"blink_fallback":true,"match":0.41}');
reset role;
select pg_temp.ok((select live_check->>'blink' = 'false' and live_check->>'blink_fallback' = 'true' from public.kr8_verifications
                   where user_id = '71000000-0000-0000-0000-000000000001' order by created_at desc limit 1), 'fallback stored as no blink seen');
set role authenticated;
select public.kr8_request_verification('71000000-0000-0000-0000-000000000001/71000000-0000-0000-0000-0000000000a2.jpg', 'face-2026-11-14',
  '{"straight":true,"left":true,"right":true,"blink":true}');
reset role;
select pg_temp.ok((select live_check->>'blink' = 'true' and live_check->>'blink_fallback' = 'false' from public.kr8_verifications
                   where user_id = '71000000-0000-0000-0000-000000000001' and status = 'pending'), 'a real blink (old app too) stored as a blink');
set role authenticated;
select pg_temp.ok(pg_temp.err($$select public.kr8_request_verification('71000000-0000-0000-0000-000000000001/71000000-0000-0000-0000-0000000000a2.jpg', 'face-2026-11-14',
  '{"straight":true,"left":true,"right":true,"blink":false}')$$) like '%KR8_LIVE_CHECK%', 'no blink and no fallback is still refused');
reset role;
\echo ALL 0071 CHECKS PASSED
