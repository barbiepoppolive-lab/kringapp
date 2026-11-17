-- 0079 (Terms agreement + promotion consent). TEST DATABASE ONLY. One DO block: it ends by raising 'ALL 0079 CHECKS PASSED', so
-- everything it made is rolled back. A failing check raises 'FAIL: …' instead.
do $t$
declare a uuid := '79000000-0000-4000-8000-000000000001'; b uuid := '79000000-0000-4000-8000-000000000002';
        c uuid := '79000000-0000-4000-8000-000000000003'; n int; j jsonb; e text;
begin
  insert into auth.users (id, email) values (a, 'a79@example.com'), (b, 'b79@example.com'), (c, 'c79@example.com');
  insert into public.kr8_members (user_id, first_name, photo, langs, area, who, age_ok_at, created_at, terms_version, terms_accepted_at) values
    (a, 'Ploy Saetang', 'https://x/a.jpg', '{TH}', 'Ari', 'local', now(), now(), 'member-2026-11-10', now() - interval '7 days'),
    (b, 'Beam', 'https://x/b.jpg', '{TH}', 'Siam', 'local', now(), now(), 'member-2026-11-10', now() - interval '7 days'),
    (c, 'Chai', 'https://x/c.jpg', '{TH}', 'Siam', 'local', now(), now(), 'member-2026-11-10', now() - interval '7 days');

  -- A agrees in the update dialog
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.kr8_agree_terms('member-2026-11-17', 'update');
  j := public.kr8_promo_get();
  if (j ->> 'on') is distinct from 'true' then raise exception 'FAIL: agree turns promotion on (%)', j; end if;
  if (j ->> 'terms_version') <> 'member-2026-11-17' then raise exception 'FAIL: version stored'; end if;
  -- the log: insert own rows only, server time only, no read / update / delete for members
  begin insert into public.kr8_terms_log (user_id, terms_version, kind, promo, source) values (b, 'member-2026-11-17', 'agree', true, 'update');
        e := 'wrote a row for someone else'; exception when insufficient_privilege then e := null; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  begin insert into public.kr8_terms_log (user_id, terms_version, kind, promo, source, at) values (a, 'member-2026-11-17', 'agree', true, 'update', now() - interval '1 year');
        e := 'chose own timestamp'; exception when insufficient_privilege then e := null; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  insert into public.kr8_terms_log (user_id, terms_version, kind, promo, source) values (a, 'member-2026-11-17', 'agree', true, 'update');
  select count(*) into n from public.kr8_terms_log;
  if n <> 0 then raise exception 'FAIL: member can read the log (% rows)', n; end if;
  begin update public.kr8_terms_log set promo = false; e := 'updated the log'; exception when insufficient_privilege then e := null; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  begin delete from public.kr8_terms_log; e := 'deleted from the log'; exception when insufficient_privilege then e := null; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  begin perform public.kr8_admin_promo_members(); e := 'member read the admin list'; exception when others then e := null; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  begin perform 1 from public.kr8_promo_ok_members; e := 'member read the view'; exception when insufficient_privilege then e := null; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  -- A turns it off in Settings; a later agree never turns it back on
  if public.kr8_set_promo(false) is not false then raise exception 'FAIL: switch off'; end if;
  perform public.kr8_agree_terms('member-2026-11-17', 'update');
  if (public.kr8_promo_get() ->> 'on') <> 'false' then raise exception 'FAIL: a later agree overwrote a no'; end if;
  if public.kr8_set_promo(true) is not true then raise exception 'FAIL: switch back on'; end if;
  execute 'reset role';

  -- B never agrees: switch ON is refused, OFF works; B is never listed
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.kr8_set_promo(true); e := 'switched on without the new Terms'; exception when others then
        if sqlerrm like '%KR8_TERMS%' then e := null; else e := sqlerrm; end if; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  if (public.kr8_promo_get() ->> 'on') is not null then raise exception 'FAIL: B should be never-asked'; end if;
  -- an older version (old app build fallback) never switches promotion on
  perform public.kr8_agree_terms('member-2026-11-10', 'update');
  if (public.kr8_promo_get() ->> 'on') is not null then raise exception 'FAIL: old version turned promotion on'; end if;
  execute 'reset role';

  -- C agrees on a new card
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.kr8_agree_terms('member-2026-11-17', 'signup');
  execute 'reset role';

  -- admin side (SQL editor): the log and the list
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.kr8_terms_log where user_id in (a, b, c);
  if n <> 7 then raise exception 'FAIL: expected 7 log rows, got %', n; end if;
  select count(*) into n from public.kr8_promo_ok_members where user_id in (a, b, c);
  if n <> 2 then raise exception 'FAIL: list should have A and C, got %', n; end if;
  if exists (select 1 from public.kr8_promo_ok_members where user_id = a and first_name <> 'Ploy') then raise exception 'FAIL: first name only'; end if;
  j := public.kr8_admin_promo_members();
  if j::text like '%79000000-%' then raise exception 'FAIL: admin list leaks user ids'; end if;
  perform set_config('kr8.ghost_set', '1', true);   -- ghost mode is only set through its own path (0061 trigger)
  update public.kr8_members set ghost = true where user_id = c;
  if exists (select 1 from public.kr8_promo_ok_members where user_id = c) then raise exception 'FAIL: ghost member listed'; end if;

  raise exception 'ALL 0079 CHECKS PASSED (rolled back)';
end $t$;
