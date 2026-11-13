/**
 * Kring · full-screen "?" guide content (rewritten for Kring from the Atlas A13 / NEXT95 G3 guides).
 * Every topic is AT MOST 3 story pages. Each page = a 3-second demo of the real screen (a finger taps, the key state
 * changes) + ONE big line + ONE plain sentence. Numbers match the app everywhere:
 *   Mint ✓ · Yaowarat food walk · 18:00–20:00 · Book ฿300 · balance ฿1,250 → ฿950 held
 *   Alex 🇬🇧 · Old Town photo walk · asks ฿1,500 → the local receives ฿1,200 · no-show ฿150
 *   KRING T3 · founder: never advertise the local's share — no percentage anywhere (a local sees only her own ฿ amount).
 *   KRING FIX2 · no paid hourly extensions: the 'extend' guide id now explains "Suggest a change" → a new TIME, agreed by
 *   both, same price, still one hold (Mint 18:00 → 19:00 · Alex 09:00 → 10:00). Decline = "Keep 18:00" / "ใช้เวลาเดิม".
 *   eSIM 15 GB: cheapest elsewhere ฿195 · Kring ฿175 · save ฿20. Arrival kit: ฿1,055 vs ฿943 · save ฿112 (the floor table).
 *   Starter Pack: worth ฿1,363 for ฿999 · once.
 * Kring words (src/lib/lexicon.ts): Book · กริ๊ง! (the bump) · Booking held until you meet · Local/โลคอล ·
 * Experiences · Pinned 📌 · Suggest a change/ขอเปลี่ยน · Live/Paused · Kring Price · Street price → Kring price · Trip fee · ฿ only.
 * Never: clink/ชนแก้ว, coins, VIP, rooftop bars or drinks, dating words, "escrow". Bad-behaviour examples are nameless.
 * Language + role: GUIDES (EN traveller) · GUIDES_TH (ไทย traveller) · HOST_GUIDES / HOST_GUIDES_TH (what a Local sees).
 * Internal ids are unchanged (meet · clink · pulse · host …) so every HelpDot / openGuide() call keeps working.
 */

export type GuideId =
  | 'meet'
  | 'rewards'
  | 'clink'
  | 'gifts'
  | 'chats'
  | 'pulse'
  | 'pulse-coupons'
  | 'wallet'
  | 'host'
  | 'safety'
  | 'extend'
  | 'floor'
  | 'starter'

export const GUIDE_IDS: GuideId[] = [
  'meet',
  'rewards',
  'clink',
  'gifts',
  'chats',
  'pulse',
  'pulse-coupons',
  'wallet',
  'host',
  'safety',
  'extend',
  'floor',
  'starter',
]

/** Most pages a guide may have (founder: "three pages maximum per guide"). */
export const GUIDE_MAX_PAGES = 3

export interface GuideRow {
  /** one emoji shown in a small tile */
  icon: string
  /** plain text; the `amount` (if any) is appended in gold */
  text: string
  amount?: string
  /** optional trailing text after the amount */
  after?: string
}

export type GuideDemoKind =
  | 'lock'
  | 'card'
  | 'price'
  | 'extend'
  | 'accept'
  | 'claim'
  | 'translate'
  | 'gift'
  | 'sos'
  | 'topup'
  | 'cashout'
  | 'modes'
  | 'share'
  | 'qr'
  | 'pack'
  | 'online'
  | 'driver'

/** A 3-second mock of the real screen (components/help/GuideDemo). Every string is already in the reader's language. */
export interface GuideDemoSpec {
  kind: GuideDemoKind
  /** the main label on the mocked surface (a name first: its first word picks the portrait) */
  title?: string
  sub?: string
  /** the control the finger taps */
  tap?: string
  /** the second, untapped control */
  alt?: string
  /** value before → after the tap */
  from?: string
  to?: string
  /** 3-state demos: the "waiting" line */
  wait?: string
  /** the result line */
  done?: string
  /** extra labels: chips, tiles, list rows, [floor label, ours label, icon] … (see GuideDemo per kind) */
  chips?: string[]
  /** a nameless person (bad-behaviour examples): a neutral avatar instead of a host / guest portrait */
  anon?: boolean
}

export interface GuidePage {
  /** one big line (may contain \n for a deliberate break) */
  title: string
  /** one plain sentence */
  line: string
  /** NEXT95: the 3-second demo shown above the text */
  demo?: GuideDemoSpec
  /** legacy worked example (shown only when a page has no demo) */
  example?: { label?: string; rows: GuideRow[] }
  /** optional closing nudge (shown small, under the line) */
  tip?: string
}

export interface Guide {
  id: GuideId
  /** mono label above the title, e.g. "Booking & the กริ๊ง!" */
  topic: string
  /** the Thai name of the topic (shown only in the Thai guide chrome; English chrome stays English — Marco B12) */
  topicTh: string
  /** what the final button says */
  done: string
  pages: GuidePage[]
}

/* ------------------------------------------------------------------------------------------------ */
/* shared demo pieces                                                                                */
/* ------------------------------------------------------------------------------------------------ */

const MINT = 'Mint ✓ · verified local'
const ALEX = 'Alex 🇬🇧 ✓'
const WALK = 'Yaowarat food walk'
const GIFT_TRAY = ['🧋 ฿15', '🌸 ฿20', '🥭 ฿50', '🛺 ฿500']

/* ===================================================================================================== */
/* ENGLISH · traveller                                                                                    */
/* ===================================================================================================== */

