/**
 * Kring Helper (18 Nov 2026, founder approved Help design "B · Chat-first").
 * 18 FAQs (Thai + English, checked against the live code) and a tiny client-side matcher:
 * each FAQ has Thai keywords (substring, spaces ignored) and English keywords (word-start match; "!" = whole word only).
 * Best score ≥ MATCH_MIN wins; otherwise "not sure" + Talk to the team.
 */
export type HelpCat = 'start' | 'rings' | 'codes' | 'safe' | 'acct';
export interface HelpFaq {
  id: string; cat: HelpCat;
  qTh: string; qEn: string; aTh: string; aEn: string;
  /** short label for a quick-reply chip */
  chipTh?: string; chipEn?: string;
  /** [keyword, weight] */
  th: [string, number][]; en: [string, number][];
}

export const HELP_TEAM_PROMISE = { th: 'ทีมงานตอบภายใน 1 ชั่วโมง', en: 'The team replies within 1 hour' };
export const HELP_EMAIL = 'ops@kringapp.com';

export const HELP_FAQS: HelpFaq[] = [
  // ── start ──
  { id: 'face_why', cat: 'start', qTh: 'ทำไมต้องยืนยันใบหน้า?', qEn: 'Why do I need the face check?', chipTh: 'ทำไมต้องยืนยันใบหน้า?', chipEn: 'Why the face check?',
    aTh: 'กริ๊ง! เป็นแอปของคนจริง หนึ่งคน หนึ่งบัญชีครับ ยืนยันแล้วคุณจะขึ้นในหน้าผู้คน โพสต์รีล และแชทได้ ก่อนยืนยันยังดูฟีดและรีลได้ตามปกติ ใช้เวลาแค่ราว 5 วินาที',
    aEn: 'Kring is for real people: one person, one account. Once verified you show in People and can post Reels and chat. Before that you can still watch the Feed and Reels. It takes about 5 seconds.',
    th: [['ยืนยันใบหน้า', 3], ['สแกนหน้า', 3], ['ทำไมต้องยืนยัน', 3], ['ยืนยันตัวตน', 2], ['ยืนยัน', 1], ['เซลฟี่', 1], ['ใบหน้า', 1]],
    en: [['why verify', 3], ['why face', 3], ['why the face', 3], ['why do i have to verif', 3], ['why do i need', 2], ['face check', 2], ['face scan', 2], ['verif', 1], ['selfie', 1]] },
  { id: 'face_privacy', cat: 'start', qTh: 'รูปหน้าของฉันถูกส่งออกจากมือถือไหม?', qEn: 'Does my face photo leave my phone?',
    aTh: 'ไม่ครับ การตรวจทำบนมือถือของคุณเอง กริ๊ง! เก็บแค่ “รหัสใบหน้า” ที่เป็นตัวเลข ไม่ใช่รูปภาพ ใช้เพื่อเช็กว่าหนึ่งคนมีบัญชีเดียวเท่านั้น',
    aEn: 'No. The check runs on your phone. Kring keeps only a face code (numbers, not a picture), used only to keep it one person, one account.',
    th: [['ออกจากมือถือ', 3], ['ส่งออก', 2], ['เก็บรูป', 3], ['เก็บหน้า', 3], ['รูปหน้า', 2], ['ความเป็นส่วนตัว', 2], ['ปลอดภัยไหม', 2], ['เก็บไว้ไหม', 2], ['ใครเห็น', 2]],
    en: [['leave my phone', 3], ['leave the phone', 3], ['leaves my phone', 3], ['privacy', 2], ['private', 1], ['store', 2], ['stored', 2], ['keep my face', 3], ['face photo', 2], ['upload', 1], ['safe', 1], ['who can see my face', 3]] },
  { id: 'face_fail', cat: 'start', qTh: 'ยืนยันใบหน้าไม่ผ่าน ทำยังไงดี?', qEn: 'The face check didn’t work. What now?',
    aTh: 'ใส่รูปหน้าชัด ๆ บนการ์ดก่อน แล้วไปที่ที่แสงสว่าง มองกล้อง หันหน้านิดหน่อย แล้วกะพริบตา ลองได้วันละ 3 ครั้ง ถ้ากล้องไม่ขึ้นในแอป LINE หรือ IG ให้เปิดใน Chrome หรือ Safari ครับ',
    aEn: 'Add a clear face photo to your card first. Then find good light, look at the camera, turn your head a little and blink. 3 tries a day. If the camera won’t start inside LINE or Instagram, open Kring in Chrome or Safari.',
    th: [['ไม่ผ่าน', 3], ['หน้าไม่ผ่าน', 3], ['สแกนไม่ผ่าน', 3], ['กล้องไม่ขึ้น', 3], ['กล้องไม่เปิด', 3], ['กล้อง', 2], ['กะพริบ', 2], ['ล้มเหลว', 2], ['ยืนยันไม่ได้', 3], ['สแกนไม่ได้', 3]],
    en: [['didn\'t work', 2], ['didnt work', 2], ['not working', 2], ['doesn\'t work', 2], ['fail', 3], ['camera', 2], ['blink', 2], ['won\'t start', 2], ['error', 1], ['tries', 1], ['stuck', 1]] },
  { id: 'face_taken', cat: 'start', qTh: 'ขึ้นว่า “หน้านี้อยู่ในบัญชี Kring อื่นแล้ว”', qEn: 'It says “This face is already on another Kring account”',
    aTh: 'หนึ่งคนใช้ได้หนึ่งบัญชีครับ ถ้าคิดว่าเป็นความผิดพลาด กด “คุยกับทีมงาน” ด้านล่าง แล้วเราจะช่วยดูให้ครับ',
    aEn: 'One person, one account. If you think it’s a mistake, tap “Talk to the team” below and we’ll sort it out.',
    th: [['บัญชีอื่น', 3], ['อยู่ในบัญชี', 2], ['สองบัญชี', 3], ['บัญชีซ้ำ', 3], ['หน้าซ้ำ', 3], ['ซ้ำ', 1]],
    en: [['another account', 3], ['another kring account', 3], ['already on', 2], ['already used', 2], ['two accounts', 3], ['duplicate', 3], ['old account', 2], ['same face', 2]] },
  // ── rings ──
  { id: 'rings_what', cat: 'rings', qTh: 'ริงคืออะไร เก็บยังไง?', qEn: 'What are Rings and how do I get them?', chipTh: 'ริงคืออะไร?', chipEn: 'What are Rings?',
    aTh: 'ริงคือคะแนนของรีลคุณ: ไลก์ +1 · เซฟ +3 · มีคนเปิดลิงก์ที่คุณแชร์ +5 (นับสูงสุด 30 ครั้ง/วัน) นักท่องเที่ยวที่ยืนยันแล้วกดไลก์หรือเซฟ นับ 2 เท่า',
    aEn: 'Rings are your Reel’s score: like +1 · save +3 · someone opens your share link +5 (up to 30 a day). A verified traveller’s like or save counts ×2.',
    th: [['ริงคือ', 3], ['ริงคืออะไร', 3], ['เก็บริง', 3], ['ได้ริง', 2], ['ริง', 2], ['คะแนน', 2], ['นับยังไง', 1]],
    en: [['what are rings', 3], ['what is a ring', 3], ['ring', 2], ['points', 2], ['score', 2], ['get rings', 2], ['earn', 1], ['how are rings', 2], ['rings work', 3], ['how do rings', 3]] },
  { id: 'rings_line', cat: 'rings', qTh: 'แชร์ลิงก์ใน LINE แล้ว ทำไมริงไม่ขึ้น?', qEn: 'I shared my link on LINE. Why no Rings?',
    aTh: 'การเปิดลิงก์จาก LINE การเปิดเองจากมือถือของคุณ และบอทพรีวิวลิงก์ ไม่นับครับ ลองแชร์ทาง IG, Facebook, TikTok หรือ X แทน',
    aEn: 'Opens from LINE, your own opens and link-preview robots don’t count. Share on Instagram, Facebook, TikTok or X instead.',
    th: [['ริงไม่ขึ้น', 3], ['ไม่ได้ริง', 3], ['ริงไม่เพิ่ม', 3], ['ไลน์', 2], ['แชร์ลิงก์', 2], ['แชร์แล้ว', 2], ['ไม่นับ', 2]],
    en: [['line!', 2], ['no rings', 3], ['shared', 1], ['share', 1], ['my link', 1], ['didn\'t count', 2], ['not counting', 2], ['don\'t count', 2], ['opens', 1]] },
  { id: 'prize_win', cat: 'rings', qTh: 'ต้องทำยังไงถึงได้รางวัลประจำสัปดาห์?', qEn: 'How do I win a weekly prize?',
    aTh: 'ทุกสัปดาห์ 8 อันดับแรกบนบอร์ดได้รางวัล ต้องมีอย่างน้อย 25 ริง นับ 2 รีลที่ดีที่สุดของคุณ และรีลต้องปักหมุดสถานที่ในกรุงเทพฯ',
    aEn: 'Every week the top 8 on the board win. You need at least 25 Rings, your best 2 Reels count, and each Reel must be pinned to a Bangkok place.',
    th: [['ได้รางวัล', 3], ['รางวัลประจำสัปดาห์', 3], ['ชนะ', 3], ['ถึงได้รางวัล', 3], ['อันดับ', 1], ['8อันดับ', 2], ['รางวัล', 1]],
    en: [['win', 3], ['weekly prize', 3], ['prize', 2], ['top 8', 2], ['top eight', 2], ['rank', 1], ['reward', 1], ['25 rings', 2]] },
  { id: 'week_end', cat: 'rings', qTh: 'รอบสัปดาห์ปิดเมื่อไหร่?', qEn: 'When does the week end?',
    aTh: 'ทุกวันอาทิตย์ 23:59 น. เวลากรุงเทพฯ แล้วสัปดาห์ใหม่ทุกคนเริ่มนับจาก 0 ครับ',
    aEn: 'Every Sunday at 23:59 Bangkok time. Then the new week starts and everyone is back at 0.',
    th: [['ปิดเมื่อไหร่', 3], ['หมดเมื่อไหร่', 3], ['จบเมื่อไหร่', 3], ['วันอาทิตย์', 2], ['รีเซ็ต', 2], ['เริ่มใหม่', 2], ['รอบสัปดาห์', 2], ['สัปดาห์', 1]],
    en: [['week end', 3], ['week ends', 3], ['end of the week', 3], ['when does the week', 3], ['sunday', 2], ['reset', 3], ['deadline', 2], ['new week', 2], ['ends', 1]] },
  { id: 'reel_board', cat: 'rings', qTh: 'ทำไมรีลของฉันยังไม่ขึ้นบอร์ด?', qEn: 'Why isn’t my Reel on the board yet?',
    aTh: 'รีลใหม่ต้องผ่านการตรวจสั้น ๆ ก่อน ระหว่างรอจะเห็นแค่คุณคนเดียว ผ่านแล้วจะขึ้นฟีดและบอร์ดเอง อย่าลืมปักหมุดสถานที่ในกรุงเทพฯ นะครับ',
    aEn: 'New Reels get a quick check first; until then only you can see it. Once approved it shows in the Feed and on the board. Remember to pin a Bangkok place.',
    th: [['ไม่ขึ้นบอร์ด', 3], ['ขึ้นบอร์ด', 3], ['รีลไม่ขึ้น', 3], ['รีลหาย', 3], ['บอร์ด', 2], ['รอตรวจ', 2], ['ไม่ขึ้นฟีด', 3]],
    en: [['board', 2], ['not on the board', 3], ['reel not showing', 3], ['can\'t see my reel', 3], ['my reel', 1], ['pending', 2], ['approved', 2], ['not in the feed', 3], ['missing', 1]] },
  // ── codes ──
  { id: 'claim_how', cat: 'codes', qTh: 'รับรางวัลยังไง?', qEn: 'How do I claim my prize?', chipTh: 'รับรางวัลยังไง?', chipEn: 'How to claim?',
    aTh: 'ไปที่ ฉัน → สัปดาห์นี้ → รางวัล กด “กดรับ” แล้วเลือก Grab หรือ TrueMoney (เลือกได้ครั้งเดียวต่อรางวัล) โค้ดจะอยู่ใน “รางวัลของฉัน”',
    aEn: 'Go to Me → This week → Rewards, tap Claim and choose Grab or TrueMoney (one choice per prize). Your code appears under My prizes.',
    th: [['รับรางวัลยังไง', 3], ['รับรางวัล', 3], ['กดรับ', 3], ['รับยังไง', 2], ['แลกรางวัล', 2]],
    en: [['claim', 3], ['how to claim', 3], ['get my prize', 2], ['collect', 2], ['grab', 1], ['truemoney', 1]] },
  { id: 'code_late', cat: 'codes', qTh: 'กดรับแล้ว แต่โค้ดยังไม่มา', qEn: 'I claimed, but my code hasn’t come', chipTh: 'โค้ดยังไม่มา', chipEn: 'Code not here yet',
    aTh: 'รางวัลของคุณปลอดภัยครับ เราตรวจผลประจำสัปดาห์ก่อน แล้วจะแจ้งในแอปทันทีที่โค้ดพร้อม ปกติภายใน 24 ชั่วโมง',
    aEn: 'Your prize is safe. We check the week’s results first and let you know in the app the moment your code is ready, usually within 24 hours.',
    th: [['โค้ดยังไม่มา', 3], ['ยังไม่ได้รับโค้ด', 3], ['ยังไม่มา', 3], ['ยังไม่ได้รับ', 3], ['ยังไม่ได้โค้ด', 3], ['รอโค้ด', 2], ['โค้ด', 1]],
    en: [['hasn\'t come', 3], ['hasnt come', 3], ['not here', 2], ['not received', 3], ['haven\'t received', 3], ['didn\'t get', 2], ['no code', 3], ['still waiting', 2], ['waiting', 1], ['code', 1]] },
  { id: 'code_use', cat: 'codes', qTh: 'ใช้โค้ดยังไง?', qEn: 'How do I use my code?',
    aTh: 'กด “คัดลอก” แล้วกดเปิด Grab หรือเติมเข้า TrueMoney ใช้แล้วกด “ใช้แล้ว” จะได้รู้ว่าเหลือโค้ดไหนบ้าง',
    aEn: 'Tap Copy, then open Grab or redeem into TrueMoney. After using it, mark it USED so you know which codes are left.',
    th: [['ใช้โค้ด', 3], ['ใช้ยังไง', 2], ['คัดลอก', 2], ['เติมเงิน', 2], ['เติม', 1], ['โค้ด', 1]],
    en: [['use my code', 3], ['use the code', 3], ['use code', 3], ['how to use', 2], ['redeem', 2], ['copy', 2], ['top up', 2], ['code', 1]] },
  // ── safe ──
  { id: 'links', cat: 'safe', qTh: 'ทำไมส่งลิงก์ในแชทไม่ได้?', qEn: 'Why can’t I send links in chat?', chipTh: 'ส่งลิงก์ในแชทไม่ได้', chipEn: 'Can’t send links',
    aTh: 'เพื่อความปลอดภัยของทุกคน กันลิงก์หลอกดูดเงินครับ ยังพิมพ์ @ไอจี หรือเบอร์โทรได้ สนิทกันแล้วค่อยแลกไอจีกัน',
    aEn: 'For everyone’s safety: no scam links. You can still type an @Instagram handle or phone number once you trust each other.',
    th: [['ส่งลิงก์', 3], ['ลิงก์ในแชท', 3], ['ส่งลิ้ง', 3], ['แชทไม่ได้', 1]],
    en: [['send link', 3], ['send a link', 3], ['links', 2], ['link in chat', 3], ['in chat', 1], ['url', 2], ['can\'t send', 2], ['cant send', 2]] },
  { id: 'hide_socials', cat: 'safe', qTh: 'ซ่อนไอจี / ติ๊กต็อกบนการ์ดได้ไหม?', qEn: 'Can I hide my Instagram / TikTok?',
    aTh: 'ได้ครับ แก้ไขการ์ด แล้วปิด “โชว์ไอจีและติ๊กต็อกบนการ์ดของฉัน” คนอื่นจะไม่เห็น แต่คุณยังเห็นของตัวเอง',
    aEn: 'Yes. Edit your card and turn off “Show my Instagram & TikTok on my card”. Others won’t see them; you still do.',
    th: [['ซ่อนไอจี', 3], ['ซ่อน', 3], ['ไอจี', 2], ['ติ๊กต็อก', 2], ['ติ้กต้อก', 2]],
    en: [['hide', 3], ['instagram', 2], ['tiktok', 2], ['ig!', 2], ['socials', 2], ['handle', 1]] },
  { id: 'report_block', cat: 'safe', qTh: 'รายงานหรือบล็อกคนอื่นยังไง?', qEn: 'How do I report or block someone?',
    aTh: 'เปิดโปรไฟล์หรือแชทของคนนั้น กด ⋯ แล้วเลือก “รายงาน” หรือ “บล็อก” ปลดบล็อกได้ที่ การตั้งค่า → คนที่บล็อกไว้ เหตุฉุกเฉินโทร 1155',
    aEn: 'Open their profile or chat, tap ⋯ and choose Report or Block. Unblock in Settings → Blocked people. In an emergency call 1155.',
    th: [['รายงาน', 3], ['บล็อก', 3], ['ปลดบล็อก', 3], ['ฉุกเฉิน', 2], ['คุกคาม', 2], ['ไม่ปลอดภัย', 2], ['โดนหลอก', 2]],
    en: [['report', 3], ['block', 3], ['unblock', 3], ['harass', 2], ['emergency', 2], ['unsafe', 2], ['creepy', 2], ['spam', 1], ['scam', 1]] },
  { id: 'delete_data', cat: 'safe', qTh: 'ลบข้อมูลใบหน้าหรือบัญชี (PDPA) ยังไง?', qEn: 'How do I delete my face data or account (PDPA)?', chipTh: 'ลบข้อมูลของฉัน', chipEn: 'Delete my data',
    aTh: 'การตั้งค่า → “ลบข้อมูลใบหน้าของฉัน” (เครื่องหมาย ✓ จะหายจนกว่าจะยืนยันใหม่) หรือ “ลบบัญชี” ถ้าเคยได้รางวัล เราเก็บรหัสใบหน้าไว้ 1 ปี กันรับรางวัลซ้ำครับ',
    aEn: 'Settings → “Delete my face data” (your ✓ goes until you verify again) or “Delete account”. If you won a prize, we keep the face code for one year so a prize can’t be claimed twice.',
    th: [['ลบข้อมูล', 3], ['ลบบัญชี', 3], ['ลบใบหน้า', 3], ['ลบ', 2], ['ปิดบัญชี', 3], ['ข้อมูลใบหน้า', 2]],
    en: [['delete', 3], ['pdpa', 3], ['remove my data', 3], ['remove my account', 3], ['erase', 2], ['close my account', 3], ['face data', 2], ['gdpr', 2]] },
  // ── acct ──
  { id: 'change_profile', cat: 'acct', qTh: 'เปลี่ยนรูป ชื่อ หรือภาษาแอปยังไง?', qEn: 'How do I change my photo, name or app language?',
    aTh: 'แตะรูปดินสอบนการ์ดเพื่อแก้รูป ชื่อ และไบโอ เปลี่ยนภาษาได้ที่ การตั้งค่า → ภาษาของแอป (ไทย, English, 中文, हिन्दी, 日本語, 한국어)',
    aEn: 'Tap the pencil on your card to change your photo, name and bio. Change language in Settings → App language (Thai, English, Chinese, Hindi, Japanese, Korean).',
    th: [['เปลี่ยนรูป', 3], ['เปลี่ยนชื่อ', 3], ['ภาษา', 3], ['แก้การ์ด', 2], ['แก้ไขการ์ด', 2], ['ไบโอ', 2], ['เปลี่ยน', 1]],
    en: [['change my photo', 3], ['change my name', 3], ['language', 3], ['edit my card', 2], ['edit', 1], ['bio', 2], ['profile picture', 2], ['rename', 2], ['change', 1], ['name', 1], ['photo', 1]] },
  { id: 'promo_off', cat: 'acct', qTh: 'ไม่อยากให้รีลขึ้นบนเว็บหรือโปรโมต', qEn: 'I don’t want my Reels on the web or in promotion',
    aTh: 'การตั้งค่า → ปิด “แสดงรีลของฉันบนเว็บ” และ “ให้กริ๊ง! นำโพสต์ของฉันไปโปรโมตได้” ปิดได้ทุกเมื่อ และเราใช้แค่ชื่อต้นกับย่านเท่านั้นครับ',
    aEn: 'Settings → turn off “Show my Reels on the web” and “Kring may feature my posts in promotion”. Switch off any time; we only ever use your first name and area.',
    th: [['โปรโมต', 3], ['บนเว็บ', 3], ['เว็บไซต์', 2], ['เว็บ', 2], ['ไม่อยากให้', 1], ['โฆษณา', 2]],
    en: [['promot', 3], ['web', 2], ['website', 2], ['on the web', 3], ['opt out', 2], ['advert', 2], ['marketing', 2]] },
];

