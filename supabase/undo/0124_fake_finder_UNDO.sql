-- UNDO 0124 Fake Finder. Quick off-switch without this file (all effects stop at once, nothing else changes):
--   update public.kr8_rings_config set value = 0 where key in ('fake_on', 'fake_effects_on');
-- Full undo (keeps the 0124 tables until the very end so nothing is lost by accident):
begin;

-- 1. stop the robot
do $$ begin
  if to_regclass('cron.job') is not null then
    begin perform cron.unschedule('kr8_fake_finder'); exception when others then null; end;   -- not scheduled: nothing to do
  end if;
end $$;
delete from public.kr8_heartbeat where job = 'kr8_fake_finder';
update public.kr8_robot_alerts set cleared_at = now(), cleared_by = 'undo 0124' where dedupe_key like 'fake:%' and cleared_at is null;

-- 2. take the patches back out of the live bodies (exact reverse of the 0124 replacements)
do $$
declare x record; src text; i int;
begin
  for x in select * from (values
    ('public.kr8_reel_scores(timestamptz,timestamptz,timestamptz,boolean,uuid)', array[
      'and exists (select 1 from public.kr8_members am where am.user_id = p.author and not am.ghost)
      and public.kr8_fake_level(p.author) <> ''red''   /*fake0124: red = off the board*/',
      'and exists (select 1 from public.kr8_members am where am.user_id = p.author and not am.ghost)',
      'and not m.ghost and public.kr8_fake_counts(m.user_id)   /*fake0124: amber unverified / red likes+saves give no Rings*/', 'and not m.ghost',
      'where o.opener is distinct from r.author and (o.opener is null or public.kr8_fake_counts(o.opener))   /*fake0124*/', 'where o.opener is distinct from r.author']),
    ('public.kr8_people(integer)', array[
      'and not public.kr8_face_gate(m.user_id) and public.kr8_fake_level(m.user_id) <> ''red''   /*fake0124*/', 'and not public.kr8_face_gate(m.user_id)']),
    ('public.kr8_claim_prize(uuid,text,text,real[],text)', array[
      'if public.kr8_fake_level(uid) = ''red'' then review := array_append(review, ''fake_red''); end if;   /*fake0124*/
  held := others is not null or cardinality(review) > 0;', 'held := others is not null or cardinality(review) > 0;']),
    ('public.kr8_founding_try(uuid)', array[
      'public.kr8_face_strength(a.source, b.source, public.kr8_face_dist(a.descriptor, b.descriptor)) = ''same''   /*fake0124*/',
      'public.kr8_face_dist(a.descriptor, b.descriptor) <= mx',
      'public.kr8_face_strength(a.source, ''verify'', public.kr8_face_dist(a.descriptor, k.descriptor)) = ''same''',
      'public.kr8_face_dist(a.descriptor, k.descriptor) <= mx'])
  ) t(fn, pairs) loop
    if to_regprocedure(x.fn) is null then continue; end if;
    src := pg_get_functiondef(to_regprocedure(x.fn));
    if position('fake0124' in src) = 0 then continue; end if;
    for i in 1 .. array_length(x.pairs, 1) / 2 loop src := replace(src, x.pairs[2 * i - 1], x.pairs[2 * i]); end loop;
    if position('fake0124' in src) > 0 or position('kr8_fake_' in src) > 0 or position('kr8_face_strength' in src) > 0 then
      raise exception 'UNDO 0124: % was edited after 0124; remove the fake0124 lines by hand', x.fn;
    end if;
    execute src;
  end loop;
end $$;

-- 3. face matching back to 0076: re-run kr8_face_nearest + kr8_face_match_links from 0076_kr8_face_dupes.sql (copy them here
--    or run that block by hand), THEN drop the 0124 helpers. Links downgraded by kr8_face_relink_0124(true) come back:
update public.kr8_account_links set dismissed_at = null, detail = detail - '0124' where reason = 'face' and detail ? '0124';

-- 4. client log back to 0058 (4 arguments; old and new app builds both still work: the new one retries without p_did)
drop function if exists public.kr8_log_client(text, text, text, text, text);
create or replace function public.kr8_log_client(p_kind text, p_code text default null, p_detail text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_kind is null or p_kind !~ '^[a-z_]{2,30}$' then return; end if;
  if (select count(*) from public.kr8_client_events where user_id = uid and created_at > now() - interval '1 hour') >= 60 then return; end if;
  insert into public.kr8_client_events (user_id, kind, code, detail, ua)
  values (uid, p_kind, left(p_code, 60), left(p_detail, 300), left(p_ua, 160));
end $$;
revoke all on function public.kr8_log_client(text, text, text, text) from public;
grant execute on function public.kr8_log_client(text, text, text, text) to authenticated;

-- 5. drop the 0124 functions (kr8_face_strength / kr8_face_cls only after step 3 is done) and, last, the tables
drop function if exists public.kr8_admin_fake_run(), public.kr8_admin_fake_decide(uuid, text), public.kr8_admin_fake_list(),
  public.kr8_fake_score_run(), public.kr8_fake_pair_ok(uuid, uuid), public.kr8_fake_skip(uuid), public.kr8_fake_name(uuid), public.kr8_fake_who(uuid),
  public.kr8_fake_counts(uuid), public.kr8_fake_level(uuid), public.kr8_fake_patch(text, text[]), public.kr8_face_relink_0124(boolean);
-- drop function if exists public.kr8_face_strength(text, text, double precision), public.kr8_face_cls(text);   -- after step 3
delete from public.kr8_robot where name = 'fake_finder';
-- drop table if exists public.kr8_fake_scores, public.kr8_fake_log, public.kr8_photo_ai;   -- the founder's decisions + history live here
-- alter table public.kr8_client_events drop column if exists did, drop column if exists ip_hash;
-- delete from public.kr8_rings_config where key in ('face_same_max_vv','face_maybe_max_vv','face_same_max_cc','face_maybe_max_cc',
--   'face_same_max_cv','face_maybe_max_cv','face_self_card_max','fake_sface_card_min','fake_on','fake_effects_on','fake_amber_min','fake_red_min');
commit;
