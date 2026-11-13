/* Safety guards: chat contact masking, cash nudge, safe-link check, host activity-name guard.
   Hardened per Kring Deep Code Audit (Oct 26, 2026) — Round 2 verified against 18/18 bypass strings. */
export interface LinkInfo { u: URL; h: string; safe: boolean; maps: boolean; title: string }

export function linkInfo(raw: string): LinkInfo | null {
  let u: URL
  try {
    u = new URL(/^https?:/i.test(raw) ? raw : 'https://' + raw.replace(/^www\./i, ''))
  } catch {
    return null
  }
  // Reject URLs with embedded credentials (e.g. https://kringapp.com@evil.com)
  if (u.username || u.password || /@/.test(raw.split('/')[2] || '')) {
    return { u, h: u.hostname, safe: false, maps: false, title: u.hostname }
  }
  const h = u.hostname.replace(/^www\./, '').toLowerCase()
  const maps =
    /^maps\.(google\.(com|co\.th)|app\.goo\.gl)$/.test(h) ||
    (/^google\.(com|co\.th)$/.test(h) && u.pathname.startsWith('/maps')) ||
    (h === 'goo.gl' && u.pathname.startsWith('/maps'))
  const safe = maps || /(^|\.)(kring\.app|kringapp\.com|go\.th|tourismthailand\.org|wikipedia\.org)$/.test(h)
  const title = maps
    ? 'Google Maps'
    : /kring(app)?\.(app|com)$/.test(h)
      ? 'Kring'
      : /wikipedia\.org$/.test(h)
        ? 'Wikipedia'
        : /(go\.th|tourismthailand\.org)$/.test(h)
          ? 'Official site · Thailand'
          : h
  return { u, h, safe, maps, title }
}

const DIGIT_MAP: Record<string, string> = {}
const ZERO_BASES = [0xff10, 0x0e50, 0x0966, 0x0660, 0x06f0] // full-width, Thai, Devanagari, Arabic-Indic, Eastern Arabic-Indic
for (const base of ZERO_BASES) {
  for (let d = 0; d <= 9; d++) {
    DIGIT_MAP[String.fromCodePoint(base + d)] = String(d)
  }
}

function foldDigitsAndZeroWidth(input: string): string {
  return input
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[０-９๐-๙०-९٠-٩۰-۹]/g, (ch) => DIGIT_MAP[ch] ?? ch)
}

/* App names used to share a contact ID. Common English words that are also app nicknames
   ("line", "wa", "ig", "fb", "tele", "snap"…) only count when a clear signal is present
   ("my line is…", "LINE ID…", "line: …"), so normal words like "walking" or "want" are never masked. */
const WEAK_APPS = new Set(['line', 'wx', 'vx', 'wa', 'tele', 'tg', 'ig', 'fb', 'vk', 'upi', 'snap', 'qq'])
const APP_NAMES =
  'line\\s*id|kakao\\s*talk|kakaotalk|kakao|wechat|weixin|whatsapp|telegram|instagram|insta|facebook|messenger|zalo|viber|snapchat|tiktok|xhs|' +
  'line|wx|vx|wa|tele|tg|ig|fb|vk|upi|snap|qq|' +
  'แอด\\s*ไลน์|ไลน์\\s*ไอดี|ไอดี\\s*ไลน์|ไลน์|ไอจี|เฟซบุ๊ก|เฟซ|วอทส์แอป|วอตส์แอป|ไอดี|' +
  '微信号|微信|v信|小红书|抖音|' +
  '카카오톡|카톡|카카오|인스타그램|인스타|텔레그램|왓츠앱|라인|아이디|' +
  'телеграм|телега|ватсап|вотсап|вайбер|инстаграм'
/** Words before the app name that say "this is mine / add me". */
const LEAD =
  '(?:(?:my|mine|our|add\\s+me\\s+on|add\\s+me|find\\s+me\\s+on|(?:message|text|dm|call|contact|reach)\\s+me\\s+on)\\s+|' +
  '(?:เพิ่ม|ทัก|제|내|我的|加我|加|мой|моя|мне\\s+в)\\s*)'
/** Filler between the app name and the ID ("ID is", "아이디는", "是", "คือ", ":" …). */
const FILL_TOK =
  'id(?![a-z0-9_])|account(?![a-z0-9_])|handle(?![a-z0-9_])|user\\s*name(?![a-z0-9_])|number(?![a-z0-9_])|is(?![a-z0-9_])|' +
  'ไอดี|คือ|ของ(?:ฉัน|ผม|หนู|เรา)|นะ(?:คะ|ครับ)?|' +
  '아이디(?:는|은|가)?|계정(?:은|이)?|id는|는|은|' +
  '号|號|是|为|為|账号|帳號|' +
  'ник|аккаунт|—|->|[:：=@→➡⇒➜\\-]'
const STRONG_FILL = /id|account|handle|user|number|ไอดี|คือ|아이디|계정|는|은|号|號|是|为|為|账号|帳號|ник|аккаунт|[:：=@→➡⇒➜]|->/i
const HANDLE = '(@?[a-z0-9][a-z0-9._\\-]{0,30}[a-z0-9_])'
const APP_RE = new RegExp(
  '(^|[^a-z0-9_])(' + LEAD + ')?(' + APP_NAMES + ')(?![a-z0-9_])((?:\\s*(?:' + FILL_TOK + '))*\\s*)' + HANDLE + '(?![a-z0-9_])',
  'gi',
)
const looksLikeId = (h: string): boolean => (/[a-z]/i.test(h) && /[0-9_.]/.test(h)) || /^@/.test(h) || /^\d{6,}$/.test(h)