export const GUIDES: Record<GuideId, Guide> = {
  meet: {
    id: 'meet',
    topic: 'How Experiences work',
    topicTh: 'ประสบการณ์',
    done: 'Find an experience',
    pages: [
      {
        title: 'Real locals.\nPublic places.',
        line: 'Every local is ID-checked and meets only in public: food streets, temples, markets, licensed spas.',
        demo: { kind: 'card', title: MINT, sub: `${WALK} · Chinatown · ~2h`, chips: ['LIVE', 'CHINATOWN', 'Ploy'], to: '฿300', done: 'Speaks EN · ไทย' },
      },
      {
        title: 'Chat is free.\nBook when it feels right.',
        line: 'Say hi for ฿0. Booking holds your money until you meet, so nothing moves before you both arrive.',
        demo: { kind: 'lock', title: MINT, sub: `${WALK} · 18:00`, tap: 'Book · ฿300', to: '฿300 held', done: 'comes back if you don’t meet' },
      },
      {
        title: 'Jai yen.\nNo pressure.',
        line: 'Not the right fit in the first 10 minutes? Walk away politely and every baht comes back.',
        demo: { kind: 'share', title: `Mint · ${WALK}`, sub: 'Met at 18:00 · 10 min in', tap: 'Walk away politely', done: '฿300 back in your wallet' },
      },
    ],
  },

  rewards: {
    id: 'rewards',
    topic: 'Daily rewards',
    topicTh: 'รางวัลรายวัน',
    done: 'Today’s ฿ promo',
    pages: [
      {
        title: 'Three small things.\nA little ฿ promo daily.',
        line: 'Watch a story, send a reply, pin a local: each one adds ฿ promo the same day.',
        demo: { kind: 'claim', chips: ['📺'], title: 'Watch 1 story', sub: '10 seconds', tap: 'Add promo', done: '+฿25 promo', from: 'Balance ฿1,250', to: 'Balance ฿1,275' },
      },
      {
        title: '฿ promo makes\ntrips cheaper.',
        line: 'Spend it on bookings and deals; it never cashes out, so it only ever saves you money.',
        demo: { kind: 'price', title: 'Book Mint', sub: 'part paid with ฿ promo', chips: ['Price', 'You pay', '✦'], from: '฿300', to: '฿225', done: '−฿75 promo' },
      },
      {
        title: 'Keep the streak.\nDay 7 doubles.',
        line: 'Show up seven days in a row and the third task pays twice.',
        demo: { kind: 'claim', chips: ['🔥'], title: 'Day 7 · third task', sub: 'streak bonus × 2', tap: 'Add promo', done: '+฿50 promo', from: 'Balance ฿1,275', to: 'Balance ฿1,325' },
      },
    ],
  },

  clink: {
    id: 'clink',
    topic: 'Booking & the Kring!',
    topicTh: 'จองแล้วกริ๊ง',
    done: 'Got it',
    pages: [
      {
        title: 'Tap Book.\nWe hold ฿300.',
        line: 'It only moves when you both kring at the venue. No meet, it all comes back.',
        demo: { kind: 'lock', title: MINT, sub: `${WALK} · 18:00`, tap: 'Book · ฿300', to: '฿300 held', done: 'balance ฿1,250 → ฿950' },
      },
      {
        title: 'Phones bump.\nKring! You met.',
        line: 'At the venue you both open the plan and bump phones; the bell rings and a receipt drops into your chat.',
        demo: { kind: 'share', title: `Mint · ${WALK}`, sub: '18:04 · you’re both here', tap: 'Bump phones · Kring!', done: 'Kring! You met · ฿300 on its way to Mint' },
      },
      {
        title: 'No meet?\nYou get it all back.',
        line: 'If the local cancels, doesn’t show, or you walk away in the first 10 minutes, every baht returns.',
        demo: { kind: 'share', title: `Mint · ${WALK}`, sub: 'cancelled at 17:30', tap: 'See my wallet', done: '+฿300 back · balance ฿1,250' },
      },
    ],
  },

  gifts: {
    id: 'gifts',
    topic: 'Gifts',
    topicTh: 'ของขวัญ',
    done: 'Open gifts',
    pages: [
      {
        title: 'Say thanks with\na tiny gift.',
        line: 'The gift tray sits at the bottom of the chat, so you can keep talking while you pick.',
        demo: { kind: 'gift', chips: GIFT_TRAY, done: 'Cha Yen sent to Mint · ฿15' },
      },
      {
        title: 'Small gifts pop.\nBig gifts take the stage.',
        line: 'A Cha Yen does a quick pop in chat; a big gift plays full screen with your name on it.',
        demo: { kind: 'gift', chips: ['🛺 ฿500', '🌸 ฿20', '🧋 ฿15', '🥭 ฿50'], done: 'Golden tuk-tuk · full screen · “From you”' },
        tip: 'Lucky gifts sometimes pop ฿ promo back: a treat, never a way to earn.',
      },
      {
        title: 'Real thanks.\nStraight to the local.',
        line: 'Gifts are real thanks: the local receives them after the trip, paid to their own account.',
        demo: { kind: 'topup', title: 'Mint receives', from: '฿0', to: '฿400', chips: ['🌸 ฿20', '🛺 ฿500', '🥭 ฿50'], done: 'Tuk-tuk gift · to her PromptPay' },
      },
    ],
  },

  chats: {
    id: 'chats',
    topic: 'Chats & plans',
    topicTh: 'แชทและแผน',
    done: 'Open chats',
    pages: [
      {
        title: 'Chat is free.\nBoth ways.',
        line: 'Plan before you book; phone numbers and contact handles stay masked.',
        demo: { kind: 'share', title: 'Mint · online', sub: 'Chinatown · replies in ~2 min', tap: 'Say hi · ฿0', done: 'Contacts stay masked' },
      },
      {
        title: 'Type English.\nShe reads ไทย.',
        line: 'Every message translates between English, ไทย and 中文, and voice notes become text.',
        demo: { kind: 'translate', chips: ['EN', 'ไทย', 'สวัสดีค่ะ 🙏'], from: 'Khao soi first?', to: 'กินข้าวซอยก่อนไหม', done: 'Voice notes become text too' },
      },
      {
        title: 'The plan sits on top.\nAnother time? Ask.',
        line: 'The bar at the top shows the venue, the time and what’s held; either side can suggest a new time, and nothing moves until both agree.',
        demo: {
          kind: 'extend',
          title: `Mint · ${WALK}`,
          from: 'Sat 18:00 · ฿300 held',
          wait: 'Asked Mint for 19:00 · waiting',
          to: 'Sat 19:00 · Mint agreed',
          chips: ['18:30', '19:00'],
          tap: '19:00',
          sub: 'Same price · still one hold',
          done: 'Moved to 19:00 · ฿300 held',
        },
      },
    ],
  },

  pulse: {
    id: 'pulse',
    topic: 'Kring Price',
    topicTh: 'ราคากริ๊ง',
    done: 'Check a price',
    pages: [
      {
        title: 'Street price →\nKring price.',
        line: 'Paste the price you were quoted; we show the usual range and the Kring price, the same for every passport.',
        demo: { kind: 'price', title: 'Airport → Sukhumvit · private car', sub: 'all-in · tolls + waiting', chips: ['Street price', 'Kring price', '🚗'], from: '฿1,500', to: '฿665', done: 'save ฿835' },
      },
      {
        title: 'Just landed?\nStart here.',
        line: 'The Arrival kit puts an eSIM, a fixed-price airport cab and bag drop on one screen.',
        demo: { kind: 'price', title: 'Arrival kit · 3 items', sub: 'eSIM · airport cab · bag drop', chips: ['Cheapest elsewhere', 'Kring price', '🧳'], from: '฿1,015', to: '฿955', done: 'save ฿60' },
        tip: 'Book it and “You saved this trip” in Me goes up by the same ฿60.',
      },
      {
        title: 'Book.\nThen it’s confirmed.',
        line: 'Nothing is charged until the real partner confirms; if they can’t, you pay nothing.',
        demo: { kind: 'share', title: 'Siam Herbal Spa', sub: 'Thai massage 2h · 14:00', tap: 'Request', done: 'Charged only when the spa confirms' },
      },
    ],
  },

  'pulse-coupons': {
    id: 'pulse-coupons',
    topic: 'Kring Price passes',
    topicTh: 'บัตรราคากริ๊ง',
    done: 'Show my passes',
    pages: [
      {
        title: 'Deals come as\na ticket stack.',
        line: 'Swipe through your passes; each one shows the cheapest elsewhere, the Kring price and the saving.',
        demo: { kind: 'price', title: 'Thai massage · 2h', sub: 'Licensed spa · today', chips: ['Cheapest elsewhere', 'Kring price', '💆'], from: '฿800', to: '฿650', done: 'save ฿150' },
      },
      {
        title: 'Show the QR.\nThe price drops.',
        line: 'Open the pass at the counter and staff scan it; no printing, and it works offline too.',
        demo: { kind: 'qr', title: 'Thai massage · 2h', sub: 'Show it at the counter', tap: 'Show QR', from: '฿800', to: '฿650', done: 'No signal? The saved QR still works' },
      },
      {
        title: 'Some deals pay\n฿ promo back.',
        line: 'After the partner confirms your purchase, ฿ promo lands in your wallet, usually within a day.',
        demo: { kind: 'claim', chips: ['💆'], title: 'Spa · ฿1,000', sub: 'partner confirmed', tap: 'Add promo', done: '+฿50 promo', from: 'Balance ฿1,250', to: 'Balance ฿1,300' },
      },
    ],
  },

  wallet: {
    id: 'wallet',
    topic: 'Your wallet',
    topicTh: 'กระเป๋า',
    done: 'Open wallet',
    pages: [
      {
        title: 'One number.\nAll in baht.',
        line: 'Your balance is ฿cash · ฿promo. Top up with a PromptPay QR in seconds.',
        demo: { kind: 'topup', title: 'Kring · Traveller', from: '฿1,250', to: '฿1,750', chips: ['฿200', '฿500', '฿1,000'], done: 'PromptPay QR · lands in seconds' },
      },
      {
        title: 'Held means safe,\nnot spent.',
        line: 'A booking waits on the side until you meet, then it goes to the local or comes back to you.',
        demo: { kind: 'lock', title: MINT, sub: `${WALK} · 18:00`, tap: 'Book · ฿300', to: '฿300 held', done: '฿950 still yours to spend' },
        tip: 'The Activity page in Me shows every hold, booking and top-up of your trip.',
      },
      {
        title: 'One app,\none wallet.',
        line: 'Join experiences and share your own in the same app; what you earn lands in the balance you spend from.',
        demo: { kind: 'topup', title: 'Kring · one wallet', from: '฿950', to: '฿1,250', chips: ['In · earned', 'Out · spent'], done: 'English chat · Mint · +฿300 earned' },
      },
    ],
  },

  host: {
    id: 'host',
    topic: 'Hosting',
    topicTh: 'พาเที่ยว',
    done: 'Go Live',
    pages: [
      {
        title: 'Share it.\nRequests come to you.',
        line: 'Share something you love, switch it Live in Me › Your experiences, and people can find it and send you a request.',
        demo: { kind: 'online', title: 'Live', sub: 'Old Town · 09:00–12:00', done: 'Alex 🇬🇧 wants to book', to: 'Old Town photo walk · 09:00 · ฿1,500' },
      },
      {
        title: 'You receive ฿1,200.\nPaid at the bump.',
        line: 'The money is held before you leave home and lands the moment you kring; if you don’t meet, it returns 100% in full.',
        demo: { kind: 'accept', title: ALEX, sub: 'Old Town photo walk · 09:00', from: '฿1,500', tap: 'Accept', alt: 'Suggest a change', done: 'Booked · you get', to: '฿1,200' },
      },
      {
        title: 'Withdraw to\nPromptPay.',
        line: '≥฿300: 1st daily PromptPay free (2nd+ ฿15). ฿100–฿299: free via 7-Eleven/Grab/GoWabi (+10% bonus) or ฿10 Express PromptPay.',
        demo: { kind: 'cashout', title: 'Kring · Local', from: '฿1,200', to: '฿0', tap: 'Withdraw to PromptPay', done: 'Sending ฿1,200 to ••5678 · no fee' },
      },
    ],
  },

  safety: {
    id: 'safety',
    topic: 'Safety',
    topicTh: 'ความปลอดภัย',
    done: 'Open Safety',
    pages: [
      {
        title: 'Hold for help.\n1155, any time.',
        line: 'Press and hold SOS for 3 seconds to call the Thai tourist police, free and in English. You get 5 seconds to cancel.',
        demo: { kind: 'sos', tap: 'SOS', title: 'Hold 3 seconds', sub: 'Tourist police · free · English', done: 'Calling 1155…', to: 'Your location goes with the call' },
      },
      {
        title: 'Share your trip\nwith someone you trust.',
        line: 'One tap sends the venue, time and local’s first name to your trusted contact.',
        demo: { kind: 'share', title: 'Mei · sister', sub: '+66 81 234 5678', tap: 'Share trip', done: `Sent: ${WALK} 18:00 with Mint` },
        tip: 'Block or report anyone from a chat in two taps; a real person replies within a day.',
      },
      {
        title: 'Taxi? Show\nthe driver card.',
        line: 'A big Thai card asks for the meter and shows your address, so nothing gets lost in translation.',
        demo: { kind: 'driver', title: 'Taxi home', sub: 'Chinatown → Silom · about ฿100–140', tap: 'Show driver', to: 'กรุณาเปิดมิเตอร์ค่ะ', done: 'Please use the meter' },
      },
    ],
  },

  extend: {
    id: 'extend',
    topic: 'Change the time',
    topicTh: 'ขอเปลี่ยนเวลา',
    done: 'Got it',
    pages: [
      {
        title: 'Need another time?\nSuggest a change.',
        line: 'Tap Suggest a change on the booking card and pick a new time. Nothing changes until the other side says yes.',
        demo: {
          kind: 'extend',
          title: `Mint · ${WALK}`,
          from: 'Sat 18:00 · ฿300 held',
          wait: 'Asked Mint for 19:00 · waiting',
          to: 'Sat 19:00 · Mint agreed',
          chips: ['18:30', '19:00'],
          tap: '19:00',
          sub: 'Same price · still one hold',
          done: 'Moved to 19:00 · ฿300 held',
        },
      },
      {
        title: 'Either side can ask.\nBoth must agree.',
        line: 'When Mint suggests a new time, you see it on the booking card: accept and the plan moves. Same price, still one hold.',
        demo: { kind: 'accept', title: 'Mint suggests 19:00', sub: 'Same price · ฿300 stays held', from: '18:00', tap: 'Accept', alt: 'Keep 18:00', done: 'Plan at', to: '19:00' },
      },
      {
        title: 'No answer?\nThe plan stays.',
        line: 'Decline, or no reply, and nothing changes: you meet at 18:00 as agreed and nothing extra is held.',
        demo: { kind: 'share', title: `Mint · ${WALK}`, sub: '19:00 suggested · no reply', tap: 'Keep 18:00', done: 'Plan stays at 18:00 · nothing extra held' },
      },
    ],
  },

  floor: {
    id: 'floor',
    topic: 'Cheapest elsewhere',
    topicTh: 'ถูกสุดที่อื่น',
    done: 'Check a price',
    pages: [
      {
        title: 'We check the\ncheapest elsewhere.',
        line: 'Every morning we check the 7-Eleven counter, the street and partner apps; the lowest real price is shown with its date.',
        demo: { kind: 'price', title: '5G eSIM · 15 GB', sub: 'Airalo app · checked today', chips: ['Cheapest elsewhere', 'Kring price', '📶'], from: '฿195', to: '฿185', done: 'save ฿10' },
      },
      {
        title: 'The Kring price sits\nunder it. Honestly.',
        line: 'We only list a deal when the Kring price beats it, so the saving you see is real.',
        demo: { kind: 'price', title: 'Thai massage · 60 min', sub: 'Licensed spa · Sukhumvit 24', chips: ['Cheapest elsewhere', 'Kring price', '💆'], from: '฿400', to: '฿385', done: 'save ฿15' },
      },
      {
        title: 'Every saving\nadds up.',
        line: 'Each booking adds its saving to “You saved this trip” in Kring Price and Me: ฿0 until you book, the same everywhere.',
        demo: { kind: 'topup', title: 'You saved this trip', from: '฿45', to: '฿60', chips: ['Cab', 'eSIM', 'Bag'], done: 'Kring Price and Me show the same ฿60' },
      },
    ],
  },

  starter: {
    id: 'starter',
    topic: 'Starter Pack',
    topicTh: 'แพ็กเริ่มต้น',
    done: 'Got it',
    pages: [
      {
        title: 'Worth ฿1,350.\nYours for ฿999.',
        line: 'One pack for your first trip: Airport → Sukhumvit car (฿665), a 15 GB eSIM (฿185), and +฿500 Promo Credit (repeat-booking fee waiver & partner perks).',
        demo: { kind: 'pack', title: 'Starter', from: '฿1,350', sub: 'worth · yours for ฿999', chips: ['Airport car ฿665', 'eSIM 15 GB ฿185', '+฿500 Promo'], tap: 'Get the pack', done: 'Opens the normal top-up' },
      },
      {
        title: 'Pays like\nany top-up.',
        line: 'PromptPay QR, Apple Pay or Google Pay; nothing moves until your bank confirms, and the perks come with your receipt.',
        demo: { kind: 'topup', title: 'Kring · Traveller', from: '฿0', to: '฿1,000', chips: ['PromptPay', 'Apple Pay', 'Google Pay'], done: '฿999 paid · ฿1,000 to spend + 3 perks' },
      },
      {
        title: 'Once per traveller.\nNo games.',
        line: 'A welcome, not a draw: one pack each, no timers. It now sits inside Top up.',
        demo: { kind: 'claim', chips: ['🧳'], title: 'Bag drop', sub: 'Starter Pack perk', tap: 'Use', done: 'Free', from: '3 perks left', to: '2 perks left · ฿105 saved' },
      },
    ],
  },
}

