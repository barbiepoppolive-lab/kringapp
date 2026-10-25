/* kringapp.com — final site
   01 Hold to กริ๊ง! (bump hero) · 02 Host / traveller switch · 03 Trip card · 04 Waitlist
   One shared rAF loop drives the cinematic background, the hero rings and the sparks. */
(() => {
'use strict';

/* =====================================================================
   LAUNCH SWITCHES
   ===================================================================== */
const LAUNCHED = false;          // true on launch day: CTAs become "Open the app" → ./app/
const WAITLIST_ENDPOINT = 'https://pedxoxpammnyfnizljyj.supabase.co/rest/v1/kr6_waitlist';   // insert-only table (0009 + 0010); '' = preview, nothing sent
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';           // public by design (same key as the live site)
const WL_HEADERS = {'Content-Type': 'application/json', 'apikey': SUPABASE_PUBLISHABLE_KEY, 'Authorization': 'Bearer ' + SUPABASE_PUBLISHABLE_KEY, 'Prefer': 'return=minimal'};

/* =====================================================================
   PHOTOS — every photo ↔ caption pair lives here. Swap files or captions
   here only. Captions must describe what the photo really shows.
   ===================================================================== */
const PH = 'assets/final/photos/';
const PHOTOS = {
  yaowarat: { src: PH + 'yaowarat-food.jpg',            // Yaowarat Road at night (true)
    cap: {en:"Yaowarat night food",th:"สตรีทฟู้ดเยาวราช",zh:"耀华力夜市美食",ko:"야오와랏 밤 먹거리",hi:"याओवारात नाइट फ़ूड",ru:"Ночная еда Яоварата",ms:"Makanan malam Yaowarat"} },
  malai:    { art: 'malai',                              // drawn in code (no true flower-market photo yet)
    cap: {en:"Flower market & garlands",th:"ตลาดดอกไม้ ร้อยมาลัย",zh:"花市与花环",ko:"꽃시장과 꽃목걸이",hi:"फूल बाज़ार और मालाएँ",ru:"Цветочный рынок и гирлянды",ms:"Pasar bunga & kalungan"} },
  marble:   { src: PH + 'talat-noi-oldtown.jpg',        // file name is wrong: it shows Wat Benchamabophit (Marble Temple)
    cap: {en:"Marble Temple walk",th:"เดินชมวัดเบญจมบพิตร",zh:"大理石寺漫步",ko:"대리석 사원 산책",hi:"मार्बल टेंपल की सैर",ru:"Прогулка к Мраморному храму",ms:"Lawatan Kuil Marmar"} },
  muay:     { src: PH + 'muay-thai.jpg',                // boxing gloves (generic)
    cap: {en:"Muay Thai, first round",th:"มวยไทยครั้งแรก",zh:"泰拳初体验",ko:"무에타이 첫 라운드",hi:"मुआय थाई, पहला राउंड",ru:"Муай-тай: первый раунд",ms:"Muay Thai, pusingan pertama"} },
  cook:     { src: PH + 'cooking-class.jpg',            // people cooking together (generic)
    cap: {en:"Cook Thai with a local",th:"ทำอาหารไทยกับคนท้องถิ่น",zh:"跟本地人学做泰国菜",ko:"현지인과 태국 요리",hi:"लोकल के साथ थाई खाना",ru:"Тайская кухня с местным",ms:"Masak masakan Thai"} },
  grill:    { src: PH + 'night-market.jpg',             // grilled skewers on a table (generic)
    cap: {en:"Night market grill",th:"ของปิ้งย่างตลาดนัด",zh:"夜市烧烤",ko:"야시장 꼬치구이",hi:"नाइट मार्केट ग्रिल",ru:"Гриль на ночном рынке",ms:"Bakar-bakar pasar malam"} },
  beach:    { src: PH + 'koh-larn-beach.jpg',           // beach at sunset
    cap: {en:"Koh Larn beach day",th:"เที่ยวเกาะล้าน",zh:"格兰岛海滩一日",ko:"꼬란 해변의 하루",hi:"को लार्न बीच डे",ru:"День на Ко Лан",ms:"Sehari di Koh Larn"} },
  seafood:  { src: PH + 'seafood-market.jpg',           // a plate of prawns (generic)
    cap: {en:"Seafood, Pattaya style",th:"ซีฟู้ดสไตล์พัทยา",zh:"芭提雅风味海鲜",ko:"파타야식 해산물",hi:"पटाया स्टाइल सीफ़ूड",ru:"Морепродукты по-паттайски",ms:"Makanan laut gaya Pattaya"} }
};
// Not used on purpose: wat-arun-temple.jpg (a different temple), flower-market.jpg (poppies),
// canal-longtail.jpg + chao-phraya-sunset.jpg (Andaman coast). Add true photos here when you have them.

/* activities: one price per activity, for 1–2 people; street price is the struck comparison */
const ACTS = [
  {k:'yaowarat', cat:'eat',    icon:'bowl',  col:'anchan', price:1000, street:1600, host:{en:'Ploy',th:'พลอย'},
   place:{en:"Chinatown",th:"เยาวราช",zh:"唐人街",ko:"차이나타운",hi:"चाइनाटाउन",ru:"Чайнатаун",ms:"Pekan Cina"},
   tag:{en:"Food",th:"อาหาร",zh:"美食",ko:"먹거리",hi:"खाना",ru:"Еда",ms:"Makanan"}},
  {k:'malai',    cat:'market', icon:'lotus', col:'gold',   price:900,  street:1400, host:{en:'Nok',th:'นก'},
   place:{en:"Pak Khlong Talat",th:"ปากคลองตลาด",zh:"帕空达叻花市",ko:"빡크롱딸랏",hi:"पाक खलोंग तलात",ru:"Пак Кхлонг Талат",ms:"Pak Khlong Talat"},
   tag:{en:"Trending",th:"มาแรง",zh:"热门",ko:"인기",hi:"ट्रेंडिंग",ru:"В тренде",ms:"Popular"}},
  {k:'marble',   cat:'temple', icon:'prang', col:'night',  price:800,  street:1300, host:{en:'Ton',th:'ต้น'},
   place:{en:"Dusit",th:"ดุสิต",zh:"律实",ko:"두싯",hi:"दुसित",ru:"Дусит",ms:"Dusit"},
   tag:{en:"Temples",th:"วัด",zh:"寺庙",ko:"사원",hi:"मंदिर",ru:"Храмы",ms:"Kuil"}},
  {k:'muay',     cat:'muay',   icon:'glove', col:'anchan', price:1200, street:1900, host:{en:'Beam',th:'บีม'},
   place:{en:"Lumpini",th:"ลุมพินี",zh:"伦披尼",ko:"룸피니",hi:"लुम्पिनी",ru:"Лумпини",ms:"Lumpini"},
   tag:{en:"Muay Thai",th:"มวยไทย",zh:"泰拳",ko:"무에타이",hi:"मुआय थाई",ru:"Муай-тай",ms:"Muay Thai"}},
  {k:'cook',     cat:'cook',   icon:'wok',   col:'gold',   price:1200, street:1800, host:{en:'Pim',th:'พิมพ์'},
   place:{en:"Bang Rak",th:"บางรัก",zh:"挽叻",ko:"방락",hi:"बांग राक",ru:"Банг Рак",ms:"Bang Rak"},
   tag:{en:"Cooking",th:"ทำอาหาร",zh:"烹饪",ko:"요리",hi:"कुकिंग",ru:"Кулинария",ms:"Memasak"}},
  {k:'grill',    cat:'night',  icon:'skewer',col:'night',  price:800,  street:1200, host:{en:'Arm',th:'อาร์ม'},
   place:{en:"Srinakarin",th:"ศรีนครินทร์",zh:"诗纳卡琳",ko:"씨나카린",hi:"श्रीनगरिन",ru:"Шринакарин",ms:"Srinakarin"},
   tag:{en:"Night",th:"กลางคืน",zh:"夜市",ko:"야시장",hi:"रात",ru:"Ночь",ms:"Malam"}},
  {k:'beach',    cat:'beach',  icon:'sun',   col:'gold',   price:1500, street:2400, host:{en:'Fah',th:'ฟ้า'},
   place:{en:"Pattaya",th:"พัทยา",zh:"芭提雅",ko:"파타야",hi:"पटाया",ru:"Паттайя",ms:"Pattaya"},
   tag:{en:"Pattaya",th:"พัทยา",zh:"芭提雅",ko:"파타야",hi:"पटाया",ru:"Паттайя",ms:"Pattaya"}},
  {k:'seafood',  cat:'sea',    icon:'boat',  col:'anchan', price:800,  street:1250, host:{en:'Mint',th:'มิ้นท์'},
   place:{en:"Naklua, Pattaya",th:"นาเกลือ พัทยา",zh:"芭提雅那库拉",ko:"파타야 나끌르아",hi:"नकलुआ, पटाया",ru:"Наклуа, Паттайя",ms:"Naklua, Pattaya"},
   tag:{en:"Food",th:"อาหาร",zh:"美食",ko:"먹거리",hi:"खाना",ru:"Еда",ms:"Makanan"}}
];
/* host "create your activity": category chips → example activity */
const CATS = [
  {a:'yaowarat', n:{en:"Food",th:"อาหาร",zh:"美食",ko:"먹거리",hi:"खाना",ru:"Еда",ms:"Makanan"}},
  {a:'malai',    n:{en:"Market",th:"ตลาด",zh:"市场",ko:"시장",hi:"बाज़ार",ru:"Рынок",ms:"Pasar"}},
  {a:'marble',   n:{en:"Temple",th:"วัด",zh:"寺庙",ko:"사원",hi:"मंदिर",ru:"Храм",ms:"Kuil"}},
  {a:'muay',     n:{en:"Muay Thai",th:"มวยไทย",zh:"泰拳",ko:"무에타이",hi:"मुआय थाई",ru:"Муай-тай",ms:"Muay Thai"}},
  {a:'cook',     n:{en:"Cooking",th:"ทำอาหาร",zh:"烹饪",ko:"요리",hi:"कुकिंग",ru:"Кулинария",ms:"Memasak"}},
  {a:'beach',    n:{en:"Beach",th:"ทะเล",zh:"海滩",ko:"해변",hi:"बीच",ru:"Пляж",ms:"Pantai"}}
];
const PRICES = [500, 800, 1200];

/* =====================================================================
   WORDS (7 languages)
   ===================================================================== */
const W = {
 en:{"skip": "Skip to content", "langL": "Language", "snd": "Sound and vibration", "ch1": "The bump", "ch2": "Host or visit", "ch3": "Trip card", "ch4": "Early access", "next": "Next", "prev": "Previous", "kicker": "Real Thailand, with a local.", "hold": "Hold to {k}", "holdBtn": "Hold", "hintKey": "or hold Space", "hintTouch": "or drag the rings together", "r1": "Find a local activity", "r2": "Money held until you meet", "r3": "Touch phones, {k}", "cta": "Get early access", "when": "Bangkok · Pattaya · November", "swTrav": "I'm visiting", "hBadge": "Founding host · first 100 per area", "hSub": "Host short activities for travellers: food walks, markets, Muay Thai. ID-checked, always in public places.", "cNew": "New activity", "cPpl": "1–2 people", "cPer": "per activity", "cName": "Name your activity", "cCat": "Category", "cPrice": "Price per activity", "medal": "FOUNDING HOST • FIRST 100 • ", "tId": "ID check", "tPub": "Public places", "tPP": "PromptPay", "hCta": "Be one of the first hosts", "tTitle": "Pick a moment.", "tSub": "One price per activity · 1–2 people · real activities in public places", "held": "Money held until you meet", "heldFine": "Held by a licensed payment partner.", "acts": "Activities", "trTitle": "Make your trip card", "trSub": "Pick 3. Share it.", "dl": "Download", "share": "Share", "reset": "Start over", "saved": "Saved", "cTitle": "My Thailand trip", "day": "Day {n}", "with": "with {n}", "pick": "Pick a postcard", "cardHeld": "Held safely until you meet", "cardAlt": "Your trip card", "jWhen": "Opens in November · Bangkok · Pattaya", "jTrav": "Get early access", "jHost": "Be one of the first hosts", "visit": "I'm visiting", "local": "I'm a Thai local", "badgeT": "Founding host", "badgeS": "First 100 per area", "field": "Email, LINE ID or phone", "join": "Join", "err": "Enter an email, a LINE ID or a phone number.", "consent": "We only use this to tell you when we open.", "preview": "Preview: nothing is sent yet.", "sending": "Sending…", "fail": "Couldn't send. Please try again.", "tyTrav": "Thank you!", "tyTrav2": "See you in November.", "tyHost": "Welcome, founding host.", "tyHost2": "First 100 per area. You're early.", "shareT": "Tell a friend", "copy": "Copy link", "copied": "Link copied", "shareText": "Real Thailand, with a local. Kring opens in November in Bangkok and Pattaya.", "edit": "Change", "openApp": "Open the app", "privacy": "Privacy", "safety": "Safety", "del": "Delete account", "line": "LINE · coming soon", "police": "Tourist Police 1155", "soonS": "Coming soon", "soon": "Coming soon · November", "bizNav": "For businesses", "ch5": "For businesses", "swHost": "I'm a Thai local", "hT1": "Share what you love.", "hT2": "Get paid when you meet.", "tripSoon": "Book them in the app · Coming soon", "bizTitle": "Bring travellers through your door.", "bizSub": "Be a Kring partner venue in Bangkok or Pattaya.", "bc1": "Travellers in 7 languages", "bc2": "Partner venue for local activities", "bc3": "Deals & vouchers in the app", "bc4": "No setup cost", "bStep1": "Your business", "bStep2": "How to reach you", "bName": "Business name", "bType": "Type of business", "bArea": "Area", "aBkk": "Bangkok", "aPty": "Pattaya", "bDistrict": "District (optional)", "bDistrictPh": "e.g. Bang Rak, Jomtien", "bPerson": "Contact person", "bNext": "Next", "bContact": "LINE ID or phone", "bEmail": "Email (optional)", "bOffer": "What would you offer travellers? (optional)", "bOfferPh": "e.g. a free drink with every booking", "bTime": "Best time to call", "tAny": "Any time", "tMorning": "Morning", "tAfternoon": "Afternoon", "tEvening": "Evening", "bConsent": "I agree that Kring may contact me about a partnership.", "bBack": "Back", "bSend": "Send", "bThanks": "Thanks! Our partner team will contact you.", "bThanks2": "We'll message you on LINE or call before launch in November.", "bAgain": "Add another business", "ty1": "Café & restaurant", "ty2": "Cooking school", "ty3": "Muay Thai gym", "ty4": "Tours & boats", "ty5": "Market & shop", "ty6": "Transport & eSIM", "ty7": "Other", "eName": "Enter your business name.", "eType": "Pick a type.", "ePerson": "Enter a contact name.", "eContact": "Enter a LINE ID or phone.", "eEmail": "Check the email.", "eConsent": "Please tick to agree.", "stepOf": "Step {n} of 2", "ch6": "Inside Kring", "inT": "More inside Kring.", "inSub": "Deals, coupons and one simple way to pay. Hosts earn more as they grow.", "inTabT": "For travellers", "inTabH": "For hosts", "d1T": "Deals & packages", "d1S": "Licensed tours, island days and city packs in one booking.", "d2T": "Coupons", "d2S": "eSIM, airport car, bag drop, Thai tea. Show the code at the counter.", "d3T": "Pay in seconds", "d3S": "Pay the way you pay at home. A licensed payment partner holds it until you meet.", "d4T": "See what you save", "d4S": "Every price shows the usual street price next to it.", "ex1": "48 hours in Bangkok", "ex2": "Thailand eSIM, 8 days", "ex4": "Street food walk", "inFine": "Example prices. Final prices in the app at launch. Payment options depend on our licensed payment partner.", "h1T": "Your price, per activity", "h1S": "One price for 1–2 people. You set it.", "h2T": "Paid when you meet", "h2S": "When phones touch, it goes to your PromptPay.", "h3T": "Tips and Thai gifts", "h3S": "Travellers can tip after the activity and send gifts. Tips go straight to you.", "h4T": "Level up, earn more", "h4S": "Higher levels earn more per activity.", "pays": "Card|PromptPay QR|Apple Pay"},
 th:{"skip": "ข้ามไปยังเนื้อหา", "langL": "ภาษา", "snd": "เสียงและการสั่น", "ch1": "กริ๊ง!", "ch2": "โฮสต์หรือมาเที่ยว", "ch3": "การ์ดทริป", "ch4": "รับสิทธิ์ก่อน", "next": "ถัดไป", "prev": "ก่อนหน้า", "kicker": "เที่ยวไทยของจริง กับคนท้องถิ่น", "hold": "กดค้างให้ {k}", "holdBtn": "กดค้าง", "hintKey": "หรือกด Space ค้างไว้", "hintTouch": "หรือลากวงแหวนมาชนกัน", "r1": "เลือกกิจกรรมกับคนท้องถิ่น", "r2": "พักเงินไว้จนกว่าจะเจอกัน", "r3": "แตะโทรศัพท์ {k}", "cta": "รับสิทธิ์ก่อนใคร", "when": "กรุงเทพฯ · พัทยา · พฤศจิกายน", "swTrav": "ฉันมาเที่ยว", "hBadge": "โฮสต์รุ่นแรก · 100 คนแรกต่อพื้นที่", "hSub": "พานักท่องเที่ยวทำกิจกรรมสั้น ๆ เช่น เดินกิน ตลาด มวยไทย · ยืนยันตัวตน · เจอกันที่สาธารณะเสมอ", "cNew": "กิจกรรมใหม่", "cPpl": "1–2 คน", "cPer": "ต่อกิจกรรม", "cName": "ตั้งชื่อกิจกรรม", "cCat": "หมวด", "cPrice": "ราคาต่อกิจกรรม", "medal": "โฮสต์รุ่นแรก • 100 คนแรก • ", "tId": "ยืนยันตัวตน", "tPub": "ที่สาธารณะ", "tPP": "พร้อมเพย์", "hCta": "สมัครเป็นโฮสต์รุ่นแรก", "tTitle": "เลือกโมเมนต์ของคุณ", "tSub": "ราคาเดียวต่อกิจกรรม · 1–2 คน · กิจกรรมจริง ในที่สาธารณะ", "held": "พักเงินไว้จนกว่าจะเจอกัน", "heldFine": "พาร์ทเนอร์ชำระเงินที่มีใบอนุญาตดูแลให้อย่างปลอดภัย", "acts": "กิจกรรม", "trTitle": "ทำการ์ดทริปของคุณ", "trSub": "เลือก 3 ใบ แล้วแชร์เลย", "dl": "ดาวน์โหลด", "share": "แชร์", "reset": "เริ่มใหม่", "saved": "บันทึกแล้ว", "cTitle": "ทริปเมืองไทยของฉัน", "day": "วันที่ {n}", "with": "กับ{n}", "pick": "เลือกโปสการ์ด", "cardHeld": "พักเงินไว้อย่างปลอดภัยจนกว่าจะเจอกัน", "cardAlt": "การ์ดทริปของคุณ", "jWhen": "เปิดพฤศจิกายนนี้ · กรุงเทพฯ · พัทยา", "jTrav": "รับสิทธิ์ก่อนใคร", "jHost": "มาเป็นโฮสต์รุ่นแรกกันนะคะ", "visit": "ฉันมาเที่ยว", "local": "ฉันเป็นคนไทย", "badgeT": "โฮสต์รุ่นแรก", "badgeS": "100 คนแรกต่อพื้นที่", "field": "อีเมล, LINE ID หรือเบอร์โทร", "join": "เข้าร่วม", "err": "กรุณากรอกอีเมล LINE ID หรือเบอร์โทรค่ะ", "consent": "เราใช้ข้อมูลนี้เพื่อแจ้งตอนเปิดตัวเท่านั้นค่ะ", "preview": "ตัวอย่าง: ยังไม่มีการส่งข้อมูลค่ะ", "sending": "กำลังส่ง…", "fail": "ส่งไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", "tyTrav": "ขอบคุณค่ะ!", "tyTrav2": "เจอกันเดือนพฤศจิกายนนะคะ", "tyHost": "ยินดีต้อนรับ โฮสต์รุ่นแรก", "tyHost2": "100 คนแรกต่อพื้นที่ คุณมาก่อนใครเลยค่ะ", "shareT": "ชวนเพื่อนมาด้วย", "copy": "คัดลอกลิงก์", "copied": "คัดลอกลิงก์แล้ว", "shareText": "เที่ยวไทยของจริง กับคนท้องถิ่น กริ๊ง! เปิดพฤศจิกายนนี้ที่กรุงเทพฯ และพัทยา", "edit": "แก้ไข", "openApp": "เปิดแอป", "privacy": "ความเป็นส่วนตัว", "safety": "ความปลอดภัย", "del": "ลบบัญชี", "line": "LINE · เร็ว ๆ นี้", "police": "ตำรวจท่องเที่ยว 1155", "soonS": "เร็ว ๆ นี้", "soon": "เร็ว ๆ นี้ · พฤศจิกายน", "bizNav": "สำหรับธุรกิจ", "ch5": "สำหรับธุรกิจ", "swHost": "ฉันเป็นคนไทย", "hT1": "แชร์สิ่งที่คุณรัก", "hT2": "ได้เงินเมื่อเจอกัน", "tripSoon": "จองได้ในแอป · เร็ว ๆ นี้", "bizTitle": "พานักท่องเที่ยวมาถึงหน้าร้านคุณ", "bizSub": "มาเป็นร้านพาร์ทเนอร์ของกริ๊ง! ในกรุงเทพฯ หรือพัทยา", "bc1": "นักท่องเที่ยว 7 ภาษา", "bc2": "สถานที่พาร์ทเนอร์สำหรับกิจกรรม", "bc3": "ดีลและบัตรกำนัลในแอป", "bc4": "ไม่มีค่าแรกเข้า", "bStep1": "ธุรกิจของคุณ", "bStep2": "ช่องทางติดต่อ", "bName": "ชื่อธุรกิจ", "bType": "ประเภทธุรกิจ", "bArea": "พื้นที่", "aBkk": "กรุงเทพฯ", "aPty": "พัทยา", "bDistrict": "เขต/ย่าน (ไม่บังคับ)", "bDistrictPh": "เช่น บางรัก, จอมเทียน", "bPerson": "ชื่อผู้ติดต่อ", "bNext": "ถัดไป", "bContact": "LINE ID หรือเบอร์โทร", "bEmail": "อีเมล (ไม่บังคับ)", "bOffer": "อยากมอบอะไรให้นักท่องเที่ยว? (ไม่บังคับ)", "bOfferPh": "เช่น เครื่องดื่มฟรีทุกการจอง", "bTime": "เวลาที่สะดวกให้โทร", "tAny": "ได้ทุกเวลา", "tMorning": "ช่วงเช้า", "tAfternoon": "ช่วงบ่าย", "tEvening": "ช่วงเย็น", "bConsent": "ยินยอมให้กริ๊ง! ติดต่อเรื่องการเป็นพาร์ทเนอร์", "bBack": "ย้อนกลับ", "bSend": "ส่ง", "bThanks": "ขอบคุณค่ะ ทีมพาร์ทเนอร์จะติดต่อกลับนะคะ", "bThanks2": "ทีมเราจะทักทาง LINE หรือโทรหาก่อนเปิดตัวเดือนพฤศจิกายนค่ะ", "bAgain": "เพิ่มธุรกิจอีกแห่ง", "ty1": "คาเฟ่และร้านอาหาร", "ty2": "โรงเรียนสอนทำอาหาร", "ty3": "ค่ายมวยไทย", "ty4": "ทัวร์และเรือ", "ty5": "ตลาดและร้านค้า", "ty6": "รถรับส่งและซิม", "ty7": "อื่น ๆ", "eName": "กรุณากรอกชื่อธุรกิจค่ะ", "eType": "เลือกประเภทธุรกิจค่ะ", "ePerson": "กรุณากรอกชื่อผู้ติดต่อค่ะ", "eContact": "กรุณากรอก LINE ID หรือเบอร์โทรค่ะ", "eEmail": "อีเมลไม่ถูกต้องค่ะ", "eConsent": "กรุณาติ๊กยินยอมค่ะ", "stepOf": "ขั้นที่ {n} จาก 2", "ch6": "ข้างในกริ๊ง!", "inT": "ในแอปยังมีอีกเยอะ", "inSub": "ดีล คูปอง และจ่ายเงินง่ายในที่เดียว โฮสต์ยิ่งโต ยิ่งได้มากขึ้น", "inTabT": "สำหรับนักท่องเที่ยว", "inTabH": "สำหรับโฮสต์", "d1T": "ดีลและแพ็กเกจ", "d1S": "ทัวร์ที่มีใบอนุญาต เที่ยวเกาะ และแพ็กเที่ยวเมือง จองครั้งเดียวจบ", "d2T": "คูปอง", "d2S": "ซิมเน็ต รถรับสนามบิน ฝากกระเป๋า ชาไทย โชว์โค้ดที่เคาน์เตอร์ได้เลย", "d3T": "จ่ายง่ายในไม่กี่วินาที", "d3S": "จ่ายด้วยวิธีที่คุ้นเคย พาร์ทเนอร์ชำระเงินที่มีใบอนุญาตพักเงินไว้จนกว่าจะเจอกัน", "d4T": "เห็นชัดว่าประหยัดเท่าไร", "d4S": "ทุกราคามีราคาทั่วไปแถวนั้นวางเทียบไว้ให้", "ex1": "48 ชั่วโมงแรกในกรุงเทพฯ", "ex2": "eSIM ไทย 8 วัน", "ex4": "เดินกินสตรีทฟู้ด", "inFine": "ราคาตัวอย่าง ราคาจริงดูในแอปตอนเปิดตัว ช่องทางจ่ายเงินขึ้นกับพาร์ทเนอร์ชำระเงินที่มีใบอนุญาต", "h1T": "ตั้งราคาเองต่อกิจกรรม", "h1S": "ราคาเดียวสำหรับ 1–2 คน คุณเป็นคนกำหนด", "h2T": "ได้เงินเมื่อเจอกัน", "h2S": "แตะโทรศัพท์ปุ๊บ เงินเข้าพร้อมเพย์ของคุณ", "h3T": "ทิปและของขวัญไทย", "h3S": "นักท่องเที่ยวให้ทิปหลังจบกิจกรรมและส่งของขวัญได้ ทิปส่งถึงคุณโดยตรง", "h4T": "เลเวลสูงขึ้น ได้มากขึ้น", "h4S": "ยิ่งเลเวลสูง ยิ่งได้เงินต่อกิจกรรมมากขึ้น", "pays": "พร้อมเพย์ QR|บัตรเครดิต/เดบิต|Apple Pay"},
 zh:{"skip": "跳到正文", "langL": "语言", "snd": "声音与振动", "ch1": "碰一碰", "ch2": "达人或游客", "ch3": "行程卡", "ch4": "抢先体验", "next": "下一个", "prev": "上一个", "kicker": "跟着本地人，玩真实的泰国。", "hold": "长按，{k}", "holdBtn": "长按", "hintKey": "或按住空格键", "hintTouch": "或把两个圆环拖到一起", "r1": "挑一个本地活动", "r2": "见面前，款项安全托管", "r3": "手机一碰，{k}", "cta": "抢先体验", "when": "曼谷 · 芭提雅 · 11月", "swTrav": "我是游客", "hBadge": "创始本地达人 · 每区前100位", "hSub": "带游客体验美食漫步、市场、泰拳等短活动 · 实名认证 · 始终在公共场所", "cNew": "新活动", "cPpl": "1–2人", "cPer": "每次活动", "cName": "给活动起个名字", "cCat": "类别", "cPrice": "每次活动价格", "medal": "创始本地达人 • 首批100位 • ", "tId": "身份核验", "tPub": "公共场所", "tPP": "PromptPay", "hCta": "成为首批本地达人", "tTitle": "选一个瞬间。", "tSub": "按活动计价 · 1–2人同价 · 真实活动，公共场所", "held": "见面前，款项安全托管", "heldFine": "由持牌支付合作方安全托管。", "acts": "活动", "trTitle": "制作你的行程卡", "trSub": "选3张，分享出去。", "dl": "下载", "share": "分享", "reset": "重选", "saved": "已保存", "cTitle": "我的泰国行程", "day": "第{n}天", "with": "和{n}一起", "pick": "选一张明信片", "cardHeld": "见面前，款项安全托管", "cardAlt": "你的行程卡", "jWhen": "11月上线 · 曼谷 · 芭提雅", "jTrav": "抢先体验", "jHost": "成为首批本地达人", "visit": "我是游客", "local": "我是泰国本地人", "badgeT": "创始本地达人", "badgeS": "每区前100位", "field": "邮箱、LINE ID 或手机号", "join": "加入", "err": "请填写邮箱、LINE ID 或手机号。", "consent": "仅用于上线时通知你。", "preview": "预览：目前不会发送任何信息。", "sending": "发送中…", "fail": "发送失败，请重试。", "tyTrav": "谢谢你！", "tyTrav2": "11月见。", "tyHost": "欢迎你，创始本地达人。", "tyHost2": "每区仅限前100位，你来得正早。", "shareT": "告诉朋友", "copy": "复制链接", "copied": "链接已复制", "shareText": "跟着本地人，玩真实的泰国。Kring 11月在曼谷和芭提雅上线。", "edit": "修改", "openApp": "打开应用", "privacy": "隐私", "safety": "安全", "del": "删除账户", "line": "LINE · 即将推出", "police": "旅游警察 1155", "soonS": "即将上线", "soon": "即将上线 · 11月", "bizNav": "商家合作", "ch5": "商家合作", "swHost": "我是泰国本地人", "hT1": "分享你热爱的事。", "hT2": "见面即收款。", "tripSoon": "App 内预订 · 即将上线", "bizTitle": "让游客走进你的店。", "bizSub": "成为 Kring 在曼谷或芭提雅的合作商家。", "bc1": "7种语言的游客", "bc2": "本地活动合作场地", "bc3": "App 内优惠与代金券", "bc4": "零入驻费用", "bStep1": "你的商家", "bStep2": "联系方式", "bName": "商家名称", "bType": "商家类型", "bArea": "区域", "aBkk": "曼谷", "aPty": "芭提雅", "bDistrict": "区（选填）", "bDistrictPh": "例如：挽叻、宗甸", "bPerson": "联系人", "bNext": "下一步", "bContact": "LINE ID 或电话", "bEmail": "邮箱（选填）", "bOffer": "你想为游客提供什么？（选填）", "bOfferPh": "例如：每单送一杯饮料", "bTime": "方便来电的时间", "tAny": "任何时间", "tMorning": "上午", "tAfternoon": "下午", "tEvening": "晚上", "bConsent": "我同意 Kring 就合作事宜联系我。", "bBack": "返回", "bSend": "提交", "bThanks": "谢谢！合作团队会尽快联系你。", "bThanks2": "我们会在11月上线前通过 LINE 或电话联系你。", "bAgain": "再添加一家商家", "ty1": "咖啡馆与餐厅", "ty2": "烹饪学校", "ty3": "泰拳馆", "ty4": "旅游与游船", "ty5": "市场与商店", "ty6": "交通与电话卡", "ty7": "其他", "eName": "请填写商家名称。", "eType": "请选择商家类型。", "ePerson": "请填写联系人。", "eContact": "请填写 LINE ID 或电话。", "eEmail": "请检查邮箱。", "eConsent": "请勾选同意。", "stepOf": "第 {n} 步，共 2 步", "ch6": "Kring 里有什么", "inT": "Kring 里还有更多。", "inSub": "优惠、优惠券和简单的支付方式。本地达人越成长，收入越多。", "inTabT": "给游客", "inTabH": "给本地达人", "d1T": "优惠与套餐", "d1S": "持牌团游、海岛一日游和城市套餐，一次预订搞定。", "d2T": "优惠券", "d2S": "eSIM、机场接送、行李寄存、泰式奶茶。到柜台出示券码即可。", "d3T": "几秒完成支付", "d3S": "用你在国内习惯的方式付款。持牌支付合作方保管款项，见面后才放款。", "d4T": "省多少一目了然", "d4S": "每个价格旁都标出附近的常见价格。", "ex1": "曼谷48小时", "ex2": "泰国 eSIM 8天", "ex4": "街头美食漫步", "inFine": "示例价格，最终价格以上线时 App 内为准。支付方式取决于持牌支付合作方。", "h1T": "按活动定价", "h1S": "1–2人一个价格，由你决定。", "h2T": "见面即收款", "h2S": "手机一碰，款项转入你的 PromptPay。", "h3T": "小费和泰式礼物", "h3S": "游客可在活动后给小费、送礼物。小费直接给你。", "h4T": "等级越高，收入越多", "h4S": "等级越高，每次活动收入越多。", "pays": "支付宝 Alipay|微信支付 WeChat Pay|银联 UnionPay"},
 ko:{"skip": "본문으로 건너뛰기", "langL": "언어", "snd": "소리와 진동", "ch1": "맞대기", "ch2": "호스트 또는 여행", "ch3": "여행 카드", "ch4": "사전 신청", "next": "다음", "prev": "이전", "kicker": "현지인과 함께, 진짜 태국.", "hold": "길게 눌러 {k}", "holdBtn": "누르기", "hintKey": "또는 스페이스바를 길게", "hintTouch": "또는 두 링을 끌어 맞대기", "r1": "현지 액티비티 고르기", "r2": "만날 때까지 결제 금액 보관", "r3": "휴대폰을 맞대면 {k}", "cta": "사전 신청하기", "when": "방콕 · 파타야 · 11월", "swTrav": "여행 왔어요", "hBadge": "창립 호스트 · 지역별 선착순 100명", "hSub": "여행자와 먹거리 산책, 시장, 무에타이 같은 짧은 액티비티를 함께해요 · 신원 확인 · 언제나 공공장소에서", "cNew": "새 액티비티", "cPpl": "1–2명", "cPer": "액티비티당", "cName": "액티비티 이름", "cCat": "카테고리", "cPrice": "액티비티당 가격", "medal": "창립 호스트 • 선착순 100명 • ", "tId": "신분 인증", "tPub": "공공장소", "tPP": "PromptPay", "hCta": "첫 호스트 되기", "tTitle": "순간을 고르세요.", "tSub": "액티비티당 한 가격 · 1–2명 · 공공장소에서 하는 진짜 액티비티", "held": "만날 때까지 결제 금액을 보관해요", "heldFine": "인가받은 결제 파트너가 안전하게 보관해요.", "acts": "액티비티", "trTitle": "여행 카드 만들기", "trSub": "3장 고르고 공유하세요.", "dl": "다운로드", "share": "공유", "reset": "다시 고르기", "saved": "저장됨", "cTitle": "나의 태국 여행", "day": "{n}일차", "with": "{n}님과 함께", "pick": "엽서를 고르세요", "cardHeld": "만날 때까지 안전하게 보관", "cardAlt": "나의 여행 카드", "jWhen": "11월 오픈 · 방콕 · 파타야", "jTrav": "사전 신청하기", "jHost": "첫 호스트가 되어 주세요", "visit": "여행 왔어요", "local": "태국 현지인이에요", "badgeT": "창립 호스트", "badgeS": "지역별 선착순 100명", "field": "이메일, LINE ID 또는 전화번호", "join": "신청", "err": "이메일, LINE ID 또는 전화번호를 입력해 주세요.", "consent": "오픈 소식을 알려 드릴 때만 사용해요.", "preview": "미리보기: 아직 아무것도 전송되지 않아요.", "sending": "보내는 중…", "fail": "전송하지 못했어요. 다시 시도해 주세요.", "tyTrav": "감사합니다!", "tyTrav2": "11월에 만나요.", "tyHost": "창립 호스트가 되신 걸 환영해요.", "tyHost2": "지역별 선착순 100명. 정말 빠르시네요.", "shareT": "친구에게 알리기", "copy": "링크 복사", "copied": "링크를 복사했어요", "shareText": "현지인과 함께, 진짜 태국. Kring이 11월 방콕과 파타야에서 오픈해요.", "edit": "변경", "openApp": "앱 열기", "privacy": "개인정보", "safety": "안전", "del": "계정 삭제", "line": "LINE · 곧 오픈", "police": "관광경찰 1155", "soonS": "출시 예정", "soon": "출시 예정 · 11월", "bizNav": "비즈니스 파트너", "ch5": "비즈니스 파트너", "swHost": "태국 현지인이에요", "hT1": "좋아하는 것을 나누세요.", "hT2": "만나면 받으세요.", "tripSoon": "앱에서 예약 · 출시 예정", "bizTitle": "여행자를 가게로 모셔오세요.", "bizSub": "방콕·파타야에서 Kring 파트너 매장이 되어 주세요.", "bc1": "7개 언어의 여행자", "bc2": "현지 액티비티 파트너 장소", "bc3": "앱 속 딜과 바우처", "bc4": "가입비 없음", "bStep1": "매장 정보", "bStep2": "연락처", "bName": "상호명", "bType": "업종", "bArea": "지역", "aBkk": "방콕", "aPty": "파타야", "bDistrict": "구역 (선택)", "bDistrictPh": "예: 방락, 좀티엔", "bPerson": "담당자 이름", "bNext": "다음", "bContact": "LINE ID 또는 전화번호", "bEmail": "이메일 (선택)", "bOffer": "여행자에게 무엇을 제공하나요? (선택)", "bOfferPh": "예: 예약마다 음료 한 잔 무료", "bTime": "통화하기 좋은 시간", "tAny": "언제든지", "tMorning": "오전", "tAfternoon": "오후", "tEvening": "저녁", "bConsent": "파트너십 관련 연락에 동의합니다.", "bBack": "이전", "bSend": "보내기", "bThanks": "감사합니다! 파트너 팀이 연락드릴게요.", "bThanks2": "11월 오픈 전에 LINE이나 전화로 연락드릴게요.", "bAgain": "다른 매장 추가", "ty1": "카페·레스토랑", "ty2": "요리 학교", "ty3": "무에타이 체육관", "ty4": "투어·보트", "ty5": "시장·상점", "ty6": "교통·유심", "ty7": "기타", "eName": "상호명을 입력해 주세요.", "eType": "업종을 선택해 주세요.", "ePerson": "담당자 이름을 입력해 주세요.", "eContact": "LINE ID 또는 전화번호를 입력해 주세요.", "eEmail": "이메일을 확인해 주세요.", "eConsent": "동의에 체크해 주세요.", "stepOf": "{n}/2단계", "ch6": "Kring 안에는", "inT": "Kring 안에 더 있어요.", "inSub": "딜, 쿠폰, 그리고 간편한 결제. 호스트는 성장할수록 더 벌어요.", "inTabT": "여행자", "inTabH": "호스트", "d1T": "딜과 패키지", "d1S": "허가받은 투어, 섬 여행, 도시 패키지를 한 번에 예약해요.", "d2T": "쿠폰", "d2S": "eSIM, 공항 차량, 짐 보관, 타이 티. 카운터에서 코드만 보여주세요.", "d3T": "몇 초 만에 결제", "d3S": "평소 쓰던 방식 그대로 결제해요. 허가받은 결제 파트너가 만날 때까지 보관해요.", "d4T": "얼마나 아끼는지 한눈에", "d4S": "모든 가격 옆에 주변의 보통 가격을 함께 보여줘요.", "ex1": "방콕 첫 48시간", "ex2": "태국 eSIM 8일", "ex4": "길거리 음식 산책", "inFine": "예시 가격이에요. 최종 가격은 오픈 때 앱에서 확인하세요. 결제 수단은 허가받은 결제 파트너에 따라 달라요.", "h1T": "액티비티별 가격", "h1S": "1–2명 한 가격, 직접 정해요.", "h2T": "만나면 받아요", "h2S": "휴대폰이 닿으면 PromptPay로 들어와요.", "h3T": "팁과 태국 선물", "h3S": "여행자는 액티비티 후 팁과 선물을 보낼 수 있어요. 팁은 바로 호스트에게 가요.", "h4T": "레벨업하면 더 벌어요", "h4S": "레벨이 높을수록 액티비티당 더 많이 받아요.", "pays": "카카오페이 Kakao Pay|카드|Apple Pay"},
 hi:{"skip": "मुख्य सामग्री पर जाएँ", "langL": "भाषा", "snd": "आवाज़ और वाइब्रेशन", "ch1": "टकराएँ", "ch2": "होस्ट या यात्री", "ch3": "ट्रिप कार्ड", "ch4": "जल्दी एक्सेस", "next": "अगला", "prev": "पिछला", "kicker": "असली थाईलैंड, एक लोकल के साथ।", "hold": "दबाए रखें, {k}", "holdBtn": "दबाएँ", "hintKey": "या Space दबाए रखें", "hintTouch": "या दोनों रिंग पास खींचें", "r1": "लोकल एक्टिविटी चुनें", "r2": "मिलने तक पैसा सुरक्षित", "r3": "फ़ोन टकराएँ, {k}", "cta": "जल्दी एक्सेस पाएँ", "when": "बैंकॉक · पटाया · नवंबर", "swTrav": "मैं यात्री हूँ", "hBadge": "फ़ाउंडिंग होस्ट · हर इलाके में पहले 100", "hSub": "यात्रियों के साथ फ़ूड वॉक, बाज़ार, मुआय थाई जैसी छोटी एक्टिविटी होस्ट करें · ID जाँच · हमेशा सार्वजनिक जगहों पर", "cNew": "नई एक्टिविटी", "cPpl": "1–2 लोग", "cPer": "प्रति एक्टिविटी", "cName": "एक्टिविटी का नाम", "cCat": "कैटेगरी", "cPrice": "प्रति एक्टिविटी दाम", "medal": "फ़ाउंडिंग होस्ट • पहले 100 • ", "tId": "ID जाँच", "tPub": "सार्वजनिक जगहें", "tPP": "PromptPay", "hCta": "पहले होस्ट में शामिल हों", "tTitle": "एक पल चुनें।", "tSub": "प्रति एक्टिविटी एक दाम · 1–2 लोग · सार्वजनिक जगहों पर असली एक्टिविटी", "held": "मिलने तक पैसा सुरक्षित रखा जाता है", "heldFine": "लाइसेंसशुदा पेमेंट पार्टनर इसे सुरक्षित रखता है।", "acts": "एक्टिविटी", "trTitle": "अपना ट्रिप कार्ड बनाएँ", "trSub": "3 चुनें। शेयर करें।", "dl": "डाउनलोड", "share": "शेयर", "reset": "फिर से चुनें", "saved": "सेव हो गया", "cTitle": "मेरी थाईलैंड ट्रिप", "day": "दिन {n}", "with": "{n} के साथ", "pick": "एक पोस्टकार्ड चुनें", "cardHeld": "मिलने तक पैसा सुरक्षित", "cardAlt": "आपका ट्रिप कार्ड", "jWhen": "नवंबर में शुरू · बैंकॉक · पटाया", "jTrav": "जल्दी एक्सेस पाएँ", "jHost": "पहले होस्ट में शामिल हों", "visit": "मैं यात्री हूँ", "local": "मैं थाई लोकल हूँ", "badgeT": "फ़ाउंडिंग होस्ट", "badgeS": "हर इलाके में पहले 100", "field": "ईमेल, LINE ID या फ़ोन", "join": "जुड़ें", "err": "ईमेल, LINE ID या फ़ोन नंबर लिखें।", "consent": "इसका इस्तेमाल सिर्फ़ लॉन्च की सूचना देने के लिए होगा।", "preview": "प्रीव्यू: अभी कुछ नहीं भेजा जाता।", "sending": "भेज रहे हैं…", "fail": "भेजा नहीं जा सका। फिर कोशिश करें।", "tyTrav": "धन्यवाद!", "tyTrav2": "नवंबर में मिलते हैं।", "tyHost": "स्वागत है, फ़ाउंडिंग होस्ट।", "tyHost2": "हर इलाके में पहले 100। आप जल्दी आए हैं।", "shareT": "दोस्तों को बताएँ", "copy": "लिंक कॉपी करें", "copied": "लिंक कॉपी हो गया", "shareText": "लोकल के साथ असली थाईलैंड। Kring नवंबर में बैंकॉक और पटाया में शुरू हो रहा है।", "edit": "बदलें", "openApp": "ऐप खोलें", "privacy": "प्राइवेसी", "safety": "सुरक्षा", "del": "अकाउंट डिलीट करें", "line": "LINE · जल्द आ रहा है", "police": "टूरिस्ट पुलिस 1155", "soonS": "जल्द आ रहा है", "soon": "जल्द आ रहा है · नवंबर", "bizNav": "बिज़नेस के लिए", "ch5": "बिज़नेस के लिए", "swHost": "मैं थाई लोकल हूँ", "hT1": "जो पसंद है, बाँटिए।", "hT2": "मिलने पर कमाइए।", "tripSoon": "ऐप में बुक करें · जल्द आ रहा है", "bizTitle": "यात्रियों को अपने दरवाज़े तक लाइए।", "bizSub": "बैंकॉक या पटाया में Kring पार्टनर वेन्यू बनिए।", "bc1": "7 भाषाओं के यात्री", "bc2": "लोकल एक्टिविटी के लिए पार्टनर वेन्यू", "bc3": "ऐप में डील और वाउचर", "bc4": "कोई सेटअप शुल्क नहीं", "bStep1": "आपका बिज़नेस", "bStep2": "संपर्क कैसे करें", "bName": "बिज़नेस का नाम", "bType": "बिज़नेस का प्रकार", "bArea": "इलाका", "aBkk": "बैंकॉक", "aPty": "पटाया", "bDistrict": "डिस्ट्रिक्ट (वैकल्पिक)", "bDistrictPh": "जैसे बांग राक, जोमटियन", "bPerson": "संपर्क व्यक्ति", "bNext": "आगे", "bContact": "LINE ID या फ़ोन", "bEmail": "ईमेल (वैकल्पिक)", "bOffer": "आप यात्रियों को क्या देंगे? (वैकल्पिक)", "bOfferPh": "जैसे हर बुकिंग पर एक ड्रिंक फ़्री", "bTime": "कॉल का सही समय", "tAny": "कभी भी", "tMorning": "सुबह", "tAfternoon": "दोपहर", "tEvening": "शाम", "bConsent": "मैं सहमत हूँ कि Kring पार्टनरशिप के लिए मुझसे संपर्क करे।", "bBack": "पीछे", "bSend": "भेजें", "bThanks": "धन्यवाद! हमारी पार्टनर टीम आपसे संपर्क करेगी।", "bThanks2": "नवंबर लॉन्च से पहले हम LINE या फ़ोन पर संपर्क करेंगे।", "bAgain": "एक और बिज़नेस जोड़ें", "ty1": "कैफ़े और रेस्टोरेंट", "ty2": "कुकिंग स्कूल", "ty3": "मुआय थाई जिम", "ty4": "टूर और बोट", "ty5": "बाज़ार और दुकान", "ty6": "ट्रांसपोर्ट और eSIM", "ty7": "अन्य", "eName": "बिज़नेस का नाम लिखें।", "eType": "प्रकार चुनें।", "ePerson": "संपर्क व्यक्ति का नाम लिखें।", "eContact": "LINE ID या फ़ोन लिखें।", "eEmail": "ईमेल जाँचें।", "eConsent": "सहमति पर टिक करें।", "stepOf": "चरण {n} / 2", "ch6": "Kring के अंदर", "inT": "Kring में और भी बहुत कुछ।", "inSub": "डील, कूपन और पेमेंट का एक आसान तरीका। होस्ट जितना बढ़ें, उतना ज़्यादा कमाएँ।", "inTabT": "यात्रियों के लिए", "inTabH": "होस्ट के लिए", "d1T": "डील और पैकेज", "d1S": "लाइसेंस वाले टूर, आइलैंड डे और सिटी पैक, एक ही बुकिंग में।", "d2T": "कूपन", "d2S": "eSIM, एयरपोर्ट कार, बैग ड्रॉप, थाई टी। काउंटर पर कोड दिखाएँ।", "d3T": "सेकंडों में पेमेंट", "d3S": "वैसे ही पे करें जैसे घर पर करते हैं। लाइसेंस वाला पेमेंट पार्टनर मिलने तक पैसा रखता है।", "d4T": "देखिए कितना बचा", "d4S": "हर कीमत के साथ आसपास की आम कीमत भी दिखती है।", "ex1": "बैंकॉक के पहले 48 घंटे", "ex2": "थाईलैंड eSIM, 8 दिन", "ex4": "स्ट्रीट फ़ूड वॉक", "inFine": "उदाहरण कीमतें। लॉन्च पर ऐप में अंतिम कीमतें देखें। पेमेंट के विकल्प लाइसेंस वाले पेमेंट पार्टनर पर निर्भर हैं।", "h1T": "हर एक्टिविटी की अपनी कीमत", "h1S": "1–2 लोगों के लिए एक कीमत, आप तय करें।", "h2T": "मिलने पर भुगतान", "h2S": "फ़ोन टकराते ही पैसा आपके PromptPay में।", "h3T": "टिप और थाई तोहफ़े", "h3S": "यात्री एक्टिविटी के बाद टिप और तोहफ़े भेज सकते हैं। टिप सीधे आपको।", "h4T": "लेवल बढ़ाएँ, ज़्यादा कमाएँ", "h4S": "लेवल जितना ऊँचा, हर एक्टिविटी पर उतनी ज़्यादा कमाई।", "pays": "UPI|कार्ड|Apple Pay"},
 ru:{"skip": "Перейти к содержанию", "langL": "Язык", "snd": "Звук и вибрация", "ch1": "Касание", "ch2": "Хост или гость", "ch3": "Карточка", "ch4": "Ранний доступ", "next": "Вперёд", "prev": "Назад", "kicker": "Настоящий Таиланд с местным жителем.", "hold": "Удерживайте — {k}", "holdBtn": "Держать", "hintKey": "или удерживайте пробел", "hintTouch": "или сведите кольца пальцем", "r1": "Выберите занятие с местным", "r2": "Деньги хранятся до встречи", "r3": "Телефоны коснулись — {k}", "cta": "Получить ранний доступ", "when": "Бангкок · Паттайя · ноябрь", "swTrav": "Я турист", "hBadge": "Хост-основатель · первые 100 в районе", "hSub": "Проводите для туристов короткие занятия: еда, рынки, муай-тай · проверка ID · всегда в общественных местах", "cNew": "Новое занятие", "cPpl": "1–2 человека", "cPer": "за занятие", "cName": "Название занятия", "cCat": "Категория", "cPrice": "Цена за занятие", "medal": "ХОСТ-ОСНОВАТЕЛЬ • ПЕРВЫЕ 100 • ", "tId": "Проверка ID", "tPub": "Общественные места", "tPP": "PromptPay", "hCta": "Стать одним из первых хостов", "tTitle": "Выберите момент.", "tSub": "Одна цена за занятие · 1–2 человека · настоящие занятия в общественных местах", "held": "Деньги хранятся до встречи", "heldFine": "Их надёжно хранит лицензированный платёжный партнёр.", "acts": "Занятия", "trTitle": "Соберите карточку поездки", "trSub": "Выберите 3. Поделитесь.", "dl": "Скачать", "share": "Поделиться", "reset": "Заново", "saved": "Сохранено", "cTitle": "Моя поездка в Таиланд", "day": "День {n}", "with": "с {n}", "pick": "Выберите открытку", "cardHeld": "Деньги хранятся до встречи", "cardAlt": "Ваша карточка поездки", "jWhen": "Открытие в ноябре · Бангкок · Паттайя", "jTrav": "Получить ранний доступ", "jHost": "Станьте одним из первых хостов", "visit": "Я путешествую", "local": "Я из Таиланда", "badgeT": "Хост-основатель", "badgeS": "Первые 100 в районе", "field": "Email, LINE ID или телефон", "join": "Записаться", "err": "Введите email, LINE ID или телефон.", "consent": "Используем только, чтобы сообщить об открытии.", "preview": "Предпросмотр: пока ничего не отправляется.", "sending": "Отправляем…", "fail": "Не удалось отправить. Попробуйте ещё раз.", "tyTrav": "Спасибо!", "tyTrav2": "До встречи в ноябре.", "tyHost": "Добро пожаловать, хост-основатель.", "tyHost2": "Первые 100 в районе. Вы среди первых.", "shareT": "Расскажите друзьям", "copy": "Скопировать ссылку", "copied": "Ссылка скопирована", "shareText": "Настоящий Таиланд с местным. Kring открывается в ноябре в Бангкоке и Паттайе.", "edit": "Изменить", "openApp": "Открыть приложение", "privacy": "Конфиденциальность", "safety": "Безопасность", "del": "Удалить аккаунт", "line": "LINE · скоро", "police": "Туристическая полиция 1155", "soonS": "Скоро", "soon": "Скоро · ноябрь", "bizNav": "Для бизнеса", "ch5": "Для бизнеса", "swHost": "Я из Таиланда", "hT1": "Делитесь любимым.", "hT2": "Оплата при встрече.", "tripSoon": "Бронь в приложении · скоро", "bizTitle": "Приведём туристов к вашей двери.", "bizSub": "Станьте партнёром Kring в Бангкоке или Паттайе.", "bc1": "Туристы на 7 языках", "bc2": "Площадка для местных занятий", "bc3": "Скидки и ваучеры в приложении", "bc4": "Без платы за подключение", "bStep1": "Ваш бизнес", "bStep2": "Как с вами связаться", "bName": "Название", "bType": "Тип бизнеса", "bArea": "Город", "aBkk": "Бангкок", "aPty": "Паттайя", "bDistrict": "Район (необязательно)", "bDistrictPh": "напр. Банг Рак, Джомтьен", "bPerson": "Контактное лицо", "bNext": "Далее", "bContact": "LINE ID или телефон", "bEmail": "Email (необязательно)", "bOffer": "Что вы предложите туристам? (необязательно)", "bOfferPh": "напр. напиток в подарок к каждой брони", "bTime": "Когда удобно позвонить", "tAny": "В любое время", "tMorning": "Утром", "tAfternoon": "Днём", "tEvening": "Вечером", "bConsent": "Я согласен(на), чтобы Kring связался со мной о партнёрстве.", "bBack": "Назад", "bSend": "Отправить", "bThanks": "Спасибо! Команда партнёров свяжется с вами.", "bThanks2": "Мы напишем в LINE или позвоним до запуска в ноябре.", "bAgain": "Добавить ещё бизнес", "ty1": "Кафе и ресторан", "ty2": "Кулинарная школа", "ty3": "Зал муай-тай", "ty4": "Туры и лодки", "ty5": "Рынок и магазин", "ty6": "Транспорт и eSIM", "ty7": "Другое", "eName": "Введите название.", "eType": "Выберите тип.", "ePerson": "Введите имя.", "eContact": "Введите LINE ID или телефон.", "eEmail": "Проверьте email.", "eConsent": "Отметьте согласие.", "stepOf": "Шаг {n} из 2", "ch6": "Внутри Kring", "inT": "В Kring есть ещё.", "inSub": "Скидки, купоны и простая оплата. Хосты зарабатывают больше по мере роста.", "inTabT": "Туристам", "inTabH": "Хостам", "d1T": "Скидки и пакеты", "d1S": "Лицензированные туры, дни на острове и городские пакеты в одном бронировании.", "d2T": "Купоны", "d2S": "eSIM, трансфер из аэропорта, камера хранения, тайский чай. Покажите код на кассе.", "d3T": "Оплата за секунды", "d3S": "Платите привычным способом. Лицензированный платёжный партнёр хранит деньги до встречи.", "d4T": "Видно, сколько экономите", "d4S": "Рядом с каждой ценой — обычная цена поблизости.", "ex1": "Первые 48 часов в Бангкоке", "ex2": "eSIM Таиланд, 8 дней", "ex4": "Прогулка по уличной еде", "inFine": "Цены — примеры. Окончательные цены — в приложении при запуске. Способы оплаты зависят от лицензированного платёжного партнёра.", "h1T": "Своя цена за занятие", "h1S": "Одна цена за 1–2 человек. Решаете вы.", "h2T": "Оплата при встрече", "h2S": "Телефоны коснулись — деньги идут на ваш PromptPay.", "h3T": "Чаевые и тайские подарки", "h3S": "Туристы могут оставить чаевые после занятия и отправить подарок. Чаевые — сразу вам.", "h4T": "Выше уровень — больше заработок", "h4S": "Чем выше уровень, тем больше за каждое занятие.", "pays": "PromptPay QR|Карта|Apple Pay"},
 ms:{"skip": "Langkau ke kandungan", "langL": "Bahasa", "snd": "Bunyi dan getaran", "ch1": "Sentuh", "ch2": "Hos atau pelancong", "ch3": "Kad trip", "ch4": "Akses awal", "next": "Seterusnya", "prev": "Sebelum", "kicker": "Thailand sebenar, bersama orang tempatan.", "hold": "Tekan lama, {k}", "holdBtn": "Tekan", "hintKey": "atau tekan lama Space", "hintTouch": "atau seret dua cincin bersama", "r1": "Pilih aktiviti tempatan", "r2": "Wang disimpan sehingga berjumpa", "r3": "Sentuh telefon, {k}", "cta": "Dapatkan akses awal", "when": "Bangkok · Pattaya · November", "swTrav": "Saya melancong", "hBadge": "Hos pengasas · 100 pertama setiap kawasan", "hSub": "Anjurkan aktiviti ringkas untuk pelancong: jalan makan, pasar, Muay Thai · ID disemak · sentiasa di tempat awam", "cNew": "Aktiviti baharu", "cPpl": "1–2 orang", "cPer": "setiap aktiviti", "cName": "Nama aktiviti", "cCat": "Kategori", "cPrice": "Harga setiap aktiviti", "medal": "HOS PENGASAS • 100 PERTAMA • ", "tId": "Semakan ID", "tPub": "Tempat awam", "tPP": "PromptPay", "hCta": "Jadi antara hos pertama", "tTitle": "Pilih satu detik.", "tSub": "Satu harga setiap aktiviti · 1–2 orang · aktiviti sebenar di tempat awam", "held": "Wang disimpan sehingga berjumpa", "heldFine": "Disimpan dengan selamat oleh rakan pembayaran berlesen.", "acts": "Aktiviti", "trTitle": "Buat kad trip anda", "trSub": "Pilih 3. Kongsikan.", "dl": "Muat turun", "share": "Kongsi", "reset": "Mula semula", "saved": "Disimpan", "cTitle": "Trip Thailand saya", "day": "Hari {n}", "with": "bersama {n}", "pick": "Pilih poskad", "cardHeld": "Disimpan selamat sehingga berjumpa", "cardAlt": "Kad trip anda", "jWhen": "Dibuka November · Bangkok · Pattaya", "jTrav": "Dapatkan akses awal", "jHost": "Jadi antara hos pertama", "visit": "Saya melancong", "local": "Saya orang Thai", "badgeT": "Hos pengasas", "badgeS": "100 pertama setiap kawasan", "field": "E-mel, LINE ID atau telefon", "join": "Sertai", "err": "Masukkan e-mel, LINE ID atau nombor telefon.", "consent": "Hanya digunakan untuk memberitahu anda bila kami dibuka.", "preview": "Pratonton: belum ada yang dihantar.", "sending": "Menghantar…", "fail": "Tidak dapat dihantar. Cuba lagi.", "tyTrav": "Terima kasih!", "tyTrav2": "Jumpa pada November.", "tyHost": "Selamat datang, hos pengasas.", "tyHost2": "100 pertama setiap kawasan. Anda awal!", "shareT": "Beritahu rakan", "copy": "Salin pautan", "copied": "Pautan disalin", "shareText": "Thailand sebenar, bersama orang tempatan. Kring dibuka November ini di Bangkok dan Pattaya.", "edit": "Tukar", "openApp": "Buka aplikasi", "privacy": "Privasi", "safety": "Keselamatan", "del": "Padam akaun", "line": "LINE · akan datang", "police": "Polis Pelancong 1155", "soonS": "Akan datang", "soon": "Akan datang · November", "bizNav": "Untuk perniagaan", "ch5": "Untuk perniagaan", "swHost": "Saya orang Thai", "hT1": "Kongsi apa yang anda suka.", "hT2": "Dibayar bila berjumpa.", "tripSoon": "Tempah dalam apl · Akan datang", "bizTitle": "Bawa pelancong ke pintu anda.", "bizSub": "Jadi tempat rakan Kring di Bangkok atau Pattaya.", "bc1": "Pelancong dalam 7 bahasa", "bc2": "Tempat rakan untuk aktiviti tempatan", "bc3": "Tawaran & baucar dalam apl", "bc4": "Tiada kos pendaftaran", "bStep1": "Perniagaan anda", "bStep2": "Cara hubungi anda", "bName": "Nama perniagaan", "bType": "Jenis perniagaan", "bArea": "Kawasan", "aBkk": "Bangkok", "aPty": "Pattaya", "bDistrict": "Daerah (pilihan)", "bDistrictPh": "cth. Bang Rak, Jomtien", "bPerson": "Orang untuk dihubungi", "bNext": "Seterusnya", "bContact": "LINE ID atau telefon", "bEmail": "E-mel (pilihan)", "bOffer": "Apa yang anda tawarkan kepada pelancong? (pilihan)", "bOfferPh": "cth. minuman percuma setiap tempahan", "bTime": "Masa terbaik untuk dihubungi", "tAny": "Bila-bila masa", "tMorning": "Pagi", "tAfternoon": "Petang", "tEvening": "Malam", "bConsent": "Saya setuju Kring menghubungi saya tentang perkongsian.", "bBack": "Kembali", "bSend": "Hantar", "bThanks": "Terima kasih! Pasukan rakan kami akan menghubungi anda.", "bThanks2": "Kami akan hubungi anda melalui LINE atau telefon sebelum pelancaran November.", "bAgain": "Tambah perniagaan lain", "ty1": "Kafe & restoran", "ty2": "Sekolah masakan", "ty3": "Gim Muay Thai", "ty4": "Lawatan & bot", "ty5": "Pasar & kedai", "ty6": "Pengangkutan & eSIM", "ty7": "Lain-lain", "eName": "Masukkan nama perniagaan.", "eType": "Pilih jenis.", "ePerson": "Masukkan nama.", "eContact": "Masukkan LINE ID atau telefon.", "eEmail": "Semak e-mel.", "eConsent": "Sila tandakan persetujuan.", "stepOf": "Langkah {n} daripada 2", "ch6": "Dalam Kring", "inT": "Banyak lagi dalam Kring.", "inSub": "Tawaran, kupon dan satu cara mudah untuk bayar. Hos dapat lebih bila mereka berkembang.", "inTabT": "Untuk pelancong", "inTabH": "Untuk hos", "d1T": "Tawaran & pakej", "d1S": "Lawatan berlesen, hari di pulau dan pakej bandar dalam satu tempahan.", "d2T": "Kupon", "d2S": "eSIM, kereta lapangan terbang, simpan beg, teh Thai. Tunjuk kod di kaunter.", "d3T": "Bayar dalam beberapa saat", "d3S": "Bayar cara anda bayar di rumah. Rakan pembayaran berlesen menyimpannya sehingga berjumpa.", "d4T": "Nampak berapa anda jimat", "d4S": "Setiap harga ditunjukkan bersama harga biasa di kawasan itu.", "ex1": "48 jam pertama di Bangkok", "ex2": "eSIM Thailand, 8 hari", "ex4": "Jalan makan jalanan", "inFine": "Harga contoh. Harga akhir dalam apl semasa pelancaran. Pilihan pembayaran bergantung pada rakan pembayaran berlesen kami.", "h1T": "Harga anda, setiap aktiviti", "h1S": "Satu harga untuk 1–2 orang. Anda yang tetapkan.", "h2T": "Dibayar bila berjumpa", "h2S": "Telefon bersentuh, wang masuk ke PromptPay anda.", "h3T": "Tip dan hadiah Thai", "h3S": "Pelancong boleh beri tip selepas aktiviti dan hantar hadiah. Tip terus kepada anda.", "h4T": "Naik tahap, dapat lebih", "h4S": "Lebih tinggi tahap, lebih banyak bagi setiap aktiviti.", "pays": "DuitNow QR|Kad|Apple Pay"}
};
const HTML_LANG = {en:'en',th:'th',zh:'zh-Hans',ko:'ko',hi:'hi',ru:'ru',ms:'ms'};
const SHORT = {en:'EN',th:'ไทย',zh:'中文',ko:'한국어',hi:'हिन्दी',ru:'RU',ms:'MS'};
const KTH = '<span class="th" lang="th">กริ๊ง!</span>';

/* =====================================================================
   helpers
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const root = document.documentElement, body = document.body;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const smooth = k => k * k * (3 - 2 * k);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => n.toLocaleString('en-US');
const store = { get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} } };
let lang = 'en';
const t = k => (W[lang] && W[lang][k] != null) ? W[lang][k] : W.en[k];
const tx = o => (o && (o[lang] || o.en)) || '';
const MOBILE = () => innerWidth < 900 || matchMedia('(pointer:coarse)').matches;
function rnd(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let q = Math.imul(seed ^ seed >>> 15, 1 | seed); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; }
let toastT = 0;
function toast(m){ const el = $('#toast'); el.textContent = m; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2000); }

/* =====================================================================
   sound + haptics (off by default — the speaker button turns them on)
   ===================================================================== */
let soundOn = false, ac = null, BUS = null, WET = null;
/* master bus: gentle compressor + a generated hall reverb (no audio files) */
function initBus(){
  if (BUS || !ac) return;
  try {
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.connect(ac.destination);
    BUS = ac.createGain(); BUS.gain.value = .95; BUS.connect(comp);
    const len = Math.round(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const cv = ac.createConvolver(); cv.buffer = ir; WET = ac.createGain(); WET.gain.value = .32; WET.connect(cv).connect(comp);
  } catch (e) { BUS = null; WET = null; }
}
function ensureAudio(){
  if (!soundOn) return false;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    initBus();
    return !!ac;
  } catch (e) { ac = null; return false; }
}
['pointerdown', 'touchstart', 'keydown', 'click'].forEach(ev => addEventListener(ev, () => { if (soundOn) ensureAudio(); }, {capture: true, passive: true}));
function out(node, wet){ const dry = BUS || ac.destination; node.connect(dry); if (WET && wet) { const s = ac.createGain(); s.gain.value = wet; node.connect(s).connect(WET); } }
function tone(f, dur, vol, type, delay, wet){
  if (!ensureAudio()) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime + (delay || 0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, n);
    g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(vol, n + .004); g.gain.exponentialRampToValueAtTime(.0001, n + dur);
    o.connect(g); out(g, wet == null ? .5 : wet); o.start(n); o.stop(n + dur + .02);
  } catch (e) {}
}
function noise(dur, vol, f0, f1, q, delay, type){
  if (!ensureAudio()) return;
  try {
    const n = ac.currentTime + (delay || 0), len = Math.round(ac.sampleRate * dur), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = b; fl.type = type || 'bandpass'; fl.Q.value = q || 1.2;
    fl.frequency.setValueAtTime(f0, n); fl.frequency.exponentialRampToValueAtTime(f1, n + dur);
    g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(vol, n + dur * .35); g.gain.exponentialRampToValueAtTime(.0001, n + dur);
    s.connect(fl).connect(g); out(g, .25); s.start(n); s.stop(n + dur + .02);
  } catch (e) {}
}
/* the กริ๊ง!: a temple bell (inharmonic partials, long tail) + a bright bicycle-bell double strike + a soft low thump */
function bell(){
  tone(110, .35, .24, 'sine', 0, 0); tone(220, .25, .1, 'triangle', 0, 0);
  [[1, .14], [2.76, .08], [5.4, .045], [8.93, .025]].forEach(([r, v], i) => tone(392 * r, 3.2 - i * .6, v, 'sine', .01, .9));
  [[2637, .09], [3951, .06], [5274, .03]].forEach(([f, v]) => { tone(f, .5, v, 'sine', .02, .6); tone(f * 1.006, .45, v * .8, 'sine', .14, .6); });
}
/* pentatonic chimes: each step of the hold climbs the Thai-sounding scale (C D E G A) */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98, 1760, 2093, 2349.3, 2637];
function stepSnd(i){ const f = PENTA[Math.min(PENTA.length - 1, i)]; tone(f, .35, .065, 'sine', 0, .7); tone(f * 2, .18, .02, 'sine', 0, .7); }
function chime(){ tone(1046.5, .7, .06, 'sine', 0, .7); tone(1567.98, .8, .05, 'sine', .07, .7); }
function whoosh(){ noise(.45, .09, 300, 2400, .8); }
function flick(){ noise(.07, .12, 3500, 6000, 1.5, 0, 'highpass'); tone(1760, .08, .025, 'triangle', 0, .2); }
function success(){ [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => tone(f, .9, .055, 'sine', i * .09, .8)); }
/* hold tension: two detuned saws through a closing-then-opening low-pass, pitch follows the hold */
let hum = null;
function humStart(){
  if (!ensureAudio() || hum) return;
  try {
    const g = ac.createGain(), fl = ac.createBiquadFilter(), o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = o2.type = 'sawtooth'; o1.frequency.value = 98; o2.frequency.value = 98.7; fl.type = 'lowpass'; fl.frequency.value = 280; fl.Q.value = 6;
    g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(.06, ac.currentTime + .25);
    o1.connect(fl); o2.connect(fl); fl.connect(g); out(g, .3); o1.start(); o2.start();
    hum = {g, fl, o1, o2};
  } catch (e) { hum = null; }
}
function humSet(p){ if (!hum) return; const n = ac.currentTime; hum.o1.frequency.setTargetAtTime(98 * (1 + p * 1.5), n, .05); hum.o2.frequency.setTargetAtTime(98.7 * (1 + p * 1.52), n, .05); hum.fl.frequency.setTargetAtTime(280 + p * p * 2600, n, .05); hum.g.gain.setTargetAtTime(.04 + p * .05, n, .05); }
function humStop(fast){ if (!hum) return; const h = hum; hum = null; try { const n = ac.currentTime; h.g.gain.cancelScheduledValues(n); h.g.gain.setTargetAtTime(0, n, fast ? .02 : .12); setTimeout(() => { try { h.o1.stop(); h.o2.stop(); } catch (e) {} }, 700); } catch (e) {} }
function buzz(p){ if (!soundOn) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
$('#snd').addEventListener('click', e => {
  soundOn = !soundOn; e.currentTarget.setAttribute('aria-pressed', String(soundOn));
  if (soundOn) { ensureAudio(); chime(); buzz(10); }
  else humStop(true);
});

/* =====================================================================
   kinetic headlines (film grammar)
   ===================================================================== */
const SEGOK = typeof Intl !== 'undefined' && !!Intl.Segmenter;
function kinSplit(el, text, lng){
  const L = lng || lang;
  let words;
  if (SEGOK) {
    words = [];
    for (const s of new Intl.Segmenter(L, {granularity:'word'}).segment(text)) {
      if (/^\s+$/.test(s.segment)) { words.push(' '); continue; }
      if (!s.isWordLike && words.length && words[words.length - 1] !== ' ') words[words.length - 1] += s.segment; else words.push(s.segment);
    }
  } else words = text.split(/(\s+)/);
  let i = 0, html = '';
  for (const w of words) {
    if (/^\s+$/.test(w)) { html += ' '; continue; }
    // Devanagari conjuncts must stay whole: animate per word there
    const gs = (L === 'hi' || !SEGOK) ? [w] : Array.from(new Intl.Segmenter(L, {granularity:'grapheme'}).segment(w), x => x.segment);
    html += '<span class="w">' + gs.map(g => `<span class="g" style="--i:${i++}">${esc(g)}</span>`).join('') + '</span>';
  }
  el.innerHTML = `<span class="sr">${esc(text)}</span><span aria-hidden="true">${html}</span>`;
}
const kinIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting || e.boundingClientRect.bottom < 0) { e.target.classList.add('in'); kinIO.unobserve(e.target); } }), {threshold:.35}) : null;
function kinWatch(el){ if (RM || !kinIO) { el.classList.add('in'); return; } kinIO.observe(el); }
function kinReplay(el){ if (RM) return; el.classList.remove('in'); void el.offsetWidth; requestAnimationFrame(() => el.classList.add('in')); }

