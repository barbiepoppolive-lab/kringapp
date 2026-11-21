-- UNDO 0190: remove kb_00_where, put kb_11_claim back exactly as it was live on 21 Nov before 0190.
begin;
delete from public.ob_kb where key in ('kb_00_where_en','kb_00_where_th');
update public.ob_kb set value_text = $$Claiming a prize needs a passed face check. Open Rewards, tap Claim and pick a Grab or TrueMoney voucher; the claim screen shows the exact voucher you get. Each prize is claimed once and the code arrives on your phone. Prizes are not exchanged for cash. Never state a percentage or fee for vouchers.$$, updated_at = now() where key = 'kb_11_claim_en';
update public.ob_kb set value_text = $$การรับรางวัลต้องยืนยันใบหน้าก่อน เปิดหน้ารางวัล กดรับ แล้วเลือกรับเป็นบัตรกำนัล Grab หรือ TrueMoney หน้ารับรางวัลจะแสดงบัตรกำนัลที่คุณจะได้รับ รางวัลหนึ่งรางวัลกดรับได้ครั้งเดียว และจะได้รับโค้ดบนมือถือ รางวัลแลกเป็นเงินสดไม่ได้$$, updated_at = now() where key = 'kb_11_claim_th';
commit;