/** A bare plain-letter handle right after a short app name: "ig pimwrites", "line nicha", "ไอจี pimwrites", "ไลน์ nicha".
    Latin app names count only at the start of a message or line (or after "my"), and the handle must end the sentence,
    so "check ig later today" or "online lessons" stay as they are. */
const BARE_LATIN = /(^|[\n.!?,;]\s*|\bmy\s+)(ig|insta|line|wa|tg|fb)(\s*[:\-]?\s+)([a-z][a-z0-9._-]{3,29})(?=\s*(?:$|[\n.!?,;]))/gim
const BARE_THAI = /((?<!ออน)ไลน์|ไอจี|อินสตา|ไอดี)(\s*[:\-]?\s*)([A-Za-z][A-Za-z0-9._-]{3,29})(?![A-Za-z0-9._-])/g
/** Mask "<app> <id>" contact shares. Exported for unit tests. */
export function maskAppIds(m: string): string {
  m = m.replace(BARE_LATIN, (_all, pre: string, app: string, gap: string) => pre + app + gap + '••••')
    .replace(BARE_THAI, (_all, app: string, gap: string) => app + gap + '••••')
  return m.replace(APP_RE, (all, pre: string, lead: string | undefined, app: string, fill: string, handle: string) => {
    const a = app.toLowerCase().replace(/\s+/g, '')
    const weak = WEAK_APPS.has(a)
    const strongFill = STRONG_FILL.test(fill)
    const ok = !!lead || strongFill || (!weak && (looksLikeId(handle) || /is/i.test(fill)))
    return ok ? pre + (lead || '') + app + fill + '••••' : all
  })
}

/* ---------- Contact-keyword window (round 2) ----------
   An ID-like token (letters/digits/._- with a digit or underscore, 4–30 chars) is hidden when it sits within
   40 characters after (or 25 before) a contact keyword in any of the 7 app languages. Thai/CJK words have no
   spaces, so "แอดไลน์พลอยได้นะคะ ploy_ari99" and "加我微信吧 wxid_test123" are caught too. */
const L = (w: string): string => `(?<![A-Za-z])(?:${w})(?![A-Za-z])` // latin keyword, bounded by non-letters
const CONTACT_KW_SRC = [
  // English / latin app names and words
  L('line\\s*id|line|kakao\\s*talk|kakaotalk|katalk|kakao|ka\\s*talk|wechat|we\\s*chat|weixin|wxid|wx|vx|whats\\s*app|whatsapp|telegram|tele|tg|insta(?:gram)?|ig|facebook|fb|messenger|viber|zalo|snap(?:chat)?|qq|tiktok|discord|signal|id|user\\s*name|username|handle|contact|add\\s+(?:me|my)|dm\\s+me|wasap|akaun|hubungi'),
  // Thai ("ไลน์" but not "ออนไลน์")
  '(?<!ออน)ไลน์', 'แอด', 'ไอดี', 'ไอจี', 'อินสตา', 'อินสตาแกรม', 'เฟซ', 'เฟส', 'เทเลแกรม', 'วอทส์แอป', 'วอตส์แอป', 'วีแชท', 'วีแชต', 'ติดต่อ',
  // Chinese
  '微信号?', '微信', 'v信', '加我', '账号', '帳號', 'QQ', '抖音', '小红书', '电报', '联系',
  // Korean
  '카카오톡', '카톡', '카카오', '아이디', '라인', '인스타그램', '인스타', '텔레그램', '왓츠앱', '위챗', '연락처', '추가',
  // Hindi
  'व्हाट्सएप', 'व्हाट्सऐप', 'वॉट्सऐप', 'इंस्टा', 'इंस्टाग्राम', 'टेलीग्राम', 'आईडी', 'लाइन', 'संपर्क',
  // Russian
  'телеграм', 'телега', 'тг', 'ватсап', 'вотсап', 'вацап', 'вайбер', 'инстаграм', 'инста', 'ник', 'аккаунт', 'добавь', 'контакт', 'лайн',
].join('|')
const CONTACT_KW = new RegExp(CONTACT_KW_SRC, 'gi')
/** Messenger app names: once one has been mentioned in a conversation, later bare IDs are hidden too. */
const APP_MENTION =
  /(?<![A-Za-z])(?:line|kakao|katalk|wechat|weixin|wx|telegram|tg|whatsapp|insta(?:gram)?|ig|facebook|fb|viber|zalo|qq|snapchat)(?![A-Za-z])|(?<!ออน)ไลน์|ไอจี|วีแชท|微信|v信|카톡|카카오|라인|인스타|텔레그램|위챗|व्हाट्सएप|टेलीग्राम|телеграм|ватсап|вотсап|лайн/i
