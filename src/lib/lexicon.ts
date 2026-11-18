/**
 * Kring lexicon — the brand words + microcopy (EN / TH). Source: round-2 brand board B11 + the locked
 * spec lexicon (KRING_BUILD_SPEC.md). Where the two differ, the spec wins (Live = ออนไลน์อยู่,
 * Paused = พักไว้ก่อน, Pinned 📌 = ปักหมุดไว้, Suggest a change = ขอเปลี่ยน, Released = โอนแล้ว).
 *
 * Usage:  t('book', lang)                         → "Book" | "จอง"
 *         t('mc.bookWith', lang, { name, price }) → "Book with Mint · ฿1,200"
 *         both('tab.experiences')                 → "Experiences · ประสบการณ์"
 *
 * Voice rules (keep when adding keys):
 *  EN — confident, plain, British spelling, lead with the verb, name the person not the role,
 *       no hype ("amazing", "exclusive", "VIP"), no exclamation marks except at กริ๊ง!.
 *  TH — polite friend; นะ · เลย · กัน; no ค่ะ/ครับ in system copy (gender-neutral); loanwords people
 *       actually say (ทริป, โลคอล, เช็ค, แชร์, รีวิว, เซฟ); no bank words (ทำรายการ, ดำเนินการ, ชำระ).
 *  NEVER — dating / escort / nightlife / alcohol words: เพื่อนเที่ยว (where money is involved), ฟีลแฟน,
 *       น้อง (as product), เอ็นเตอร์เทน, ไซด์ไลน์, เปิดห้อง, นวดพิเศษ, ชนแก้ว, ปาร์ตี้, คนโปรด, date,
 *       companion, hostess, private room, VIP, cheers, drinks, special massage, "unlive". Use ฿ only.
 *
 * Unknown keys return the key itself, so a missing word is obvious on screen and never crashes.
 * Languages other than th fall back to EN (zh is given for a handful of shell words).
 */
export type Lang = 'en' | 'th' | 'zh'
export interface Entry { en: string; th: string; zh?: string }

