-- 0190 · Help bot (founder 21 Nov, after member #87 ยะหยา was told to "open the Rewards menu" with no place and searched Google Play):
--   · NEW kb_00_where (EN + TH): Kring is used at kringapp.com/app (add to home screen); it is NOT on Google Play or the App Store yet.
--   · kb_11_claim (EN + TH): the exact path to prizes and codes: kringapp.com/app/?open=rewards → scroll to "My prizes" / "รางวัลของฉัน".
-- Paths checked in the live app source 21 Nov: ?open=rewards opens the Rewards page once signed in (signed out: sign-in first, then
-- Rewards); the section title is "My prizes" / "รางวัลของฉัน" (V5KxRewards + v5Strings). No new money amounts.
-- The bot reads every ob_kb kb_* row on each answer, so no deploy is needed. UNDO: 0190_help_kb_where_and_claim_UNDO.sql
begin;
insert into public.ob_kb (key, lang, value_text, verified_source, updated_at) values
('kb_00_where_en','en',$$Where to use Kring: Kring is a web app. Open kringapp.com/app in your phone's browser (Chrome or Safari) and tap "Add to Home screen" to keep it like an app. Kring is NOT on Google Play or the App Store yet, so an app with a similar name there is not Kring. Always give the link kringapp.com/app, never say "download the app" or "open the app store".$$,'app/index.html · 21 Nov founder',now()),
('kb_00_where_th','th',$$ใช้กริ๊ง!ที่ไหน: กริ๊ง!เป็นเว็บแอป เปิด kringapp.com/app ในเบราว์เซอร์ของมือถือ (Chrome หรือ Safari) แล้วกด "เพิ่มไปยังหน้าจอโฮม" เพื่อเก็บไว้ใช้เหมือนแอป ตอนนี้กริ๊ง!ยังไม่มีใน Google Play หรือ App Store แอปชื่อคล้ายๆ ในนั้นไม่ใช่กริ๊ง! ให้ลิงก์ kringapp.com/app เสมอ ห้ามบอกให้ไปโหลดแอปใน Store$$,'app/index.html · 21 Nov founder',now())
on conflict (key) do update set value_text = excluded.value_text, lang = excluded.lang, verified_source = excluded.verified_source, updated_at = now();
update public.ob_kb set value_text = $$Claiming a prize needs a passed face check. To see your prizes and codes, open kringapp.com/app/?open=rewards (sign in if asked); it opens the Rewards page. Scroll down to "My prizes": tap Claim there and pick a Grab or TrueMoney voucher; the claim screen shows the exact voucher you get. Each prize is claimed once, and your code then shows under "My prizes". Prizes are not exchanged for cash. Never state a percentage or fee for vouchers. Never say just "open the Rewards menu" without this link.$$,
  verified_source = 'creator-terms §5-6 · V5KxRewards My prizes · ?open=rewards (21 Nov)', updated_at = now() where key = 'kb_11_claim_en';
update public.ob_kb set value_text = $$การรับรางวัลต้องยืนยันใบหน้าก่อน ดูรางวัลและโค้ดได้โดยเปิด kringapp.com/app/?open=rewards (ถ้าระบบให้เข้าสู่ระบบ ให้เข้าสู่ระบบก่อน) ลิงก์นี้จะเปิดหน้ารางวัลให้ทันที เลื่อนลงไปที่ "รางวัลของฉัน" กด "กดรับ" แล้วเลือกรับเป็นบัตรกำนัล Grab หรือ TrueMoney หน้ารับรางวัลจะแสดงบัตรกำนัลที่คุณจะได้รับ รางวัลหนึ่งรางวัลกดรับได้ครั้งเดียว แล้วโค้ดจะขึ้นใน "รางวัลของฉัน" รางวัลแลกเป็นเงินสดไม่ได้ ห้ามบอกแค่ "เปิดเมนูรางวัล" โดยไม่ให้ลิงก์นี้$$,
  verified_source = 'creator-terms §5-6 · V5KxRewards My prizes · ?open=rewards (21 Nov)', updated_at = now() where key = 'kb_11_claim_th';
commit;
