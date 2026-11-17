-- 0104 · Kring Autopilot v2 — M7: AI Slot (BUILT, OFF · OpenRouter xiaomi/mimo-v2-flash:free · Rules Fallback · Strict PII Firewall)
--
-- ADDITIVE & RE-RUNNABLE (idempotent). Built on live-base (8a29fdb) + 0098..0103.
-- HARD RULES:
--   1. Built OFF by default ('ai_helper' mode = 'off') with ZERO keys in code.
--   2. Reads secret 'openrouter_api_key' from vault.decrypted_secrets (does NOT exist yet — founder adds tomorrow).
--   3. Allowed tasks ONLY: 'morning_brief', 'error_explain', 'caption_draft'. Any other task raises KR8_AI_TASK_FORBIDDEN.
--   4. NEVER sends member names, chats, photos, or face data — public.kr8_ai_guard_input recursively inspects all nested
--      keys, string patterns, and numeric arrays BEFORE checking mode/secret and raises KR8_AI_PRIVACY_BLOCKED on violation.
--   5. Whenever OFF, DRY-RUN, paused, missing secret, at daily cap, or failing HTTP, public.kr8_ai_call falls back
--      seamlessly to deterministic rules (public.kr8_ai_rules_fallback).
--
-- UNDO:
--   begin;
--   drop function if exists public.kr8_admin_ai_slot_status();
--   drop function if exists public.kr8_ai_call(text, jsonb);
--   drop function if exists public.kr8_ai_rules_fallback(text, jsonb);
--   drop function if exists public.kr8_ai_guard_input(text, jsonb);
--   drop function if exists public.kr8_ai_secret_key();
--   commit;

begin;

-- Ensure ai_helper stays OFF by default (never auto-enable!)
insert into public.kr8_robot (name, title, note, mode, daily_cap, schedule)
values (
  'ai_helper',
  'AI helper slot (Mimo v2)',
  'Built OFF: OpenRouter xiaomi/mimo-v2-flash:free for morning brief wording, error explain, and caption drafts. Blocks names, chats, photos & face data; falls back to rules.',
  'off',
  50,
  'on-demand'
)
on conflict (name) do update
   set title    = excluded.title,
       note     = excluded.note,
       schedule = excluded.schedule;

-- ───────────────────────── 1. Safe Vault secret lookup (no secret created!) ─────────────────────────
create or replace function public.kr8_ai_secret_key()
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  k text := null;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    begin
      select nullif(btrim(decrypted_secret), '')
        into k
        from vault.decrypted_secrets
       where name = 'openrouter_api_key'
       limit 1;
    exception when others then
      k := null;
    end;
  end if;
  return k;
end $$;
revoke all on function public.kr8_ai_secret_key() from public, anon, authenticated;