/** Latin ID-like tokens (Thai/CJK letters around them don't count as part of the token). */
const TOKEN = /(?<![A-Za-z0-9_.@-])[A-Za-z0-9][A-Za-z0-9._-]{2,28}[A-Za-z0-9_](?![A-Za-z0-9_@-])/g
/** Not an ID: booking refs, times, amounts and units ("KR-243683", "18h30", "7pm", "10min", "1500baht"). */
const NOT_ID = /^(?:kr-?\d+|\d{1,2}[h:.]\d{2}|\d+(?:am|pm|min|mins|km|m|cm|mm|kg|baht|thb|h|hr|hrs|pax|ppl|x|th|st|nd|rd)|\d{1,5})$/i
/** ID-like: a letter plus a digit or underscore, or a long run of digits (QQ / numeric IDs). Exported for unit tests. */
export const isIdLike = (tok: string, loose = false): boolean => {
  if (tok.length < 4 || tok.length > 30 || NOT_ID.test(tok)) return false
  if (/[a-z]/i.test(tok) && /[0-9_]/.test(tok)) return true
  if (/^\d{6,}$/.test(tok)) return true
  // right after a contact keyword, "nicha.bkk" / "ploy-ari" style IDs count too
  return loose && /^[a-z]{2,}[.\-][a-z0-9]{2,}/i.test(tok)
}

function maskNearKeywords(m: string, anyId: boolean): string {
  const ranges: [number, number][] = []
  for (const k of m.matchAll(CONTACT_KW)) {
    const s = k.index ?? 0, e = s + k[0].length
    ranges.push([Math.max(0, s - 25), e + 40])
  }
  const near = (i: number): boolean => ranges.some(([a, b]) => i >= a && i <= b)
  return m.replace(TOKEN, (tok: string, at: number) => {
    const close = near(at)
    if (close && isIdLike(tok, true)) return '••••'
    if (anyId && isIdLike(tok)) return '••••'
    // a letter + underscore token is almost always a handle ("jiwoo_test"), mask it anywhere
    if (/[a-z]/i.test(tok) && tok.includes('_') && isIdLike(tok)) return '••••'
    return tok
  })
}

/**
 * Hide contact details in a chat message.
 * @param history earlier messages from the same sender in this conversation (an app named earlier, e.g. "my kakao is…",
 *   makes a later bare "jiwoo_test" count as an ID).
 */
