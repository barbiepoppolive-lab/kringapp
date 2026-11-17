-- 0097 test (TEST DB only). Everything rolls back: the block ends by raising its own report as the error message.
-- Expect a final line "REPORT ... ALL OK".
do $$
declare
  m uuid := '5498e83b-775a-4902-94a3-9ab191875b0a';   -- test4: unverified, member_no > 68 → face-gated
  other uuid := '85d3d505-f42f-47e3-a1a0-6f72df743043'; -- test1
  adm uuid := 'c68f7b80-b7b4-4078-a6bf-71e8b39d3d49';   -- admin-test
  tid uuid; tid2 uuid; r text := ''; ok boolean := true; e text; j jsonb; n int;
  procedure_dummy int;
begin
  update public.kr8_members set verified = false, ghost = false where user_id = m;
  delete from public.kr8_threads where (user_a = m or user_b = m);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  if not public.kr8_face_gate(m) then r := r || ' [precondition: test4 not gated]'; ok := false; end if;

  -- 1. a normal hello is still gated
  begin perform public.kr8_send_hello(other, 'hi there'); r := r || ' 1:FAIL(no gate)'; ok := false;
  exception when others then e := sqlerrm; r := r || ' 1:' || e; if e <> 'KR8_VERIFY_FIRST' then ok := false; end if; end;

  -- 2. help thread opens, status open, first message carries [Help]
  tid := public.kr8_help_open('Shared my link on LINE, why no Rings?');
  select status into e from public.kr8_threads where id = tid;
  r := r || ' 2:' || e; if e <> 'open' then ok := false; end if;
  select body into e from public.kr8_messages where thread_id = tid order by id desc limit 1;
  if e <> '[Help] Shared my link on LINE, why no Rings?' then r := r || ' 2b:FAIL ' || e; ok := false; end if;
  -- double tap = one message
  tid2 := public.kr8_help_open('Shared my link on LINE, why no Rings?');
  select count(*) into n from public.kr8_messages where thread_id = tid;
  r := r || ' 2c:msgs=' || n; if n <> 1 or tid2 <> tid then ok := false; end if;

  -- 3. the gated member keeps chatting with the team (no one-message rule, no face gate)
  perform public.kr8_send_message(tid, 'Also, when does the week end?');
  r := r || ' 3:ok';

  -- 4/5. links still refused
  begin perform public.kr8_send_message(tid, 'see www.scam.com'); r := r || ' 4:FAIL'; ok := false;
  exception when others then r := r || ' 4:' || sqlerrm; if sqlerrm <> 'KR8_NO_LINKS' then ok := false; end if; end;
  begin perform public.kr8_help_open('go to bit.ly/abc'); r := r || ' 5:FAIL'; ok := false;
  exception when others then r := r || ' 5:' || sqlerrm; if sqlerrm <> 'KR8_NO_LINKS' then ok := false; end if; end;

  -- 6. event log: insert via RPC only
  perform public.kr8_help_event('shown', 'rings_line', 'why no rings', 'th');
  perform public.kr8_help_event('not_quite', 'rings_line', null, 'th');
  begin perform count(*) from public.kr8_help_events; r := r || ' 6:FAIL(read)'; ok := false;
  exception when others then r := r || ' 6:noread'; end;
  begin insert into public.kr8_help_events (kind) values ('up'); r := r || ' 6b:FAIL(insert)'; ok := false;
  exception when others then r := r || ' 6b:noinsert'; end;

  -- 7. member can't see cases or reply as team
  begin perform public.kr8_admin_help_cases(); r := r || ' 7:FAIL'; ok := false;
  exception when others then r := r || ' 7:' || sqlerrm; end;
  begin perform public.kr8_admin_team_reply(m, 'x'); r := r || ' 7b:FAIL'; ok := false;
  exception when others then r := r || ' 7b:' || sqlerrm; end;

  -- 8. admin sees one case for test4 with the question + 2 unanswered, then replies as the team
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  j := public.kr8_admin_help_cases();
  select x into j from jsonb_array_elements(j) x where x ->> 'member' = m::text;
  r := r || ' 8:unanswered=' || coalesce(j ->> 'unanswered', 'none');
  if j is null or (j ->> 'unanswered')::int <> 2 or j ->> 'question' <> '[Help] Shared my link on LINE, why no Rings?' then ok := false; end if;
  perform public.kr8_admin_team_reply(m, 'Hi! LINE opens don''t count. Share on IG instead ครับ');
  select sender::text into e from public.kr8_messages where thread_id = tid order by id desc limit 1;
  if e <> 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa' then r := r || ' 8b:FAIL sender ' || e; ok := false; end if;
  j := public.kr8_admin_help_cases();
  if exists (select 1 from jsonb_array_elements(j) x where x ->> 'member' = m::text) then r := r || ' 8c:FAIL still open'; ok := false; else r := r || ' 8c:answered'; end if;
  j := public.kr8_admin_help_stats(30);
  r := r || ' 8d:stats=' || (j -> 'faqs' -> 0 ->> 'faq');

  -- 9. the member sees the team reply in their thread
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  select count(*) into n from public.kr8_thread_messages(tid, 0) t where not t.mine;
  r := r || ' 9:team_msgs=' || n; if n <> 1 then ok := false; end if;

  raise exception 'REPORT%  %', r, case when ok then 'ALL OK' else 'SOMETHING FAILED' end;
end $$;