-- ───────────────────────── 2. Recursive PII / Chat / Photo / Biometric Firewall ─────────────────────────
create or replace function public.kr8_ai_guard_input(p_task text, p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  t text := lower(btrim(coalesce(p_task, '')));
  inp jsonb := coalesce(p_input, '{}'::jsonb);
  k text;
  v jsonb;
  elem jsonb;
  sval text;
  arr_len int;
  num_count int;
begin
  -- Allowlist of the 3 permitted tasks ONLY
  if t not in ('morning_brief', 'error_explain', 'caption_draft') then
    raise exception 'KR8_AI_TASK_FORBIDDEN: %', coalesce(p_task, 'null');
  end if;

  if jsonb_typeof(inp) = 'object' then
    for k, v in select * from jsonb_each(inp) loop
      if lower(k) in (
        'name', 'first_name', 'last_name', 'display_name', 'member_name', 'full_name', 'username',
        'email', 'phone', 'ig_handle', 'tiktok_handle', 'line_to', 'line_sub',
        'chat', 'chats', 'message', 'messages', 'thread', 'threads', 'dm', 'chat_body',
        'photo', 'photos', 'selfie', 'selfie_path', 'face_photo', 'poster_path', 'video_path', 'media_path', 'avatar', 'image', 'image_url',
        'face', 'emb', 'card_emb', 'descriptor', 'descriptors', 'face_vectors', 'face_prints', 'biometric', 'embedding',
        'user_id', 'member_id', 'author_id'
      ) then
        raise exception 'KR8_AI_PRIVACY_BLOCKED: forbidden field "%"', k;
      end if;

      -- Recurse into nested objects / arrays / values
      if jsonb_typeof(v) in ('object', 'array') then
        perform public.kr8_ai_guard_input(t, v);
      elsif jsonb_typeof(v) = 'string' then
        sval := v #>> '{}';
        if sval ~* '^data:(image|video)/'
           or sval ~* '/storage/v1/object/'
           or sval ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]+\.(jpg|jpeg|png|webp|mp4|gif)'
           or sval ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' then
          raise exception 'KR8_AI_PRIVACY_BLOCKED: forbidden media/email/storage value in "%"', k;
        end if;
      end if;
    end loop;
  elsif jsonb_typeof(inp) = 'array' then
    arr_len := jsonb_array_length(inp);
    if arr_len >= 64 then
      select count(*)::int into num_count
        from jsonb_array_elements(inp) e
       where jsonb_typeof(e) = 'number';
      if num_count >= 64 then
        raise exception 'KR8_AI_PRIVACY_BLOCKED: numeric embedding vector blocked (len=%)', arr_len;
      end if;
    end if;
    for elem in select * from jsonb_array_elements(inp) loop
      if jsonb_typeof(elem) in ('object', 'array') then
        perform public.kr8_ai_guard_input(t, elem);
      elsif jsonb_typeof(elem) = 'string' then
        sval := elem #>> '{}';
        if sval ~* '^data:(image|video)/'
           or sval ~* '/storage/v1/object/'
           or sval ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' then
          raise exception 'KR8_AI_PRIVACY_BLOCKED: forbidden media/email value in array';
        end if;
      end if;
    end loop;
  end if;

  return inp;
end $$;
revoke all on function public.kr8_ai_guard_input(text, jsonb) from public, anon, authenticated;