/* ===================================================================================================== */
/* ไทย · traveller (written to be read, not translated: short, warm, the way friends text; lexicon words)  */
/* ===================================================================================================== */

const MINT_TH = 'มิ้นท์ ✓ · โลคอลตัวจริง'
const WALK_TH = 'เดินกินเยาวราช'

export const GUIDES_TH: Record<GuideId, Guide> = {
  meet: {
    id: 'meet',
    topic: 'ประสบการณ์ทำงานยังไง',
    topicTh: 'ประสบการณ์',
    done: 'หาทริปเลย',
    pages: [
      {
        title: 'โลคอลตัวจริง\nเจอกันที่สาธารณะ',
        line: 'โลคอลทุกคนยืนยันตัวตนแล้ว และเจอกันที่สาธารณะเท่านั้น: สตรีทฟู้ด วัด ตลาด สปาที่มีใบอนุญาต',
        demo: { kind: 'card', title: MINT_TH, sub: `${WALK_TH} · ~2 ชม.`, chips: ['ออนไลน์อยู่', 'เยาวราช', 'Ploy'], to: '฿300', done: 'พูด EN · ไทย' },
      },
      {
        title: 'แชทฟรี\nพร้อมเมื่อไหร่ค่อยจอง',
        line: 'ทักได้ ฿0 กดจองแล้วเงินจะพักไว้จนเจอกัน ยังไม่เจอ เงินยังไม่ไปไหน',
        demo: { kind: 'lock', title: MINT_TH, sub: `${WALK_TH} · 18:00`, tap: 'จอง · ฿300', to: 'พักไว้ ฿300', done: 'ไม่เจอ ได้คืนเต็ม' },
      },
      {
        title: 'ใจเย็นๆ\nไม่มีกดดัน',
        line: 'ไม่ใช่สไตล์ใน 10 นาทีแรก? ขอตัวสุภาพๆ แล้วได้เงินคืนเต็มจำนวน',
        demo: { kind: 'share', title: `มิ้นท์ · ${WALK_TH}`, sub: 'เจอกัน 18:00 · ผ่านไป 10 นาที', tap: 'ขอตัวสุภาพๆ', done: 'คืน ฿300 เข้ากระเป๋าแล้ว' },
      },
    ],
  },

  rewards: {
    id: 'rewards',
    topic: 'รางวัลรายวัน',
    topicTh: 'รางวัลรายวัน',
    done: 'รับของวันนี้',
    pages: [
      {
        title: 'สามเรื่องเล็กๆ\nรับ ฿ โปรทุกวัน',
        line: 'ดูสตอรี่ ตอบแชท ปักหมุดโลคอล ทำแต่ละอย่างได้ ฿ โปรวันเดียวกันเลย',
        demo: { kind: 'claim', chips: ['📺'], title: 'ดูสตอรี่ 1 เรื่อง', sub: '10 วินาที', tap: 'รับโปร', done: '+฿25 โปร', from: 'ยอด ฿1,250', to: 'ยอด ฿1,275' },
      },
      {
        title: '฿ โปร\nช่วยให้เที่ยวถูกลง',
        line: 'ใช้จองทริปและดีลได้ ถอนเป็นเงินสดไม่ได้ เลยมีแต่ช่วยประหยัด',
        demo: { kind: 'price', title: 'จองกับมิ้นท์', sub: 'จ่ายบางส่วนด้วย ฿ โปร', chips: ['ราคา', 'จ่ายจริง', '✦'], from: '฿300', to: '฿225', done: '−฿75 โปร' },
      },
      {
        title: 'มาต่อเนื่อง\nวันที่ 7 ได้สองเท่า',
        line: 'เข้ามาเจ็ดวันติด ภารกิจที่สามได้สองเท่า',
        demo: { kind: 'claim', chips: ['🔥'], title: 'วันที่ 7 · ภารกิจที่สาม', sub: 'โบนัสต่อเนื่อง × 2', tap: 'รับโปร', done: '+฿50 โปร', from: 'ยอด ฿1,275', to: 'ยอด ฿1,325' },
      },
    ],
  },

  clink: {
    id: 'clink',
    topic: 'จองแล้วกริ๊ง',
    topicTh: 'จองแล้วกริ๊ง',
    done: 'เข้าใจแล้ว',
    pages: [
      {
        title: 'กดจอง\nเราพัก ฿300 ไว้ให้',
        line: 'เงินจะไปก็ต่อเมื่อแตะกริ๊งกันที่หน้างาน ไม่เจอ ได้คืนทั้งหมด',
        demo: { kind: 'lock', title: MINT_TH, sub: `${WALK_TH} · 18:00`, tap: 'จอง · ฿300', to: 'พักไว้ ฿300', done: 'ยอด ฿1,250 → ฿950' },
      },
      {
        title: 'แตะโทรศัพท์\nกริ๊ง! เจอกันแล้ว',
        line: 'ถึงที่นัดแล้วเปิดแผนพร้อมกัน แตะโทรศัพท์ชนกัน กระดิ่งดัง ใบเสร็จเด้งเข้าแชท',
        demo: { kind: 'share', title: `มิ้นท์ · ${WALK_TH}`, sub: '18:04 · มาถึงทั้งคู่', tap: 'แตะกริ๊ง!', done: 'กริ๊ง! เจอกันแล้ว · ฿300 กำลังไปถึงมิ้นท์' },
      },
      {
        title: 'ไม่ได้เจอ?\nได้คืนเต็ม',
        line: 'โลคอลยกเลิก ไม่มา หรือคุณขอตัวใน 10 นาทีแรก ได้คืนทุกบาท',
        demo: { kind: 'share', title: `มิ้นท์ · ${WALK_TH}`, sub: 'ยกเลิกเวลา 17:30', tap: 'ดูกระเป๋า', done: '+฿300 คืนแล้ว · ยอด ฿1,250' },
      },
    ],
  },

  gifts: {
    id: 'gifts',
    topic: 'ของขวัญ',
    topicTh: 'ของขวัญ',
    done: 'เปิดของขวัญ',
    pages: [
      {
        title: 'ขอบคุณด้วย\nของขวัญเล็กๆ',
        line: 'ถาดของขวัญอยู่ล่างแชท คุยไปเลือกไปได้เลย',
        demo: { kind: 'gift', chips: GIFT_TRAY, done: 'ส่งชาเย็นให้มิ้นท์ · ฿15' },
      },
      {
        title: 'ชิ้นเล็กเด้งในแชท\nชิ้นใหญ่เต็มจอ',
        line: 'ชาเย็นเด้งแป๊บเดียว ของขวัญชิ้นใหญ่เล่นเต็มจอพร้อมชื่อคุณ',
        demo: { kind: 'gift', chips: ['🛺 ฿500', '🌸 ฿20', '🧋 ฿15', '🥭 ฿50'], done: 'ตุ๊กตุ๊กทอง · เต็มจอ · “จากคุณ”' },
        tip: 'ของขวัญลัคกี้บางทีเด้ง ฿ โปรกลับมา: เป็นของแถม ไม่ใช่ช่องทางหาเงิน',
      },
      {
        title: 'ขอบคุณจริงๆ\nถึงมือโลคอล',
        line: 'ของขวัญคือคำขอบคุณจริงๆ โลคอลได้รับหลังจบทริป เข้าบัญชีของตัวเอง',
        demo: { kind: 'topup', title: 'มิ้นท์ได้รับ', from: '฿0', to: '฿400', chips: ['🌸 ฿20', '🛺 ฿500', '🥭 ฿50'], done: 'ของขวัญตุ๊กตุ๊ก · เข้าพร้อมเพย์ของเธอ' },
      },
    ],
  },

  chats: {
    id: 'chats',
    topic: 'แชทและแผน',
    topicTh: 'แชทและแผน',
    done: 'เปิดแชท',
    pages: [
      {
        title: 'แชทฟรี\nทั้งสองฝั่ง',
        line: 'วางแผนก่อนจองได้เลย เบอร์และช่องทางติดต่อถูกซ่อนไว้',
        demo: { kind: 'share', title: 'มิ้นท์ · ออนไลน์อยู่', sub: 'เยาวราช · ตอบใน ~2 นาที', tap: 'ทักเลย · ฿0', done: 'ข้อมูลติดต่อถูกซ่อนไว้' },
      },
      {
        title: 'พิมพ์ไทย\nเขาอ่านอังกฤษ',
        line: 'ทุกข้อความแปลไทย อังกฤษ จีนให้ ข้อความเสียงกลายเป็นตัวหนังสือด้วย',
        demo: { kind: 'translate', chips: ['ไทย', 'EN', 'Hi Mint! 👋'], from: 'กินข้าวซอยก่อนไหม', to: 'Khao soi first?', done: 'ข้อความเสียงก็แปลได้' },
      },
      {
        title: 'แผนอยู่ด้านบน\nอยากเปลี่ยนเวลา ขอได้',
        line: 'แถบด้านบนบอกที่ เวลา และยอดที่พักไว้ ขอเปลี่ยนเวลาได้ทั้งสองฝั่ง ไม่มีอะไรขยับจนกว่าตกลงกันทั้งคู่',
        demo: {
          kind: 'extend',
          title: `มิ้นท์ · ${WALK_TH}`,
          from: 'ส. 18:00 · พักไว้ ฿300',
          wait: 'ขอมิ้นท์เป็น 19:00 · รอตอบ',
          to: 'ส. 19:00 · มิ้นท์ตกลง',
          chips: ['18:30', '19:00'],
          tap: '19:00',
          sub: 'ราคาเดิม · ยอดพักไว้ก้อนเดียว',
          done: 'ย้ายเป็น 19:00 · พักไว้ ฿300',
        },
      },
    ],
  },

  pulse: {
    id: 'pulse',
    topic: 'ราคากริ๊ง',
    topicTh: 'ราคากริ๊ง',
    done: 'เช็คราคาเลย',
    pages: [
      {
        title: 'ราคาทั่วไป\n→ ราคากริ๊ง',
        line: 'วางราคาที่โดนเสนอมา เราบอกราคาปกติกับราคากริ๊ง ราคาเดียวกันทุกพาสปอร์ต',
        demo: { kind: 'price', title: 'สนามบิน → สุขุมวิท · รถส่วนตัว', sub: 'รวมทางด่วน + รอ', chips: ['ราคาทั่วไป', 'ราคากริ๊ง', '🚗'], from: '฿1,500', to: '฿665', done: 'เซฟไป ฿835' },
      },
      {
        title: 'เพิ่งลงเครื่อง?\nเริ่มตรงนี้',
        line: 'ชุดมาถึงรวม eSIM แท็กซี่สนามบินราคาเหมา และฝากกระเป๋าไว้ในหน้าเดียว',
        demo: { kind: 'price', title: 'ชุดมาถึง · 3 อย่าง', sub: 'eSIM · รถสนามบิน · ฝากกระเป๋า', chips: ['ถูกสุดที่อื่น', 'ราคากริ๊ง', '🧳'], from: '฿1,015', to: '฿955', done: 'เซฟไป ฿60' },
        tip: 'จองแล้ว “ทริปนี้เซฟไป” ในกระเป๋าเพิ่ม ฿60 เท่ากัน',
      },
      {
        title: 'จอง\nแล้วค่อยยืนยัน',
        line: 'ยังไม่ตัดเงินจนกว่าพาร์ทเนอร์ตัวจริงยืนยัน ถ้าไม่ได้ ไม่ต้องจ่าย',
        demo: { kind: 'share', title: 'Siam Herbal Spa', sub: 'นวดไทย 2 ชม. · 14:00', tap: 'ขอจอง', done: 'ตัดเงินเมื่อสปายืนยันเท่านั้น' },
      },
    ],
  },

  'pulse-coupons': {
    id: 'pulse-coupons',
    topic: 'บัตรราคากริ๊ง',
    topicTh: 'บัตรราคากริ๊ง',
    done: 'ดูบัตรของฉัน',
    pages: [
      {
        title: 'ดีลมาเป็น\nกองตั๋ว',
        line: 'ปัดดูบัตรของคุณ แต่ละใบบอกราคาถูกสุดที่อื่น ราคากริ๊ง และส่วนที่เซฟ',
        demo: { kind: 'price', title: 'นวดไทย · 2 ชม.', sub: 'สปามีใบอนุญาต · วันนี้', chips: ['ถูกสุดที่อื่น', 'ราคากริ๊ง', '💆'], from: '฿800', to: '฿650', done: 'เซฟไป ฿150' },
      },
      {
        title: 'โชว์ QR\nราคาลดทันที',
        line: 'เปิดบัตรที่เคาน์เตอร์ให้พนักงานสแกน ไม่ต้องพิมพ์ ไม่มีเน็ตก็ใช้ได้',
        demo: { kind: 'qr', title: 'นวดไทย · 2 ชม.', sub: 'โชว์ที่เคาน์เตอร์', tap: 'โชว์ QR', from: '฿800', to: '฿650', done: 'ไม่มีสัญญาณ? QR ที่เซฟไว้ยังใช้ได้' },
      },
      {
        title: 'บางดีล\nได้ ฿ โปรคืน',
        line: 'พาร์ทเนอร์ยืนยันการซื้อแล้ว ฿ โปรเข้ากระเป๋า ปกติภายในหนึ่งวัน',
        demo: { kind: 'claim', chips: ['💆'], title: 'สปา · ฿1,000', sub: 'พาร์ทเนอร์ยืนยันแล้ว', tap: 'รับโปร', done: '+฿50 โปร', from: 'ยอด ฿1,250', to: 'ยอด ฿1,300' },
      },
    ],
  },

  wallet: {
    id: 'wallet',
    topic: 'กระเป๋าของคุณ',
    topicTh: 'กระเป๋า',
    done: 'เปิดกระเป๋า',
    pages: [
      {
        title: 'ตัวเลขเดียว\nเป็นเงินบาท',
        line: 'ยอดของคุณคือ ฿เงินสด · ฿โปร เติมด้วย QR พร้อมเพย์ไม่กี่วินาที',
        demo: { kind: 'topup', title: 'กริ๊ง · ผู้จอง', from: '฿1,250', to: '฿1,750', chips: ['฿200', '฿500', '฿1,000'], done: 'QR พร้อมเพย์ · เข้าในไม่กี่วินาที' },
      },
      {
        title: 'พักไว้ คือปลอดภัย\nยังไม่ได้จ่าย',
        line: 'ยอดจองพักไว้ข้างๆ จนเจอกัน แล้วค่อยโอนให้โลคอล หรือคืนให้คุณ',
        demo: { kind: 'lock', title: MINT_TH, sub: `${WALK_TH} · 18:00`, tap: 'จอง · ฿300', to: 'พักไว้ ฿300', done: 'ยังใช้ได้อีก ฿950' },
        tip: 'ไทม์ไลน์ในกระเป๋าโชว์ทุกยอดพัก การจอง และการเติมเงินของทริปนี้',
      },
      {
        title: 'แอปเดียว\nกระเป๋าเดียว',
        line: 'ไปทริปและแชร์ทริปของคุณเองได้ในแอปเดียว รายได้เข้ากระเป๋าเดียวกับที่คุณใช้จ่าย',
        demo: { kind: 'topup', title: 'กริ๊ง · กระเป๋าเดียว', from: '฿950', to: '฿1,250', chips: ['เงินเข้า', 'เงินออก'], done: 'คุยภาษาอังกฤษ · มิ้นท์ · ได้ ฿300' },
      },
    ],
  },

  host: {
    id: 'host',
    topic: 'พาเที่ยว',
    topicTh: 'พาเที่ยว',
    done: 'เปิดออนไลน์',
    pages: [
      {
        title: 'แชร์เลย\nคำขอวิ่งมาหาคุณ',
        line: 'แชร์สิ่งที่คุณรัก เปิดออนไลน์ใน ฉัน › ประสบการณ์ของคุณ แล้วคนจะเจอและส่งคำขอมา',
        demo: { kind: 'online', title: 'ออนไลน์อยู่', sub: 'เมืองเก่า · 09:00–12:00', done: 'Alex 🇬🇧 อยากจอง', to: 'เดินถ่ายรูปเมืองเก่า · 09:00 · ฿1,500' },
      },
      {
        title: 'คุณได้ ฿1,200\nเงินถึงตอนกริ๊ง',
        line: 'เงินพักไว้ก่อนออกจากบ้าน แตะกริ๊งปุ๊บเงินถึงมือ ถ้าไม่ได้เจอกัน คืนเงินเต็ม 100%',
        demo: { kind: 'accept', title: ALEX, sub: 'เดินถ่ายรูปเมืองเก่า · 09:00', from: '฿1,500', tap: 'ตกลง', alt: 'ขอเปลี่ยน', done: 'จองแล้ว · คุณได้', to: '฿1,200' },
      },
      {
        title: 'ถอนเข้า\nพร้อมเพย์',
        line: '≥฿300 ถอนพร้อมเพย์ฟรีวันละครั้ง (ครั้งที่ 2+ ฿15) · ฿100–฿299 ฟรีผ่าน 7-Eleven/Grab/GoWabi (+โบนัส 10%) หรือพร้อมเพย์ด่วน ฿10',
        demo: { kind: 'cashout', title: 'กริ๊ง · โลคอล', from: '฿1,200', to: '฿0', tap: 'ถอนเข้าพร้อมเพย์', done: 'กำลังส่ง ฿1,200 ไป ••5678 · ฟรี' },
      },
    ],
  },

  safety: {
    id: 'safety',
    topic: 'ความปลอดภัย',
    topicTh: 'ความปลอดภัย',
    done: 'เปิดหน้าความปลอดภัย',
    pages: [
      {
        title: 'กดค้างขอความช่วยเหลือ\n1155 ได้ตลอด',
        line: 'กด SOS ค้าง 3 วินาที โทรตำรวจท่องเที่ยวฟรี มี 5 วินาทีให้ยกเลิก',
        demo: { kind: 'sos', tap: 'SOS', title: 'กดค้าง 3 วินาที', sub: 'ตำรวจท่องเที่ยว · ฟรี', done: 'กำลังโทร 1155…', to: 'ส่งตำแหน่งไปพร้อมสาย' },
      },
      {
        title: 'แชร์ทริป\nให้คนที่ไว้ใจ',
        line: 'แตะเดียว ส่งสถานที่ เวลา และชื่อโลคอลให้คนที่คุณไว้ใจ',
        demo: { kind: 'share', title: 'เหมย · พี่สาว', sub: '+66 81 234 5678', tap: 'แชร์ทริป', done: `ส่งแล้ว: ${WALK_TH} 18:00 กับมิ้นท์` },
        tip: 'บล็อกหรือรายงานได้จากแชทในสองแตะ มีคนจริงตอบภายในหนึ่งวัน',
      },
      {
        title: 'นั่งแท็กซี่?\nโชว์การ์ดคนขับ',
        line: 'การ์ดภาษาไทยตัวใหญ่ขอให้เปิดมิเตอร์และบอกที่อยู่ ไม่ต้องอธิบายเอง',
        demo: { kind: 'driver', title: 'แท็กซี่กลับที่พัก', sub: 'เยาวราช → สีลม · ประมาณ ฿100–140', tap: 'โชว์คนขับ', to: 'กรุณาเปิดมิเตอร์ค่ะ', done: 'Please use the meter' },
      },
    ],
  },

  extend: {
    id: 'extend',
    topic: 'ขอเปลี่ยนเวลา',
    topicTh: 'ขอเปลี่ยนเวลา',
    done: 'เข้าใจแล้ว',
    pages: [
      {
        title: 'อยากเปลี่ยนเวลา?\nกดขอเปลี่ยน',
        line: 'กด “ขอเปลี่ยน” บนการ์ดจอง แล้วเลือกเวลาใหม่ ไม่มีอะไรเปลี่ยนจนกว่าอีกฝั่งตกลง',
        demo: {
          kind: 'extend',
          title: `มิ้นท์ · ${WALK_TH}`,
          from: 'ส. 18:00 · พักไว้ ฿300',
          wait: 'ขอมิ้นท์เป็น 19:00 · รอตอบ',
          to: 'ส. 19:00 · มิ้นท์ตกลง',
          chips: ['18:30', '19:00'],
          tap: '19:00',
          sub: 'ราคาเดิม · ยอดพักไว้ก้อนเดียว',
          done: 'ย้ายเป็น 19:00 · พักไว้ ฿300',
        },
      },
      {
        title: 'ขอได้ทั้งสองฝั่ง\nต้องตกลงทั้งคู่',
        line: 'ถ้ามิ้นท์ขอเปลี่ยนเวลา คุณจะเห็นบนการ์ดจอง กดตกลงแล้วแผนย้ายตาม ราคาเดิม ยอดพักไว้ก้อนเดียว',
        demo: { kind: 'accept', title: 'มิ้นท์ขอเป็น 19:00', sub: 'ราคาเดิม · ฿300 ยังพักไว้', from: '18:00', tap: 'ตกลง', alt: 'ใช้เวลาเดิม', done: 'แผนเป็น', to: '19:00' },
      },
      {
        title: 'ไม่ตอบ?\nแผนเดิมตามนัด',
        line: 'ปฏิเสธ หรือไม่ตอบ ก็ไม่มีอะไรเปลี่ยน เจอกัน 18:00 ตามที่ตกลง ไม่มียอดพักเพิ่ม',
        demo: { kind: 'share', title: `มิ้นท์ · ${WALK_TH}`, sub: 'ขอเป็น 19:00 · ยังไม่มีคำตอบ', tap: 'ใช้เวลาเดิม', done: 'แผนเดิม 18:00 · ไม่มียอดพักเพิ่ม' },
      },
    ],
  },

  floor: {
    id: 'floor',
    topic: 'ถูกสุดที่อื่น',
    topicTh: 'ถูกสุดที่อื่น',
    done: 'เช็คราคาเลย',
    pages: [
      {
        title: 'เราเช็ค\nราคาถูกสุดที่อื่น',
        line: 'ทุกเช้าเราเช็คเคาน์เตอร์ 7-Eleven ร้านริมทาง และแอปพาร์ทเนอร์ ราคาจริงที่ถูกสุดโชว์พร้อมวันที่เช็ค',
        demo: { kind: 'price', title: 'eSIM 5G · 15 GB', sub: 'แอป Airalo · เช็ควันนี้', chips: ['ถูกสุดที่อื่น', 'ราคากริ๊ง', '📶'], from: '฿195', to: '฿185', done: 'เซฟไป ฿10' },
      },
      {
        title: 'ราคากริ๊งอยู่ต่ำกว่า\nตรงไปตรงมา',
        line: 'เราลงดีลเฉพาะตอนที่ราคากริ๊งถูกกว่า ส่วนที่เซฟเลยเป็นของจริง',
        demo: { kind: 'price', title: 'นวดไทย · 60 นาที', sub: 'สปามีใบอนุญาต · สุขุมวิท 24', chips: ['ถูกสุดที่อื่น', 'ราคากริ๊ง', '💆'], from: '฿400', to: '฿385', done: 'เซฟไป ฿15' },
      },
      {
        title: 'เซฟทุกครั้ง\nรวมกันให้',
        line: 'จองแต่ละครั้งเพิ่มยอด “ทริปนี้เซฟไป” ในราคากริ๊งและกระเป๋า ฿0 จนกว่าจะจอง ตัวเลขเดียวกันทุกที่',
        demo: { kind: 'topup', title: 'ทริปนี้เซฟไป', from: '฿45', to: '฿60', chips: ['รถ', 'eSIM', 'กระเป๋า'], done: 'ราคากริ๊งกับกระเป๋าโชว์ ฿60 เท่ากัน' },
      },
    ],
  },

  starter: {
    id: 'starter',
    topic: 'แพ็กเริ่มต้น',
    topicTh: 'แพ็กเริ่มต้น',
    done: 'เข้าใจแล้ว',
    pages: [
      {
        title: 'มูลค่า ฿1,350\nจ่ายแค่ ฿999',
        line: 'แพ็กเดียวสำหรับทริปแรก: รถสนามบิน → สุขุมวิท (฿665) eSIM 15 GB (฿185) และโปร +฿500 (50k เหรียญกริ๊ง · ลด 10% ค่าจอง)',
        demo: { kind: 'pack', title: 'Starter', from: '฿1,350', sub: 'มูลค่า · จ่าย ฿999', chips: ['รถสนามบิน ฿665', 'eSIM 15 GB ฿185', '+โปร ฿500 (50k เหรียญ)'], tap: 'รับแพ็ก', done: 'เปิดหน้าเติมเงินปกติ' },
      },
      {
        title: 'จ่ายเหมือน\nเติมเงินปกติ',
        line: 'QR พร้อมเพย์ Apple Pay หรือ Google Pay ไม่มีอะไรขยับจนธนาคารยืนยัน สิทธิ์มากับใบเสร็จ',
        demo: { kind: 'topup', title: 'กริ๊ง · ผู้จอง', from: '฿0', to: '฿1,000', chips: ['พร้อมเพย์', 'Apple Pay', 'Google Pay'], done: 'จ่าย ฿999 · ใช้ได้ ฿1,000 + 3 สิทธิ์' },
      },
      {
        title: 'คนละครั้ง\nไม่มีลุ้น',
        line: 'เป็นของต้อนรับ ไม่ใช่การจับรางวัล คนละแพ็ก ไม่มีนับถอยหลัง ซ่อนได้ตลอดในกระเป๋า',
        demo: { kind: 'claim', chips: ['🧳'], title: 'ฝากกระเป๋า', sub: 'สิทธิ์แพ็กเริ่มต้น', tap: 'ใช้', done: 'ฟรี', from: 'เหลือ 3 สิทธิ์', to: 'เหลือ 2 สิทธิ์ · เซฟ ฿105' },
      },
    ],
  },
}

