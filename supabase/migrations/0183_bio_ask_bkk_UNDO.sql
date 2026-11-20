-- UNDO 0183: back to the 0182 state (bio rule = kr8_text_ok, no kr8_set_bio, no bio translations, "Ask a Thai" texts).
begin;
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
  if coalesce(p_bio, '') <> '' and not public.kr8_text_ok(p_bio, 80) then raise exception 'KR8_BAD_BIO'; end if;
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


drop function if exists public.kr8_set_bio(text);
drop function if exists public.kr8_bio_ok(text);
delete from public.kr8_ask_tr where kind = 'b';
alter table public.kr8_ask_tr drop constraint if exists kr8_ask_tr_kind_check;
alter table public.kr8_ask_tr add constraint kr8_ask_tr_kind_check check (kind in ('q', 'qd', 'a'));
update public.ob_kb set value_text = replace(replace(value_text, 'Ask BKK', 'Ask a Thai'), 'ถาม BKK', 'ถามคนไทย'), updated_at = now()
 where key like 'kb\_%' and (value_text like '%Ask BKK%' or value_text like '%ถาม BKK%');
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
    values (uid, v_au, p_id, p_reason, left('Ask a Thai answer · ' || p_reason || ': “' || left(coalesce(nullif(btrim(v_body), ''), '(photo)'), 200) || '”', 300));
    select count(distinct reporter) into n from public.kr8_reports where ask_answer_id = p_id and handled_at is null;
    if n >= 3 then update public.kr8_ask_answers set hidden = true where id = p_id; end if;
  end if;
  insert into public.kr8_ask_answer_hidden (user_id, answer_id) values (uid, p_id) on conflict do nothing;
  if p_reason = 'block' then insert into public.kr8_blocks (blocker, blocked) values (uid, v_au) on conflict do nothing; end if;
end $function$;

commit;
