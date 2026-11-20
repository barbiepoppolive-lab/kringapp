-- 0162 (20 Nov 2026, founder): a card photo must show ONE clear human face.
--  1. Upload: face-check-aws action 'photo' (AWS DetectFaces + DetectText) records a pass for the exact photo it checked
--     (kr8_photo_passes, sha-256 of the data URL). A trigger on kr8_members.photo only lets a member's own new photo in
--     when it has a pass from the last 6 h ('ok', or 'unchecked' when AWS was down → re-checked by the audit below).
--     SQL / cron / service role (auth.uid() null) and admins are not blocked.
--  2. Existing photos: kr8_photo_audit_run() (every 5 min) reads the feed-quality robot's photo scan (kr8_people_quality):
--     no face at all (objects, scenery, fireworks, cartoons) → photo_check 'no_face' → out of People + ONE friendly message;
--     unclear cases (body but no face found, group, screenshot text) → 'look' (admin chip, never hidden).
--     A new passing photo clears it automatically.
--  3. Admin: one honest chip per state (see adminV2 / adminApp).

alter table public.kr8_members drop constraint if exists kr8_members_photo_check_check;
alter table public.kr8_members add constraint kr8_members_photo_check_check
  check (photo_check = any (array['ok','unchecked','no_face','look']));

create table if not exists public.kr8_photo_passes (
  user_id uuid not null,
  sha text not null,
  verdict text not null check (verdict in ('ok','unchecked')),
  created_at timestamptz not null default now(),
  primary key (user_id, sha)
);
alter table public.kr8_photo_passes enable row level security;
revoke all on public.kr8_photo_passes from anon, authenticated;

create table if not exists public.kr8_photo_audit (
  user_id uuid primary key,
  md5 text not null,
  verdict text not null check (verdict in ('ok','no_face','look')),
  why text,
  admin_ok boolean not null default false,
  decided_at timestamptz not null default now()
);
alter table public.kr8_photo_audit enable row level security;
revoke all on public.kr8_photo_audit from anon, authenticated;

create table if not exists public.kr8_photo_notices (
  user_id uuid primary key,
  sent_at timestamptz not null default now(),
  message_id bigint
);
alter table public.kr8_photo_notices enable row level security;
revoke all on public.kr8_photo_notices from anon, authenticated;

