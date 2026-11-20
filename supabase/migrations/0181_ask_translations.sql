-- 0181 (20 Nov, founder): Ask a Thai in ONE language. Member-written questions, details, answers and replies are translated once
-- (Thai <-> English, the same cheap Gemini flash-lite models as chat translation) by the Edge Function kr8-ask-translate and kept here,
-- so each text is translated once, not on every view. The app shows the original until a translation is ready.
-- Only the service role reads/writes this table (the Edge Function); members never touch it directly.
begin;
create table if not exists public.kr8_ask_tr (
  kind text not null check (kind in ('q', 'qd', 'a')),   -- q = question body, qd = question details, a = answer or reply
  ref uuid not null,                                      -- kr8_posts.id (q, qd) or kr8_ask_answers.id (a)
  target text not null check (target in ('en', 'th')),
  src text not null,                                      -- detected language of the original
  body_hash text not null,                                -- hash of the original text: an edited text is translated again
  text text not null,
  provider text,
  created_at timestamptz not null default now(),
  primary key (kind, ref, target)
);
alter table public.kr8_ask_tr enable row level security;
revoke all on public.kr8_ask_tr from anon, authenticated;
create index if not exists kr8_ask_tr_day on public.kr8_ask_tr (created_at);
insert into public.kr8_translate_config (key, value, note) values
  ('ask_daily_total', 1500, 'most NEW Ask a Thai translations (questions + answers) in a day for everyone; each text is translated once and kept')
on conflict (key) do nothing;
commit;