export const LEXICON = {
  // ── Brand ────────────────────────────────────────────────────────────────
  brand: { en: 'Kring', th: 'กริ๊ง', zh: 'Kring' },
  'brand.store': { en: 'Kring · Bangkok Locals', th: 'กริ๊ง · โลคอลกรุงเทพฯ' },
  'brand.tagline': { en: 'Real locals. Fair prices.', th: 'เที่ยวกับโลคอลตัวจริง ในราคากันเอง', zh: '真本地人 · 公道价' },
  'brand.tagline2': { en: 'No rip-offs. No no-shows.', th: 'ไม่โดนโก่ง ไม่โดนเบี้ยว' },
  'brand.signoff': { en: "Kring! Let's Go!", th: 'แตะกริ๊ง! ไปกันเลย!' },
  'brand.cities': { en: 'Bangkok · Pattaya', th: 'กรุงเทพฯ · พัทยา' },
  'brand.idea': { en: 'Kring is the sound of a promise kept.', th: 'กริ๊ง คือเสียงของคำสัญญาที่ทำได้จริง' },

  // ── Ritual & money ───────────────────────────────────────────────────────
  kring: { en: 'Kring!', th: 'กริ๊ง!' },
  'kring.verb': { en: 'Kring in', th: 'แตะกริ๊ง' },
  'kring.bump': { en: 'Bump phones to kring in', th: 'แตะโทรศัพท์ชนกันเพื่อกริ๊ง' },
  book: { en: 'Book', th: 'จอง' },
  booking: { en: 'Booking', th: 'การจอง' },
  booked: { en: 'Booked', th: 'จองแล้ว' },
  held: { en: 'Booking held until you meet', th: 'เงินแขกพักไว้แล้ว โอนให้ตอนกริ๊ง' },
  'held.short': { en: 'Held safe', th: 'พักไว้ให้' },
  released: { en: 'Released', th: 'โอนแล้ว' },
  'released.to': { en: 'Sent to {name}', th: 'เงินถึง {name} แล้ว' },
  refund: { en: 'Back to you', th: 'คืนเงินให้แล้ว' },
  'card.pending': { en: 'Settling · 3–5d', th: 'รอเคลียร์ · 3–5 วัน' },
  baht: { en: '฿', th: '฿' },
  'promo.baht': { en: '฿ promo', th: '฿ โปรโมชัน' },

  // ── People ───────────────────────────────────────────────────────────────
  local: { en: 'Local', th: 'โลคอล' },
  locals: { en: 'Locals', th: 'โลคอล' },
  'local.legal': { en: 'Local guide', th: 'ไกด์ท้องถิ่น' },
  traveller: { en: 'Traveller', th: 'ผู้จอง' },
  agency: { en: 'Agency', th: 'เอเจนซี' },
  verified: { en: 'Verified local ✓', th: 'โลคอลตัวจริง ✓' },
  'level.new': { en: 'New', th: 'มือใหม่' },
  'level.rising': { en: 'Rising', th: 'มาแรง' },
  'level.trusted': { en: 'Trusted', th: 'ไว้ใจได้' },
  'level.legend': { en: 'Legend', th: 'ตำนาน' },
  you: { en: 'This is you · Edit profile', th: 'นี่คือคุณ · แก้โปรไฟล์' },
  edit: { en: '✎ Edit', th: '✎ แก้ไข' },

  // ── Discover ─────────────────────────────────────────────────────────────
  experiences: { en: 'Experiences', th: 'ประสบการณ์', zh: '体验' },
  experience: { en: 'Experience', th: 'ทริป' },
  trip: { en: 'Trip', th: 'ทริป' },
  pinned: { en: 'Pinned 📌', th: 'ปักหมุดไว้' },
  pin: { en: 'Pin', th: 'ปักหมุด' },
  'multi.request': { en: 'Ask around · first yes wins', th: 'โลคอลคนแรกที่ตอบรับจะได้ทริปนี้' },
  'plus.friends': { en: '+ friends', th: '+ มากับเพื่อน' },
  'city.bangkok': { en: 'Bangkok', th: 'กรุงเทพฯ' },
  'city.pattaya': { en: 'Pattaya', th: 'พัทยา' },
  'city.bkk.short': { en: 'BKK', th: 'กทม.' },
  'search.placeholder': { en: 'What do you want to do?', th: 'อยากทำอะไรดี' },
  'from.price': { en: 'from {price}', th: 'เริ่ม {price}' },
  'message.plan': { en: 'Message to plan', th: 'ทักไปวางแผน' },
  // Wei · one name for the action everywhere: Book (the card still lets you change the price)
  'make.offer': { en: 'Book', th: 'จอง' },

  // ── Price ────────────────────────────────────────────────────────────────
  'kring.price': { en: 'Kring Price', th: 'ราคากริ๊ง', zh: 'Kring 价' },
  // KRING VISUAL V2 · founder: "Street price → Kring price" (TH ราคาทั่วไป → ราคากริ๊ง) replaces "Tourist price" on screen
  'tourist.price': { en: 'Street price', th: 'ราคาทั่วไป' },
  'price.street': { en: 'Street price', th: 'ราคาทั่วไป', zh: '街头价' },
  'price.streetToKring': { en: 'Street price → Kring price', th: 'ราคาทั่วไป → ราคากริ๊ง', zh: '街头价 → Kring 价' },
  'price.otherQuote': { en: 'Got a different quote? Check it', th: 'ได้ราคาอื่นมาเหรอ เช็คเลย', zh: '别处报价不同？查一下' },
  'price.city.short': { en: 'BKK | PTY', th: 'กทม. | พัทยา' },
  'price.vs': { en: 'Street price → Kring price', th: 'ราคาทั่วไป → ราคากริ๊ง' },
  'price.check': { en: 'Price Check', th: 'เช็คราคา' },
  'price.usual': { en: 'Usual {range}', th: 'ราคาปกติ {range}' },
  saved: { en: 'Saved {amount}', th: 'เซฟไป {amount}' },
  'saved.trip': { en: 'You saved {amount} this trip', th: 'ทริปนี้เซฟไป {amount}' },
  'same.price': { en: 'Same price for every passport', th: 'ราคาเดียวกัน ทุกพาสปอร์ต' },

  // ── Deal ─────────────────────────────────────────────────────────────────
  offer: { en: 'Book', th: 'จอง' },
  counter: { en: 'Counter', th: 'เสนอกลับ' },
  accept: { en: 'Accept', th: 'ตกลง' },
  deal: { en: 'Deal', th: 'ดีล' },
  'suggest.change': { en: 'Suggest a change', th: 'ขอเปลี่ยน' },
  'suggest.what': { en: 'Time · venue · price', th: 'เวลา · ที่ · ราคา' },
  cancel: { en: 'Cancel trip', th: 'ยกเลิกทริป' },
  'cancel.ask': { en: 'Can’t make it?', th: 'ไปไม่ได้แล้วเหรอ' },
  'noshow.cover': { en: 'No-show cover', th: 'โดนเบี้ยว? ได้เงินคืน' },
  review: { en: 'Trip review', th: 'รีวิวทริป' },
  'venue.suggest': { en: 'Guests may suggest another venue', th: 'ให้แขกเสนอสถานที่อื่นได้' },
  yes: { en: 'Yes', th: 'ได้' },
  no: { en: 'No', th: 'ไม่' },

  // ── Status & moments ─────────────────────────────────────────────────────
  live: { en: 'Live', th: 'ออนไลน์อยู่' },
  paused: { en: 'Paused', th: 'พักไว้ก่อน' },
  'live.you': { en: 'You’re Live', th: 'ออนไลน์อยู่' },
  'paused.you': { en: 'You’re Paused', th: 'พักไว้ก่อน' },
  'live.line': { en: 'Guests can find you in Experiences and Locals', th: 'ผู้จองเห็นคุณในหน้าประสบการณ์และโลคอล' },
  'paused.line': { en: 'Hidden from Experiences and Locals. Chats, bookings and wallet still work.', th: 'ไม่โชว์ในหน้าประสบการณ์และโลคอล แต่แชท การจอง และกระเป๋ายังใช้ได้ปกติ' },
  'go.live': { en: 'Go Live', th: 'เปิดรับจอง' },
  'stay.live': { en: 'Stay Live', th: 'ออนไลน์ต่อ' },
  pause: { en: 'Pause', th: 'พักไว้ก่อน' },
  empty: { en: 'Quiet for now', th: 'ยังว่างอยู่นะ' },
  success: { en: 'Kring! You met.', th: 'กริ๊ง! เจอกันแล้ว' },
  'city.waking': { en: 'Pattaya is waking up', th: 'พัทยากำลังมา' },

  // ── CTA verbs ────────────────────────────────────────────────────────────
  'cta.book': { en: 'Book', th: 'จองเลย' },
  'cta.ask': { en: 'Ask', th: 'ทักเลย' },
  'cta.check': { en: 'Check', th: 'เช็คเลย' },
  'cta.pin': { en: 'Pin', th: 'ปักหมุด' },
  'cta.share': { en: 'Share', th: 'แชร์' },
  'cta.golive': { en: 'Go Live', th: 'เปิดรับจอง' },
  'cta.go': { en: 'Let’s go', th: 'ไปกันเลย' },
  'cta.done': { en: 'Done', th: 'เสร็จแล้ว' },
  'cta.next': { en: 'Next', th: 'ต่อไป' },
  'cta.skip': { en: 'Skip', th: 'ข้าม' },

  // ── KRING VISUAL V2 (22 Oct) · approved renames + new shell words ─────────
  // money word on the booking card: Trip fee / ค่าทริป (never "tip", never "price" on the card)
  'trip.fee': { en: 'Trip fee', th: 'ค่าทริป', zh: '行程费' },
  // the one booking card's single gold action follows its state
  'card.sendRequest': { en: 'Send request', th: 'ส่งคำขอจอง', zh: '发送请求' },
  'card.acceptOrChange': { en: 'Accept · or change', th: 'ตกลง · หรือขอเปลี่ยน', zh: '接受 · 或修改' },
  'card.sendChange': { en: 'Send change', th: 'ส่งขอเปลี่ยน', zh: '发送修改' },
  'card.accepted': { en: 'Accepted · {amount} held', th: 'ตกลงแล้ว · พักเงินไว้ {amount}', zh: '已接受 · 暂存 {amount}' },
  'card.history': { en: 'History', th: 'ประวัติ', zh: '记录' },
  'card.when': { en: 'When', th: 'เมื่อไร', zh: '时间' },
  'card.where': { en: 'Where', th: 'ที่ไหน', zh: '地点' },
  'card.group': { en: 'Group', th: 'กี่คน', zh: '人数' },
  // rewards: the gift in the header opens "Earn reward 555" — the headline is always shown
  'rewards.title': { en: 'Earn reward 555', th: 'รับรางวัล 555', zh: '赚奖励 555' },
  'rewards.upto': { en: 'Up to ฿555 a month', th: 'สูงสุด ฿555 ต่อเดือน', zh: '每月最高 ฿555' },
  'rewards.open': { en: 'Earn reward 555', th: 'รับรางวัล 555', zh: '赚奖励 555' },
  'rewards.tip': { en: 'Rewards live here · {n} ready', th: 'รางวัลอยู่ตรงนี้ · พร้อมรับ {n}', zh: '奖励在这里 · {n} 个可领' },
  'rewards.soon': { en: 'Coming soon', th: 'เร็ว ๆ นี้', zh: '即将推出' },
  // header ฿ pill menu (cash and promo always separate; promo never pays bookings)
  'bal.title': { en: 'Your baht', th: 'เงินบาทของคุณ', zh: '你的泰铢' },
  'bal.cash': { en: 'Cash · pays bookings', th: 'เงินสด · จ่ายค่าทริป', zh: '现金 · 付行程' },
  'bal.promo': { en: 'Promo · gifts & extras', th: 'โปรโมชัน · ของขวัญและของเสริม', zh: '优惠 · 礼物和附加' },
  'bal.held': { en: 'Held for bookings', th: 'พักไว้สำหรับการจอง', zh: '预订暂存' },
  'bal.note': { en: 'Promo pays gifts & extras, never bookings.', th: 'โปรโมชันใช้กับของขวัญและของเสริม ไม่ใช้จ่ายค่าทริป', zh: '优惠可用于礼物和附加，不可付行程' },
  'bal.topup': { en: 'Top up', th: 'เติมเงิน', zh: '充值' },
  'bal.withdraw': { en: 'Withdraw', th: 'ถอนเงิน', zh: '提现' },
  // Locals "Who" filter — never the word "local" in the options; Trans woman = สาวประเภทสอง (polite)
  'who.title': { en: 'Who', th: 'ใคร', zh: '谁' },
  'who.woman': { en: 'Woman', th: 'ผู้หญิง', zh: '女性' },
  'who.man': { en: 'Man', th: 'ผู้ชาย', zh: '男性' },
  'who.transwoman': { en: 'Trans woman', th: 'สาวประเภทสอง', zh: '跨性别女性' },
  'who.any': { en: 'Any', th: 'ใครก็ได้', zh: '不限' },
  'saved.toast': { en: 'Saved · see in Me › Saved', th: 'เซฟแล้ว · ดูได้ที่ ฉัน › ที่เซฟไว้', zh: '已收藏 · 在 我 › 收藏 查看' },
  // Me
  'me.activity': { en: 'Activity', th: 'กิจกรรม', zh: '动态' },
  'me.saved': { en: 'Saved', th: 'ที่เซฟไว้', zh: '收藏' },
  'me.invite': { en: 'Invite', th: 'ชวนเพื่อน', zh: '邀请' },
  'me.safety': { en: 'Safety', th: 'ความปลอดภัย', zh: '安全' },
  'me.settings': { en: 'Settings', th: 'ตั้งค่า', zh: '设置' },
  'me.profile': { en: 'My profile · photos · ID', th: 'โปรไฟล์ของฉัน · รูป · ยืนยันตัวตน', zh: '我的资料 · 照片 · 身份' },
  'me.usingAs': { en: 'Using Kring as', th: 'ใช้กริ๊งในฐานะ', zh: '身份' },

  // ── Tabs ─────────────────────────────────────────────────────────────────
  'tab.experiences': { en: 'Experiences', th: 'ประสบการณ์', zh: '体验' },
  'tab.price': { en: 'Kring Price', th: 'ราคากริ๊ง', zh: 'Kring 价' },
  'tab.chats': { en: 'Chats', th: 'แชท', zh: '聊天' },
  'tab.wallet': { en: 'Wallet', th: 'กระเป๋า', zh: '钱包' },
  // KRING VISUAL V2 · the 4th tab is Me (balance card, roles, Activity · Saved · Invite · Safety · Settings)
  'tab.me': { en: 'Me', th: 'ฉัน', zh: '我' },
  wallet: { en: 'Wallet', th: 'กระเป๋า', zh: '钱包' },
  chats: { en: 'Chats', th: 'แชท', zh: '聊天' },
  // tab headings (screen-reader title + one line under it)
  'tabcopy.meet.title': { en: '✦ Experiences', th: '✦ ประสบการณ์', zh: '✦ 体验' },
  'tabcopy.meet.sub': { en: 'Verified locals. Public venues. Fair prices.', th: 'โลคอลตัวจริง เจอกันที่สาธารณะ ราคากันเอง', zh: '认证本地人 · 公共场所 · 公道价' },
  'tabcopy.pulse.title': { en: '฿ Kring Price', th: '฿ ราคากริ๊ง', zh: '฿ Kring 价' },
  'tabcopy.pulse.sub': { en: 'Street price → Kring price, checked for you.', th: 'ราคาทั่วไป → ราคากริ๊ง เช็คให้แล้ว', zh: '街头价 → Kring 价，帮你查好了' },
  'tabcopy.chats.title': { en: '💬 Chats', th: '💬 แชท', zh: '💬 聊天' },
  'tabcopy.chats.sub': { en: 'Plan with your local. Contacts stay masked.', th: 'วางแผนกับโลคอล ข้อมูลติดต่อถูกซ่อนไว้', zh: '和本地人计划行程 · 联系方式保密' },
  'tabcopy.vip.title': { en: '👤 Me', th: '👤 ฉัน', zh: '👤 我' },
  'tabcopy.vip.sub': { en: 'Your baht: cash, promo, held and released.', th: 'เงินบาทของคุณ: เงินสด โปรโมชัน พักไว้ และโอนแล้ว', zh: '你的泰铢：现金、优惠、暂存与已转出' },
  'role.guest': { en: 'Traveller', th: 'ผู้จอง' },
  'role.host': { en: 'Local', th: 'โลคอล' },
  'role.agency': { en: 'Agency', th: 'เอเจนซี' },
  'profile.open': { en: 'My profile', th: 'โปรไฟล์ของฉัน' },
  'profile.host.cta': { en: 'Want to show people around? Share something you love', th: 'อยากพาเที่ยว? แชร์สิ่งที่คุณรักได้เลย' },
  'profile.agency.line': { en: 'Your agency dashboard is in Wallet · totals only, never bookings.', th: 'แดชบอร์ดเอเจนซีอยู่ในกระเป๋า · เห็นแค่ยอดรวม ไม่เห็นการจอง' },
  'profile.yourcard': { en: 'Your experiences show here once you add one.', th: 'ทริปของคุณจะโชว์ตรงนี้เมื่อเพิ่มแล้ว' },
  'profile.settings': { en: 'Settings', th: 'ตั้งค่า' },
  'profile.account': { en: 'Account', th: 'บัญชี' },
  'stay.signedin.sub': { en: 'Off: you sign in again each time Kring closes.', th: 'ปิด: ต้องเข้าสู่ระบบใหม่ทุกครั้งที่ปิดกริ๊ง' },

  // ── Launch & sign-in ─────────────────────────────────────────────────────
  'launch.cta': { en: 'Let’s go', th: 'ไปกันเลย', zh: '出发' },
  'signin.title': { en: 'Sign in to continue', th: 'เข้าสู่ระบบเพื่อไปต่อ' },
  'signin.phone': { en: 'Continue with phone number', th: 'ไปต่อด้วยเบอร์โทร' },
  'signin.email': { en: 'Continue with email', th: 'ไปต่อด้วยอีเมล' },
  'welcome.back': { en: 'Welcome back, {name} 🙏', th: 'ยินดีต้อนรับกลับ {name} 🙏' },

  // ── Onboarding (≤ 1 minute) ──────────────────────────────────────────────
  'ob.title': { en: 'One minute and you’re in', th: 'หนึ่งนาที แล้วไปกันเลย' },
  'ob.step': { en: 'Step {n} of {total}', th: 'ขั้นที่ {n} จาก {total}' },
  'ob.age.title': { en: '18+ and our promise', th: 'อายุ 18+ และสัญญาของเรา' },
  'ob.age.confirm': { en: 'I’m 18 or older', th: 'ฉันอายุ 18 ปีขึ้นไป' },
  'ob.conduct.1': { en: 'Public venues only', th: 'เจอกันที่สาธารณะเท่านั้น' },
  'ob.conduct.2': { en: 'Respect, no pressure, no alcohol-led plans', th: 'ให้เกียรติกัน ไม่กดดัน ไม่มีแผนเน้นแอลกอฮอล์' },
  'ob.conduct.3': { en: 'Pay only in Kring, held until you meet', th: 'จ่ายผ่านกริ๊งเท่านั้น พักเงินไว้จนเจอกัน' },
  'ob.conduct.agree': { en: 'I agree', th: 'ตกลง' },
  'ob.name.title': { en: 'What should locals call you?', th: 'ให้โลคอลเรียกคุณว่าอะไรดี' },
  'ob.name.ph': { en: 'First name', th: 'ชื่อเล่น' },
  'ob.photo': { en: 'Add a photo', th: 'เพิ่มรูป' },
  'ob.photo.hint': { en: 'A clear face photo helps people trust you', th: 'รูปหน้าชัดๆ ช่วยให้คนไว้ใจมากขึ้น' },
  'ob.interests.title': { en: 'Pick 3 things you love', th: 'เลือก 3 อย่างที่ชอบ' },
  'ob.done.title': { en: 'You’re in. Kring!', th: 'เรียบร้อย กริ๊ง!' },
  'ob.done.line': { en: 'Opening Experiences…', th: 'กำลังเปิดหน้าประสบการณ์…' },
  'ob.time': { en: '~1 min', th: '~1 นาที' },

  // ── My profile ───────────────────────────────────────────────────────────
  'profile.title': { en: 'My profile', th: 'โปรไฟล์ของฉัน' },
  'profile.role': { en: 'Using Kring as', th: 'ใช้กริ๊งในฐานะ' },
  // KRING T3 · no modes: these two keys stay for older callers but never offer a switch
  'profile.role.sheet': { en: 'Your account', th: 'บัญชีของคุณ' },
  'profile.role.note': { en: 'One app, one account, one ID check.', th: 'แอปเดียว บัญชีเดียว ยืนยันตัวตนครั้งเดียว' },
  'role.traveller.line': { en: 'Find locals and book experiences', th: 'หาโลคอลและจองทริป' },
  'role.local.line': { en: 'Run experiences and get paid at the bump', th: 'พาเที่ยว แล้วรับเงินตอนกริ๊ง' },
  'role.agency.line': { en: 'Manage your locals · private totals only', th: 'ดูแลโลคอลของคุณ · เห็นแค่ยอดรวม' },
  'profile.see': { en: 'How guests see you', th: 'ผู้จองเห็นคุณแบบนี้' },
  'profile.inlocals': { en: 'In Locals', th: 'อยู่ในหน้าโลคอล' },
  'profile.hidden': { en: 'Hidden', th: 'ซ่อนอยู่' },
  'pause.title': { en: 'Pause your profile?', th: 'พักโปรไฟล์ไว้ก่อนไหม' },
  'pause.p1': { en: 'Hidden from Experiences, Locals and search', th: 'ไม่โชว์ในหน้าประสบการณ์ โลคอล และการค้นหา' },
  'pause.p2': { en: 'Chats, bookings and wallet keep working', th: 'แชท การจอง และกระเป๋ายังใช้ได้ปกติ' },
  'pause.p3': { en: 'Go Live again any time, in one tap', th: 'กลับมาออนไลน์ได้ทุกเมื่อ แตะครั้งเดียว' },
  'golive.title': { en: 'Before you go Live', th: 'ก่อนออนไลน์' },
  'golive.q': { en: 'Can guests suggest another venue in an offer?', th: 'ให้แขกเสนอสถานที่อื่นในข้อเสนอได้ไหม' },
  'golive.yes': { en: 'Yes · default', th: 'ได้ · ค่าเริ่มต้น' },
  'golive.no': { en: 'No, use the meeting point in my experience', th: 'ไม่ได้ · ใช้จุดนัดในทริปของฉัน' },
  'golive.note': { en: 'With “No”, your venue stays fixed. Guests can still suggest a new time or price.', th: 'ถ้าเลือก “ไม่” สถานที่จะไม่เปลี่ยน แต่แขกยังขอเปลี่ยนเวลาหรือราคาได้' },
  'venue.setting.sub': { en: 'Chosen when you go live · change any time', th: 'ตั้งตอนออนไลน์ · เปลี่ยนได้ตลอด' },

  // ── Settings / session ───────────────────────────────────────────────────
  settings: { en: 'Settings', th: 'ตั้งค่า' },
  'device.this': { en: 'This device', th: 'อุปกรณ์นี้' },
  'device.signedin': { en: 'Signed in on this phone since {date}', th: 'เข้าสู่ระบบบนโทรศัพท์นี้ตั้งแต่ {date}' },
  'device.signedin.sub': { en: 'Opening Kring takes you straight to Experiences until you log out.', th: 'เปิดกริ๊งแล้วเข้าหน้าประสบการณ์ได้เลย จนกว่าจะออกจากระบบ' },
  'stay.signedin': { en: 'Stay signed in', th: 'อยู่ในระบบต่อ' },
  logout: { en: 'Log out of this device', th: 'ออกจากระบบบนอุปกรณ์นี้' },
  'logout.title': { en: 'Log out of this device?', th: 'ออกจากระบบบนอุปกรณ์นี้ไหม' },
  'logout.body': { en: 'Next time you open Kring on this phone you’ll need to sign in. Your bookings, chats and wallet stay safe in your account.', th: 'ครั้งหน้าที่เปิดกริ๊งบนโทรศัพท์นี้ต้องเข้าสู่ระบบใหม่ การจอง แชท และกระเป๋ายังปลอดภัยอยู่ในบัญชีของคุณ' },
  'logout.cta': { en: 'Log out', th: 'ออกจากระบบ' },
  'session.rule': { en: 'Payouts still ask for your PIN. The session ends if your password or phone number changes.', th: 'การถอนเงินยังต้องใส่ PIN เสมอ และจะออกจากระบบอัตโนมัติถ้าเปลี่ยนรหัสผ่านหรือเบอร์โทร' },
  notifications: { en: 'Notifications', th: 'การแจ้งเตือน' },
  language: { en: 'Language', th: 'ภาษา' },
  'wallet.pin': { en: 'Wallet PIN', th: 'PIN กระเป๋า' },
  'wallet.pin.sub': { en: 'Asked before every payout, even when you stay signed in', th: 'ถามทุกครั้งก่อนถอนเงิน แม้จะอยู่ในระบบตลอด' },
  'help.safety': { en: 'Help & safety', th: 'ช่วยเหลือและความปลอดภัย' },
  privacy: { en: 'Privacy', th: 'ความเป็นส่วนตัว' },
  'sound.on': { en: 'Kring sound', th: 'เสียงกริ๊ง' },
  on: { en: 'On', th: 'เปิด' },
  off: { en: 'Off', th: 'ปิด' },

  // ── Safety ───────────────────────────────────────────────────────────────
  'sos.hold': { en: 'Hold for SOS 1155', th: 'กดค้างเพื่อโทร 1155' },
  'share.trip': { en: 'Share trip', th: 'แชร์ทริป' },
  report: { en: 'Report', th: 'รายงาน' },
  'public.venues': { en: 'Public venues only', th: 'สถานที่สาธารณะเท่านั้น' },
  private: { en: 'Private · only you and {name}', th: 'ส่วนตัว · เห็นแค่คุณกับ {name}' },

  // ── Chat reactions & stickers (no Kring emoji in chat) ──────────────────
  'react.thanks': { en: '🙏', th: '🙏' },
  'sticker.555': { en: '555', th: '555' },
  'sticker.fin': { en: 'ฟิน', th: 'ฟิน' },
  'sticker.pang': { en: 'ปัง!', th: 'ปัง!' },
  'sticker.jueng': { en: 'จึ้ง', th: 'จึ้ง' },
  'sticker.omg': { en: 'ตายแล้ว 😱', th: 'ตายแล้ว 😱' },
  'sticker.ok': { en: 'โอเค{p} 👌', th: 'โอเค{p} 👌' },
  'sticker.thanks': { en: 'ขอบคุณ{p} 🙏', th: 'ขอบคุณ{p} 🙏' },
  'sticker.touched': { en: 'ซึ้ง 🥹', th: 'ซึ้ง 🥹' },
  'chat.read': { en: 'Read', th: 'อ่านแล้ว' },
  'chat.translate': { en: 'Translate', th: 'แปล' },

  // ── Microcopy (B11 · 10 samples + extras) ────────────────────────────────
  'mc.bookWith': { en: 'Book with {name} · {price}', th: 'จองกับ {name} · {price}' },
  'mc.firstYes': { en: '{name} said yes first. The others are released.', th: '{name} รับก่อน ได้ทริปนี้ไปแล้ว · คืนยอดพักของคนอื่นให้แล้ว' },
  'mc.heldSafe': { en: '{price} held safe until you meet.', th: 'พักเงิน {price} ไว้ให้ก่อน จนกว่าจะเจอกัน' },
  'mc.met': { en: 'Kring! You met. {price} is released to {name}.', th: 'กริ๊ง! เจอกันแล้ว โอน {price} ให้ {name} แล้ว' },
  'mc.tooHigh': { en: 'That’s {x}× the usual price. See the Kring price?', th: 'แพงกว่าปกติ {x} เท่าเลยนะ ลองดูราคากริ๊งไหม' },
  'mc.noPins': { en: 'No pins yet. Tap 📌 on a local you like.', th: 'ยังไม่ได้ปักหมุดใครเลย กด 📌 ที่โลคอลที่ชอบได้เลย' },
  'mc.noChats': { en: 'Quiet for now. Find a trip, then say hi.', th: 'ยังว่างอยู่นะ หาทริปที่ชอบแล้วทักไปได้เลย' },
  'mc.liveOn': { en: 'You’re Live. Guests can find you now.', th: 'ออนไลน์แล้ว ผู้จองเห็นโปรไฟล์คุณแล้วนะ' },
  'mc.liveOff': { en: 'Paused. You’re hidden from Experiences; chats and wallet still work.', th: 'พักไว้ก่อน ไม่โชว์ในหน้าประสบการณ์ แต่แชทกับกระเป๋ายังใช้ได้ปกติ' },
  'mc.noShow': { en: 'They didn’t show? You get it all back.', th: 'โดนเบี้ยวเหรอ ไม่ต้องห่วง ได้เงินคืนเต็มจำนวน' },
  'mc.loggedOut': { en: 'Logged out of this device.', th: 'ออกจากระบบบนอุปกรณ์นี้แล้ว' },
  'mc.roleSwitched': { en: 'You’re using Kring as {role}.', th: 'ตอนนี้ใช้กริ๊งในฐานะ {role}' },
  // ── KRING T3 · one app for travellers and Thai locals ───────────────────
  'city.here': { en: 'You’re in {city} · locals here', th: 'คุณอยู่{city} · โลคอลที่นี่', zh: '你在{city} · 这里的本地人' },
  'city.home': { en: 'Home: {home}', th: 'บ้านคุณ: {home}', zh: '你的家：{home}' },
  'city.home.see': { en: 'See {home} instead', th: 'ดู{home}แทน', zh: '改看{home}' },
  'city.locals.here': { en: '{city} · locals here', th: '{city} · โลคอลแถวนี้', zh: '{city} · 这里的本地人' },
  'city.change': { en: 'Change', th: 'เปลี่ยน', zh: '更改' },
  'home.city': { en: 'Home city', th: 'เมืองที่คุณอยู่' },
  'home.city.sub': { en: 'Only used to know when you’re away', th: 'ใช้แค่รู้ว่าตอนนี้คุณเที่ยวต่างเมือง' },
  'share.love': { en: '＋ Share something you love', th: '＋ แชร์สิ่งที่คุณรัก', zh: '＋ 分享你喜爱的事' },
  'share.love.sub': { en: 'Anyone can · 3 steps', th: 'ใครก็แชร์ได้ · 3 ขั้นตอน', zh: '人人可分享 · 3 步' },
  'share.step.what': { en: 'What', th: 'อะไร' },
  'share.step.where': { en: 'Where', th: 'ที่ไหน' },
  'share.step.fee': { en: 'Trip fee', th: 'ค่าทริป' },
  'share.live.now': { en: 'Live now?', th: 'เปิดรับจองเลยไหม' },
  'share.publish': { en: 'Publish', th: 'เผยแพร่' },
  'share.public.only': { en: 'Public places only', th: 'สถานที่สาธารณะเท่านั้น' },
  'tag.joining': { en: 'You’re joining', th: 'คุณไปด้วย' },
  'tag.hosting': { en: 'You’re hosting', th: 'คุณพาเที่ยว' },
  'filter.all': { en: 'All', th: 'ทั้งหมด' },
  'filter.joining': { en: 'Joining', th: 'ไปด้วย' },
  'filter.hosting': { en: 'Hosting', th: 'พาเที่ยว' },
  'your.experiences': { en: 'Your experiences', th: 'ประสบการณ์ของคุณ' },
  'your.trips': { en: 'Your trips', th: 'ทริปของคุณ' },
  'badge.local': { en: '✓ Local', th: '✓ โลคอล' },
  'badge.local.sub': { en: 'Shown after the ID check', th: 'ขึ้นหลังยืนยันตัวตน' },
  'wallet.one': { en: 'Wallet · one balance', th: 'กระเป๋า · ยอดเดียว' },
  'wallet.in': { en: 'In · earned', th: 'เงินเข้า · รายได้' },
  'wallet.out': { en: 'Out · spent', th: 'เงินออก · ใช้จ่าย' },
  'you.receive': { en: 'You receive {price}', th: 'คุณได้รับ {price}' },
  'both.kring': { en: 'You both went กริ๊ง!', th: 'คุณทั้งคู่ กริ๊ง! แล้ว' },
  'paid.to': { en: 'Paid to {name} {price}', th: 'จ่ายให้ {name} แล้ว {price}' },
  'released.you': { en: 'Released to you {price}', th: 'เข้ากระเป๋าคุณแล้ว {price}' },
  'review.other': { en: 'Done · review {name}', th: 'เสร็จแล้ว · ให้คะแนน {name}' },
  'group.friends': { en: 'Going with friends · {n}', th: 'ไปกับเพื่อน · {n} คน' },
  'group.each': { en: '{price} each', th: 'คนละ {price}' },
  'twoway.travellers': { en: 'for travellers', th: 'สำหรับคนมาเที่ยว' },
  'twoway.thais': { en: 'for Thais on a weekend trip', th: 'สำหรับคนไทยเที่ยวสุดสัปดาห์' },
  'twoway.both': { en: 'two-way', th: 'แลกเปลี่ยนกัน' },
  'twoway.shelf': { en: 'Learn from people who moved here', th: 'เรียนจากคนที่ย้ายมาอยู่ไทย' },
  'signin.line': { en: 'Sign in with LINE', th: 'เข้าสู่ระบบด้วย LINE', zh: '使用 LINE 登录' },
  'signin.line.first': { en: 'LINE comes first because your phone is in Thai', th: 'LINE ขึ้นก่อน เพราะคุณใช้ภาษาไทย' },
  'mc.signedIn': { en: 'Signed in. Kring will remember this phone.', th: 'เข้าสู่ระบบแล้ว กริ๊งจะจำโทรศัพท์เครื่องนี้ไว้' },
} satisfies Record<string, Entry>