/* ===================================================================================================== */
/* ENGLISH · local (what a Local sees — the amounts are what SHE receives; never a percentage)            */
/* ===================================================================================================== */

export const HOST_GUIDES: Partial<Record<GuideId, Guide>> = {
  wallet: {
    id: 'wallet',
    topic: 'Your earnings',
    topicTh: 'รายได้',
    done: 'Open wallet',
    pages: [
      {
        title: 'Your earnings,\none number.',
        line: 'What you can withdraw sits on top of Me, in baht.',
        demo: { kind: 'cashout', title: 'Kring · Local', from: '฿1,200', to: '฿0', tap: 'Withdraw to PromptPay', done: 'Sending ฿1,200 to ••5678 · no fee' },
      },
      {
        title: 'No fee.\nOne free withdrawal a day.',
        line: '≥฿300 1st daily PromptPay free (฿100–฿299 free via 7-Eleven/Grab/GoWabi or ฿10 Express). PromptPay settles in <60s; foreign cards take 3–5 business days (Trusted) or 14 days (New).',
        demo: { kind: 'share', title: 'PromptPay ••5678', sub: 'Name matches your verified name', tap: 'Enter PIN', done: '฿1,200 lands in minutes · fee ฿0' },
      },
      {
        title: 'Held until\nthe bump.',
        line: 'A booking is held before you leave home and released the moment you kring. If you don’t meet, it returns 100% in full.',
        demo: { kind: 'accept', title: ALEX, sub: 'Old Town · 09:04 · both here', from: '฿1,500', tap: 'Bump · Kring!', alt: 'Report', done: 'Released · you get', to: '฿1,200' },
        tip: 'Travelling yourself? Just book a local; your earnings stay in the same wallet.',
      },
    ],
  },
  chats: {
    id: 'chats',
    topic: 'Requests & chats',
    topicTh: 'คำขอและแชท',
    done: 'Open chats',
    pages: [
      {
        title: 'Requests land\nas chats.',
        line: 'Every traveller who asks shows up here with an offer card. Chatting is free; contacts stay masked.',
        demo: { kind: 'accept', title: ALEX, sub: 'Old Town photo walk · 09:00', from: '฿1,500', tap: 'Accept', alt: 'Suggest a change', done: 'Plan on top of the chat ·', to: '฿1,200 to you' },
      },
      {
        title: 'You type ไทย.\nHe reads English.',
        line: 'Every message translates between ไทย, English and 中文; voice notes become text.',
        demo: { kind: 'translate', chips: ['ไทย', 'EN', 'Hi Ploy! 👋'], from: 'ไปกินข้าวซอยก่อนไหมคะ', to: 'Khao soi first?', done: 'Voice notes become text too' },
      },
      {
        title: 'He suggests another time?\nYou decide.',
        line: 'Accept and the plan moves everywhere at the same price; “Keep 09:00” and it stays as it is.',
        demo: { kind: 'accept', title: 'Alex suggests 10:00', sub: 'Same price · you still get ฿1,200', from: '09:00', tap: 'Accept', alt: 'Keep 09:00', done: 'Plan at', to: '10:00' },
      },
    ],
  },
  pulse: {
    id: 'pulse',
    topic: 'Kring Price for locals',
    topicTh: 'ราคากริ๊งสำหรับโลคอล',
    done: 'Check a price',
    pages: [
      {
        title: 'Fair prices\nfor your guests.',
        line: 'Send a guest the Kring price for a ride or a spa so nobody pays a street price on your trip.',
        demo: { kind: 'price', title: 'Cab back · Chinatown → Silom', sub: 'Meter card included', chips: ['Street price', 'Kring price', '🚕'], from: '฿300', to: '฿120', done: 'save ฿180' },
      },
      {
        title: 'Suggest a place.\nYour guest books.',
        line: 'Share a licensed spa or a cooking class at the Kring price; they pay the venue, you just show up.',
        demo: { kind: 'share', title: 'Siam Herbal Spa', sub: 'Thai massage 2h · Kring price', tap: 'Send to Alex', done: 'Alex books it · you just show up' },
      },
      {
        title: 'Nothing charged\nuntil it’s confirmed.',
        line: 'A real partner confirms first; if they can’t, nobody pays.',
        demo: { kind: 'share', title: 'Siam Herbal Spa', sub: 'Thai massage 2h · 14:00', tap: 'Request', done: 'Charged only when the spa confirms' },
      },
    ],
  },
  rewards: {
    id: 'rewards',
    topic: 'Local habits',
    topicTh: 'นิสัยโลคอล',
    done: 'Got it',
    pages: [
      {
        title: 'Small habits.\nMore requests.',
        line: 'Post a story, answer fast and stay Live: locals who do get booked first.',
        demo: { kind: 'online', title: 'Live', sub: 'Story posted · replies in 2 min', done: 'Alex 🇬🇧 wants to book', to: 'Fast answers get booked first' },
      },
      {
        title: 'Your earnings\nare in baht.',
        line: 'Locals don’t collect ฿ promo: everything you earn goes to PromptPay.',
        demo: { kind: 'cashout', title: 'Kring · Local', from: '฿1,200', to: '฿0', tap: 'Withdraw', done: 'Nothing to collect · all to PromptPay' },
      },
    ],
  },
  gifts: {
    id: 'gifts',
    topic: 'Gifts you receive',
    topicTh: 'ของขวัญที่ได้รับ',
    done: 'Got it',
    pages: [
      {
        title: 'Guests say thanks\nwith gifts.',
        line: 'A gift shows as a gold bubble in the chat and a note in the top island.',
        demo: { kind: 'claim', chips: ['🧋'], title: 'Alex sent a Cha Yen', sub: 'in your chat', tap: 'Say thanks', done: '+฿12 to you', from: 'Today ฿1,200', to: 'Today ฿1,212' },
      },
      {
        title: 'Yours after the trip.\nPaid to PromptPay.',
        line: 'Gift money joins your earnings after the trip and withdraws like the rest.',
        demo: { kind: 'cashout', title: 'Kring · Local', from: '฿400', to: '฿0', tap: 'Withdraw', done: 'Tuk-tuk gift · ฿400 to you · no fee' },
      },
      {
        title: 'Only inside\nthe app.',
        line: 'Never accept gifts or money outside Kring; inside, you’re covered.',
        demo: { kind: 'share', title: 'A guest', sub: 'asks for your bank number', tap: 'Report', done: 'Kept inside Kring · you’re covered', anon: true },
      },
    ],
  },
  safety: {
    id: 'safety',
    topic: 'Safety for locals',
    topicTh: 'ความปลอดภัยของโลคอล',
    done: 'Open Safety',
    pages: [
      {
        title: 'Public venues.\nAlways.',
        line: 'You choose the venue. If a guest asks to move somewhere private, decline and report.',
        demo: { kind: 'share', title: 'A guest', sub: 'asks to move to a private room', tap: 'Decline & report', done: 'Plan stays at the venue · we’re told', anon: true },
      },
      {
        title: 'Share your trip\nwith someone you trust.',
        line: 'One tap sends the venue, time and guest’s first name to your trusted contact.',
        demo: { kind: 'share', title: 'Fah · best friend', sub: '+66 89 765 4321', tap: 'Share trip', done: 'Sent: Old Town 09:00 with Alex' },
      },
      {
        title: 'Hold for help.\n1155 or 191.',
        line: 'Hold SOS for 3 seconds to call the tourist police; police 191 is one tap below. 5 seconds to cancel.',
        demo: { kind: 'sos', tap: 'SOS', title: 'Hold 3 seconds', sub: 'Police 191 · one tap below', done: 'Calling 1155…', to: 'Your location goes with the call' },
      },
    ],
  },
  extend: {
    id: 'extend',
    topic: 'Change the time',
    topicTh: 'ขอเปลี่ยนเวลา',
    done: 'Got it',
    pages: [
      {
        title: 'He suggests another time.\nYou decide.',
        line: 'You’ll see it on the booking card in the chat and on Local home. Same price; nothing changes until you accept.',
        demo: { kind: 'accept', title: 'Alex suggests 10:00', sub: 'Same price · you still get ฿1,200', from: '09:00', tap: 'Accept', alt: 'Keep 09:00', done: 'Plan at', to: '10:00' },
      },
      {
        title: 'Need another time?\nYou can ask too.',
        line: 'Tap Suggest a change on the booking card and pick a time; nothing moves until Alex agrees.',
        demo: {
          kind: 'extend',
          title: 'Alex · Old Town photo walk',
          from: 'Sat 09:00',
          wait: 'Asked Alex for 10:00 · waiting',
          to: 'Sat 10:00 · Alex agreed',
          chips: ['09:30', '10:00'],
          tap: '10:00',
          sub: 'Same price · one hold',
          done: 'Moved to 10:00 · ฿1,200 to you',
        },
      },
      {
        title: 'Not possible?\nThe plan stays.',
        line: 'Say no, or let it lapse: no penalty, you meet at 09:00 as agreed.',
        demo: { kind: 'share', title: 'Alex · Old Town photo walk', sub: '10:00 suggested', tap: 'Keep 09:00', done: 'Plan stays at 09:00 · no penalty' },
      },
    ],
  },
}

