/** Kring · contextual help (HelpDot legacy fallback). One entry per page or section; 3–4 crisp lines each, benefits
 *  first, Kring words only (src/lib/lexicon.ts): Book · กริ๊ง! · held until you meet · Local · Kring Price · ฿ only. */
export interface HelpEntry { title: string; titleTh: string; lines: string[]; linesTh: string[] }

export const HELP: Record<string, HelpEntry> = {
  meet: {
    title: 'Experiences · how Kring works',
    titleTh: 'ประสบการณ์ · กริ๊งทำงานยังไง',
    lines: ['Every local is ID-checked and meets only in public places and licensed venues.', 'Tap Book: the booking is held until you meet. No meet, you get it all back.', 'Bump phones at the venue — Kring! — and only then does the local get paid.', 'Daily tasks add a little ฿ promo you can use on bookings.'],
    linesTh: ['โลคอลทุกคนยืนยันตัวตนแล้ว และเจอกันที่สาธารณะหรือร้านที่มีใบอนุญาตเท่านั้น', 'กดจอง ยอดจองพักไว้จนเจอกัน ไม่ได้เจอ ได้คืนเต็ม', 'แตะโทรศัพท์ที่หน้างาน กริ๊ง! แล้วโลคอลถึงได้เงิน', 'ภารกิจรายวันให้ ฿ โปรเล็กๆ ใช้จองทริปได้'],
  },
  'meet-stories': {
    title: 'Stories',
    titleTh: 'สตอรี่',
    lines: ['10-second stories from locals who are Live right now.', 'A ring means a story you haven’t seen.', 'Locals: post one a day. It lifts your card for 2 hours.'],
    linesTh: ['สตอรี่ 10 วิ จากโลคอลที่ออนไลน์อยู่ตอนนี้', 'มีวงแหวนคือยังไม่ได้ดู', 'โลคอล: โพสต์วันละครั้ง การ์ดจะขึ้นบนสุด 2 ชั่วโมง'],
  },
  'meet-grid': {
    title: 'Experiences | Locals',
    titleTh: 'ประสบการณ์ | โลคอล',
    lines: ['Browse by activity or by person with the switch at the top.', 'Each card shows the venue, “from ฿X · ~Nh”, the rating and a live dot.', '📌 pins a local for later; ⋯ opens block, report and share.', 'Filters: city, category, language, when. Single is the default; + friends lives in the offer.'],
    linesTh: ['สลับดูตามกิจกรรมหรือตามคนได้จากปุ่มด้านบน', 'การ์ดบอกสถานที่ “เริ่ม ฿X · ~N ชม.” คะแนน และจุดออนไลน์', '📌 ปักหมุดโลคอลไว้ดูทีหลัง ⋯ คือบล็อก รายงาน แชร์', 'ตัวกรอง: เมือง หมวด ภาษา เวลา ค่าเริ่มต้นคือไปคนเดียว + มากับเพื่อนอยู่ในการเสนอราคา'],
  },
  'meet-rewards': {
    title: 'A little ฿ promo, every day',
    titleTh: '฿ โปรเล็กๆ ทุกวัน',
    lines: ['Three small tasks a day: watch a story, reply, pin a local.', 'Each adds ฿ promo you can spend on bookings and deals.', '฿ promo never cashes out. It only makes trips cheaper.', 'A 7-day streak doubles the third task.'],
    linesTh: ['ภารกิจเล็ก 3 อย่างต่อวัน: ดูสตอรี่ ตอบแชท ปักหมุดโลคอล', 'แต่ละอย่างได้ ฿ โปร ใช้จองทริปและดีลได้', '฿ โปรถอนไม่ได้ ใช้ให้เที่ยวถูกลงเท่านั้น', 'ต่อเนื่อง 7 วัน ภารกิจที่สามได้สองเท่า'],
  },
  pulse: {
    title: 'Kring Price',
    titleTh: 'ราคากริ๊ง',
    lines: ['Street price → Kring price: the same price for every passport.', 'Price Check: paste a street quote and see the usual range.', 'Cheapest elsewhere is shown small, with the date we checked it.', 'Nothing is charged until a real partner confirms.'],
    linesTh: ['ราคาทั่วไป → ราคากริ๊ง ราคาเดียวกันทุกพาสปอร์ต', 'เช็คราคา: วางราคาที่โดนเสนอมา แล้วดูราคาปกติ', 'ราคาถูกสุดที่อื่นโชว์ตัวเล็ก พร้อมวันที่เช็ค', 'ไม่ตัดเงินจนกว่าพาร์ทเนอร์จริงจะยืนยัน'],
  },
  'pulse-moments': {
    title: 'Bangkok · Pattaya',
    titleTh: 'กรุงเทพฯ · พัทยา',
    lines: ['Just landed: eSIM, bag drop, fixed-price airport car.', 'Getting around: rides on your route at the Kring price.', 'Wellness: licensed spas only.', 'The city switch changes every price on the page.'],
    linesTh: ['เพิ่งถึง: eSIM ฝากกระเป๋า รถสนามบินราคาเหมา', 'เดินทาง: รถตามเส้นทางในราคากริ๊ง', 'สุขภาพ: สปามีใบอนุญาตเท่านั้น', 'สลับเมืองแล้วราคาทั้งหน้าเปลี่ยนตาม'],
  },
  'pulse-bundle': {
    title: 'Bundles',
    titleTh: 'แพ็กรวม',
    lines: ['One tap books several things: car, eSIM, bag drop, spa.', 'Switch off what you don’t need; the total updates live.', 'Each item is confirmed by its own partner; anything that can’t be delivered comes back to you.'],
    linesTh: ['แตะครั้งเดียวจองหลายอย่าง: รถ eSIM ฝากกระเป๋า สปา', 'ปิดสิ่งที่ไม่ต้องการ ยอดรวมอัปเดตทันที', 'แต่ละรายการยืนยันโดยพาร์ทเนอร์ของมันเอง ส่งไม่ได้ คืนเงินให้'],
  },
  chats: {
    title: 'Chats & plans',
    titleTh: 'แชทและแผน',
    lines: ['Chat is free both ways. Contacts stay masked.', 'Booking card: price · date · time · venue. Either side can suggest a change.', 'Translation EN · ไทย · 中文, voice notes and “อ่านแล้ว”.', 'Block, report and SOS 1155 are one tap away in ⋯.'],
    linesTh: ['แชทฟรีทั้งสองฝั่ง ข้อมูลติดต่อถูกซ่อนไว้', 'การ์ดจอง: ราคา วัน เวลา สถานที่ ขอเปลี่ยนได้ทั้งสองฝั่ง', 'แปล EN · ไทย · 中文 ข้อความเสียง และ “อ่านแล้ว”', 'บล็อก รายงาน และ SOS 1155 อยู่ใน ⋯'],
  },
  wallet: {
    title: 'Wallet · one number',
    titleTh: 'กระเป๋า · ตัวเลขเดียว',
    lines: ['Your balance is ฿cash · ฿promo.', '฿ promo is free and never cashes out.', 'Locals are paid at the bump, straight to PromptPay.', 'One app for everyone: join experiences or share your own.'],
    linesTh: ['ยอดของคุณคือ ฿เงินสด · ฿โปร', '฿ โปรได้ฟรี ถอนไม่ได้', 'โลคอลได้รับเงินตอนกริ๊ง เข้าพร้อมเพย์', 'แอปเดียวสำหรับทุกคน: ไปทริป หรือแชร์ทริปของคุณเอง'],
  },
  'wallet-modes': {
    /* KRING T3 · no modes: the id stays for older HelpDot callers */
    title: 'One app for everyone',
    titleTh: 'แอปเดียวสำหรับทุกคน',
    lines: ['Same tabs for everyone: join experiences, or share something you love.', 'Share: one quick ID check, then each of your experiences can be Live or Paused.', 'The ✓ Local badge shows on your profile after the ID check.', 'One wallet: money you earn and money you spend, one Activity list.'],
    linesTh: ['ทุกคนใช้แท็บเดียวกัน: ไปทริป หรือแชร์สิ่งที่คุณรัก', 'แชร์: ยืนยันตัวตนครั้งเดียว แล้วแต่ละทริปของคุณเปิดออนไลน์หรือพักได้', 'ป้าย ✓ Local ขึ้นที่โปรไฟล์หลังยืนยันตัวตน', 'กระเป๋าเดียว: เงินเข้า เงินออก รายการเดียว'],
  },
  'wallet-earn': {
    title: 'Earn & refer',
    titleTh: 'รายได้และชวนเพื่อน',
    lines: ['Invite a friend to become a Local: you both get ฿100 promo after their first completed experience.', 'PromptPay & Voucher bookings settle in <60s (0-Day Hold); foreign cards take 3–5 business days (Trusted) or 14 days (New).', 'Locals: ≥฿300 1st daily PromptPay free (2nd+ ฿15); ฿100–฿299 free via 7-Eleven/Grab/GoWabi (+10% bonus) or ฿10 Express PromptPay.'],
    linesTh: ['ชวนเพื่อนมาเป็นโลคอล: รับโปร ฿100 ทั้งคู่ เมื่อเพื่อนพาเที่ยวทริปแรกจบ', 'งานพร้อมเพย์และคูปองเข้าพร้อมถอนใน <60 วิ บัตรต่างประเทศใช้ 3–5 วันทำการ (Trusted) หรือ 14 วัน (ใหม่)', 'โลคอล: ≥฿300 ถอนพร้อมเพย์ฟรีวันละครั้ง (ครั้งที่ 2+ ฿15) · ฿100–฿299 ฟรีผ่าน 7-Eleven/Grab/GoWabi (+โบนัส 10%) หรือพร้อมเพย์ด่วน ฿10'],
  },
  'host-home': {
    title: 'Local home',
    titleTh: 'หน้าโลคอล',
    lines: ['Live means guests can find you and send a booking request.', 'Each request counts down 10 minutes; accept, counter or suggest a change.', 'The booking is held until you meet and released when you kring.', 'Earnings show Ready, This month and Pending.'],
    linesTh: ['ออนไลน์อยู่ คือผู้จองเจอคุณและส่งคำขอจองได้', 'คำขอจองนับถอยหลัง 10 นาที ตกลง เสนอกลับ หรือขอเปลี่ยน', 'เงินแขกพักไว้แล้ว โอนให้ตอนกริ๊ง', 'รายได้แบ่งเป็น ถอนได้ เดือนนี้ และรอเข้า'],
  },
}