export function maskTxt(v: string, history: readonly string[] = []): string {
  if (!v) return ''
  let m = foldDigitsAndZeroWidth(v)

  // 1. Fold bracketed (at)/[at]/{at} and (dot)/[dot]/{dot} inside email tokens, then mask standard & spelled-out emails
  m = m
    .replace(/([\w.+-])\s*[\(\[\{<]\s*(?:at|@)\s*[\)\]\}>]\s*([\w-])/gi, '$1@$2')
    .replace(/([\w-])\s*[\(\[\{<]\s*(?:dot|\.)\s*[\)\]\}>]\s*([\w])/gi, '$1.$2')
    .replace(/([\w-])\s*[\(\[\{<]\s*(?:dot|\.)\s*[\)\]\}>]\s*([\w])/gi, '$1.$2')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '••••')
    // "jiwoo_test@kakao", "ploy99@line": an ID glued to an app or host name with @
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]{2,}(?![A-Za-z0-9])/g, '••••')
    .replace(
      /\b[a-z0-9._%+-]+(\s*@\s*|\s+at\s+)[a-z0-9.-]+(\s*\.\s*|\s+dot\s+)(com|net|org|io|co|th|in|ru|cn|me|app|info|biz|edu|gov|uk|de|fr|jp|kr|sg|au|us|ca|mail|gmail|yahoo|hotmail|outlook|icloud|proton)(\s*(\.|\s+dot\s+)\s*[a-z]{2,3})?\b/gi,
      '••••',
    )

  // 2. HTTP(S) and www URLs — only allow verified Google Maps / Kring / official links at token start
  m = m.replace(/(^|\s)((https?:\/\/|www\.)\S+)/gi, (_all, pre: string, url: string) => {
    const i = linkInfo(url)
    return pre + (i && i.safe ? url : '••••')
  })

  // 3. Bare shorteners & social profile links
  m = m.replace(
    /\b(t\.me|wa\.me|line\.me|lin\.ee|linktr\.ee|bit\.ly|tinyurl\.com|instagr\.am|instagram\.com|fb\.me|facebook\.com|m\.me|vk\.com| tiktok\.com|x\.com|qr\.kakao\.com)\/?\S*/gi,
    '••••',
  )
  // 3b. Messenger profile / invite domains written without https ("open.kakao.com/o/abc", "pf.kakao.com/_xyz")
  m = m.replace(
    /(?<![A-Za-z0-9.@-])(?:[a-z0-9-]+\.)*(?:kakao\.com|kakao\.me|kakaocorp\.com|line\.me|lin\.ee|t\.me|telegram\.me|telegram\.dog|wa\.me|whatsapp\.com|chat\.whatsapp\.com|m\.me|ig\.me|instagram\.com|facebook\.com|fb\.com|weixin\.qq\.com|wechat\.com|u\.wechat\.com|qq\.com|vk\.me|vk\.com|zalo\.me|viber\.com|invite\.viber\.com|snapchat\.com|discord\.gg|discord\.com|tiktok\.com|xiaohongshu\.com|xhslink\.com|linktr\.ee)(?:\/\S*)?/gi,
    '••••',
  )
  // 3c. Any other bare link ("nicha-bkk.com/me") unless it is an allow-listed one (Google Maps, Kring, official sites)
  m = m.replace(
    /(?<![A-Za-z0-9.@\/-])(?:[a-z0-9-]+\.)+(?:com|net|org|me|io|co|ly|gg|gl|ee|app|link|page|to|cc|th|cn|kr|ru|in|my|site|online|bio)(?![A-Za-z0-9-])(?:\/\S*)?/gi,
    (url: string) => {
      const i = linkInfo(url)
      return i && i.safe ? url : '••••'
    },
  )
  // 3d. Spelled-out underscores between two ID parts ("jiwoo 언더바 test", "ploy underscore ari")
  m = m.replace(
    /(?<![A-Za-z0-9])[A-Za-z0-9]{2,}\s*(?:언더바|언더스코어|밑줄|underscore|under\s*bar|ขีดล่าง|ขีดเส้นใต้|下划线|下劃線|底线|нижнее\s+подч[её]ркивание|подч[её]ркивание|garis\s+bawah)\s*[A-Za-z0-9]{2,}(?![A-Za-z0-9])/gi,
    '••••',
  )
  // 3e. IDs spelled with spaces between the letters ("j i w o o _ t e s t")
  m = m.replace(/(?<![A-Za-z0-9_.@-])(?:[A-Za-z0-9_.@-][ \t]+){4,}[A-Za-z0-9_.@-](?![A-Za-z0-9_.@-])/g, (x: string) =>
    /[A-Za-z0-9]/.test(x) ? '••••' : x,
  )

  // 4–5. App IDs in any of the 7 languages ("my kakao is jiwoo_test", "我的微信是 liwei_cd2000", "카톡 아이디는 …")
  m = maskAppIds(m)
  // 5b. ID-like tokens near a contact keyword, or anywhere once an app was named earlier in the conversation
  m = maskNearKeywords(m, history.some((h) => APP_MENTION.test(h)))

  // 6. Phone numbers (8–16 digits allowing spaces, dashes, dots, slashes, underscores, parens)
  m = m.replace(/\+?\d[\d\s.\-/_()]{6,18}\d/g, (x) => {
    const trimmed = x.trim()
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(trimmed)) return x
    const digitCount = trimmed.replace(/\D/g, '').length
    return digitCount >= 8 && digitCount <= 16 ? '•••• ••••' : x
  })

  // 7. Spelled-out Chinese (including spaced), Thai & English digit sequences (7+ digits)
  m = m
    .replace(/(?:[零〇一二三四五六七八九壹贰叁肆伍陆柒捌玖][\s.,_\-]*){7,}/g, '•••• ••••')
    .replace(/((ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)[\s.,_-]*){7,}/g, '•••• ••••')
    .replace(/\b((zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s.,_-]*){7,}/gi, '•••• •••• ')
    // Korean Sino-Korean digits ("공일공 일이삼사 오육칠팔"), Russian, Malay and Hindi number words
    .replace(/(?:[공영일이삼사오육칠팔구][\s.,_-]*){7,}/g, '•••• ••••')
    .replace(/(?:(?:ноль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)[\s.,_-]*){7,}/gi, '•••• ••••')
    .replace(/\b(?:(?:kosong|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan)[\s.,_-]*){7,}/gi, '•••• ••••')
    .replace(/(?:(?:शून्य|एक|दो|तीन|चार|पांच|पाँच|छह|छः|सात|आठ|नौ)[\s.,_-]*){7,}/g, '•••• ••••')
    // @handles (Instagram, Telegram, X…) anywhere that isn't the middle of an email
    .replace(/(^|[^A-Za-z0-9_.@])@[A-Za-z0-9_.]{3,32}/g, '$1@••••')

  // 8. Off-app payment diversion / pre-meetup transfer / personal QR / card-transfer evasion signals
  m = m.replace(
    /(ca\$h|\bc\s+a\s+s\s+h\b|\bscan\s+(?:my\s+)?qr\b|โอนให้ก่อน|โอนมัดจำก่อน|สแกน\s*qr\s*ส่วนตัว|\bpay\s+outside\s+(?:the\s+)?app\b|перевод\s+на\s+карту)/gi,
    '••••',
  )

  return m
}

// Note: PromptPay is Kring's legitimate check-in QR rail, so only flag off-app cash/direct transfer solicitation
export const CASH =
  /cash|ca\$h|\bc\s+a\s+s\s+h\b|เงินสด|现金|現金|현금|नकद|कैश|наличн|кэш|перевод\s+на\s+карту|tunai|pay\s*(me\s*)?direct|(?:pay\s+)?outside\s*(the\s*)?app|scan\s+(?:my\s+)?qr|save\s*(you\s*)?the\s*fee|ไม่ผ่านแอป|โอนตรง|โอนให้ก่อน|โอนมัดจำก่อน|โอนเข้าบัญชีส่วนตัว|private\s*time/i

/** Booking or paying outside Kring ("pay outside the app", "save the fee", "ไม่ผ่านแอป"). Cash at the place is fine. */
export const OFFAPP =
  /(?:pay\s+|book\s+)?outside\s*(?:of\s+)?(?:the\s*)?(?:app|kring)|pay\s*(?:me\s*)?direct|book\s+(?:with\s+me\s+)?direct|save\s*(?:you\s*)?the\s*(?:fee|ticket)|skip\s+(?:the\s+)?(?:app|kring|ticket)|without\s+(?:the\s+)?(?:app|kring)|ไม่ผ่านแอป|ไม่ต้องผ่าน|นอกแอป|โอนตรง|โอนเข้าบัญชีส่วนตัว|不通过\s*(?:app|kring)|私下|직접\s*예약|앱\s*밖|мимо\s+приложени|напрямую|ऐप\s+के\s+बाहर|luar\s+(?:app|aplikasi)|private\s*time/i

