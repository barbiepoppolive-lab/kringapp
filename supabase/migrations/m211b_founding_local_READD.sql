-- m211b (25 Nov 2026): Founding Local tags are ON HOLD (founder: "Hold for Pich and Otop tag").
-- The two rows were deleted from production on 25 Nov; the table, kr8_profile / kr8_people_extras support and the UI stay.
-- To show the tags again, run this one insert (nothing else is needed; the app picks it up on the next profile load):
insert into public.kr8_member_badges (user_id, badge) values
  ('0a21313a-b688-43d2-87ce-2d611fc7dbed', 'founding_local'),   -- #16 Otop  "โอท็อปไงจะใครหล่ะ"
  ('474b8497-2bad-47d1-9b39-68ebc780f717', 'founding_local')    -- #14 Pich  "Pichy Review💗"
on conflict do nothing;