-- ───────────────────────── 3. Deterministic Rules Fallback ─────────────────────────
create or replace function public.kr8_ai_rules_fallback(p_task text, p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql immutable set search_path = public, pg_temp as $$
declare
  t text := lower(btrim(coalesce(p_task, '')));
  new_m int := coalesce((p_input ->> 'new_members_today')::int, 0);
  held_n int := coalesce((p_input ->> 'held_count')::int, 0);
  held_b int := coalesce((p_input ->> 'held_thb')::int, 0);
  v_avail int := coalesce((p_input ->> 'available_vouchers')::int, 10);
  errs int := coalesce((p_input ->> 'errors_24h')::int, 0);
  err_code text := coalesce(nullif(btrim(p_input ->> 'error_code'), ''), 'UNKNOWN_ERROR');
  subsys text := coalesce(nullif(btrim(p_input ->> 'subsystem'), ''), 'app');
  area_txt text := coalesce(nullif(btrim(p_input ->> 'area'), ''), 'Bangkok');
  spot_txt text := coalesce(nullif(btrim(p_input ->> 'vibe'), ''), 'local street cafe');
begin
  if t = 'morning_brief' then
    return jsonb_build_object(
      'headline', format(
        '+%s real member(s) today · %s held payout(s) (THB %s) · %s voucher(s) left · %s error(s) in 24h.',
        new_m, held_n, held_b, v_avail, errs
      ),
      'next_step', case
        when v_avail <= 5 then 'Top up voucher codes in Codes first.'
        when held_n > 0 then 'Review held payouts in Needs you.'
        when errs > 0 then 'Inspect recent errors in Problems.'
        else 'All quiet — no urgent founder actions needed.'
      end
    );
  elsif t = 'error_explain' then
    return jsonb_build_object(
      'plain_english', case
        when err_code ilike '%TIMEOUT%' or err_code ilike '%NETWORK%' then
          format('A temporary connection timeout occurred in %s. Safe retries handle transient spikes automatically.', subsys)
        when err_code ilike '%STORAGE%' or err_code ilike '%UPLOAD%' then
          format('A media upload to %s did not finish (often weak mobile signal). Self-fix cleans >24h orphan files automatically.', subsys)
        when err_code ilike '%FACE%' or err_code ilike '%VERIFY%' then
          'A phone camera face-check frame did not pass live movement within the time limit; the member can retry.'
        else
          format('Error "%s" was logged in %s. Check Health Watch and recent client events if count rises.', err_code, subsys)
      end,
      'recommended_action', 'Watch 24h count; no manual DB intervention required unless Health Watch turns red.'
    );
  elsif t = 'caption_draft' then
    return jsonb_build_object(
      'caption_th', format('มุมดีๆ ย่าน %s วันนี้ บรรยากาศสบายๆ แวะมาลองกันได้นะ ปักหมุดไว้ให้ในคลิปแล้ว!', area_txt),
      'caption_en', format('Good vibes around %s today (%s) — place pin attached on this Reel!', area_txt, spot_txt)
    );
  end if;

  raise exception 'KR8_AI_TASK_FORBIDDEN: %', coalesce(p_task, 'null');
end $$;
revoke all on function public.kr8_ai_rules_fallback(text, jsonb) from public, anon, authenticated;

-- ───────────────────────── 4. Main kr8_ai_call(task, input) Server Function ─────────────────────────
create or replace function public.kr8_ai_call(p_task text, p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t text := lower(btrim(coalesce(p_task, '')));
  clean_in jsonb;
  rmode text;
  gate text;
  api_key text;
  fb jsonb;
  sys_prompt text;
  http_status int;
  http_body jsonb;
  ai_text text;
  ai_json jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  -- Step 1: ALWAYS run privacy & task firewall FIRST (even when OFF!)
  clean_in := public.kr8_ai_guard_input(t, coalesce(p_input, '{}'::jsonb));
  fb := public.kr8_ai_rules_fallback(t, clean_in);

  -- Step 2: Check kill switch, mode, secret, and daily cap -> clean rules fallback
  if public.kr8_autopilot_paused() then
    return jsonb_build_object(
      'ok', true,
      'task', t,
      'model', 'xiaomi/mimo-v2-flash:free',
      'used_ai', false,
      'fallback_reason', 'autopilot_paused',
      'output', fb
    );
  end if;

  rmode := public.kr8_robot_mode('ai_helper');
  if rmode <> 'on' then
    return jsonb_build_object(
      'ok', true,
      'task', t,
      'model', 'xiaomi/mimo-v2-flash:free',
      'used_ai', false,
      'fallback_reason', 'robot_' || rmode,
      'output', fb
    );
  end if;

  api_key := public.kr8_ai_secret_key();
  if api_key is null then
    return jsonb_build_object(
      'ok', true,
      'task', t,
      'model', 'xiaomi/mimo-v2-flash:free',
      'used_ai', false,
      'fallback_reason', 'missing_secret',
      'output', fb
    );
  end if;

  gate := public.kr8_robot_can_act('ai_helper');
  if gate <> 'act' then
    return jsonb_build_object(
      'ok', true,
      'task', t,
      'model', 'xiaomi/mimo-v2-flash:free',
      'used_ai', false,
      'fallback_reason', gate,
      'output', fb
    );
  end if;

  -- Step 3: If synchronous pgsql-http extension is installed, call OpenRouter xiaomi/mimo-v2-flash:free;
  -- otherwise (or on any network/parse error) fall back cleanly to rules!
  if to_regprocedure('extensions.http_post(varchar,varchar,varchar)') is null
     and to_regprocedure('public.http_post(varchar,varchar,varchar)') is null then
    return jsonb_build_object(
      'ok', true,
      'task', t,
      'model', 'xiaomi/mimo-v2-flash:free',
      'used_ai', false,
      'fallback_reason', 'sync_http_ext_not_installed',
      'output', fb
    );
  end if;

  sys_prompt := case t
    when 'morning_brief' then 'Return concise plain-English JSON {"headline":"...","next_step":"..."} summarizing aggregate app metrics.'
    when 'error_explain' then 'Return plain-English JSON {"plain_english":"...","recommended_action":"..."} explaining the technical error.'
    else 'Return JSON {"caption_th":"...","caption_en":"..."} with natural Bangkok Thai + English Reel caption, zero banned words.'
  end;

  begin
    execute $q$
      select status, content::jsonb
        from extensions.http((
          'POST',
          'https://openrouter.ai/api/v1/chat/completions',
          array[
            extensions.http_header('Authorization', 'Bearer ' || $1),
            extensions.http_header('Content-Type', 'application/json')
          ],
          'application/json',
          $2
        )::extensions.http_request)
    $q$
    into http_status, http_body
    using api_key, jsonb_build_object(
      'model', 'xiaomi/mimo-v2-flash:free',
      'temperature', 0.2,
      'messages', jsonb_build_array(
        jsonb_build_object('role', 'system', 'content', sys_prompt),
        jsonb_build_object('role', 'user', 'content', clean_in::text)
      )
    )::text;

    ai_text := http_body #>> '{choices,0,message,content}';
    if http_status between 200 and 299 and ai_text is not null then
      ai_json := ai_text::jsonb;
      if t = 'caption_draft' then
        if not (public.kr8_member_copy_clean(ai_json ->> 'caption_th') and public.kr8_member_copy_clean(ai_json ->> 'caption_en')) then
          raise exception 'KR8_AI_BANNED_WORD_IN_OUTPUT';
        end if;
      end if;

      perform public.kr8_robot_record(
        'ai_helper',
        'ai_call_' || t,
        'xiaomi/mimo-v2-flash:free',
        jsonb_build_object('task', t, 'used_ai', true, 'note', 'OpenRouter xiaomi/mimo-v2-flash:free succeeded'),
        null,
        false
      );

      update public.kr8_robot
         set last_run = now(), last_ok = true, last_note = 'ON · ' || t || ' via Mimo v2'
       where name = 'ai_helper';

      return jsonb_build_object(
        'ok', true,
        'task', t,
        'model', 'xiaomi/mimo-v2-flash:free',
        'used_ai', true,
        'fallback_reason', null,
        'output', ai_json
      );
    end if;
  exception when others then
    null; -- Fall through to deterministic rules fallback
  end;

  return jsonb_build_object(
    'ok', true,
    'task', t,
    'model', 'xiaomi/mimo-v2-flash:free',
    'used_ai', false,
    'fallback_reason', 'provider_error_fallback',
    'output', fb
  );
end $$;
revoke all on function public.kr8_ai_call(text, jsonb) from public, anon;
grant execute on function public.kr8_ai_call(text, jsonb) to authenticated;

-- ───────────────────────── 5. Admin AI Slot Status RPC ─────────────────────────
create or replace function public.kr8_admin_ai_slot_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  rmode text := public.kr8_robot_mode('ai_helper');
  has_key boolean := public.kr8_ai_secret_key() is not null;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  return jsonb_build_object(
    'at', now(),
    'mode', rmode,
    'model', 'xiaomi/mimo-v2-flash:free',
    'secret_name', 'openrouter_api_key',
    'secret_configured', has_key,
    'fallback_active', (rmode <> 'on' or not has_key or public.kr8_autopilot_paused()),
    'allowed_tasks', jsonb_build_array('morning_brief', 'error_explain', 'caption_draft'),
    'blocked_fields', jsonb_build_array('names', 'chats', 'photos', 'face_data')
  );
end $$;
revoke all on function public.kr8_admin_ai_slot_status() from public, anon;
grant execute on function public.kr8_admin_ai_slot_status() to authenticated;

commit;