/* ===================================================================================================== */
/* ไทย · local                                                                                             */
/* ===================================================================================================== */

export const HOST_GUIDES_TH: Partial<Record<GuideId, Guide>> = {
  wallet: {
    id: 'wallet',
    topic: 'รายได้ของคุณ',
    topicTh: 'รายได้',
    done: 'เปิดกระเป๋า',
    pages: [
      {
        title: 'รายได้\nดูตัวเลขเดียว',
        line: 'ยอดที่ถอนได้อยู่บนสุดของกระเป๋า เป็นเงินบาท',
        demo: { kind: 'cashout', title: 'กริ๊ง · โลคอล', from: '฿1,200', to: '฿0', tap: 'ถอนเข้าพร้อมเพย์', done: 'กำลังส่ง ฿1,200 ไป ••5678 · ฟรี' },
      },
      {
        title: 'ไม่มีค่าธรรมเนียม\nถอนฟรีวันละครั้ง',
        line: '≥฿300 ถอนพร้อมเพย์ฟรีวันละครั้ง (฿100–฿299 ฟรีผ่าน 7-Eleven/Grab/GoWabi หรือด่วน ฿10) พร้อมเพย์เข้าใน <60 วิ บัตรใช้ 3–5 วันทำการ (Trusted) หรือ 14 วัน (ใหม่)',
        demo: { kind: 'share', title: 'พร้อมเพย์ ••5678', sub: 'ชื่อตรงกับชื่อที่ยืนยันตัวตน', tap: 'ใส่ PIN', done: '฿1,200 เข้าในไม่กี่นาที · ฟรี' },
      },
      {
        title: 'พักไว้\nจนกริ๊ง',
        line: 'ยอดจองพักไว้ก่อนออกจากบ้าน แตะกริ๊งปุ๊บโอนให้ ถ้าไม่ได้เจอกัน คืนเงินเต็ม 100%',
        demo: { kind: 'accept', title: ALEX, sub: 'เมืองเก่า · 09:04 · มาถึงทั้งคู่', from: '฿1,500', tap: 'แตะกริ๊ง!', alt: 'รายงาน', done: 'โอนแล้ว · คุณได้', to: '฿1,200' },
        tip: 'ไปเที่ยวเอง? จองโลคอลได้เลย รายได้ยังอยู่ในกระเป๋าเดียวกัน',
      },
    ],
  },
  chats: {
    id: 'chats',
    topic: 'คำขอและแชท',
    topicTh: 'คำขอและแชท',
    done: 'เปิดแชท',
    pages: [
      {
        title: 'คำขอมา\nเป็นแชท',
        line: 'ผู้จองที่ขอจองจะโผล่ที่นี่พร้อมการ์ดเสนอราคา แชทฟรี ข้อมูลติดต่อถูกซ่อนไว้',
        demo: { kind: 'accept', title: ALEX, sub: 'เดินถ่ายรูปเมืองเก่า · 09:00', from: '฿1,500', tap: 'ตกลง', alt: 'ขอเปลี่ยน', done: 'แผนอยู่บนแชท ·', to: 'คุณได้ ฿1,200' },
      },
      {
        title: 'พิมพ์ไทย\nเขาอ่านอังกฤษ',
        line: 'ทุกข้อความแปลไทย อังกฤษ จีนให้ ข้อความเสียงกลายเป็นตัวหนังสือ',
        demo: { kind: 'translate', chips: ['ไทย', 'EN', 'Hi Ploy! 👋'], from: 'ไปกินข้าวซอยก่อนไหมคะ', to: 'Khao soi first?', done: 'ข้อความเสียงก็แปลได้' },
      },
      {
        title: 'เขาขอเปลี่ยนเวลา?\nคุณเป็นคนเลือก',
        line: 'ตกลงแล้วแผนย้ายตามทุกที่ ราคาเดิม กด “ใช้เวลาเดิม” แผนเดิมตามนัด',
        demo: { kind: 'accept', title: 'Alex ขอเป็น 10:00', sub: 'ราคาเดิม · คุณยังได้ ฿1,200', from: '09:00', tap: 'ตกลง', alt: 'ใช้เวลาเดิม', done: 'แผนเป็น', to: '10:00' },
      },
    ],
  },
  pulse: {
    id: 'pulse',
    topic: 'ราคากริ๊งสำหรับโลคอล',
    topicTh: 'ราคากริ๊ง',
    done: 'เช็คราคาเลย',
    pages: [
      {
        title: 'ราคากันเอง\nให้แขกของคุณ',
        line: 'ส่งราคากริ๊งของรถหรือสปาให้แขก ทริปของคุณจะไม่มีใครโดนราคาทั่วไปที่แพงเกิน',
        demo: { kind: 'price', title: 'แท็กซี่ · เยาวราช → สีลม', sub: 'มีการ์ดมิเตอร์', chips: ['ราคาทั่วไป', 'ราคากริ๊ง', '🚕'], from: '฿300', to: '฿120', done: 'เซฟไป ฿180' },
      },
      {
        title: 'แนะนำที่\nแขกจองเอง',
        line: 'แชร์สปามีใบอนุญาตหรือคลาสทำอาหารในราคากริ๊ง แขกจ่ายร้านเอง คุณแค่ไปตามนัด',
        demo: { kind: 'share', title: 'Siam Herbal Spa', sub: 'นวดไทย 2 ชม. · ราคากริ๊ง', tap: 'ส่งให้ Alex', done: 'Alex จองเอง · คุณแค่ไปตามนัด' },
      },
      {
        title: 'ยังไม่ตัดเงิน\nจนกว่าจะยืนยัน',
        line: 'พาร์ทเนอร์ตัวจริงยืนยันก่อน ถ้าไม่ได้ ไม่มีใครต้องจ่าย',
        demo: { kind: 'share', title: 'Siam Herbal Spa', sub: 'นวดไทย 2 ชม. · 14:00', tap: 'ขอจอง', done: 'ตัดเงินเมื่อสปายืนยันเท่านั้น' },
      },
    ],
  },
  rewards: {
    id: 'rewards',
    topic: 'นิสัยโลคอล',
    topicTh: 'นิสัยโลคอล',
    done: 'เข้าใจแล้ว',
    pages: [
      {
        title: 'นิสัยเล็กๆ\nคำขอมากขึ้น',
        line: 'ลงสตอรี่ ตอบไว และออนไลน์ไว้ โลคอลแบบนี้ถูกจองก่อน',
        demo: { kind: 'online', title: 'ออนไลน์อยู่', sub: 'ลงสตอรี่แล้ว · ตอบใน 2 นาที', done: 'Alex 🇬🇧 อยากจอง', to: 'ตอบไว ถูกจองก่อน' },
      },
      {
        title: 'รายได้\nเป็นเงินบาท',
        line: 'โลคอลไม่ต้องสะสม ฿ โปร รายได้ทั้งหมดเข้าพร้อมเพย์',
        demo: { kind: 'cashout', title: 'กริ๊ง · โลคอล', from: '฿1,200', to: '฿0', tap: 'ถอน', done: 'ไม่ต้องสะสมอะไร · เข้าพร้อมเพย์ทั้งหมด' },
      },
    ],
  },
  gifts: {
    id: 'gifts',
    topic: 'ของขวัญที่ได้รับ',
    topicTh: 'ของขวัญที่ได้รับ',
    done: 'เข้าใจแล้ว',
    pages: [
      {
        title: 'แขกขอบคุณ\nด้วยของขวัญ',
        line: 'ของขวัญโชว์เป็นบับเบิลสีทองในแชท และแจ้งเตือนด้านบน',
        demo: { kind: 'claim', chips: ['🧋'], title: 'Alex ส่งชาเย็นให้', sub: 'ในแชทของคุณ', tap: 'ขอบคุณ', done: '+฿12 ให้คุณ', from: 'วันนี้ ฿1,200', to: 'วันนี้ ฿1,212' },
      },
      {
        title: 'เป็นของคุณหลังจบทริป\nเข้าพร้อมเพย์',
        line: 'เงินจากของขวัญรวมเข้ารายได้หลังจบทริป ถอนได้เหมือนเดิม',
        demo: { kind: 'cashout', title: 'กริ๊ง · โลคอล', from: '฿400', to: '฿0', tap: 'ถอน', done: 'ของขวัญตุ๊กตุ๊ก · คุณได้ ฿400 · ฟรี' },
      },
      {
        title: 'รับในแอป\nเท่านั้น',
        line: 'อย่ารับของขวัญหรือเงินนอกกริ๊ง ในแอปคุณได้รับการคุ้มครอง',
        demo: { kind: 'share', title: 'แขกคนหนึ่ง', sub: 'ขอเลขบัญชีธนาคาร', tap: 'รายงาน', done: 'อยู่ในกริ๊ง · คุณได้รับการคุ้มครอง', anon: true },
      },
    ],
  },
  safety: {
    id: 'safety',
    topic: 'ความปลอดภัยของโลคอล',
    topicTh: 'ความปลอดภัย',
    done: 'เปิดหน้าความปลอดภัย',
    pages: [
      {
        title: 'ที่สาธารณะ\nเสมอ',
        line: 'คุณเป็นคนเลือกสถานที่ ถ้าแขกขอย้ายไปที่ส่วนตัว ปฏิเสธแล้วรายงาน',
        demo: { kind: 'share', title: 'แขกคนหนึ่ง', sub: 'ขอย้ายไปห้องส่วนตัว', tap: 'ปฏิเสธและรายงาน', done: 'แผนอยู่ที่เดิม · ทีมงานรับเรื่องแล้ว', anon: true },
      },
      {
        title: 'แชร์ทริป\nให้คนที่ไว้ใจ',
        line: 'แตะเดียว ส่งสถานที่ เวลา และชื่อแขกให้คนที่คุณไว้ใจ',
        demo: { kind: 'share', title: 'ฟ้า · เพื่อนสนิท', sub: '+66 89 765 4321', tap: 'แชร์ทริป', done: 'ส่งแล้ว: เมืองเก่า 09:00 กับ Alex' },
      },
      {
        title: 'กดค้างขอความช่วยเหลือ\n1155 หรือ 191',
        line: 'กด SOS ค้าง 3 วินาที โทรตำรวจท่องเที่ยว ตำรวจ 191 อยู่ถัดลงมา มี 5 วินาทีให้ยกเลิก',
        demo: { kind: 'sos', tap: 'SOS', title: 'กดค้าง 3 วินาที', sub: 'ตำรวจ 191 · อยู่ถัดลงมา', done: 'กำลังโทร 1155…', to: 'ส่งตำแหน่งไปพร้อมสาย' },
      },
    ],
  },
  extend: {
    id: 'extend',
    topic: 'ขอเปลี่ยนเวลา',
    topicTh: 'ขอเปลี่ยนเวลา',
    done: 'เข้าใจแล้ว',
    pages: [
      {
        title: 'เขาขอเปลี่ยนเวลา\nคุณเป็นคนเลือก',
        line: 'จะเห็นบนการ์ดจองในแชทและหน้าโลคอล ราคาเดิม ไม่มีอะไรเปลี่ยนจนกว่าคุณตกลง',
        demo: { kind: 'accept', title: 'Alex ขอเป็น 10:00', sub: 'ราคาเดิม · คุณยังได้ ฿1,200', from: '09:00', tap: 'ตกลง', alt: 'ใช้เวลาเดิม', done: 'แผนเป็น', to: '10:00' },
      },
      {
        title: 'อยากเปลี่ยนเวลา?\nคุณขอได้เหมือนกัน',
        line: 'กด “ขอเปลี่ยน” บนการ์ดจองแล้วเลือกเวลา ไม่มีอะไรขยับจน Alex ตกลง',
        demo: {
          kind: 'extend',
          title: 'Alex · เดินถ่ายรูปเมืองเก่า',
          from: 'ส. 09:00',
          wait: 'ขอ Alex เป็น 10:00 · รอตอบ',
          to: 'ส. 10:00 · Alex ตกลง',
          chips: ['09:30', '10:00'],
          tap: '10:00',
          sub: 'ราคาเดิม · ยอดพักไว้ก้อนเดียว',
          done: 'ย้ายเป็น 10:00 · คุณได้ ฿1,200',
        },
      },
      {
        title: 'ไม่สะดวก?\nแผนเดิมตามนัด',
        line: 'ปฏิเสธ หรือปล่อยไว้ ไม่มีบทลงโทษ เจอกัน 09:00 ตามที่ตกลงกัน',
        demo: { kind: 'share', title: 'Alex · เดินถ่ายรูปเมืองเก่า', sub: 'ขอเป็น 10:00', tap: 'ใช้เวลาเดิม', done: 'แผนเดิม 09:00 · ไม่มีบทลงโทษ' },
      },
    ],
  },
}