/* =====================================================================
   language
   ===================================================================== */
const langBtn = $('#langBtn'), langMenu = $('#langMenu');
function pickLang(){
  const q = new URLSearchParams(location.search).get('lang');
  if (q && W[q]) return q;
  const s = store.get('kring-lang'); if (s && W[s]) return s;
  const navs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
  for (const n of navs) { const c = String(n).toLowerCase().slice(0, 2); if (W[c]) return c; }
  return 'en';
}
function setLang(l, save){
  lang = W[l] ? l : 'en';
  root.lang = HTML_LANG[lang];
  if (save) store.set('kring-lang', lang);
  $$('[data-i]').forEach(el => {
    const v = t(el.dataset.i);
    if (el.hasAttribute('data-kin')) { kinSplit(el, v); return; }
    if (el.hasAttribute('data-k')) el.innerHTML = esc(v).replace('{k}', KTH); else el.textContent = v;
  });
  $('#who').placeholder = t('field');
  $$('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
  const pays = $('#pays'); if (pays) pays.innerHTML = t('pays').split('|').map(x => `<span>${esc(x)}</span>`).join('');
  if (typeof renderBiz === 'function' && btypesEl) renderBiz();
  $('#snd').setAttribute('aria-label', t('snd'));
  langBtn.setAttribute('aria-label', t('langL'));
  $('#langCur').textContent = SHORT[lang];
  $$('#langMenu button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.lang === lang)));
  $('#prev').setAttribute('aria-label', t('prev')); $('#next').setAttribute('aria-label', t('next'));
  $$('.cue').forEach(c => c.setAttribute('aria-label', t('next')));
  $('#xdeck').setAttribute('aria-label', t('acts'));
  $('#cats').setAttribute('aria-label', t('cCat'));
  $('#medalText').textContent = t('medal').repeat(2);
  $('#phoneImg').src = `assets/final/app/${lang}-detail.webp`;
  syncRole();
  renderStudio(); renderDeck(); renderTiles(); drawTrip();
  if (done) renderThanks();
  applyLaunch();
}
function openMenu(focusIdx){
  langMenu.hidden = false; langBtn.setAttribute('aria-expanded', 'true');
  const items = $$('#langMenu button'); const i = focusIdx != null ? focusIdx : Math.max(0, items.findIndex(b => b.dataset.lang === lang));
  items[i].focus();
}
function closeMenu(refocus){ langMenu.hidden = true; langBtn.setAttribute('aria-expanded', 'false'); if (refocus) langBtn.focus(); }
langBtn.addEventListener('click', () => langMenu.hidden ? openMenu() : closeMenu());
langBtn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(); } });
langMenu.addEventListener('keydown', e => {
  const items = $$('#langMenu button'), i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
  else if (e.key === 'Tab') closeMenu(false);
});
$$('#langMenu button').forEach(b => b.addEventListener('click', () => {
  setLang(b.dataset.lang, true); closeMenu(true);
  try { const u = new URL(location.href); u.searchParams.set('lang', lang); history.replaceState(null, '', u); } catch (e) {}
}));
document.addEventListener('pointerdown', e => { if (!langMenu.hidden && !e.target.closest('.langs')) closeMenu(false); });