export const BAN =
  /เดท|เดต|แฟน(?!ซี)|ฟิวแฟน|รับงาน|ไซด์ไลน์|ค้างคืน|ต่อคืน|คืนละ|ต่อ\s*ชั่วโมง|ชั่วโมงละ|รายชั่วโมง|ต่อ\s*ชม|ชม\.?\s*ละ|เรทชั่วโมง|เพื่อนเที่ยว|เพื่อนคุย|คุยเป็นเพื่อน|เพื่อนกิน|นวด(?!แป้ง)|เซ็กซี่|อะโกโก้|โคโยตี้|เด็กดริ้ง|เลานจ์|บาร์ไฟน์|อัญมณี|โรงงานเพชร|ร้านเพชร|ห้องส่วนตัว|คอนโดส่วนตัว|ไปห้อง|ส่วนตัว|\bdate\b(?!\s*palm)|dating|girl\s*friend|boy\s*friend|gf\s*experience|bf\s*experience|girls?\s*bar|go-?go|nightlife|bar\s*crawl|bar\s*fine|drink\s*quota|lady\s*drink|hostess|lounge|companion|escort|\bgfe\b|\bbfe\b|sugar|fwb|\bons\b|pretty\s*lad|sexy|over\s*night|per\s*\d*\s*(h(ou)?rs?|min(ute)?s?|night|day)|hourly|by\s*the\s*hour|\/\s*\d*\s*(h(ou)?rs?|min(ute)?s?|night)\b|\d+\s*(฿|baht|thb)?\s*\/\s*\d*\s*(h(ou)?r|min)|massage|private\s*(time|room|condo)|hotel\s*room|my\s*(room|condo)|friend\s*(for|in)\b|bangkok\s*friend|\bgem(s|stone)?\b|jewel(le)?ry|free\s*tuk|tuk\s*-?\s*tuk\s*\d+/i

const HOMOGLYPH_MAP: Record<string, string> = {
  α: 'a', а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', в: 'b', к: 'k', м: 'm', н: 'h', т: 't',
}

export const NORM = (v: string): string =>
  v
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[αаеорсхуіјѕвкмнт]/g, (c) => HOMOGLYPH_MAP[c] ?? c)
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/\$/g, 's')
    .replace(/[\s._-]+/g, ' ')

export const nameBlocked = (v: string): boolean => BAN.test(v) || BAN.test(NORM(v))

/**
 * 13:25 IST Option B · In-card chat masking until Check-in ("Received ✓").
 * - When `isCheckedIn === false` (both during the <= 3 offer messages AND after Ticket/Pass acceptance before Check-in),
 *   all contact info and off-app payment diversion strings are masked via `maskTxt(text)`.
 * - Once the Host taps "Received ✓" at Check-in (`isCheckedIn === true`), chat is open.
 */
export function maskCardChatMessage(text: string, isCheckedIn: boolean): { text: string; masked: boolean } {
  if (isCheckedIn) {
    return { text, masked: false }
  }
  const out = maskTxt(text)
  return { text: out, masked: out !== text }
}

/* Chat solicitation filter (sexual content, hotel rooms, staying the night) in the 7 app languages.
   A message that matches is not sent; the chat shows a warning instead. Kring activities happen at public places only. */