-- called by the edge function with the service key only
create or replace function public.kr8_photo_pass_add(p_user uuid, p_sha text, p_verdict text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null or coalesce(p_sha, '') !~ '^[0-9a-f]{64}$' or p_verdict not in ('ok','unchecked') then raise exception 'KR8_BAD_PASS'; end if;
  insert into public.kr8_photo_passes (user_id, sha, verdict) values (p_user, p_sha, p_verdict)
  on conflict (user_id, sha) do update set verdict = case when excluded.verdict = 'ok' then 'ok' else public.kr8_photo_passes.verdict end, created_at = now();
  delete from public.kr8_photo_passes where created_at < now() - interval '2 days';
end $$;
revoke all on function public.kr8_photo_pass_add(uuid, text, text) from public, anon, authenticated;
grant execute on function public.kr8_photo_pass_add(uuid, text, text) to service_role;

create or replace function public.kr8_photo_face_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare sha text;
begin
  if new.photo is null then return new; end if;
  if tg_op = 'UPDATE' and new.photo is not distinct from old.photo then return new; end if;
  if auth.uid() is null or public.kr8_is_admin() then return new; end if;   -- SQL, cron, robots, admins
  sha := encode(sha256(convert_to(new.photo, 'UTF8')), 'hex');
  if not exists (select 1 from public.kr8_photo_passes p
                  where p.user_id = new.user_id and p.sha = sha and p.created_at > now() - interval '6 hours') then
    raise exception 'KR8_PHOTO_FACE';
  end if;
  -- a new photo that passed: back in People (the audit re-checks 'unchecked' ones)
  if coalesce(new.photo_check, '') in ('no_face','look') then new.photo_check := null; end if;
  return new;
end $$;
drop trigger if exists kr8_photo_face_guard on public.kr8_members;
create trigger kr8_photo_face_guard before insert or update of photo on public.kr8_members
  for each row execute function public.kr8_photo_face_guard();

-- kr8_save_card resets photo_check to null on a new photo; the guard above runs before it, so a passing photo always
-- starts clean. The audit decides again from the robot scan within ~5 minutes.

create or replace function public.kr8_photo_audit_run()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; f jsonb; nf int; person numeric; words int; v text; why text; hid int := 0; looks int := 0; cleared int := 0; sent int := 0; mid bigint;
begin
  for r in
    select m.user_id, m.member_no, m.photo_check, m.langs, md5(m.photo) as md5, q.features
      from public.kr8_members m
      join public.kr8_people_quality q on q.user_id = m.user_id and q.photo_md5 = md5(m.photo)
     where m.photo is not null and not coalesce(m.ghost, false)
       and not public.kr8_is_test_member(m.user_id) and not public.kr8_is_team(m.user_id)
  loop
    f := r.features -> 'photo';
    if f is null then continue; end if;   -- the robot could not read the photo: leave it
    if exists (select 1 from public.kr8_photo_audit a where a.user_id = r.user_id and a.md5 = r.md5 and a.admin_ok) then continue; end if;
    nf := (select count(*) from jsonb_array_elements(coalesce(f -> 'faces', '[]')) x where (x ->> 'conf')::numeric >= 90);
    person := coalesce((f ->> 'person')::numeric, 0);
    words := coalesce((f ->> 'words')::int, 0);
    v := 'ok'; why := null;
    if nf = 0 and person < 80 then v := 'no_face'; why := 'no person in the photo';
    elsif nf = 0 then v := 'look'; why := 'a person but no clear face';
    elsif nf >= 3 then v := 'look'; why := 'group photo';
    elsif words >= 25 then v := 'look'; why := 'lots of text (screenshot?)';
    end if;
    insert into public.kr8_photo_audit (user_id, md5, verdict, why, decided_at) values (r.user_id, r.md5, v, why, now())
    on conflict (user_id) do update set verdict = excluded.verdict, why = excluded.why, decided_at = now(),
      admin_ok = case when public.kr8_photo_audit.md5 = excluded.md5 then public.kr8_photo_audit.admin_ok else false end,
      md5 = excluded.md5;
    if v = 'no_face' then
      if r.photo_check is distinct from 'no_face' then update public.kr8_members set photo_check = 'no_face' where user_id = r.user_id; hid := hid + 1; end if;
      if not exists (select 1 from public.kr8_photo_notices n where n.user_id = r.user_id) then
        if 'TH' = any (coalesce(r.langs, '{}')) or not ('EN' = any (coalesce(r.langs, '{}'))) then
          mid := public.kr8_system_notice(r.user_id,
            'สวัสดีครับ 🙂 รูปโปรไฟล์ของคุณยังไม่เห็นหน้าคุณ ลองเปลี่ยนเป็นรูปที่เห็นหน้าคุณชัด ๆ นะครับ แล้วคุณจะกลับมาแสดงในหน้า People ให้เพื่อน ๆ เห็นครับ (แตะที่การ์ดของคุณในแท็บ Me เพื่อเปลี่ยนรูป)',
            'Hi 🙂 Your profile photo doesn''t show your face yet. Add a clear photo of you to show up in People again (tap your card in the Me tab to change it).');
        else
          mid := public.kr8_system_notice(r.user_id,
            'Hi 🙂 Your profile photo doesn''t show your face yet. Add a clear photo of you to show up in People again (tap your card in the Me tab to change it).',
            'Hi 🙂 Your profile photo doesn''t show your face yet. Add a clear photo of you to show up in People again (tap your card in the Me tab to change it).');
        end if;
        insert into public.kr8_photo_notices (user_id, message_id) values (r.user_id, mid) on conflict do nothing;
        sent := sent + 1;
      end if;
    elsif v = 'look' then
      if r.photo_check is distinct from 'look' then update public.kr8_members set photo_check = 'look' where user_id = r.user_id; looks := looks + 1; end if;
    else
      if r.photo_check in ('no_face','look','unchecked') or r.photo_check is null then
        update public.kr8_members set photo_check = 'ok' where user_id = r.user_id and photo_check is distinct from 'ok'; cleared := cleared + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('hidden', hid, 'look', looks, 'cleared', cleared, 'messages', sent);
end $$;
revoke all on function public.kr8_photo_audit_run() from public, anon, authenticated;

-- admin "Looks fine" on a 'look' / 'no_face' photo: remembered for this exact photo
create or replace function public.kr8_admin_photo_ok(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare was text; mno int; ph text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_user is null then raise exception 'KR8_NO_PERSON'; end if;
  select photo_check, member_no, photo into was, mno, ph from public.kr8_members where user_id = p_user for update;
  if not found then raise exception 'KR8_NO_PERSON'; end if;
  update public.kr8_members set photo_check = 'ok' where user_id = p_user and photo_check is distinct from 'ok';
  if ph is not null then
    insert into public.kr8_photo_audit (user_id, md5, verdict, why, admin_ok) values (p_user, md5(ph), 'ok', 'admin: looks fine', true)
    on conflict (user_id) do update set md5 = excluded.md5, verdict = 'ok', why = 'admin: looks fine', admin_ok = true, decided_at = now();
  end if;
  insert into public.kr8_admin_actions_log (action, detail)
    values ('photo_ok', jsonb_build_object('user_id', p_user, 'member_no', mno, 'was', was, 'by', auth.uid()));
  return jsonb_build_object('user_id', p_user, 'photo_check', 'ok', 'was', was);
end $$;

-- People: a photo with no face is out of the list (the member still sees their own card and gets one message)
create or replace function public.kr8_people(p_limit integer default 60)
returns table(user_id uuid, first_name text, photo text, langs text[], bio text, area text, who text, here boolean, verified boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, m.first_name, m.photo, m.langs, m.bio, m.area, m.who, coalesce(m.here_until > now(), false), m.verified
  from public.kr8_members m
  cross join (select auth.uid() is not null and public.kr8_is_admin() as yes) adm                       -- 0077
  where (exists (select 1 from public.kr8_members me where me.user_id = auth.uid()) or adm.yes)         -- 0077: "or adm.yes"
    and m.user_id <> auth.uid() and not public.kr8_is_blocked(auth.uid(), m.user_id)
    and not public.kr8_face_gate(m.user_id) and public.kr8_fake_level(m.user_id) <> 'red'   /*fake0124*/
    and (adm.yes or not public.kr8_minor_held(m.user_id))   -- 0151 possible under 18: out of People
    and (adm.yes or m.photo_check is distinct from 'no_face')   -- 0162 no face in the photo: out of People
  order by public.kr8_people_score(m.user_id) desc, m.updated_at desc   -- 0151: verified, photo quality, Reel, active, bio (never looks)
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'kr8_photo_audit') then perform cron.unschedule('kr8_photo_audit'); end if;
  perform cron.schedule('kr8_photo_audit', '2-59/5 * * * *', 'select public.kr8_photo_audit_run()');
end $$;