/* =====================================================================
   CINEMATIC BACKGROUND — one fixed canvas, four code-drawn scenes,
   cross-dissolved by scroll with light leaks.
   0 aurora (hero) · 1 dawn/night (host/traveller) · 2 lantern sky · 3 deep night
   ===================================================================== */
const cv = $('#scene'), cx = cv.getContext('2d');
let VW = 0, VH = 0, SD = 1, HY = 0;
const MRG = 40;
let buf = null, bx = null;
const au = document.createElement('canvas'), ax = au.getContext('2d');
const au2 = document.createElement('canvas'), ax2 = au2.getContext('2d');
const scn = {dawn:{}, night:{}};
let px = 0, tpx = 0;
const FINE = matchMedia('(pointer:fine)').matches;
addEventListener('pointermove', e => { if (FINE && e.pointerType === 'mouse') tpx = (e.clientX / innerWidth - .5) * 2; }, {passive:true});

function mkLayer(){ const c = document.createElement('canvas'); c.width = Math.ceil((VW + 2 * MRG) * SD); c.height = Math.ceil(VH * SD); const g = c.getContext('2d'); g.scale(SD, SD); g.translate(MRG, 0); return [c, g]; }
function radial(g, x, y, r, stops){ const gr = g.createRadialGradient(x, y, 0, x, y, r); stops.forEach(s => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
function lin(g, y0, y1, stops){ const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; }
function prang(g, x, b, w, h){
  g.beginPath(); g.moveTo(x - w / 2, b);
  g.bezierCurveTo(x - w * .47, b - h * .38, x - w * .24, b - h * .64, x - w * .05, b - h * .86);
  g.lineTo(x - w * .012, b - h * .9); g.lineTo(x, b - h); g.lineTo(x + w * .012, b - h * .9); g.lineTo(x + w * .05, b - h * .86);
  g.bezierCurveTo(x + w * .24, b - h * .64, x + w * .47, b - h * .38, x + w / 2, b); g.closePath(); g.fill();
  for (let i = 1; i < 9; i++) { const k = i / 9, yy = b - h * .84 * k, hw = (w / 2) * Math.pow(1 - k, .78); g.fillRect(x - hw - 2.5, yy - 1.5, hw * 2 + 5, 2.6); }
  g.fillRect(x - w * .8, b - h * .05, w * 1.6, h * .05);
}
function hall(g, x, b, w, h){
  g.fillRect(x - w * .36, b - h * .42, w * .72, h * .42);
  for (let i = 0; i < 3; i++) { const ww = w * (1 - i * .2), yy = b - h * .4 - i * h * .13, hh = h * .36;
    g.beginPath(); g.moveTo(x - ww / 2 - 6, yy + 2); g.lineTo(x - ww / 2, yy - 3); g.lineTo(x, yy - hh); g.lineTo(x + ww / 2, yy - 3); g.lineTo(x + ww / 2 + 6, yy + 2); g.closePath(); g.fill(); }
}
function palm(g, x, b, h, lean){
  g.lineCap = 'round'; g.lineWidth = Math.max(2, h * .035);
  g.beginPath(); g.moveTo(x, b); g.quadraticCurveTo(x + lean * .2, b - h * .55, x + lean, b - h); g.stroke();
  const tx0 = x + lean, ty = b - h; g.lineWidth = Math.max(1.5, h * .022);
  for (let i = 0; i < 8; i++) { const a = -Math.PI + i * Math.PI / 7, len = h * .36; g.beginPath(); g.moveTo(tx0, ty); g.quadraticCurveTo(tx0 + Math.cos(a) * len * .6, ty + Math.sin(a) * len * .6 - len * .2, tx0 + Math.cos(a) * len, ty + Math.sin(a) * len * .35 + len * .3); g.stroke(); }
}
function buildDawn(){
  const S = scn.dawn, R = rnd(7), s = Math.min(1.25, Math.max(.7, VH / 900));
  const [bg, g] = mkLayer();
  g.fillStyle = lin(g, 0, HY, [[0, '#0A1240'], [.36, '#22358A'], [.6, '#5F72B6'], [.8, '#D6A66D'], [1, '#FFC877']]); g.fillRect(-MRG, 0, VW + 2 * MRG, HY + 1);
  const sx = VW * .66, sy = HY - VH * .015; S.sx = sx;
  radial(g, sx, sy, Math.max(VW, VH) * .7, [[0, 'rgba(255,214,140,.55)'], [.22, 'rgba(255,178,30,.2)'], [1, 'rgba(255,178,30,0)']]);
  for (let i = 0; i < 9; i++) { const y = HY * (.3 + R() * .55), ww = VW * (.2 + R() * .45), x = R() * VW, hh = 6 + R() * 12; g.save(); g.translate(x, y); g.scale(ww / 2 / hh, 1); radial(g, 0, 0, hh, [[0, `rgba(255,${205 + R() * 30 | 0},160,${.1 + R() * .12})`], [1, 'rgba(255,210,160,0)']]); g.restore(); }
  const sr = Math.min(VW, VH) * .055; radial(g, sx, sy, sr * 2.2, [[0, 'rgba(255,244,210,1)'], [.45, 'rgba(255,226,150,.9)'], [.5, 'rgba(255,208,103,.35)'], [1, 'rgba(255,178,30,0)']]);
  g.fillStyle = lin(g, HY, VH, [[0, '#C8925A'], [.08, '#6A5E78'], [.4, '#262D63'], [1, '#0A0E2A']]); g.fillRect(-MRG, HY, VW + 2 * MRG, VH - HY);
  g.save(); g.translate(sx, HY); g.scale(.12, 1); radial(g, 0, 0, (VH - HY) * 1.1, [[0, 'rgba(255,226,160,.6)'], [.5, 'rgba(255,178,30,.18)'], [1, 'rgba(255,178,30,0)']]); g.restore();
  S.bg = bg;
  const [far, f] = mkLayer(); f.fillStyle = '#353D78';
  for (let x = -MRG; x < VW + MRG; x += 6) { const hh = 6 + Math.sin(x * .03) * 4 + Math.sin(x * .011) * 6 + R() * 3; f.fillRect(x, HY - hh, 7, hh + 1); }
  const pc = VW < 700 ? VW * .22 : VW * .18;
  prang(f, pc, HY, 90 * s, 230 * s); prang(f, pc - 70 * s, HY, 36 * s, 92 * s); prang(f, pc + 70 * s, HY, 36 * s, 92 * s);
  if (VW > 700) { prang(f, pc - 150 * s, HY, 26 * s, 64 * s); prang(f, pc + 150 * s, HY, 26 * s, 64 * s); }
  S.far = far;
  const [near, n] = mkLayer(); n.fillStyle = n.strokeStyle = '#141838';
  n.fillRect(-MRG, HY - 4, VW + 2 * MRG, 8);
  const hx = VW < 700 ? VW * .86 : VW * .82; hall(n, hx, HY, 150 * s, 150 * s);
  if (VW > 700) hall(n, VW * .52, HY, 90 * s, 90 * s);
  palm(n, VW * .04, HY, 150 * s, 24 * s); palm(n, VW * .1, HY, 110 * s, -10 * s); palm(n, hx - 105 * s, HY, 130 * s, -18 * s); palm(n, VW * .98, HY, 120 * s, -14 * s);
  if (VW > 700) palm(n, VW * .4, HY, 100 * s, 12 * s);
  S.near = near;
  const N = VW < 700 ? 26 : 50; S.petals = [];
  for (let i = 0; i < N; i++) S.petals.push({x: R() * VW, y: R() * VH, z: .35 + R() * .65, r: R() * 6, vr: (R() - .5) * 2.4, ph: R() * 6.3, c: ['#FFB21E', '#FF9F1C', '#FFC53D', '#FFA41B'][i % 4]});
}
function buildNight(){
  const S = scn.night, R = rnd(11), s = Math.min(1.25, Math.max(.7, VH / 900));
  const [bg, g] = mkLayer();
  g.fillStyle = lin(g, 0, HY, [[0, '#04050C'], [.45, '#090D2A'], [.8, '#18206A'], [1, '#2A3192']]); g.fillRect(-MRG, 0, VW + 2 * MRG, HY + 1);
  radial(g, VW * .5, HY, Math.max(VW, VH) * .8, [[0, 'rgba(52,70,255,.32)'], [.5, 'rgba(52,70,255,.08)'], [1, 'rgba(52,70,255,0)']]);
  radial(g, VW * .3, HY, VW * .5, [[0, 'rgba(255,178,30,.14)'], [1, 'rgba(255,178,30,0)']]);
  for (let i = 0; i < 240; i++) { g.fillStyle = `rgba(255,255,255,${.1 + R() * .45})`; g.fillRect(R() * (VW + 2 * MRG) - MRG, R() * HY * .85, R() < .1 ? 1.6 : 1, R() < .1 ? 1.6 : 1); }
  g.fillStyle = lin(g, HY, VH, [[0, '#141A55'], [.15, '#0A0E2E'], [1, '#03040A']]); g.fillRect(-MRG, HY, VW + 2 * MRG, VH - HY);
  S.bg = bg;
  S.stars = []; for (let i = 0; i < 60; i++) S.stars.push({x: R() * VW, y: R() * HY * .7, ph: R() * 6.3, r: .8 + R() * 1.4});
  const refl = [];
  const [far, f] = mkLayer();
  for (let x = -MRG; x < VW + MRG;) { const bw = 14 + R() * 40, bh = VH * (.03 + R() * .1); f.fillStyle = '#121747'; f.fillRect(x, HY - bh, bw - 2, bh + 2); f.fillStyle = 'rgba(255,208,103,.35)'; for (let yy = HY - bh + 5; yy < HY - 3; yy += 6) for (let xx = x + 3; xx < x + bw - 5; xx += 5) if (R() < .12) f.fillRect(xx, yy, 1.6, 2); x += bw; }
  const bxx = VW < 700 ? VW * .78 : VW * .76, deckY = HY - 12 * s, ph = 150 * s, span = VW < 700 ? VW * .55 : VW * .34;
  f.fillStyle = '#1A2060'; f.fillRect(bxx - span, deckY, span * 1.45, 4);
  f.beginPath(); f.moveTo(bxx - 9 * s, deckY + 2); f.lineTo(bxx - 2.5, deckY - ph); f.lineTo(bxx + 2.5, deckY - ph); f.lineTo(bxx + 9 * s, deckY + 2); f.closePath(); f.fill();
  f.strokeStyle = 'rgba(255,208,103,.42)'; f.lineWidth = .8;
  for (let i = 1; i <= 13; i++) { f.beginPath(); f.moveTo(bxx, deckY - ph + i * 6 * s); f.lineTo(bxx - span * i / 13, deckY); f.stroke(); }
  for (let i = 1; i <= 6; i++) { f.beginPath(); f.moveTo(bxx, deckY - ph + i * 8 * s); f.lineTo(bxx + span * .45 * i / 6, deckY); f.stroke(); }
  f.fillStyle = '#FFD067'; for (let x = bxx - span; x < bxx + span * .45; x += 16) { f.fillRect(x, deckY - 1, 2, 2); if (R() < .5) refl.push({x, c: '255,208,103', a: .55}); }
  S.far = far;
  const [near, n] = mkLayer();
  const tower = (x, bw, bh, cut) => {
    n.fillStyle = '#070919'; n.fillRect(x, HY - bh, bw, bh + 4);
    if (cut) { n.save(); n.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 18; k++) { const yy = HY - bh + 10 + k * (bh / 20), xx = x + (Math.sin(k * .9) * .5 + .5) * (bw - 8); n.fillRect(xx, yy, 7, 6); } n.restore(); }
    for (let yy = HY - bh + 6; yy < HY - 4; yy += 7) for (let xx = x + 3; xx < x + bw - 4; xx += 6) { if (R() < .16) { const blue = R() < .2; n.fillStyle = blue ? 'rgba(115,129,255,.8)' : `rgba(255,${200 + R() * 30 | 0},103,${.45 + R() * .5})`; n.fillRect(xx, yy, 2.2, 3); if (yy > HY - 50 && R() < .25) refl.push({x: xx, c: blue ? '115,129,255' : '255,208,103', a: .5}); } }
  };
  const mob = VW < 700;
  for (let x = -MRG; x < VW + MRG;) { const bw = 22 + R() * 46, bh = VH * (.04 + R() * (mob ? .1 : .13)); tower(x, bw, bh, false); x += bw + R() * 6; }
  const mx = VW * (mob ? .2 : .34); tower(mx, 30 * s, VH * (mob ? .3 : .36), true);
  const bx2 = VW * (mob ? .58 : .62), bw2 = 34 * s, bh2 = VH * (mob ? .24 : .28); tower(bx2, bw2, bh2, false); n.fillStyle = '#070919'; n.fillRect(bx2 + bw2 / 2 - 1.5, HY - bh2 - 50 * s, 3, 50 * s);
  if (!mob) tower(VW * .1, 40 * s, VH * .2, false);
  S.tops = [[mx + 15 * s, HY - VH * (mob ? .3 : .36) - 3], [bx2 + bw2 / 2, HY - bh2 - 50 * s - 2]];
  n.fillStyle = '#04050F'; n.fillRect(-MRG, HY - 2, VW + 2 * MRG, 6);
  n.fillStyle = 'rgba(255,208,103,.9)'; for (let x = -MRG; x < VW + MRG; x += 11) if (R() < .6) { n.fillRect(x, HY - 1, 1.6, 1.6); if (R() < .35) refl.push({x, c: '255,208,103', a: .4}); }
  S.near = near; S.refl = refl.slice(0, mob ? 46 : 100);
  S.lanterns = []; const L = mob ? 8 : 14;
  for (let i = 0; i < L; i++) S.lanterns.push({x: R() * VW, y: R() * VH, s: 4 + R() * 6, v: 8 + R() * 14, ph: R() * 6.3});
}
function blit(g, S){
  g.drawImage(S.bg, -MRG + px * 3, 0, VW + 2 * MRG, VH);
  g.drawImage(S.far, -MRG + px * 8, 0, VW + 2 * MRG, VH);
  g.drawImage(S.near, -MRG + px * 16, 0, VW + 2 * MRG, VH);
}
function drawDawn(g, tt, dt){
  const S = scn.dawn; blit(g, S);
  for (let k = 0; k < 22; k++) {
    const y = HY + 3 + (VH - HY) * Math.pow(k / 22, 1.5), ww = 8 + k * 3.2 + Math.sin(tt * 2.2 + k * 1.7) * 6, x = S.sx + px * 3 + Math.sin(tt * 1.4 + k * 1.3) * (3 + k * 1.6) - ww / 2;
    g.fillStyle = `rgba(255,226,160,${Math.max(0, (.6 - k * .022) * (.55 + .45 * Math.sin(tt * 3 + k)))})`; g.fillRect(x, y, ww, 1.4 + k * .06);
  }
  const by = HY + (VH - HY) * .42, bxx = ((tt * 16) % (VW + 260)) - 130 + px * 16;
  g.fillStyle = '#121633'; g.beginPath(); g.moveTo(bxx - 34, by - 4); g.quadraticCurveTo(bxx - 10, by + 5, bxx + 30, by - 2); g.lineTo(bxx + 40, by - 9); g.lineTo(bxx + 30, by - 4); g.lineTo(bxx - 34, by - 6); g.fill();
  g.fillRect(bxx - 6, by - 16, 5, 11); g.beginPath(); g.arc(bxx - 3.5, by - 19, 3.4, 0, 7); g.fill();
  for (const p of S.petals) {
    if (dt) { p.y += (16 + 34 * p.z) * dt; p.x += (Math.sin(tt * .9 + p.ph) * 22 * p.z + 10) * dt; p.r += p.vr * dt; if (p.y > VH + 20) { p.y = -20; p.x = Math.random() * VW; } if (p.x > VW + 20) p.x = -20; }
    g.save(); g.translate(p.x + px * 20 * p.z, p.y); g.rotate(p.r); g.scale(1, .35 + .65 * Math.abs(Math.cos(tt * 1.6 + p.ph)));
    const L = 4 + 8 * p.z, Wd = 2.2 + 3.6 * p.z;
    g.globalAlpha = .4 + .6 * p.z; g.fillStyle = p.c; g.beginPath(); g.moveTo(-L, 0);
    g.quadraticCurveTo(-L * .2, -Wd * 1.25, L * .75, -Wd * .55); g.quadraticCurveTo(L * 1.1, 0, L * .75, Wd * .55); g.quadraticCurveTo(-L * .2, Wd * 1.25, -L, 0); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
}
function drawNight(g, tt, dt){
  const S = scn.night; blit(g, S);
  for (const s of S.stars) { g.fillStyle = `rgba(255,255,255,${.25 + .75 * (.5 + .5 * Math.sin(tt * 1.7 + s.ph))})`; g.fillRect(s.x + px * 3, s.y, s.r, s.r); }
  for (const [x, y] of S.tops) { const a = .5 + .5 * Math.sin(tt * 3); radial(g, x + px * 16, y, 10, [[0, `rgba(255,208,103,${a})`], [1, 'rgba(255,208,103,0)']]); }
  for (let i = 0; i < S.refl.length; i++) {
    const r = S.refl[i];
    for (let k = 0; k < 8; k++) {
      const y = HY + 5 + k * k * 1.15 + k * 4, ww = 2 + k * .9 + Math.sin(tt * 2.4 + i + k) * 1.4, x = r.x + px * 12 + Math.sin(tt * 1.9 + k * .9 + i) * (1 + k * .8);
      g.fillStyle = `rgba(${r.c},${Math.max(0, r.a * (1 - k / 8) * (.6 + .4 * Math.sin(tt * 3.1 + k + i * 2)))})`; g.fillRect(x - ww / 2, y, ww, 1.3);
    }
  }
  const cxx = VW - ((tt * 11) % (VW + 300)) + 150 + px * 18, cy = HY + (VH - HY) * .38;
  g.fillStyle = '#05060F'; g.fillRect(cxx - 46, cy - 8, 92, 9); g.fillRect(cxx - 30, cy - 15, 60, 7);
  g.fillStyle = 'rgba(255,208,103,.9)'; for (let i = 0; i < 10; i++) g.fillRect(cxx - 40 + i * 9, cy - 6, 3, 2); for (let i = 0; i < 6; i++) g.fillRect(cxx - 26 + i * 9, cy - 13, 3, 2);
  for (const l of S.lanterns) {
    if (dt) { l.y -= l.v * dt; l.x += Math.sin(tt * .6 + l.ph) * 6 * dt; if (l.y < -30) { l.y = VH + 30; l.x = Math.random() * VW; } }
    const x = l.x + px * 24 * (l.s / 10), fl = .8 + .2 * Math.sin(tt * 7 + l.ph);
    radial(g, x, l.y, l.s * 5, [[0, `rgba(255,178,30,${.38 * fl})`], [1, 'rgba(255,178,30,0)']]);
    const gr = g.createLinearGradient(0, l.y - l.s, 0, l.y + l.s * 1.2); gr.addColorStop(0, '#FFB21E'); gr.addColorStop(1, '#FFE7A8');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - l.s * .7, l.y - l.s); g.lineTo(x + l.s * .7, l.y - l.s); g.lineTo(x + l.s * .55, l.y + l.s * 1.1); g.lineTo(x - l.s * .55, l.y + l.s * 1.1); g.closePath(); g.fill();
  }
}
/* the circular reveal between dawn (host) and night (traveller) */
let side = 'trav', rev = null;
function drawSide(g, tt, dt, now){
  const base = which => which === 'host' ? drawDawn(g, tt, dt) : drawNight(g, tt, dt);
  if (rev) {
    const k = RM ? 1 : clamp((now - rev.t0) / 1250), e = ease(k), R = Math.hypot(VW, VH) + 80;
    base(rev.from);
    g.save(); g.beginPath(); g.arc(rev.x, rev.y, Math.max(.1, e * R), 0, 7); g.clip(); base(rev.to); g.restore();
    if (k < 1) { g.globalAlpha = (1 - k) * .9; g.strokeStyle = rev.to === 'trav' ? '#7381FF' : '#FFD067'; g.lineWidth = 3 + 6 * (1 - k); g.beginPath(); g.arc(rev.x, rev.y, e * R, 0, 7); g.stroke(); g.globalAlpha = 1; }
    if (k >= 1) rev = null;
  } else base(side);
  // readability: soft darkening behind the content column
  g.fillStyle = 'rgba(5,6,13,.18)'; g.fillRect(0, 0, VW, VH);
  radial(g, VW / 2, VH * .48, Math.max(VW, VH) * .62, [[0, 'rgba(5,6,13,.4)'], [1, 'rgba(5,6,13,0)']]);
}
/* aurora + low gold haze (hero) — drawn small and scaled up, so it stays soft */
let heroEnergy = .3;
function drawAurora(g, tt){
  const w = au.width, h = au.height;
  ax.globalCompositeOperation = 'source-over'; ax.fillStyle = '#05060D'; ax.fillRect(0, 0, w, h);
  ax.globalCompositeOperation = 'lighter';
  const blob = (x, y, r, col, a) => { const gg = ax.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, `rgba(${col},${a})`); gg.addColorStop(1, `rgba(${col},0)`); ax.fillStyle = gg; ax.fillRect(0, 0, w, h); };
  const en = heroEnergy;
  blob(w * (.3 + .12 * Math.sin(tt * .13)), h * (.28 + .06 * Math.cos(tt * .17)), w * .55, '52,70,255', .42 + en * .25);
  blob(w * (.72 + .1 * Math.cos(tt * .11)), h * (.22 + .08 * Math.sin(tt * .19)), w * .45, '115,129,255', .26 + en * .2);
  blob(w * .5, h * .98, w * .6, '255,178,30', .06 + en * .16);
  for (let k = 0; k < 3; k++) {
    const base = h * (.16 + k * .09), amp = h * (.05 + .02 * k), len = h * (.22 - k * .04), col = k === 1 ? '115,129,255' : '52,70,255';
    for (let x = 0; x <= w; x += 2) {
      const yy = base + Math.sin(x / w * 6.28 * (1.1 + k * .35) + tt * (.35 + k * .12)) * amp + Math.sin(x / w * 17 + tt * .9 + k) * amp * .25;
      const a = Math.max(0, (.16 + .12 * Math.sin(x / w * 9 + tt * .6 + k * 2)) * (1 + en * .8));
      const gg = ax.createLinearGradient(0, yy, 0, yy + len);
      gg.addColorStop(0, `rgba(${col},0)`); gg.addColorStop(.25, `rgba(${col},${a})`); gg.addColorStop(1, `rgba(${col},0)`);
      ax.fillStyle = gg; ax.fillRect(x, yy, 2, len);
    }
  }
  // soften at low resolution (cheap), then scale up
  ax2.globalCompositeOperation = 'copy'; ax2.filter = 'blur(2.5px)'; ax2.drawImage(au, 0, 0); ax2.filter = 'none';
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(au2, -VW * .06, -VH * .06, VW * 1.12, VH * 1.12);
  g.fillStyle = lin(g, VH * .7, VH, [[0, 'rgba(5,6,13,0)'], [1, 'rgba(5,6,13,.85)']]); g.fillRect(0, VH * .7, VW, VH * .3);
}
/* lantern sky (trip card) */
let lan = [], stars = [];
function seedSky(){
  const r = rnd(7); stars = []; const ns = Math.round(Math.min(380, VW * VH / 5200));
  for (let i = 0; i < ns; i++) stars.push({x: r() * VW, y: r() * VH * .9, s: r() * 1.3 + .3, p: r() * 6.28, v: .5 + r() * 1.5});
  lan = []; const nl = clamp(Math.round(VW * VH / 60000), 8, 22);
  for (let i = 0; i < nl; i++) { const z = .25 + r() * .75; lan.push({x: r() * VW, y: r() * (VH + 200), z, s: 5 + z * z * 20, v: 6 + z * 16, p: r() * 6.28}); }
}
function lantern(c, x, y, s, a, fl){
  const g = c.createRadialGradient(x, y + s * .3, 0, x, y + s * .3, s * 3.6);
  g.addColorStop(0, `rgba(255,180,60,${.34 * a})`); g.addColorStop(.35, `rgba(255,160,40,${.12 * a})`); g.addColorStop(1, 'rgba(255,150,30,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y + s * .3, s * 3.6, 0, 6.2832); c.fill();
  const w1 = s * .56, w2 = s * .44, h = s * 1.5, top = y - h / 2, bot = y + h / 2;
  c.beginPath(); c.moveTo(x - w2, bot); c.lineTo(x - w1, top + w1 * .55); c.quadraticCurveTo(x - w1, top, x, top); c.quadraticCurveTo(x + w1, top, x + w1, top + w1 * .55); c.lineTo(x + w2, bot); c.quadraticCurveTo(x, bot + s * .14, x - w2, bot); c.closePath();
  const lg = c.createLinearGradient(x, top, x, bot);
  lg.addColorStop(0, `rgba(214,108,22,${a})`); lg.addColorStop(.45, `rgba(255,168,48,${a})`); lg.addColorStop(1, `rgba(255,226,150,${a})`);
  c.fillStyle = lg; c.fill();
  const fg = c.createRadialGradient(x, bot - s * .1, 0, x, bot - s * .1, s * .75);
  fg.addColorStop(0, `rgba(255,253,235,${.95 * a * fl})`); fg.addColorStop(1, 'rgba(255,240,200,0)');
  c.fillStyle = fg; c.fill();
}
function drawLanterns(g, tt, dt){
  g.fillStyle = lin(g, 0, VH, [[0, '#05060D'], [.55, '#070920'], [1, '#0E1240']]); g.fillRect(0, 0, VW, VH);
  radial(g, VW * .5, VH * 1.1, Math.max(VW, VH) * .8, [[0, 'rgba(52,70,255,.3)'], [1, 'rgba(52,70,255,0)']]);
  const sy = scrollY;
  g.fillStyle = '#DDE2FF';
  for (const s of stars) { g.globalAlpha = .25 + .55 * (.5 + .5 * Math.sin(tt * s.v + s.p)); let y = (s.y - sy * .03) % VH; if (y < 0) y += VH; g.fillRect(s.x, y, s.s, s.s); }
  g.globalAlpha = 1;
  for (const l of lan) {
    if (dt) l.y -= l.v * dt;
    let y = l.y - sy * l.z * .3; const span = VH + 260; y = ((y % span) + span) % span - 130;
    const x = l.x + Math.sin(tt * .35 + l.p) * 12 * l.z;
    g.save(); g.translate(x, y); g.rotate(Math.sin(tt * .6 + l.p) * .06);
    lantern(g, 0, 0, l.s, .35 + .65 * l.z, .75 + .25 * Math.sin(tt * 9 + l.p * 3)); g.restore();
  }
}
/* deep night (waitlist) — two soft halos, anchan and marigold */
function drawDeep(g, tt){
  g.fillStyle = lin(g, 0, VH, [[0, '#05060D'], [1, '#090B22']]); g.fillRect(0, 0, VW, VH);
  const m = Math.max(VW, VH);
  radial(g, VW * (.32 + .03 * Math.sin(tt * .2)), VH * .42, m * .5, [[0, 'rgba(52,70,255,.26)'], [1, 'rgba(52,70,255,0)']]);
  radial(g, VW * (.7 + .03 * Math.cos(tt * .17)), VH * .6, m * .42, [[0, 'rgba(255,178,30,.13)'], [1, 'rgba(255,178,30,0)']]);
  g.fillStyle = '#DDE2FF';
  for (let i = 0; i < stars.length; i += 2) { const s = stars[i]; g.globalAlpha = .15 + .35 * (.5 + .5 * Math.sin(tt * s.v + s.p)); g.fillRect(s.x, s.y, s.s, s.s); }
  g.globalAlpha = 1;
}
/* 04 · businesses: a warm street at dusk, out of focus — shop lights as drifting bokeh */
let bokeh = null;
function drawBokeh(g, tt){
  if (!bokeh || bokeh.w !== VW) { const R = rnd(77); bokeh = {w: VW, d: Array.from({length: MOBILE() ? 26 : 44}, () => ({x: R(), y: .25 + R() * .7, r: .02 + R() * .07, c: R() < .62 ? '255,190,80' : (R() < .5 ? '115,129,255' : '255,232,190'), v: .004 + R() * .012, p: R() * 6.28}))}; }
  g.fillStyle = lin(g, 0, VH, [[0, '#07081A'], [.55, '#120E24'], [1, '#1A1020']]); g.fillRect(0, 0, VW, VH);
  const m = Math.max(VW, VH);
  radial(g, VW * .5, VH * 1.05, m * .7, [[0, 'rgba(255,150,40,.22)'], [1, 'rgba(255,150,40,0)']]);
  g.globalCompositeOperation = 'lighter';
  for (const b of bokeh.d) {
    const x = ((b.x + tt * b.v) % 1.1 - .05) * VW, y = b.y * VH + Math.sin(tt * .4 + b.p) * 6, r = b.r * m * .5;
    const a = .1 + .1 * (.5 + .5 * Math.sin(tt * .7 + b.p));
    radial(g, x, y, r, [[0, `rgba(${b.c},${a * 1.6})`], [.62, `rgba(${b.c},${a})`], [.7, `rgba(${b.c},${a * .35})`], [1, `rgba(${b.c},0)`]]);
  }
  g.globalCompositeOperation = 'source-over';
  // string of market lights along a soft curve
  for (let i = 0; i < 26; i++) { const k = i / 25, x = k * VW, y = VH * (.14 + .06 * Math.sin(k * Math.PI)) ; const on = .5 + .5 * Math.sin(tt * 2 + i * 1.7);
    radial(g, x, y, 14, [[0, `rgba(255,214,120,${.5 + on * .4})`], [1, 'rgba(255,214,120,0)']]); }
}
const SCENES = [
  (g, tt, dt, now) => drawAurora(g, tt),
  (g, tt, dt, now) => drawSide(g, tt, dt, now),
  (g, tt, dt) => drawLanterns(g, tt, dt),
  (g, tt, dt) => drawLanterns(g, tt, dt),
  (g, tt) => drawBokeh(g, tt),
  (g, tt) => drawDeep(g, tt)
];
const LEAK = [['52,70,255', '255,178,30'], ['255,208,103', '115,129,255'], ['255,178,30', '52,70,255'], ['255,208,103', '52,70,255'], ['255,178,30', '115,129,255'], ['115,129,255', '255,208,103']];
const glowSpr = {};
function glow(rgb){
  if (glowSpr[rgb]) return glowSpr[rgb];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.2, `rgba(${rgb},.5)`); gr.addColorStop(.5, `rgba(${rgb},.14)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return glowSpr[rgb] = c;
}
const SECS = () => [$('#top'), $('#you'), $('#trip'), $('#inside'), $('#biz'), $('#join')];
let secs = [];
function sceneMix(){
  const c = innerHeight * .5, band = innerHeight * .32;
  const r = secs.map(s => s.getBoundingClientRect());
  let i = 0; for (let k = 0; k < r.length; k++) if (r[k].top <= c) i = k;
  if (i < r.length - 1) { const m = (c - (r[i].bottom - band)) / (2 * band); if (m > 0) return [i, i + 1, smooth(clamp(m))]; }
  if (i > 0) { const m = (c - (r[i].top - band)) / (2 * band); if (m < 1) return [i - 1, i, smooth(clamp(m))]; }
  return [i, i, 0];
}
let curScene = 0;
function drawScene(now, dt){
  const tt = RM ? 14 : now / 1000;
  px += (tpx - px) * .05;
  if (!FINE && !RM) px = Math.sin(tt * .18) * .5;
  const [a, b, mix] = sceneMix();
  curScene = mix > .5 ? b : a;
  cx.setTransform(SD, 0, 0, SD, 0, 0); cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  SCENES[a](cx, tt, dt, now);
  if (b !== a && mix > .001) {
    bx.setTransform(SD, 0, 0, SD, 0, 0); bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over';
    SCENES[b](bx, tt, dt, now);
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = mix; cx.drawImage(buf, 0, 0); cx.setTransform(SD, 0, 0, SD, 0, 0);
  }
  // light leaks (film): stronger while two scenes cross
  const flare = b !== a ? Math.sin(Math.PI * mix) : 0, L = LEAK[curScene];
  cx.globalCompositeOperation = 'lighter';
  const m = Math.max(VW, VH);
  cx.globalAlpha = .07 + flare * .42; cx.drawImage(glow(L[0]), VW * (-.08 + .06 * Math.sin(tt * .13)) - m * .5, VH * (.25 + .12 * Math.sin(tt * .09)) - m * .5, m, m);
  cx.globalAlpha = .05 + flare * .3; cx.drawImage(glow(L[1]), VW * (1.04 + .04 * Math.cos(tt * .11)) - m * .42, VH * (.8 + .08 * Math.cos(tt * .07)) - m * .42, m * .84, m * .84);
  if (flare > .02) { cx.globalAlpha = flare * .1; cx.fillStyle = '#FFE6B8'; cx.fillRect(0, 0, VW, VH); }
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
}
function sizeScene(force){
  const w = innerWidth, h = Math.max(innerHeight, cv.clientHeight || 0);
  if (!force && VW && Math.abs(w - VW) < 1 && Math.abs(h - VH) < 140) return false;
  VW = w; VH = h; SD = Math.min(devicePixelRatio || 1, MOBILE() ? 1.5 : 2);
  HY = Math.round(VH * (VW < 700 ? .8 : .86));
  cv.width = Math.ceil(VW * SD); cv.height = Math.ceil(VH * SD);
  if (!buf) { buf = document.createElement('canvas'); bx = buf.getContext('2d'); }
  buf.width = cv.width; buf.height = cv.height;
  au.width = au2.width = Math.max(40, Math.round(VW / 7)); au.height = au2.height = Math.max(40, Math.round(VH / 7));
  buildDawn(); buildNight(); seedSky();
  return true;
}

/* =====================================================================
   01 · HOLD TO กริ๊ง!  (rings, contact flash, sparks, slam, reveal)
   ===================================================================== */
const stage = $('#top'), wrapR = $('#ringwrap'), svg = $('#rings');
const E = id => document.getElementById(id);
const el = {cA:E('cA'), gwA:E('gwA'), gwB:E('gwB'), fillA:E('fillA'), fillB:E('fillB'), lens:E('lens'), lensFlash:E('lensFlash'), rA:E('rA'), rB:E('rB'), hlA:E('hlA'), hlB:E('hlB'), glow:E('glow')};
let G = {w:0, h:0, R:0, sw:0, dS:0, dM:0};
function measure(){
  const r = wrapR.getBoundingClientRect(), w = r.width, h = r.height;
  const R = Math.max(34, Math.min(w * .16, h * .34, 160)), sw = R * .2;
  G = {w, h, R, sw, dS: Math.max(R * .9, Math.min(w / 2 - R - sw - 8, R * 2.6)), dM: R * .62};
  svg.setAttribute('viewBox', `0 0 ${w.toFixed(1)} ${Math.max(1, h).toFixed(1)}`);
}
function attrs(n, o){ for (const k in o) n.setAttribute(k, typeof o[k] === 'number' ? o[k].toFixed(2) : o[k]); }
function drawRings(d, jx, jy, lensOp, flash, glowBoost){
  const {w, h, R, sw} = G, ccx = w / 2, ccy = h / 2;
  const axx = ccx - d + jx, bxx = ccx + d - jx, y = ccy + jy;
  attrs(el.cA, {cx: axx, cy: y, r: R});
  for (const [n, x] of [[el.gwA, axx], [el.gwB, bxx]]) attrs(n, {cx: x, cy: y, r: R, 'stroke-width': sw * 1.6});
  attrs(el.fillA, {cx: axx, cy: y, r: R}); attrs(el.fillB, {cx: bxx, cy: y, r: R});
  attrs(el.lens, {cx: bxx, cy: y, r: R, opacity: lensOp});
  attrs(el.lensFlash, {cx: bxx, cy: y, r: R, opacity: flash});
  attrs(el.rA, {cx: axx, cy: y, r: R, 'stroke-width': sw}); attrs(el.rB, {cx: bxx, cy: y, r: R, 'stroke-width': sw});
  const hr = R - sw * .18, C = 2 * Math.PI * hr;
  attrs(el.hlA, {cx: axx, cy: y, r: hr, 'stroke-width': Math.max(1.5, sw * .16), 'stroke-dasharray': `${C * .12} ${C}`, 'stroke-dashoffset': -C * .6});
  attrs(el.hlB, {cx: bxx, cy: y, r: hr, 'stroke-width': Math.max(1.5, sw * .16), 'stroke-dasharray': `${C * .12} ${C}`, 'stroke-dashoffset': -C * .6});
  el.glow.setAttribute('opacity', (.45 + glowBoost * .55).toFixed(2));
}
function contactPoint(){ const s = stage.getBoundingClientRect(), r = wrapR.getBoundingClientRect(); return {x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2}; }

const fx = $('#fx'), fctx = fx.getContext('2d');
let SW = 0, SH = 0, FD = 1, dust = [], sparks = [], waves = [];
function sizeFx(){
  const r = stage.getBoundingClientRect();
  SW = r.width; SH = r.height; FD = Math.min(devicePixelRatio || 1, MOBILE() ? 1.5 : 2);
  fx.width = Math.round(SW * FD); fx.height = Math.round(SH * FD);
  const n = Math.round(Math.min(140, SW * SH / 9000));
  dust = Array.from({length: n}, () => ({x: Math.random() * SW, y: Math.random() * SH, z: .3 + Math.random() * .9, r: .5 + Math.random() * 1.6, tw: Math.random() * 6, v: 4 + Math.random() * 10}));
}
/* the burst: gold sparks and marigold petals (no coins, nothing that reads as money) */
function burst(k){
  k = k || 1;
  const c = contactPoint(), small = SW < 600, n = Math.round((small ? 54 : 90) * k);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.95, sp = (small ? 400 : 580) * (.35 + Math.random() * .9);
    const kind = Math.random() < .55 ? 0 : 1; // 0 streak spark, 1 petal
    sparks.push({x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: (small ? 4 : 6) + Math.random() * (small ? 5 : 7), ph: Math.random() * 6.28, sp: 4 + Math.random() * 10, life: 0, max: 1.2 + Math.random() * .9, kind, col: ['#FFB21E', '#FFD067', '#FF9F1C', '#FFE7A6'][i % 4]});
  }
  if (k >= 1) waves.push({x: c.x, y: c.y, t: 0, c: '255,208,103'}, {x: c.x, y: c.y, t: -.08, c: '115,129,255'}, {x: c.x, y: c.y, t: -.2, c: '255,178,30'});
  else waves.push({x: c.x, y: c.y, t: 0, c: '115,129,255'});
}
function drawFx(dt, now, pull){
  dt *= (S.slow > 0 ? .18 : 1);   // slow-motion moment right after contact
  const c = fctx; c.setTransform(FD, 0, 0, FD, 0, 0); c.clearRect(0, 0, SW, SH);
  const cp = (pull > 0 || sparks.length) ? contactPoint() : null;
  for (const d of dust) {
    if (dt) { d.tw += dt * (1.2 + d.z); d.y -= d.v * d.z * dt; d.x += Math.sin(now / 2400 + d.tw) * 3 * dt; }
    if (cp && pull > 0) { const dx = cp.x - d.x, dy = cp.y - d.y, m = Math.hypot(dx, dy) + 30; d.x += dx / m * pull * 140 * d.z * dt; d.y += dy / m * pull * 140 * d.z * dt; }
    if (d.y < -10) { d.y = SH + 10; d.x = Math.random() * SW; }
    if (d.x < -10) d.x = SW + 10; if (d.x > SW + 10) d.x = -10;
    const a = (.35 + .45 * Math.sin(d.tw)) * d.z; if (a <= 0) continue;
    c.fillStyle = `rgba(255,${190 + Math.round(d.z * 40)},${90 + Math.round(d.z * 40)},${a.toFixed(3)})`;
    c.beginPath(); c.arc(d.x, d.y, d.r * d.z, 0, 6.283); c.fill();
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    const v = waves[i]; v.t += dt; if (v.t < 0) continue;
    const k = v.t / .9; if (k >= 1) { waves.splice(i, 1); continue; }
    const r = 20 + (1 - Math.pow(1 - k, 3)) * Math.max(SW, SH) * .55;
    c.strokeStyle = `rgba(${v.c},${(1 - k) * .55})`; c.lineWidth = 3 + (1 - k) * 10;
    c.beginPath(); c.arc(v.x, v.y, r, 0, 6.283); c.stroke();
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const o = sparks[i]; o.life += dt; if (o.life > o.max) { sparks.splice(i, 1); continue; }
    o.vy += 900 * dt; o.vx *= (1 - .6 * dt); o.x += o.vx * dt; o.y += o.vy * dt; o.ph += o.sp * dt;
    const fade = Math.min(1, (o.max - o.life) * 2.5);
    c.globalAlpha = fade;
    if (o.kind === 0) {
      const sp = Math.hypot(o.vx, o.vy) || 1, L = Math.min(26, sp * .03);
      c.strokeStyle = o.col; c.lineWidth = Math.max(1.5, o.r * .35); c.lineCap = 'round';
      c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x - o.vx / sp * L, o.y - o.vy / sp * L); c.stroke();
    } else {
      c.save(); c.translate(o.x, o.y); c.rotate(o.ph * .4); c.scale(1, .4 + .6 * Math.abs(Math.cos(o.ph)));
      c.fillStyle = o.col; c.beginPath(); c.moveTo(-o.r, 0); c.quadraticCurveTo(-o.r * .2, -o.r * .7, o.r * .8, -o.r * .3); c.quadraticCurveTo(o.r * 1.1, 0, o.r * .8, o.r * .3); c.quadraticCurveTo(-o.r * .2, o.r * .7, -o.r, 0); c.fill();
      c.restore();
    }
  }
  c.globalAlpha = 1;
}

const S = {slow: 0, p: 0, holding: false, holdP: 0, dragP: 0, met: false, metT: 0, step: 0, flash: 0, energy: 0, ptr: null, x0: 0, side: 0, kb: false};
const prg = $('#prg'), CIRC = 314.16, holdBtn = $('#holdBtn');
function startHold(e){
  if (S.met) return;
  S.holding = true; S.kb = !e; stage.classList.add('holding'); S.holdP = S.p;
  if (e && e.pointerId != null) {
    S.ptr = e.pointerId; S.x0 = e.clientX;
    const r = wrapR.getBoundingClientRect(), onRings = e.target.closest && e.target.closest('#ringwrap');
    S.side = onRings ? (e.clientX < r.left + r.width / 2 ? 1 : -1) : 0;
    const hb = e.target.closest && e.target.closest('.holdbtn'); if (hb) { try { hb.setPointerCapture(e.pointerId); } catch (err) {} }
  }
  ensureAudio();
  stepSnd(0); humStart(); buzz(8); kick();
}
function endHold(){ if (!S.holding) return; humStop(S.met); S.holding = false; S.ptr = null; S.dragP = 0; stage.classList.remove('holding'); }
stage.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  if (S.met) { if (e.target.closest('#ringwrap')) poke(); return; }
  if (e.target.closest('a,input,label,.reveal,.cue')) return;
  if (e.target.closest('.holdbtn')) e.preventDefault();
  startHold(e);
});
addEventListener('pointermove', e => {
  if (!S.holding || e.pointerId !== S.ptr || !S.side) return;
  const travel = Math.max(30, G.dS - G.dM);
  S.dragP = clamp((e.clientX - S.x0) * S.side / travel);
});
addEventListener('pointerup', e => { if (e.pointerId === S.ptr) endHold(); });
addEventListener('pointercancel', e => { if (e.pointerId === S.ptr) endHold(); });
addEventListener('blur', endHold);
stage.addEventListener('contextmenu', e => { if (!S.met) e.preventDefault(); });
function keyTargetOK(){
  const a = document.activeElement;
  if (a === holdBtn) return true;
  if (a && a !== body && a.closest && !a.closest('#top')) return false;
  if (a && /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(a.tagName)) return false;
  const r = stage.getBoundingClientRect(); return r.bottom > innerHeight * .5;
}
addEventListener('keydown', e => {
  if (S.met || (e.key !== ' ' && e.key !== 'Enter')) return;
  if (!keyTargetOK()) return;
  e.preventDefault(); if (e.repeat || S.holding) return;
  startHold(null);
});
addEventListener('keyup', e => { if ((e.key === ' ' || e.key === 'Enter') && S.holding) { e.preventDefault(); endHold(); } });
holdBtn.addEventListener('click', e => e.preventDefault());
function contact(){
  S.met = true; S.metT = 0; S.flash = 1; S.energy = 1; endHold();
  stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
  const slam = $('#slam'); slam.classList.remove('go'); void slam.offsetWidth; slam.classList.add('go');
  S.slow = .26; burst(); bell(); buzz([24, 40, 70]);
  setTimeout(() => { burst(.4); }, 380);
  const kb = S.kb;
  setTimeout(() => { body.classList.add('met'); if (kb) $('#heroCta').focus({preventScroll: true}); }, 650);
}
function poke(){ S.flash = .8; S.energy = .7; S.metT = 0; burst(.6); tone(2637, .5, .05, 'sine', 0, .6); tone(2637 * 1.006, .45, .04, 'sine', .12, .6); buzz(20); kick(); }
function heroStep(dt, now, rawDt){
  const hd = Math.min(.25, rawDt != null ? rawDt : dt);   // hold time follows the real clock, even on slow frames
  if (!S.met) {
    if (S.holding) { S.holdP = Math.min(1, S.holdP + hd / 1.15); S.p = Math.max(S.holdP, S.dragP); }
    else S.p = Math.max(0, S.p - dt * 2.2);
    const step = Math.floor(S.p * 12);
    if (step > S.step && S.holding) { stepSnd(step); buzz(4 + step); }
    if (S.holding) humSet(S.p);
    S.step = step;
    if (S.p >= 1) contact();
  } else { S.metT += dt * (S.slow > 0 ? .2 : 1); }
  S.slow = Math.max(0, (S.slow || 0) - dt);
  S.flash = Math.max(0, S.flash - dt * 1.6);
  S.energy = Math.max(S.met ? .25 : S.p * .6, S.energy - dt * .8);
  heroEnergy = S.energy;
  stage.style.setProperty('--p', S.p.toFixed(3));
  prg.setAttribute('stroke-dashoffset', (CIRC * (1 - S.p)).toFixed(1));
  let d, jx = 0, jy = 0;
  if (!S.met) {
    d = G.dS + (G.dM - G.dS) * Math.pow(S.p, 1.7);
    if (S.p > .86) d += G.R * .1 * Math.sin((S.p - .86) / .14 * Math.PI);   // anticipation: a tiny wind-up before they touch
    if (S.holding) { const j = Math.pow(S.p, 3) * 2.4; jx = (Math.random() - .5) * j; jy = (Math.random() - .5) * j; }
    else jy = Math.sin(now / 900) * 3;
  } else { const k = S.metT; d = G.dM - G.R * .3 * Math.exp(-k * 4.2) * Math.cos(k * 14); jy = Math.sin(now / 1100) * 2.5; }
  const lensOp = S.met ? Math.min(.62, .25 + S.metT * .6) + S.flash * .38 : Math.pow(S.p, 4) * .3;
  drawRings(d, jx, jy, Math.min(1, lensOp), S.flash, Math.max(S.p, S.flash));
}
function heroStatic(){ measure(); drawRings(G.dM, 0, 0, .62, 0, .4); }

/* =====================================================================
   02 · HOST OR VISIT
   ===================================================================== */
const sw = $('#sideSwitch');
let roleTouched = false;
function setSide(next, instant){
  const prev = side; side = next;
  body.dataset.side = next;
  $$('button[role=radio]', sw).forEach(b => { const on = b.dataset.side === next; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  if (!roleTouched) setRole(next === 'host' ? 'local' : 'visit');
  if (!inTouched && $('#inTabT')) inTab(next === 'host' ? 'host' : 'trav', false);
  if (!inTouched && $('#inTabT')) inTab(next === 'host' ? 'host' : 'trav', false);
  const panes = $$('.pane');
  if (instant || RM || prev === next) {
    panes.forEach(p => p.hidden = p.dataset.for !== next);
    rev = null; afterPane(); requestDraw(); return;
  }
  const b = $(`button[data-side="${next}"]`, sw).getBoundingClientRect();
  rev = {from: prev, to: next, t0: performance.now(), x: b.left + b.width / 2, y: b.top + b.height / 2};
  whoosh(); buzz(10); kick();
  const olds = panes.filter(p => p.dataset.for === prev), news = panes.filter(p => p.dataset.for === next);
  olds.forEach(p => p.classList.add('out'));
  setTimeout(() => {
    olds.forEach(p => { p.hidden = true; p.classList.remove('out'); });
    news.forEach(p => { p.hidden = false; p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); });
    afterPane(true);
  }, 380);
}
function afterPane(replay){
  if (side === 'trav') { depth(); centerDeck(); if (replay) kinReplay($('#travH')); }
  else { if (replay) $$('#hostH .kin').forEach(kinReplay); maybeGhost(); }
}
$$('button[role=radio]', sw).forEach(b => b.addEventListener('click', () => setSide(b.dataset.side)));
sw.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const n = side === 'host' ? 'trav' : 'host'; setSide(n); $(`button[data-side="${n}"]`, sw).focus(); }
});

/* host: live "create your activity" card */
const lph = $('#lph'), lTitle = $('#lTitle'), actName = $('#actName');
let cat = 0, price = 800, ghostT = 0, ghostSeen = false, artURL = '';
const actBy = k => ACTS.find(a => a.k === k);
function photoSrc(k){ const p = PHOTOS[k]; return p.art ? artURL : p.src; }
function buildLph(){
  lph.innerHTML = '';
  CATS.forEach((c, i) => { const img = new Image(); img.src = photoSrc(c.a); img.alt = ''; img.width = 560; img.height = 315; img.decoding = 'async'; if (i !== 0) img.loading = 'lazy'; if (i === cat) img.className = 'on'; lph.appendChild(img); });
}
function renderStudio(){
  const cats = $('#cats'); cats.innerHTML = '';
  CATS.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = tx(c.n); b.setAttribute('aria-pressed', String(i === cat)); b.addEventListener('click', () => pickCat(i)); cats.appendChild(b); });
  const pr = $('#prices'); pr.innerHTML = '';
  PRICES.forEach(p => { const b = document.createElement('button'); b.type = 'button'; b.textContent = '฿' + fmt(p); b.dataset.p = p; b.setAttribute('aria-pressed', String(p === price)); b.addEventListener('click', () => pickPrice(p)); pr.appendChild(b); });
  const a = CATS[cat].a;
  actName.placeholder = tx(PHOTOS[a].cap);
  $('#lPlace').textContent = tx(actBy(a).place);
  $$('img', lph).forEach((im, j) => im.alt = j === cat ? tx(PHOTOS[CATS[j].a].cap) : '');
  if (!actName.value) { clearTimeout(ghostT); lTitle.textContent = tx(PHOTOS[a].cap); lTitle.classList.add('ghost'); }
}
function flash(){ const c = $('#lcard'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
function pickCat(i){
  if (i === cat) return; cat = i;
  $$('img', lph).forEach((im, j) => { im.classList.toggle('on', j === i); if (j === i) im.loading = 'eager'; });
  renderStudio(); if (!actName.value) typeGhost(tx(PHOTOS[CATS[cat].a].cap));
  flash(); flick(); buzz(6);
  $$('#cats button')[i].focus();
}
let priceShown = 800, priceRaf = 0;
function pickPrice(p){
  price = p; $$('#prices button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.p === p)));
  const from = priceShown, t0 = performance.now(), out = $('#lPrice');
  cancelAnimationFrame(priceRaf);
  const step = now => { const k = RM ? 1 : Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - k, 3); priceShown = Math.round(from + (p - from) * e); out.textContent = fmt(priceShown); if (k < 1) priceRaf = requestAnimationFrame(step); };
  priceRaf = requestAnimationFrame(step); flash(); chime(); buzz(6);
}
function typeGhost(text){
  clearTimeout(ghostT); lTitle.classList.add('ghost');
  if (RM) { lTitle.textContent = text; return; }
  const chars = SEGOK ? Array.from(new Intl.Segmenter(lang, {granularity:'grapheme'}).segment(text), x => x.segment) : Array.from(text);
  let i = 0;
  const go = () => { lTitle.innerHTML = esc(chars.slice(0, i).join('')) + '<span class="caret"></span>'; if (i++ < chars.length) ghostT = setTimeout(go, 50 + Math.random() * 45); else ghostT = setTimeout(() => { lTitle.textContent = text; }, 1200); };
  go();
}
function maybeGhost(){ if (!ghostSeen && !actName.value && side === 'host') { const r = $('#lcard').getBoundingClientRect(); if (r.top < innerHeight * .8 && r.bottom > 0) { ghostSeen = true; typeGhost(tx(PHOTOS[CATS[cat].a].cap)); } } }
actName.addEventListener('input', () => {
  clearTimeout(ghostT);
  const v = actName.value;
  if (v.trim()) { lTitle.classList.remove('ghost'); lTitle.innerHTML = esc(v) + '<span class="caret"></span>'; }
  else { lTitle.textContent = tx(PHOTOS[CATS[cat].a].cap); lTitle.classList.add('ghost'); }
});
actName.addEventListener('blur', () => { if (actName.value.trim()) lTitle.textContent = actName.value; });
const lcard = $('#lcard');
if (!RM && FINE) {
  lcard.parentElement.addEventListener('pointermove', e => { const r = lcard.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; lcard.style.transform = `rotateY(${x * 9}deg) rotateX(${-y * 7}deg)`; });
  lcard.parentElement.addEventListener('pointerleave', () => { lcard.style.transform = ''; });
}

/* traveller: depth carousel */
const deck = $('#xdeck'), dots = $('#dots');
function renderDeck(){
  const keep = deck.scrollLeft;
  deck.innerHTML = ACTS.map((a, i) => {
    const p = PHOTOS[a.k];
    return `<article class="xcard" aria-label="${esc(tx(p.cap))}">
    <div class="xph"><img src="${photoSrc(a.k)}" width="560" height="315" alt="${esc(tx(p.cap))}" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async" draggable="false"><span class="pill dark xtag">${esc(tx(a.tag))}</span></div>
    <div class="xb"><h3>${esc(tx(p.cap))}</h3><p class="xarea">${esc(tx(a.place))}</p>
    <div class="xmeta"><span class="xprice"><s>฿${fmt(a.street)}</s><b>฿${fmt(a.price)}</b></span><span class="xppl"><svg aria-hidden="true"><use href="#i-ppl"/></svg>${esc(t('cPpl'))}</span></div></div></article>`;
  }).join('');
  dots.innerHTML = ACTS.map(() => '<i></i>').join('');
  deck.scrollLeft = keep; depth();
}
const cardStep = () => { const c = $$('.xcard', deck); return c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : 300; };
function depth(){
  if (deck.offsetParent === null) return;
  const r = deck.getBoundingClientRect(), mid = r.left + r.width / 2, st = Math.max(120, cardStep()); let best = 0, bd = 1e9;
  $$('.xcard', deck).forEach((c, i) => {
    const b = c.getBoundingClientRect(), d = (b.left + b.width / 2 - mid) / st, ad = Math.min(Math.abs(d), 2.5);
    if (Math.abs(d) < bd) { bd = Math.abs(d); best = i; }
    c.style.transform = RM ? '' : `perspective(1000px) translateZ(${-ad * 110}px) rotateY(${clamp(d, -2.5, 2.5) * -16}deg) scale(${1 - ad * .04})`;
    c.style.opacity = String(1 - Math.min(ad, 2) * .28);
    c.style.zIndex = String(10 - Math.round(ad * 3));
  });
  $$('i', dots).forEach((d, i) => d.classList.toggle('on', i === best));
}
let deckCentered = false;
function centerDeck(){ if (deckCentered || deck.offsetParent === null) return; deckCentered = true; deck.scrollLeft = cardStep() * 1; depth(); }
deck.addEventListener('scroll', () => requestAnimationFrame(depth), {passive: true});
$('#prev').addEventListener('click', () => deck.scrollBy({left: -cardStep(), behavior: RM ? 'auto' : 'smooth'}));
$('#next').addEventListener('click', () => deck.scrollBy({left: cardStep(), behavior: RM ? 'auto' : 'smooth'}));
deck.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); $('#next').click(); } if (e.key === 'ArrowLeft') { e.preventDefault(); $('#prev').click(); } });
let dragX = null, dragS = 0;
deck.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; dragX = e.clientX; dragS = deck.scrollLeft; deck.classList.add('drag'); try { deck.setPointerCapture(e.pointerId); } catch (err) {} });
deck.addEventListener('pointermove', e => { if (dragX === null) return; deck.scrollLeft = dragS - (e.clientX - dragX); });
const endDrag = () => { if (dragX === null) return; dragX = null; const st = cardStep(); deck.classList.remove('drag'); deck.scrollTo({left: Math.round(deck.scrollLeft / st) * st, behavior: RM ? 'auto' : 'smooth'}); };
deck.addEventListener('pointerup', endDrag); deck.addEventListener('pointercancel', endDrag);

/* =====================================================================
   03 · TRIP CARD (postcards → shareable 3:4 card)
   ===================================================================== */
const ICON = {
  lotus:'<path d="M50 80C38 72 36 56 50 40C64 56 62 72 50 80Z"/><path d="M50 80C33 80 23 67 25 54C38 56 46 66 50 80Z"/><path d="M50 80C67 80 77 67 75 54C62 56 54 66 50 80Z"/><path d="M28 88H72M36 94H64"/>',
  bowl:'<path d="M26 62H74C74 76 63 84 50 84C37 84 26 76 26 62Z"/><path d="M40 54C37 49 43 46 40 40M50 54C47 49 53 46 50 40M60 54C57 49 63 46 60 40"/><path d="M60 34L80 58M66 31L84 54"/><path d="M38 90H62"/>',
  prang:'<path d="M50 24L52 36H55L57 50H61L63 66H68L71 86H29L32 66H37L39 50H43L45 36H48Z"/><path d="M24 86H76M42 66H58M45 50H55"/>',
  glove:'<path d="M34 50C34 38 44 32 56 34C69 36 74 47 72 59C71 67 65 72 58 72H42C37 72 34 68 34 63Z"/><path d="M42 72V86H62V72"/><path d="M36 58C43 55 49 59 47 65"/><path d="M42 80H62"/>',
  wok:'<path d="M24 58H76C74 72 64 80 50 80C36 80 26 72 24 58Z"/><path d="M76 60L88 54"/><path d="M42 48C40 43 45 40 42 34M54 48C52 43 57 40 54 34"/><path d="M36 88H64"/>',
  skewer:'<path d="M28 84L76 36"/><rect x="38" y="58" width="12" height="10" rx="3" transform="rotate(-45 44 63)"/><rect x="50" y="46" width="12" height="10" rx="3" transform="rotate(-45 56 51)"/><rect x="62" y="34" width="12" height="10" rx="3" transform="rotate(-45 68 39)"/><path d="M30 92H70"/>',
  sun:'<path d="M28 70A22 22 0 0 1 72 70"/><path d="M20 70H80M28 78H72M36 86H64"/><path d="M50 34V40M30 42L34 46M70 42L66 46"/>',
  boat:'<path d="M22 68H78L72 78H30Z"/><path d="M72 68L84 56"/><path d="M40 68V58H58V68"/><path d="M22 88C28 84 34 92 40 88S52 84 58 88S70 92 78 88"/>'
};
const SC = {gold: ['#FFB21E', '#171A3A'], anchan: ['#3446FF', '#F8F1E3'], night: ['#121538', '#FFD067']};
let uid = 0;
function stampSVG(icon, col, standalone){
  const id = 'm' + (++uid), [bgc, fg] = SC[col]; let holes = '';
  for (let x = 0; x <= 100; x += 10) holes += `<circle cx="${x}" cy="0" r="3.6"/><circle cx="${x}" cy="120" r="3.6"/>`;
  for (let y = 10; y < 120; y += 10) holes += `<circle cx="0" cy="${y}" r="3.6"/><circle cx="100" cy="${y}" r="3.6"/>`;
  return `<svg ${standalone ? 'xmlns="http://www.w3.org/2000/svg" width="200" height="240" ' : ''}viewBox="0 0 100 120" aria-hidden="true"><defs><mask id="${id}"><rect width="100" height="120" fill="#fff"/><g fill="#000">${holes}</g></mask></defs><g mask="url(#${id})"><rect width="100" height="120" fill="#FBF6EA"/><rect x="8" y="8" width="84" height="104" fill="${bgc}"/><g fill="none" stroke="${fg}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${ICON[icon]}</g><text x="50" y="106" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7.4" letter-spacing="1.2" fill="${fg}">THAILAND</text></g></svg>`;
}
let picks = [];
function renderTiles(){
  $('#tiles').innerHTML = ACTS.map((a, i) => {
    const n = picks.indexOf(i);
    return `<button class="tile" type="button" data-k="${i}" aria-pressed="${n > -1}"><span class="t-ph"><img src="${photoSrc(a.k)}" alt="" width="560" height="315" loading="lazy" decoding="async"></span><span class="t-stamp">${stampSVG(a.icon, a.col)}</span><b>${esc(tx(PHOTOS[a.k].cap))}</b><span class="t-p">฿${fmt(a.price)} · ${esc(a.host[lang] || a.host.en)}</span><i class="badge-n" aria-hidden="true">${n > -1 ? n + 1 : ''}</i></button>`;
  }).join('');
}
const imgCache = {};
function loadImg(src){ if (!imgCache[src]) imgCache[src] = new Promise(res => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); return imgCache[src]; }
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function cRings(c, cxx, cy, r, lw){
  const d = r * 1.07, a = Math.acos(d / 2 / r);
  c.beginPath(); c.arc(cxx - d / 2, cy, r, -a, a); c.arc(cxx + d / 2, cy, r, Math.PI - a, Math.PI + a); c.fillStyle = '#9B5CFF'; c.fill();
  c.lineWidth = lw; c.strokeStyle = '#7381FF'; c.beginPath(); c.arc(cxx - d / 2, cy, r, 0, 6.2832); c.stroke();
  c.strokeStyle = '#FFB21E'; c.beginPath(); c.arc(cxx + d / 2, cy, r, 0, 6.2832); c.stroke();
}
function wrapText(c, text, maxW){
  const seg = SEGOK ? Array.from(new Intl.Segmenter(lang, {granularity:'word'}).segment(text), s => s.segment) : text.split(/(\s+)/);
  const lines = []; let cur = '';
  for (const w of seg) { const tst = cur + w; if (c.measureText(tst).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w.trimStart(); } else cur = tst; }
  if (cur.trim()) lines.push(cur.trim()); return lines;
}
const FAM = {
  d: '"Unbounded","Noto Sans Thai","PingFang SC","Noto Sans CJK SC","Apple SD Gothic Neo","Malgun Gothic","Noto Sans CJK KR","Noto Sans Devanagari","Nirmala UI","Segoe UI",Roboto,sans-serif',
  u: '"Plus Jakarta Sans","Noto Sans Thai","PingFang SC","Noto Sans CJK SC","Apple SD Gothic Neo","Malgun Gothic","Noto Sans CJK KR","Noto Sans Devanagari","Nirmala UI","Segoe UI",Roboto,sans-serif'
};
const F = (w, s, f) => `${w} ${s}px ${f === 'd' && /^(en|ms)$/.test(lang) ? FAM.d : FAM.u}`;
let drawSeq = 0, tripURL = null, tripBlob = null;
async function drawTrip(){
  const seq = ++drawSeq;
  try { if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load(F(800, 40, 'd'), 'Ab'), document.fonts.load(F(800, 40, 'u'), 'Abกข'), document.fonts.load(F(700, 30, 'u'), 'Ab')]); } catch (e) {}
  const sel = picks.map(i => ACTS[i]);
  const imgs = await Promise.all(sel.map(a => loadImg(photoSrc(a.k))));
  const stamps = await Promise.all(sel.map(a => loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stampSVG(a.icon, a.col, true)))));
  if (seq !== drawSeq) return;
  const cvs = document.createElement('canvas'); cvs.width = 1080; cvs.height = 1440; const c = cvs.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 1440); g.addColorStop(0, '#05060D'); g.addColorStop(.6, '#080B26'); g.addColorStop(1, '#141A52'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1440);
  const hz = c.createRadialGradient(540, 1500, 0, 540, 1500, 900); hz.addColorStop(0, 'rgba(52,70,255,.45)'); hz.addColorStop(1, 'rgba(52,70,255,0)'); c.fillStyle = hz; c.fillRect(0, 0, 1080, 1440);
  const r = rnd(11); c.fillStyle = '#DDE2FF'; for (let i = 0; i < 220; i++) { c.globalAlpha = .2 + r() * .6; const s = r() * 2 + .6; c.fillRect(r() * 1080, r() * 1440, s, s); } c.globalAlpha = 1;
  [[940, 250, 24, .9], [150, 1290, 18, .7], [990, 1180, 14, .55], [60, 420, 10, .5], [820, 120, 9, .45]].forEach(([x, y, s, a]) => lantern(c, x, y, s, a, 1));
  cRings(c, 118, 104, 30, 9);
  c.fillStyle = '#fff'; c.font = `800 34px ${FAM.u}`; c.textBaseline = 'middle'; c.fillText('กริ๊ง!', 178, 106);
  c.textAlign = 'right'; c.font = `800 22px ${FAM.u}`; c.fillStyle = '#FFD067'; c.fillText('BANGKOK · PATTAYA', 1000, 106); c.textAlign = 'left';
  c.textBaseline = 'alphabetic'; c.fillStyle = '#fff'; c.font = F(800, lang === 'en' ? 68 : 62, 'd');
  wrapText(c, t('cTitle'), 920).slice(0, 1).forEach(ln => c.fillText(ln, 80, 236));
  c.font = F(700, 30, 'u'); c.fillStyle = '#A9B1FF'; c.fillText(t('kicker'), 82, 290);
  const rots = [-2.2, 1.6, -1.2], xs = [70, 110, 80];
  for (let i = 0; i < 3; i++) {
    const x = xs[i], y = 340 + i * 318, w = 900, h = 290;
    c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(rots[i] * Math.PI / 180); c.translate(-w / 2, -h / 2);
    const a = sel[i];
    if (!a) {
      c.setLineDash([14, 12]); c.lineWidth = 3; c.strokeStyle = 'rgba(238,240,255,.28)'; rr(c, 0, 0, w, h, 18); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(238,240,255,.42)'; c.font = `800 80px ${FAM.d}`; c.textAlign = 'center'; c.fillText(String(i + 1), w / 2, h / 2 + 12); c.font = F(700, 26, 'u'); c.fillText(t('pick'), w / 2, h / 2 + 62); c.textAlign = 'left'; c.restore(); continue;
    }
    c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 50; c.shadowOffsetY = 24; c.fillStyle = '#F8F1E3'; rr(c, 0, 0, w, h, 12); c.fill(); c.shadowColor = 'transparent';
    const pw = Math.round((h - 28) * 16 / 10.5), ph = h - 28;
    c.save(); rr(c, 14, 14, pw, ph, 8); c.clip();
    if (imgs[i]) { const iw = imgs[i].naturalWidth, ih = imgs[i].naturalHeight, sc = Math.max(pw / iw, ph / ih), dw = iw * sc, dh = ih * sc; c.drawImage(imgs[i], 14 + (pw - dw) / 2, 14 + (ph - dh) / 2, dw, dh); }
    c.restore();
    const tx0 = 14 + pw + 30, tw = w - tx0 - 26;
    c.fillStyle = '#3446FF'; c.font = F(800, 20, 'u'); c.fillText(t('day').replace('{n}', i + 1).toUpperCase(), tx0, 60);
    c.fillStyle = '#171A3A'; c.font = F(800, /^(en|ms)$/.test(lang) ? 28 : 30, 'd');
    const lines = wrapText(c, tx(PHOTOS[a.k].cap), tw).slice(0, 2); lines.forEach((ln, j) => c.fillText(ln, tx0, 104 + j * 38));
    const yy = 104 + (lines.length - 1) * 38;
    c.fillStyle = '#5E5D73'; c.font = F(700, 21, 'u'); c.fillText(t('with').replace('{n}', a.host[lang] || a.host.en) + ' · ' + tx(a.place), tx0, yy + 42, tw);
    c.fillStyle = '#171A3A'; c.font = `800 40px ${FAM.d}`; const pr = '฿' + fmt(a.price); c.fillText(pr, tx0, h - 34);
    const pwid = c.measureText(pr).width; c.font = `700 22px ${FAM.u}`; c.fillStyle = '#E5484D'; const st = '฿' + fmt(a.street); c.fillText(st, tx0 + pwid + 14, h - 38);
    const sww = c.measureText(st).width; c.fillRect(tx0 + pwid + 14, h - 46, sww, 2.5);
    c.fillStyle = '#5E5D73'; c.font = F(700, 18, 'u'); c.fillText(t('cPpl'), tx0, h - 86);
    const sxp = 14 + pw - 84;
    if (stamps[i]) { c.save(); c.translate(sxp + 36, 72); c.rotate(.07); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10; c.shadowOffsetY = 3; c.drawImage(stamps[i], -36, -44, 72, 86); c.restore(); }
    c.save(); c.globalAlpha = .75; c.strokeStyle = '#F8F1E3'; c.lineWidth = 2.5; c.beginPath(); c.arc(sxp - 6, 112, 30, 0, 6.2832); c.stroke(); c.lineWidth = 2; for (let wv = 0; wv < 3; wv++) { c.beginPath(); for (let q = 0; q <= 60; q += 3) c.lineTo(sxp - 90 + q, 96 + wv * 14 + Math.sin(q / 6) * 3); c.stroke(); } c.restore(); cRings(c, sxp - 6, 112, 10, 3.4);
    c.restore();
  }
  c.strokeStyle = 'rgba(160,170,255,.2)'; c.lineWidth = 2; c.beginPath(); c.moveTo(80, 1340); c.lineTo(1000, 1340); c.stroke();
  cRings(c, 108, 1388, 17, 5.5); c.fillStyle = '#fff'; c.font = `800 32px ${FAM.d}`; c.textBaseline = 'middle'; c.fillText('kringapp.com', 148, 1390);
  c.textAlign = 'right'; c.fillStyle = '#FFD067'; c.font = F(800, 24, 'u'); c.fillText(t('cardHeld'), 1000, 1390, 520); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  let blob = null; try { blob = await new Promise(res => cvs.toBlob(res, 'image/png')); } catch (e) { blob = null; }
  if (seq !== drawSeq) return;
  if (tripURL) URL.revokeObjectURL(tripURL);
  if (blob) { tripURL = URL.createObjectURL(blob); tripBlob = blob; } else { tripURL = null; tripBlob = null; }
  const img = $('#tripImg'); if (tripURL) img.src = tripURL; else { try { img.src = cvs.toDataURL('image/png'); } catch (e) {} }
  img.alt = picks.length ? t('cardAlt') + ': ' + sel.map(a => tx(PHOTOS[a.k].cap)).join(', ') : t('cardAlt');
  const ready = picks.length === 3 && !!blob;
  const dl = $('#dl'); dl.setAttribute('aria-disabled', String(!ready)); dl.href = ready ? tripURL : '#'; if (!ready) dl.setAttribute('tabindex', '-1'); else dl.removeAttribute('tabindex');
  $('#tshare').disabled = !ready; $('#treset').hidden = !picks.length;
  $('#pickCount').textContent = picks.length + ' / 3';
}
$('#tiles').addEventListener('click', e => {
  const b = e.target.closest('.tile'); if (!b) return; const k = +b.dataset.k;
  const at = picks.indexOf(k);
  if (at > -1) picks.splice(at, 1);
  else if (picks.length < 3) picks.push(k);
  else { const pc = $('#pickCount'); pc.classList.remove('shake'); void pc.offsetWidth; pc.classList.add('shake'); return; }
  buzz(8); flick();
  $$('.tile').forEach(tb => { const i = +tb.dataset.k, n = picks.indexOf(i); tb.setAttribute('aria-pressed', String(n > -1)); tb.querySelector('.badge-n').textContent = n > -1 ? n + 1 : ''; });
  drawTrip().then(() => { if (picks.length === 3 && innerWidth < 900) { const f = $('#preview'), r = f.getBoundingClientRect(); if (r.top > innerHeight * .5) f.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: 'start'}); } });
});
$('#treset').addEventListener('click', () => { picks = []; renderTiles(); drawTrip(); });
$('#dl').addEventListener('click', e => { if ($('#dl').getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; } toast(t('saved')); });
$('#tshare').addEventListener('click', async () => {
  const url = 'https://kringapp.com', text = t('cTitle') + ' · ' + t('kicker');
  try {
    if (tripBlob && navigator.canShare) { const f = new File([tripBlob], 'kring-trip-card.png', {type: 'image/png'}); if (navigator.canShare({files: [f]})) { await navigator.share({files: [f], title: 'Kring', text: text + ' ' + url}); return; } }
    if (navigator.share) { await navigator.share({title: 'Kring', text, url}); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  // fallback: save the card instead
  const a = document.createElement('a'); a.href = tripURL; a.download = 'kring-trip-card.png'; document.body.appendChild(a); a.click(); a.remove(); toast(t('saved'));
});

/* marigold + jasmine garland illustration (the flower-market card has no true photo yet) */
function makeMalai(){
  const c = document.createElement('canvas'); c.width = 560; c.height = 350; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 350); bg.addColorStop(0, '#1A1238'); bg.addColorStop(.55, '#3A1E2A'); bg.addColorStop(1, '#5C2A0E'); g.fillStyle = bg; g.fillRect(0, 0, 560, 350);
  const glw = g.createRadialGradient(300, 330, 0, 300, 330, 380); glw.addColorStop(0, 'rgba(255,178,30,.55)'); glw.addColorStop(1, 'rgba(255,178,30,0)'); g.fillStyle = glw; g.fillRect(0, 0, 560, 350);
  const R = rnd(5);
  for (let s = 0; s < 9; s++) {
    const x0 = 30 + s * 63 + (R() - .5) * 14, len = 170 + R() * 120, bead = 10 + R() * 2, sway = (R() - .5) * .12;
    for (let k = 0; k * bead * 1.45 < len; k++) {
      const y = -6 + k * bead * 1.45, x = x0 + Math.sin(sway * k) * 10;
      const jas = k % 6 === 5;
      g.fillStyle = 'rgba(40,10,0,.45)'; g.beginPath(); g.arc(x + 2, y + 3, bead, 0, 7); g.fill();
      const col = jas ? ['#FBF6EA', '#EDE4CF'] : (k % 2 ? ['#FFC23D', '#F08A0C'] : ['#FFB21E', '#E07700']);
      const gr = g.createRadialGradient(x - bead * .35, y - bead * .35, 1, x, y, bead); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, bead, 0, 7); g.fill();
      if (!jas) { g.strokeStyle = 'rgba(120,50,0,.35)'; g.lineWidth = 1; for (let q = 0; q < 5; q++) { const a = q * 1.26 + k; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * bead * .8, y + Math.sin(a) * bead * .8); g.stroke(); } }
    }
    const ey = -6 + Math.floor(len / (bead * 1.45)) * bead * 1.45;
    g.fillStyle = '#FBF6EA'; g.beginPath(); g.ellipse(x0, ey + bead * 1.6, bead * .9, bead * 1.4, 0, 0, 7); g.fill();
    g.strokeStyle = '#C0392B00'; g.fillStyle = '#FFD067'; g.fillRect(x0 - 1, ey + bead * 3, 2, 22);
  }
  for (let i = 0; i < 70; i++) { const x = R() * 560, y = 290 + R() * 60, s = 3 + R() * 5; g.save(); g.translate(x, y); g.rotate(R() * 6); g.fillStyle = ['#FFB21E', '#FFC23D', '#F08A0C', '#FBF6EA'][i % 4]; g.globalAlpha = .7 + R() * .3; g.beginPath(); g.ellipse(0, 0, s, s * .55, 0, 0, 7); g.fill(); g.restore(); }
  g.globalAlpha = 1;
  const v = g.createRadialGradient(280, 175, 120, 280, 175, 360); v.addColorStop(0, 'rgba(5,6,13,0)'); v.addColorStop(1, 'rgba(5,6,13,.5)'); g.fillStyle = v; g.fillRect(0, 0, 560, 350);
  try { return c.toDataURL('image/jpeg', .9); } catch (e) { return ''; }
}

/* =====================================================================
   04 · WAITLIST
   ===================================================================== */
const seg = $('#seg'), badge = $('#badge'), form = $('#form'), panel = $('#panel'), who = $('#who'), field = $('#field'), errEl = $('#err');
let role = 'visit', done = false;
function setRole(r){ role = r; const inp = $(r === 'local' ? '#rl' : '#rv'); if (inp) inp.checked = true; syncRole(); }
function syncRole(){
  seg.dataset.role = role;
  badge.classList.toggle('show', role === 'local'); badge.setAttribute('aria-hidden', String(role !== 'local'));
  const ha = $('#harea'); if (ha) { ha.classList.toggle('show', role === 'local'); ha.setAttribute('aria-hidden', String(role !== 'local')); }
  $('#joinH').textContent = LAUNCHED ? t('kicker') : t(role === 'local' ? 'jHost' : 'jTrav');
}
$$('input[name="role"]').forEach(r => r.addEventListener('change', () => { roleTouched = true; role = r.value; syncRole(); }));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, LINE = /^@?[a-z0-9._-]{3,20}$/i;
form.addEventListener('submit', async e => {
  e.preventDefault();
  const v = who.value.trim();
  const isPhone = /^\+?[0-9 ()-]{8,18}$/.test(v) && v.replace(/\D/g, '').length >= 9;
  if (!(EMAIL.test(v) || LINE.test(v) || isPhone)) { errEl.textContent = t('err'); field.classList.add('bad'); who.focus(); return; }
  errEl.textContent = ''; field.classList.remove('bad');
  if (WAITLIST_ENDPOINT) {
    const btn = $('#joinBtn'); btn.disabled = true; btn.textContent = t('sending');
    try {
      const res = await fetch(WAITLIST_ENDPOINT, {method: 'POST', headers: WL_HEADERS,
        body: JSON.stringify(role === 'local' ? {kind: 'host', contact: v.slice(0, 120), lang, consent: true,
          area: ($('#haP') && $('#haP').checked) ? 'Pattaya' : 'Bangkok',
          note: [actName.value.trim() || '', CATS[cat] ? tx(PHOTOS[CATS[cat].a].cap) : '', '฿' + price].filter(Boolean).join(' · ').concat(REF ? ' | ref:' + REF : '').slice(0, 300)}
          : {kind: 'traveller', contact: v.slice(0, 120), lang, consent: true, note: withRef('')})});
      if (!res.ok) throw new Error(res.status);
    } catch (err) { errEl.textContent = t('fail'); btn.disabled = false; btn.textContent = t('join'); return; }
    btn.disabled = false; btn.textContent = t('join');
  }
  who.value = '';                               // keep nothing on the page
  done = true; panel.classList.add('done'); panel.classList.toggle('host', role === 'local');
  renderThanks(); $('#copied').textContent = '';
  success(); buzz([18, 40, 26]);
  bringIntoView(panel); $('#thanks').focus({preventScroll: true});
});
who.addEventListener('input', () => { if (field.classList.contains('bad')) { field.classList.remove('bad'); errEl.textContent = ''; } });
function renderThanks(){ $('#tyT').textContent = t(role === 'local' ? 'tyHost' : 'tyTrav'); $('#tyS').textContent = t(role === 'local' ? 'tyHost2' : 'tyTrav2'); }
const shareUrl = () => 'https://kringapp.com/' + (lang !== 'en' ? '?lang=' + lang : '');
if (navigator.share) $('#shareBtn').hidden = false;
$('#shareBtn').addEventListener('click', async () => { try { await navigator.share({title: 'Kring', text: t('shareText'), url: shareUrl()}); } catch (e) {} });
$('#copyBtn').addEventListener('click', async () => {
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(shareUrl()); ok = true; } } catch (e) {}
  if (!ok) { try { const ta = document.createElement('textarea'); ta.value = shareUrl(); ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e) {} }
  $('#copied').textContent = ok ? t('copied') : shareUrl();
});
$('#again').addEventListener('click', () => { done = false; panel.classList.remove('done', 'host'); who.focus(); });
$('#previewNote').hidden = !!WAITLIST_ENDPOINT;
$('#consent').hidden = !WAITLIST_ENDPOINT;

/* CTAs → waitlist with the right role */
$$('[data-cta]').forEach(a => a.addEventListener('click', e => {
  if (LAUNCHED) return;
  e.preventDefault();
  roleTouched = true; setRole(a.dataset.cta === 'auto' ? (side === 'host' ? 'local' : 'visit') : (a.dataset.cta === 'local' ? 'local' : 'visit'));
  if (done) { done = false; panel.classList.remove('done', 'host'); }
  $('#join').scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: 'start'});
  setTimeout(() => who.focus({preventScroll: true}), RM ? 0 : 900);
}));
function applyLaunch(){
  if (!LAUNCHED) return;
  $$('[data-soon]').forEach(x => x.hidden = true);
  $$('[data-cta]').forEach(a => { a.href = './app/'; const s = a.querySelector('span') || a; s.textContent = t('openApp'); });
  form.hidden = true; $('#launched').hidden = false; $('#joinH').textContent = t('kicker');
  $$('.share-t').forEach(x => x.hidden = true);
}

/* =====================================================================
   04 · FOR BUSINESSES — 2-step partner form (no fees or percentages shown)
   ===================================================================== */
const BTYPES = [['cafe_restaurant', 'ty1', 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3'],
  ['cooking_school', 'ty2', 'M3 12h18M5 12a7 7 0 0 0 14 0M12 5v3M9 6v2M15 6v2'],
  ['muay_thai_gym', 'ty3', 'M7 10a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v3a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM7 13H5a2 2 0 0 1 0-4h2M9 18v3h6v-3'],
  ['tours_boats', 'ty4', 'M3 16l2 4h14l2-4zM6 16V9l6-4 6 4v7M12 5v11'],
  ['market_shop', 'ty5', 'M4 9l2-5h12l2 5M4 9v11h16V9M4 9h16M9 20v-6h6v6'],
  ['transport_esim', 'ty6', 'M7 3h7l4 4v14H7zM9.5 11h6v6h-6z'],
  ['other', 'ty7', 'M12 5v14M5 12h14']];
const bform = $('#bform'), bs1 = $('#bs1'), bs2 = $('#bs2'), btypesEl = $('#btypes'), bthanks = $('#bthanks');
let bType = '', bStep = 1;
function renderBiz(){
  btypesEl.innerHTML = BTYPES.map(([v, k, d]) => `<button type="button" class="btype" data-v="${v}" aria-pressed="${bType === v}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg><span>${esc(t(k))}</span></button>`).join('');
  $('#bStepLive').textContent = t('stepOf').replace('{n}', bStep);
  $$('#bform .ferr').forEach(p => { if (p.dataset.k) p.textContent = t(p.dataset.k); });
  if (!$('#bFail').hidden && $('#bFail').dataset.k) $('#bFail').textContent = t($('#bFail').dataset.k);
}
btypesEl.addEventListener('click', e => {
  const b = e.target.closest('.btype'); if (!b) return;
  bType = b.dataset.v; $$('.btype', btypesEl).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  bErr('bTypeE', ''); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); flick(); buzz(6);
});
function bErr(id, k){ const p = $('#' + id); if (!p) return; p.dataset.k = k; p.textContent = k ? t(k) : ''; const f = p.closest('.bf'); if (f) f.classList.toggle('bad', !!k); }
function bringIntoView(el){ if (!el) return; const r = el.getBoundingClientRect(), head = ($('#bar') ? $('#bar').getBoundingClientRect().height : 64) + 12; if (r.top < head || r.top > innerHeight * .45) scrollTo({top: scrollY + r.top - head, behavior: RM ? 'auto' : 'smooth'}); }
function bGo(n){
  bStep = n; const from = n === 2 ? bs1 : bs2, to = n === 2 ? bs2 : bs1;
  from.hidden = true; to.hidden = false; to.classList.remove('in'); void to.offsetWidth; to.classList.add('in');
  $('#bpl1').classList.toggle('on', true); $('#bpl2').classList.toggle('on', n === 2); $('#bpl1').classList.toggle('done', n === 2);
  $('#bpFill').style.transform = `scaleX(${n === 2 ? 1 : .5})`;
  $('#bStepLive').textContent = t('stepOf').replace('{n}', n);
  whoosh(); buzz(8);
  bringIntoView($('.bcard'));
  const f = to.querySelector('input,textarea'); if (f) setTimeout(() => f.focus({preventScroll: true}), RM ? 0 : 420);
}
$('#bNext').addEventListener('click', () => {
  let ok = true, first = null;
  const name = $('#bName').value.trim(), person = $('#bPerson').value.trim();
  if (name.length < 2) { bErr('bNameE', 'eName'); ok = false; first = first || $('#bName'); } else bErr('bNameE', '');
  if (!bType) { bErr('bTypeE', 'eType'); ok = false; first = first || btypesEl.querySelector('.btype'); } else bErr('bTypeE', '');
  if (person.length < 2) { bErr('bPersonE', 'ePerson'); ok = false; first = first || $('#bPerson'); } else bErr('bPersonE', '');
  if (!ok) { bform.classList.remove('nudge'); void bform.offsetWidth; bform.classList.add('nudge'); first.focus(); buzz([10, 30, 10]); return; }
  bGo(2);
});
$('#bBack').addEventListener('click', () => bGo(1));
const PHONE = /^\+?[0-9 ()-]{8,16}$/;
const REF = (() => { let r = new URLSearchParams(location.search).get('ref'); try { r = r || sessionStorage.getItem('kring-ref'); if (r) sessionStorage.setItem('kring-ref', r); } catch (e) {} return r ? String(r).replace(/[^\w.-]/g, '').slice(0, 40) : ''; })();
const withRef = n => [n, REF ? 'ref:' + REF : ''].filter(Boolean).join(' | ').slice(0, 300) || null;
bform.addEventListener('submit', async e => {
  e.preventDefault();
  if (bStep === 1) { $('#bNext').click(); return; }
  let ok = true, first = null;
  const contactV = $('#bContact').value.trim(), email = $('#bEmail').value.trim();
  if (!(PHONE.test(contactV) || LINE.test(contactV) || (contactV.replace(/\D/g, '').length >= 9) || /^(line\s*[:：]?\s*)?@?[a-z0-9._-]{3,20}$/i.test(contactV) || /@\S{2,}/.test(contactV))) { bErr('bContactE', 'eContact'); ok = false; first = first || $('#bContact'); } else bErr('bContactE', '');
  if (email && !EMAIL.test(email)) { bErr('bEmailE', 'eEmail'); ok = false; first = first || $('#bEmail'); } else bErr('bEmailE', '');
  if (!$('#bConsent').checked) { bErr('bConsentE', 'eConsent'); ok = false; first = first || $('#bConsent'); } else bErr('bConsentE', '');
  if (!ok) { first.focus(); buzz([10, 30, 10]); return; }
  const fail = $('#bFail'); fail.textContent = ''; fail.dataset.k = '';
  if (WAITLIST_ENDPOINT) {
    const btn = $('#bSend'); btn.disabled = true;
    try {
      const area = (bform.querySelector('input[name="barea"]:checked') || {}).value === 'pattaya' ? 'Pattaya' : 'Bangkok';
      const bName = $('#bName').value.trim().slice(0, 120), bDistrict = $('#bDistrict').value.trim().slice(0, 80) || null;
      const bPerson = $('#bPerson').value.trim().slice(0, 80), bOffer = $('#bOffer').value.trim().slice(0, 300) || null, bTime = $('#bTime').value;
      let res = await fetch(WAITLIST_ENDPOINT, {method: 'POST', headers: WL_HEADERS, body: JSON.stringify({
        kind: 'business', business_name: bName, business_type: bType, area, district: bDistrict,
        name: bPerson, contact: contactV.slice(0, 120), email: email || null, note: withRef(bOffer),
        best_time: bTime, lang, consent: true})});
      if (res.status === 400) {
        res = await fetch(WAITLIST_ENDPOINT, {method: 'POST', headers: WL_HEADERS, body: JSON.stringify({
          kind: 'host', area, name: (`[BIZ:${bType}] ${bName} · ${bPerson}`).slice(0, 80),
          contact: contactV.slice(0, 120), note: withRef([bDistrict, email, bTime, bOffer].filter(Boolean).join(' | ')),
          lang, consent: true})});
      }
      if (!res.ok) throw new Error(res.status);
    } catch (err) { fail.dataset.k = 'fail'; fail.textContent = t('fail'); btn.disabled = false; return; }
    btn.disabled = false;
  }
  bform.reset(); bType = ''; renderBiz();                // keep nothing on the page
  bform.hidden = true; bthanks.hidden = false; bthanks.classList.remove('in'); void bthanks.offsetWidth; bthanks.classList.add('in');
  success(); buzz([18, 40, 26]); bringIntoView($('.bcard')); bthanks.focus({preventScroll: true});
});
$('#bAgain').addEventListener('click', () => { bthanks.hidden = true; bform.hidden = false; bGo(1); });
['bName', 'bPerson', 'bContact', 'bEmail'].forEach(id => $('#' + id).addEventListener('input', () => bErr(id + 'E', '')));
$('#bConsent').addEventListener('change', () => bErr('bConsentE', ''));
$('#bPreview').hidden = !!WAITLIST_ENDPOINT;
$('#bpFill').style.transform = 'scaleX(.5)';
{ const bz = $('#biz'); if (RM || !('IntersectionObserver' in window)) bz.classList.add('seen'); else { const io = new IntersectionObserver(es => { if (es[0].isIntersecting || es[0].boundingClientRect.bottom < 0) { bz.classList.add('seen'); io.disconnect(); } }, {threshold: .18}); io.observe(bz); } }