const SOLICIT_RE = new RegExp(
  [
    // English
    '\\bsex(?:y|ual|ually|ting)?\\b', '\\bs[\\s.*_-]+[e3*][\\s.*_-]+x(?:y|ual)?\\b', '\\bs\\*+x(?:y)?\\b', '\\bnudes?\\b', '\\bnaked\\b', '\\bhorny\\b', '\\bhook\\s*up\\b',
    'one\\s*night\\s*stand', 'hotel\\s*room', '\\bmotel\\b', '(?:spend|stay)\\s+the\\s+night', '\\bstay\\s+over\\b',
    '\\bover\\s*night\\s+(?:with|together|at)\\b', '\\bsleep\\s+(?:with|together|over)\\b',
    '\\b(?:come|coming|up)\\s+(?:back\\s+|up\\s+|over\\s+)?to\\s+(?:my|your)\\s+(?:room|hotel|condo|apartment|flat|place)\\b', '\\b(?:go|going|back)\\s+(?:back\\s+|up\\s+)?to\\s+your\\s+(?:room|hotel|condo|apartment|flat|place)\\b', '\\bmy\\s+(?:room|condo)\\b',
    '\\broom\\s*(?:no\\.?|number|#)?\\s*\\d{3,4}\\b', '\\bkiss\\s+(?:me|you)\\b', 'private\\s+(?:time|room|massage)', 'happy\\s+ending',
    '\\bfwb\\b', '\\bescort\\b', 'body\\s*to\\s*body',
    '\\bdating\\b', '\\bgo(?:ing)?\\s+(?:out\\s+)?on\\s+a\\s+date\\b', '\\b(?:a|our|my|your)\\s+date\\s+(?:with|after|tonight|later)\\b', '\\bbe\\s+my\\s+date\\b', '\\bdate\\s+(?:night|me|you|with\\s+(?:me|you))\\b',
    '\\bjust\\s+(?:the\\s+)?two\\s+of\\s+us\\b', '\\b(?:meet|see)\\s+(?:me\\s+|you\\s+)?(?:alone|privately|in\\s+private)\\b',
    '\\b(?:meet|wait|see\\s+you)\\s+(?:me\\s+)?(?:at|in)\\s+(?:the|my|your)\\s+hotel\\b', '\\bcome\\s+(?:up\\s+)?to\\s+(?:the|my|your)\\s+hotel\\b', '\\bback\\s+to\\s+(?:my|your)\\s+(?:hotel|place)\\s+(?:with|together)\\b', '\\b(?:my|your)\\s+hotel\\s+(?:tonight|later|after)\\b',
    '\\bcome\\s+(?:back\\s+)?to\\s+(?:my|your)\\s+place\\b', '\\b(?:stay|sleep)\\s+(?:over\\s*night|the\\s+night|together|at\\s+(?:my|your)\\s+(?:place|hotel))', '\\ball\\s+night\\s+(?:with|together)\\b', '\\bspend\\s+(?:the\\s+)?night\\b',
    '\\bafter\\s+the\\s+(?:activity|tour|walk|class)\\b.{0,30}\\b(?:alone|private|my\\s+room|hotel)\\b',
    // Thai
    'เซ็กส์', 'เซ็กซ์', 'เซ็กซี่', 'เซ็กซี', 'นอนด้วย', 'นอนกับ', 'ค้างคืน', 'ค้างด้วย', 'ไปค้าง', 'ห้องโรงแรม',
    'ห้องพัก(?:ฉัน|ผม|คุณ|ของ)', 'ไปห้อง(?!น้)', 'ขึ้นห้อง', 'มาห้อง(?!น้)', 'เข้าห้อง(?!น้)', 'ห้อง(?:ฉัน|ผม|คุณ|หนู|เค้า)', 'ห้อง\\s*(?:เบอร์|หมายเลข)?\\s*\\d{3,4}', 'โป๊', 'เปลือย', 'จูบ',
    '(?:มา|เจอ(?:กัน)?|นัด(?:กัน)?|รอ)\\s*(?:ที่)?\\s*โรงแรม', 'โรงแรมได้ไหม', 'เดท', 'เดต', 'สองต่อสอง', '(?:เจอ|นัด|เที่ยว)(?:กัน)?(?:ต่อ)?\\s*ส่วนตัว', 'หลังกิจกรรม.{0,20}ส่วนตัว', 'ไปต่อ.{0,12}(?:ส่วนตัว|สองคน|ห้อง|โรงแรม)', 'คืนนี้.{0,10}(?:ห้อง|โรงแรม|ค้าง)',
    // Chinese
    '开房', '開房', '酒店房间', '酒店房間', '过夜', '過夜', '上床', '做爱', '做愛', '性感', '约炮', '約炮', '裸照', '约会', '約會', '单独见面', '單獨見面', '来我(?:酒店|房间|家)', '去(?:我|你)(?:的)?(?:酒店|房间|家)',
    // Korean
    '섹스', '섹시', '모텔', '호텔\\s*방', '자고\\s*가', '같이\\s*자(?:요|자|고|러)', '하룻밤', '원나잇', '데이트', '둘이서만', '우리\\s*둘만', '호텔(?:로|에서)\\s*(?:만나|와|가)',
    // Russian
    'секс', 'переноч', 'номер\\s+в\\s+отеле', 'ко\\s+мне\\s+в\\s+номер', 'в\\s+мой\\s+номер', 'интим', 'голая', 'голый', 'свидани', 'наедине', 'в\\s+(?:мой|твой)\\s+отель',
    // Hindi
    'सेक्स', 'होटल\\s*(?:का|के)\\s*कमर', 'होटल\\s*रूम', 'रात\\s*(?:भर\\s*साथ|बिता)', 'साथ\\s*सो', 'डेट', 'अकेले\\s*में', 'मेरे\\s*(?:होटल|कमरे)',
    // Malay
    '\\bseks(?:i)?\\b', 'bilik\\s+hotel', 'bilik\\s+saya', '\\bbermalam\\b', 'tidur\\s+(?:dengan|bersama)', '\\blucah\\b', 'temu\\s*janji', 'berdua\\s+sahaja', 'hotel\\s+saya',
    /* Round 3: "whole night" / "overnight" / "your place" / "massage after" phrasings (audit 19).
       Travel words stay allowed: "night market", "night food walk", "overnight bus/train to Chiang Mai",
       "is the market open all night?", "my hotel is near BTS Asok". */
    '\\b(?:whole|entire|full)\\s+night\\b', '\\b(?:the|a)\\s+night\\s+together\\b',
    '(?<!\\bopen\\s)(?<!\\bopens\\s)\\ball[\\s-]+night\\b(?![\\s-]*(?:market|bus|train|ferry|food|stall|caf[eé]|restaurant|shop|long\\s+at\\s+the\\s+market))',
    '\\bover[\\s-]*night\\b(?![\\s-]*(?:bus|train|sleeper|ferry|flight|coach|journey|van|boat|oats))',
    '\\bsleep[\\s-]*over\\b', '\\bsleepover\\b',
    '\\b(?:at|to|in|into|visit|inside)\\s+your\\s+(?:place|home|house|apartment|flat|condo|room)\\b', '\\byour\\s+place\\s+or\\s+mine\\b',
    '\\bmy\\s+hotel\\b.{0,40}\\b(?:come|coming|join|visit|sleep|tonight|room|bed|together|alone|drinks?)\\b',
    '\\b(?:come|coming|join|visit|sleep)\\b.{0,30}\\bmy\\s+hotel\\b',
    '\\b(?:come|coming|go|going|up)\\s+(?:back\\s+|up\\s+|over\\s+)?(?:to|into)\\s+my\\s+(?:room|hotel|condo|apartment|flat|place)\\b',
    '\\bmassage\\b.{0,25}\\b(?:after|later|tonight|together|private|room|hotel|oil|body|with\\s+(?:me|you))\\b',
    '\\b(?:give|do|get)\\s+(?:me|you)\\s+(?:a\\s+)?massage\\b', '\\bmassage\\s+(?:me|you)\\b',
    // Thai ("ตลาดเปิดทั้งคืน" = the market is open all night stays allowed)
    '(?<!เปิด)ทั้งคืน', '(?<!เปิด)ตลอดคืน', 'นอนค้าง', 'ค้าง(?:ที่|กับ)', 'ไป\\s*(?:ที่)?\\s*(?:บ้าน|คอนโด|ที่พัก)(?:คุณ|ผม|ฉัน|หนู)', 'นวดให้', 'ไปนวด.{0,10}(?:ด้วยกัน|สองคน)', 'หลัง.{0,15}ไปนวด',
    // Chinese
    '包夜', '整晚', '整夜', '陪.{0,3}(?:一晚|过夜|睡)', '去你家', '来我家',
    // Korean ("밤새 영업" = open all night stays allowed)
    '밤새(?!\\s*영업)', '외박', '(?:네|너네|당신)\\s*집(?:에서|으로|에)', '마사지\\s*해\\s*(?:줘|줄|드릴)',
    // Russian
    'на\\s+всю\\s+ночь', '(?<!(?:работает|открыт[аоы]?)\\s)всю\\s+ночь', 'ноч[её]в', 'к\\s+тебе\\s+домой', 'ко\\s+мне\\s+домой',
    // Hindi / Malay
    'पूरी\\s*रात', 'रात\\s*भर', 'sepanjang\\s+malam', '\\bsemalaman\\b', 'rumah\\s+(?:awak|kau|anda)',
  ].join('|'),
  'i',
)