export type LexKey = keyof typeof LEXICON

const TABLE: Record<string, Entry> = LEXICON

/** Normalises any app language code to a lexicon language. */
export function lexLang(lang: string | null | undefined): Lang {
  if (lang === 'th') return 'th'
  if (lang === 'zh') return 'zh'
  return 'en'
}

/** Look up a brand word / microcopy line. `vars` fills {placeholders}. Unknown key → the key. */
export function t(key: LexKey | (string & {}), lang: Lang | string = 'en', vars?: Record<string, string | number>): string {
  const e = TABLE[key]
  if (!e) return key
  const l = lexLang(lang)
  let s = l === 'th' ? e.th : l === 'zh' ? (e.zh ?? e.en) : e.en
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return s.replace(/\{p\}/g, '')
}

/** "EN · TH" — for bilingual labels such as the launch CTA or the Live/Paused status line. */
export function both(key: LexKey | (string & {}), vars?: Record<string, string | number>): string {
  const en = t(key, 'en', vars)
  const th = t(key, 'th', vars)
  return en === th ? en : `${en} · ${th}`
}

/** True when a key exists (used by tests and by builders to assert coverage). */
export function hasKey(key: string): boolean {
  return key in TABLE
}

/** Banned words that must never appear in user-facing copy (checked by lexicon.test.ts). */
export const BANNED_WORDS = ['Clink', 'cheers', 'cocktail', 'VIP', 'date night', 'Unlive', 'companion', 'hostess', 'ชนแก้ว', 'คนโปรด', 'เพื่อนเที่ยว', 'ฟีลแฟน', 'Double-Date', 'Speakeasy', 'สายฝอ', 'Loves Expats', 'personal LINE', 'Claim coins', 'Treat sent', 'ราคาเริ่มต้นต่อนัด', '💌'] as const

/** KRING FIX2 · founder: no paid hourly extensions anywhere. A time change is "Suggest a change" (time), agreed by both. */
export const EXTENSION_WORDS = ['ต่อเวลา', '+1 ชม', '+30 นาที', 'Add time', 'Extend time', '+1 h', '+1 hour', '+30 min', 'extra hour', 'Not tonight', 'คืนนี้ไม่ต่อ'] as const