export type GuideRole = 'guest' | 'host'

/** Local accounts never see traveller-only guides: Experiences and Booking fold into the hosting guide, the Starter Pack into Wallet. */
export function guideIdForRole(id: GuideId, role: GuideRole): GuideId {
  if (role === 'host' && (id === 'meet' || id === 'clink')) return 'host'
  if (role === 'host' && id === 'starter') return 'wallet'
  return id
}

/** The guide a person actually reads: their language (ไทย / English; 中文 reads English for now) and their role. */
export function getGuide(id: GuideId, language: string = 'en', role: GuideRole = 'guest'): Guide {
  const th = language === 'th'
  const gid = guideIdForRole(id, role)
  if (role === 'host') {
    const hosted = th ? HOST_GUIDES_TH[gid] : HOST_GUIDES[gid]
    if (hosted) return hosted
  }
  return th ? GUIDES_TH[gid] : GUIDES[gid]
}

/** UI strings for the guide chrome. */
export function guideChrome(language: string = 'en') {
  const th = language === 'th'
  return {
    of: th ? 'จาก' : 'of',
    example: th ? 'ตัวอย่าง' : 'Example',
    close: th ? 'ปิด' : 'Close',
    back: th ? 'ย้อนกลับ' : 'Back',
    next: th ? 'ถัดไป' : 'Next',
    closeAria: th ? 'ปิดคู่มือ' : 'Close guide',
    pageAria: (i: number, n: number) => (th ? `หน้า ${i} จาก ${n}` : `Page ${i} of ${n}`),
  }
}

