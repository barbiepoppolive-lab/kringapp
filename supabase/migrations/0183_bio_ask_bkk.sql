-- 0183 (20 Nov, founder batch): profile bio + "Ask BKK" rename.
-- 1. kr8_bio_ok: a bio is at most 80 characters with no phone numbers (Thai digits too), links, @handles or LINE IDs.
--    kr8_save_card uses it, and kr8_set_bio saves just the bio (the card editor and Me).
-- 2. Bios are translated for readers in the other app language (Thai <-> English) by kr8-ask-translate, kept in kr8_ask_tr
--    with kind 'b' (ref = the member's user_id; the body hash makes an edited bio translate again).
-- 3. "Ask a Thai" is now "Ask BKK" / "ถาม BKK": help-bot knowledge rows and the admin report line.
begin;

create or replace function public.kr8_bio_ok(t text) returns boolean
language sql immutable set search_path to 'public', 'pg_temp' as $$
  select t is not null and length(btrim(t)) between 1 and 80
    -- links: http(s), www., line.me / lin.ee, or a bare domain like abc.com / shop.co.th
    and t !~* '(https?://|www\.|line\.me|lin\.ee|[a-z0-9-]+\.(com|net|org|co|th|me|ly|io|app|link|gg|to|cc|info|biz|xyz|site|shop)([^a-z0-9]|$))'
    -- @handles (LINE / IG ids)
    and t !~* '@[a-z0-9_.-]{3,}'
    -- LINE IDs: "line id abc", "line: abc", "ไลน์ abc", "ไอดีไลน์ abc", "add line abc"
    and t !~* '(^|[^a-z])(line|lineid)\s*(id|ไอดี)\s*[:：=]?\s*\S{3,}'
    and t !~* '(^|[^a-z])line\s*[:：=]\s*\S{3,}'
    and t !~* '(ไลน์|ไลน|ไอดีไลน์|ไอดี\s*ไลน์)\s*(id|ไอดี)?\s*[:：=]?\s*[a-z0-9._-]{3,}'
    and t !~* '(add|แอด|แอ๊ด)\s*(line|ไลน์)\s*[:：=]?\s*\S{3,}'
    -- phone numbers: 9+ digits with at most one space / dot / dash / bracket between them (Thai digits count too)
    and translate(t, '๐๑๒๓๔๕๖๗๘๙', '0123456789') !~ '\d([\s.()-]?\d){8,}'
$$;
grant execute on function public.kr8_bio_ok(text) to anon, authenticated;

create or replace function public.kr8_set_bio(p_bio text) returns text
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare uid uuid := auth.uid(); v text := btrim(coalesce(p_bio, ''));
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if v <> '' and not public.kr8_bio_ok(v) then raise exception 'KR8_BAD_BIO'; end if;
  update public.kr8_members set bio = v, updated_at = now() where user_id = uid;
  return v;
end $$;
revoke all on function public.kr8_set_bio(text) from public, anon;
grant execute on function public.kr8_set_bio(text) to authenticated;

CREATE OR REPLACE FUNCTION public.kr8_save_card(p_first_name text, p_langs text[], p_bio text, p_area text, p_who text, p_photo text DEFAULT NULL::text, p_age_ok boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); existed boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select exists(select 1 from public.kr8_members where user_id = uid) into existed;
  if not existed and not coalesce(p_age_ok, false) then raise exception 'KR8_AGE_CONFIRM'; end if;
  if not public.kr8_text_ok(p_first_name, 30) then raise exception 'KR8_BAD_NAME'; end if;
  -- 0183: bios use the stricter bio rule (phone numbers incl. Thai digits, links, @handles, LINE IDs)
  if coalesce(btrim(p_bio), '') <> '' and not public.kr8_bio_ok(p_bio) then raise exception 'KR8_BAD_BIO'; end if;
  if p_langs is null or cardinality(p_langs) not between 1 and 6
     or not (select array(select distinct upper(x) from unnest(p_langs) x)) <@ array['TH','EN','ZH','HI','JA','KO','FR','DE','ES','RU','MS','ID','VI','AR']
     then raise exception 'KR8_BAD_LANGS'; end if;
  if not public.kr8_area_ok(coalesce(p_area, 'Bangkok')) then raise exception 'KR8_BAD_AREA'; end if;
  if coalesce(p_who, 'local') not in ('local','traveller') then raise exception 'KR8_BAD_WHO'; end if;
  if nullif(p_photo, '') is not null and (p_photo !~ '^(data:image/(jpeg|png|webp);base64,|https://(profile\.line-scdn\.net|obs\.line-scdn\.net|pedxoxpammnyfnizljyj\.supabase\.co)/)' or length(p_photo) > 120000)
     then raise exception 'KR8_BAD_PHOTO'; end if;
  -- audit P1-1: a brand-new card must come with a photo the member uploaded (the phone has face-checked it).
  -- 1,500 characters ≈ 1 KB of image: a real 384 px card photo is 10–110 KB, a 1×1 pixel is under 200.
  if not existed and not (coalesce(p_photo, '') ~ '^(data:image/(jpeg|png|webp);base64,|https://pedxoxpammnyfnizljyj\.supabase\.co/storage/)'
                          and length(p_photo) >= 1500)
     then raise exception 'KR8_PHOTO_NEEDED'; end if;
  insert into public.kr8_members (user_id, first_name, langs, bio, area, who, photo, age_ok_at)
  values (uid, btrim(p_first_name), (select array(select distinct upper(x) from unnest(p_langs) x)), coalesce(btrim(p_bio), ''),
          coalesce(p_area, 'Bangkok'), coalesce(p_who, 'local'), nullif(p_photo, ''), now())
  on conflict (user_id) do update set
    first_name = excluded.first_name, langs = excluded.langs, bio = excluded.bio, area = excluded.area, who = excluded.who,
    photo = coalesce(excluded.photo, public.kr8_members.photo),
    -- a new photo needs a new check result (sent right after by kr8_note_photo_check)
    photo_check = case when excluded.photo is not null and excluded.photo is distinct from public.kr8_members.photo then null else public.kr8_members.photo_check end,
    updated_at = now();
  return public.kr8_me();
end $function$;

-- bio translations live with the Ask BKK translations (service role only, as before)
alter table public.kr8_ask_tr drop constraint if exists kr8_ask_tr_kind_check;
alter table public.kr8_ask_tr add constraint kr8_ask_tr_kind_check check (kind in ('q', 'qd', 'a', 'b'));

-- Ask BKK rename: help-bot knowledge rows
update public.ob_kb set value_text = replace(replace(value_text, 'Ask a Thai', 'Ask BKK'), 'ถามคนไทย', 'ถาม BKK'), updated_at = now()
 where key like 'kb\_%' and (value_text like '%Ask a Thai%' or value_text like '%ถามคนไทย%');

-- Ask BKK rename: the admin's report line for a reported answer
CREATE OR REPLACE FUNCTION public.kr8_ask_report(p_kind text, p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    values (uid, v_au, p_id, p_reason, left('Ask BKK answer · ' || p_reason || ': “' || left(coalesce(nullif(btrim(v_body), ''), '(photo)'), 200) || '”', 300));
    select count(distinct reporter) into n from public.kr8_reports where ask_answer_id = p_id and handled_at is null;
    if n >= 3 then update public.kr8_ask_answers set hidden = true where id = p_id; end if;
  end if;
  insert into public.kr8_ask_answer_hidden (user_id, answer_id) values (uid, p_id) on conflict do nothing;
  if p_reason = 'block' then insert into public.kr8_blocks (blocker, blocked) values (uid, v_au) on conflict do nothing; end if;
end $function$;

commit;