/** The six quick-reply chips under the greeting (design B). */
export const HELP_CHIPS = ['face_why', 'rings_what', 'claim_how', 'code_late', 'links', 'delete_data'];

export const faqById = (id: string) => HELP_FAQS.find((f) => f.id === id);

/** lower case, NFC, curly quotes → straight, punctuation → space, one space between words */
export function normHelp(s: string): string {
  return (s || '').normalize('NFC').toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/[’‘`]/g, '\'')
    .replace(/[?!.,;:“”"()[\]{}/\\|~*_+=<>«»…·→-]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const thaiKey = (s: string) => normHelp(s).replace(/\s+/g, '');
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scoreFaq(f: HelpFaq, query: string): number {
  const q = normHelp(query);
  if (!q) return 0;
  const qt = q.replace(/\s+/g, '');
  if (qt === thaiKey(f.qTh) || q === normHelp(f.qEn) || (f.chipTh && qt === thaiKey(f.chipTh)) || (f.chipEn && q === normHelp(f.chipEn))) return 99;
  let s = 0;
  for (const [k, w] of f.th) if (qt.includes(thaiKey(k))) s += w;
  for (const [k0, w] of f.en) {
    const exact = k0.endsWith('!');
    const k = normHelp(exact ? k0.slice(0, -1) : k0);
    if (new RegExp(`(^|[^a-z0-9'])${escRe(k)}${exact ? '($|[^a-z0-9])' : ''}`).test(q)) s += w;
  }
  return s;
}

export const MATCH_MIN = 3;
export interface HelpMatch { faq: HelpFaq | null; score: number; similar: HelpFaq[] }

/** Best FAQ for a typed question (null under MATCH_MIN) + up to 2 similar questions. */
export function matchHelp(query: string): HelpMatch {
  const ranked = HELP_FAQS.map((f, i) => ({ f, i, s: scoreFaq(f, query) })).sort((a, b) => b.s - a.s || a.i - b.i);
  const top = ranked[0];
  const faq = top && top.s >= MATCH_MIN ? top.f : null;
  const similar: HelpFaq[] = [];
  for (const r of ranked) {
    if (similar.length >= 2) break;
    if (r.f === faq || r.s <= 0) continue;
    similar.push(r.f);
  }
  if (faq) for (const f of HELP_FAQS) {
    if (similar.length >= 2) break;
    if (f !== faq && f.cat === faq.cat && !similar.includes(f)) similar.push(f);
  }
  if (!faq && !similar.length) similar.push(...HELP_CHIPS.slice(0, 2).map((id) => faqById(id)!));
  return { faq, score: top ? top.s : 0, similar };
}

/** Member-facing banned words (founder copy rules). Used by tests on every Help string. */
export const HELP_BANNED = ['meet', 'guide', 'tour', 'host', 'creator', 'reviews', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temples', 'ลุ้น'];