/** True when a chat message asks for sex, a hotel room or staying the night (checked on raw and look-alike-folded text). */
export function isSolicitation(v: string): boolean {
  if (!v) return false
  const raw = foldDigitsAndZeroWidth(v)
  return SOLICIT_RE.test(raw) || SOLICIT_RE.test(NORM(raw))
}

/* Going around Kring (round 3, audit 19 #8): "pay you by PromptPay now to skip the Kring ticket", "book with you
   directly without the app". These are not sent. A plain question about paying at the place is fine. */
const AROUND_RE =
  /\bno\s+need\s+(?:for\s+)?(?:the\s+)?(?:app|kring)\b|\b(?:don'?t|do\s+not)\s+need\s+(?:the\s+)?(?:app|kring)\b|\bpay\s+you\s+(?:a\s+(?:bit|little)\s+)?(?:extra|more|on\s+the\s+side)\b|\b(?:skip|avoid|dodge|bypass|save\s+(?:on\s+)?)\s+(?:the\s+|a\s+|my\s+|paying\s+(?:the\s+)?)?(?:kring\s*)?(?:ticket|booking\s+fee|app\s+fee|fee)\b|\b(?:skip|avoid|bypass|cut\s+out)\s+(?:the\s+)?(?:app|kring)\b|\bwithout\s+(?:the\s+|a\s+)?(?:kring|app)(?:\s+(?:ticket|fee))?\b|\bbook\s+(?:with\s+you\s+directly|you\s+directly|directly\s+with\s+you)\b|ไม่ต้อง(?:จ่าย|ซื้อ)?\s*(?:ค่า)?ตั๋ว|จองตรง(?:กับ)?(?:คุณ|พี่|น้อง)|ไม่ต้องจองผ่านแอป|不(?:用|要)(?:买)?\s*(?:票|门票)|绕过\s*(?:app|kring|平台)|티켓\s*(?:없이|안\s*사)|앱\s*없이\s*예약|без\s+билета|в\s+обход\s+(?:приложени|kring)|tanpa\s+tiket|टिकट\s+के\s+बिना/i

/** True when a message tries to book or pay around Kring (skip the ticket, book directly). */
export function isAroundKring(v: string): boolean {
  if (!v) return false
  return AROUND_RE.test(foldDigitsAndZeroWidth(v).normalize('NFKC'))
}

/* Insults and swearing (round 2). A matching message is not sent; the chat shows a warning instead.
   English + Thai first (the audit's languages), plus the common ones in zh/ko/ru/hi/ms. Food words that look
   similar are left alone ("ตีนไก่" chicken feet, "babi" = pork in Malay, "สวนสัตว์" zoo, "เนื้อควาย"). */
const ABUSE_RE = new RegExp(
  [
    // English (also caught after look-alike folding: "f*ck", "fuk", "sh1t", "b!tch")
    '\\bf+[\\W_]*u*[\\W_]*c+[\\W_]*k+(?:ing|in|er|ers|ed|off|face|wit)?\\b', '\\bf[\\W_]*[*#@]+[\\W_]*k\\b', '\\bfu?ck\\b', '\\bfuk(?:ing)?\\b', '\\bphuck', '\\bwtf\\b', '\\bstfu\\b', '\\bmotherf',
    '\\bsh[i1!*]t(?:ty|head)?\\b', '\\bbullshit\\b', '\\bbitch(?:es|y)?\\b', '\\bb[i1!*]tch', '\\bbastards?\\b', '\\bass\\s*holes?\\b', '\\barseholes?\\b', '\\bdick\\s*head\\b', '\\bcunts?\\b',
    '\\bsluts?\\b', '\\bwhores?\\b', '\\bidiots?\\b', '\\bidiotic\\b', '\\bstupid\\b(?!\\s+question)', '\\bmorons?\\b', '\\bdumb\\s*(?:ass|fuck|bitch)?\\b', '\\bretard(?:ed)?\\b', '\\bloser\\b',
    '\\bpiss\\s+off\\b', '\\bscrew\\s+you\\b', '\\bgo\\s+to\\s+hell\\b', '\\bscum\\b',
    // Thai
    '(?<!เนื้อ|ฟาร์ม|ฝูง|เลี้ยง)ควาย(?!ป่า|ไทย|น้ำ)', 'เหี้ย', 'สัส', 'ไอ้สัตว์', 'อีสัตว์', 'อีดอก', 'ดอกทอง', 'เย็ด', 'มึง', 'ไอ้บ้า', 'อีบ้า', 'ไอ้โง่', 'อีโง่', '(?<!ไม่)โง่', 'ส้นตีน',
    'หน้าหี', '(?<![ก-ฮ])หี(?![ก-ฮ])', 'ควย', 'แม่ง(?!าน)', 'ระยำ', 'ชาติหมา', 'อีตัว', 'กะหรี่', 'ไอ้เวร', 'อีเวร', 'ไอ้ห่า', 'อีห่า', 'ไอ้หน้าโง่', 'สถุล', 'เสือก', 'ไอ้ชั่ว', 'ปัญญาอ่อน',
    // Chinese
    '傻逼', '傻b', '煞笔', '操你', '肏', '他妈的', '他媽的', '妈的', '媽的', '滚蛋', '滾蛋', '贱人', '賤人', '白痴', '混蛋', '王八蛋', '去死',
    // Korean
    '씨발', '시발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새끼', '좆', '미친놈', '미친년', '꺼져', '닥쳐', '지랄',
    // Russian
    'бля', 'сука', 'суки', 'хуй', 'хуе', 'хуё', 'пизд', '(?<![а-я])еба', '(?<![а-я])ёба', 'ебан', 'мудак', 'идиот', 'дебил', 'урод', 'шлюх',
    // Hindi (and Hinglish)
    'चूतिया', 'चुतिया', 'भेनचोद', 'बहनचोद', 'मादरचोद', 'कमीना', 'कमीनी', 'हरामी', 'गांडू', 'साला', 'कुतिया', 'बेवकूफ',
    '\\bchutiya\\b', '\\bmadarchod\\b', '\\bbe?h?enchod\\b', '\\bbhenchod\\b', '\\bharami\\b', '\\bkamina\\b', '\\bgandu\\b',
    // Malay
    '\\bbodoh\\b', '\\bsial\\b', '\\bcelaka\\b', '\\bpuki(?:mak)?\\b', '\\blancau\\b', '\\bbangsat\\b', '\\bkimak\\b', '\\bbabi\\s+(?:kau|lu|hang)\\b', '\\bpantat\\b',
  ].join('|'),
  'i',
)

/** True when a chat message contains insults or swearing (checked on raw and look-alike-folded text). */
export function isAbusive(v: string): boolean {
  if (!v) return false
  const raw = foldDigitsAndZeroWidth(v)
  return ABUSE_RE.test(raw) || ABUSE_RE.test(NORM(raw))
}

/* Paying before the meeting ("Can I pay you now by bank transfer?", "โอนมัดจำได้ไหม", "我先转账给你").
   The message is sent, and the chat repeats the safety rule: pay only at the meeting place, after check-in. */
export const PREPAY =
  /bank\s*transfer|wire\s+(?:you|the\s+money)|\btransfer\b.{0,30}\b(?:now|first|before|today|deposit|account)|\b(?:pay|send)\s+(?:you\s+)?(?:the\s+)?(?:money\s+)?(?:now|first|before|in\s+advance|upfront|up\s+front|ahead|early)\b|\bdeposit\b|\bpre-?pay|\bpay\s+(?:you\s+)?(?:now|today)\b|\bsecure\s+(?:my|the|our)\s+(?:spot|place|booking)\b.{0,20}\bpay|\bcash\b|\bpromptpay\b.{0,20}\b(?:now|first|before)|โอน|มัดจำ|จ่ายก่อน|ชำระก่อน|เงินสด|转账|轉帳|先付|预付|定金|订金|现金|現金|송금|입금|계좌|선불|미리\s*(?:결제|지불|보내)|현금|перевод|переве(?:сти|ду)|предоплат|залог|наличн|पहले\s*(?:पैसे|भुगतान)|एडवांस|advance\s+payment|ट्रांसफर|नकद|pindah(?:an)?\s+wang|bayar\s+(?:dulu|awal|sekarang)|deposit|tunai/i
