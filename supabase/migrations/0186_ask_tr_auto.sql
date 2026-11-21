-- 0186 (21 Nov, founder: "my screen is English but answers show in Thai"): Ask BKK texts were translated only when a SIGNED-IN reader
-- opened them, so new answers waited in one language and signed-out readers (and the admin "View as member" visitor) never got any.
-- Now every question, details line, answer, reply and bio is translated both ways (Thai <-> English) the moment it is saved, and a
-- 10-minute sweep catches anything missed (provider busy, cap reached, an edit). The work is done by the Edge Function
-- kr8-ask-translate (robot key, same vault secret as the face robot); pg_net calls are async, so saving a post never waits on it.
begin;

create or replace function public.kr8_ask_tr_call(p_body jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'face_robot_key' limit 1;
  if k is null or length(k) < 32 then return; end if;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/kr8-ask-translate',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kring-robot', k),
    body := p_body,
    timeout_milliseconds := 60000);
exception when others then null;   -- translation must never block saving a post
end $$;
revoke all on function public.kr8_ask_tr_call(jsonb) from public, anon, authenticated;

-- the sweep: both languages, up to 60 texts each run
create or replace function public.kr8_ask_tr_sweep() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.kr8_ask_tr_call('{"backfill":true,"target":"en","limit":60}'::jsonb);
  perform public.kr8_ask_tr_call('{"backfill":true,"target":"th","limit":60}'::jsonb);
end $$;
revoke all on function public.kr8_ask_tr_sweep() from public, anon, authenticated;

create or replace function public.kr8_ask_tr_on_save() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare items jsonb := '[]'::jsonb;
begin
  if tg_table_name = 'kr8_ask_answers' then
    if coalesce(new.hidden, false) or coalesce(btrim(new.body), '') = '' then return new; end if;
    if tg_op = 'UPDATE' and new.body is not distinct from old.body and new.hidden is not distinct from old.hidden then return new; end if;
    items := jsonb_build_array(jsonb_build_object('kind', 'a', 'id', new.id));
  elsif tg_table_name = 'kr8_posts' then
    if new.kind is distinct from 'ask' then return new; end if;
    if coalesce(btrim(new.body), '') <> '' and (tg_op = 'INSERT' or new.body is distinct from old.body) then
      items := items || jsonb_build_array(jsonb_build_object('kind', 'q', 'id', new.id)); end if;
    if coalesce(btrim(new.ask_details), '') <> '' and (tg_op = 'INSERT' or new.ask_details is distinct from old.ask_details) then
      items := items || jsonb_build_array(jsonb_build_object('kind', 'qd', 'id', new.id)); end if;
  elsif tg_table_name = 'kr8_members' then
    if coalesce(btrim(new.bio), '') = '' or (tg_op = 'UPDATE' and new.bio is not distinct from old.bio) then return new; end if;
    items := jsonb_build_array(jsonb_build_object('kind', 'b', 'id', new.user_id));
  end if;
  if jsonb_array_length(items) > 0 then
    perform public.kr8_ask_tr_call(jsonb_build_object('items', items, 'target', 'en'));
  end if;
  return new;
exception when others then return new;
end $$;
revoke all on function public.kr8_ask_tr_on_save() from public, anon, authenticated;

drop trigger if exists kr8_ask_tr_answers on public.kr8_ask_answers;
create trigger kr8_ask_tr_answers after insert or update of body, hidden on public.kr8_ask_answers
  for each row execute function public.kr8_ask_tr_on_save();
drop trigger if exists kr8_ask_tr_posts on public.kr8_posts;
create trigger kr8_ask_tr_posts after insert or update of body, ask_details on public.kr8_posts
  for each row execute function public.kr8_ask_tr_on_save();
drop trigger if exists kr8_ask_tr_bios on public.kr8_members;
create trigger kr8_ask_tr_bios after insert or update of bio on public.kr8_members
  for each row execute function public.kr8_ask_tr_on_save();

select cron.unschedule('kr8_ask_tr_sweep') where exists (select 1 from cron.job where jobname = 'kr8_ask_tr_sweep');
select cron.schedule('kr8_ask_tr_sweep', '*/10 * * * *', 'select public.kr8_ask_tr_sweep()');
commit;