/** Map a HelpDot / tab id onto the right guide (and page). Unknown ids fall back to Meet. */
export function guideTargetFor(id: string): { id: GuideId; page: number } {
  switch (id) {
    case 'meet':
    case 'meet-grid':
    case 'meet-stories':
      return { id: 'meet', page: 0 }
    case 'meet-rewards':
    case 'rewards':
    case 'games':
      return { id: 'rewards', page: 0 }
    case 'clink':
    case 'offer':
      return { id: 'clink', page: 0 }
    case 'gifts':
    case 'gift':
      return { id: 'gifts', page: 0 }
    case 'chats':
      return { id: 'chats', page: 0 }
    case 'plan-extend':
    case 'extend':
    case 'extension':
      return { id: 'extend', page: 0 }
    case 'pulse':
    case 'pulse-moments':
      return { id: 'pulse', page: 0 }
    case 'pulse-floor':
    case 'floor':
    case 'floor-price':
      return { id: 'floor', page: 0 }
    case 'pulse-bundle':
    case 'pulse-coupons':
      return { id: 'pulse-coupons', page: 0 }
    case 'starter':
    case 'starter-pack':
      return { id: 'starter', page: 0 }
    case 'wallet':
    case 'vip':
    case 'wallet-earn':
      return { id: 'wallet', page: 0 }
    case 'wallet-modes':
      return { id: 'wallet', page: 2 }
    case 'host':
    case 'host-home':
      return { id: 'host', page: 0 }
    case 'safety':
      return { id: 'safety', page: 0 }
    default:
      return (GUIDE_IDS as string[]).includes(id) ? { id: id as GuideId, page: 0 } : { id: 'meet', page: 0 }
  }
}

export function openGuide(id: GuideId | string, page?: number): void {
  if (typeof window === 'undefined') return
  const target = guideTargetFor(id)
  window.dispatchEvent(new CustomEvent('chon:open-guide', { detail: { id: target.id, page: page ?? target.page } }))
}