/* =====================================================================
   chrome: header, chapter rail
   ===================================================================== */
const bar = $('#bar'), railA = $$('#rail a');
/* 04 · inside Kring: travellers / hosts tabs (follows the side chosen in 02 until tapped) */
let inTouched = false;
function inTab(which, user){
  const host = which === 'host'; if (user) inTouched = true;
  $('#inTabT').setAttribute('aria-selected', String(!host)); $('#inTabH').setAttribute('aria-selected', String(host));
  $('#inTabT').tabIndex = host ? -1 : 0; $('#inTabH').tabIndex = host ? 0 : -1;
  $('#inPaneT').hidden = host; $('#inPaneH').hidden = !host;
  const pane = host ? $('#inPaneH') : $('#inPaneT'); pane.classList.remove('in'); void pane.offsetWidth; pane.classList.add('in');
  if (user) { flick(); buzz(6); }
}
$('#inTabT').addEventListener('click', () => inTab('trav', true));
$('#inTabH').addEventListener('click', () => inTab('host', true));
$('.in-tabs').addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const h = $('#inTabH').getAttribute('aria-selected') !== 'true'; inTab(h ? 'host' : 'trav', true); (h ? $('#inTabH') : $('#inTabT')).focus(); } });
const sticky = $('#stickyCta');
function stickyCheck(){
  if (!sticky) return;
  const jr = $('#join').getBoundingClientRect(), br = $('.bcard').getBoundingClientRect();
  const on = !LAUNCHED && scrollY > innerHeight * .9 && jr.top > innerHeight * .9 && !(br.top < innerHeight && br.bottom > 0);
  sticky.classList.toggle('on', on); sticky.setAttribute('aria-hidden', String(!on)); sticky.tabIndex = on ? 0 : -1;
  $('#stickyTxt').textContent = t(side === 'host' ? 'hCta' : 'cta');
}
function onScroll(){
  bar.classList.toggle('solid', scrollY > 24);
  stickyCheck();
  $$('.kin:not(.in),#biz:not(.seen)').forEach(k => { if (k.getBoundingClientRect().top < innerHeight * .85) k.classList.add(k.id === 'biz' ? 'seen' : 'in'); });
  const c = innerHeight * .5; let cur = 0;
  secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= c) cur = i; });
  railA.forEach((a, i) => { a.classList.toggle('on', i === cur); if (i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  if (side === 'host') maybeGhost();
  if (RM) requestDraw(); else kick();
}
addEventListener('scroll', onScroll, {passive: true});

/* =====================================================================
   ONE shared loop
   ===================================================================== */
let raf = 0, last = 0, heroVis = true;
const FRAMES = [];
function loop(now){
  raf = 0;
  if (document.hidden) return;
  const w0 = performance.now(), raw = now - (last || now);
  const dt = Math.min(.05, raw / 1000); last = now;
  if (heroVis || S.holding || sparks.length) heroStep(dt, now, raw / 1000);
  drawScene(now, dt);
  if (heroVis) drawFx(dt, now, S.met ? 0 : S.p);
  if (FRAMES.length < 3000) FRAMES.push({gap: raw, work: performance.now() - w0});
  raf = requestAnimationFrame(loop);
}
function kick(){ if (RM || raf || document.hidden) return; last = 0; raf = requestAnimationFrame(loop); }
let drawQ = 0;
function requestDraw(){ if (!RM) { kick(); return; } if (drawQ) return; drawQ = requestAnimationFrame(() => { drawQ = 0; drawScene(performance.now(), 0); }); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

/* =====================================================================
   boot
   ===================================================================== */
artURL = makeMalai();
secs = SECS();
buildLph();
const startLang = pickLang();
const qs = new URLSearchParams(location.search);
side = ['host', 'trav'].includes(qs.get('side')) ? qs.get('side') : (startLang === 'th' ? 'host' : 'trav');
setLang(startLang, false);
$$('.kin, [data-kin]').forEach(kinWatch);
setSide(side, true);
sizeScene(true); sizeFx(); measure();
if (!LAUNCHED) $('#launched').hidden = true;

if (RM) {
  S.met = true; body.classList.add('met', 'rm'); heroEnergy = .3;
  requestAnimationFrame(() => { heroStatic(); drawScene(performance.now(), 0); drawFx(0, 12000, 0); });
  addEventListener('resize', () => { sizeScene(false); sizeFx(); heroStatic(); drawScene(performance.now(), 0); drawFx(0, 12000, 0); });
} else {
  new ResizeObserver(() => measure()).observe(wrapR);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { sizeScene(false); sizeFx(); depth(); }, 120); });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { heroVis = es[0].isIntersecting; if (!heroVis) fctx.clearRect(0, 0, fx.width, fx.height); }, {threshold: 0}).observe(stage);
  kick();
}
onScroll();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); depth(); drawTrip(); });

/* grain tile (film) */
(() => { if (RM) return; const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'); const d = x.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); $('.grain').style.backgroundImage = `url(${c.toDataURL()})`; })();

/* test hook (no effect for visitors) */
window.__kring = {state: S, contact, frames: FRAMES, setSide, setLang: l => setLang(l, false), PHOTOS, ACTS};
})();
