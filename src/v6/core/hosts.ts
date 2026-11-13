/* Host profile overlay for the demo hosts (area E). data.ts (area A) keeps the activity rows; this file adds what the
   guest needs to judge a host: gender (from Act.f, never guessed), a photo when one exists, when they started,
   what Kring checked, languages vs. the viewer's language, and a few sample reviews.
   Sample reviews are preview-only demo content: in live mode they are hidden until real reviews come from the server. */
import { S, type Lang } from './store'
import { LN, isProdBuild, type Act } from './data'

export type HostGender = 'f' | 'm'
export interface Review { by: string; from: string; when: string; stars: number; text: string; lang: string }
export interface HostInfo {
  /** woman or man host. Taken from Act.f (1 = woman), which the host's verified ID sets. */
  g: HostGender
  /** portrait photo (file name under v6/photos), when the host uploaded one. None of the demo hosts has one yet. */
  photo?: string
  /** first month hosting on Kring, YYYY-MM */
  since: string
  /** checks Kring did: id = ID card, face = face matches ID, phone = Thai phone number, place = meets only at public places */
  checks: ('id' | 'face' | 'phone' | 'place')[]
  reviews: Review[]
}

const R = (by: string, from: string, when: string, stars: number, lang: string, text: string): Review => ({ by, from, when, stars, lang, text })
const ALL: HostInfo['checks'] = ['id', 'face', 'phone', 'place']

/** keyed by activity id (one host per activity in the demo data) */
export const HOSTS: Record<string, Omit<HostInfo, 'g'>> = {
  eat: { since: '2026-06', checks: ALL, reviews: [
    R('Hannah', 'UK', '2026-10', 5, 'en', 'Nicha knew every stall owner. We ate far too much and she made sure I had veggie options.'),
    R('李娜', 'CN', '2026-10', 5, 'zh', '路线很清楚，集合点就在地铁口，很安心。'),
    R('Ploy', 'TH', '2026-09', 5, 'th', 'พาไปร้านที่คนแถวนั้นกินจริงๆ คุ้มมาก'),
  ] },
  muay: { since: '2026-07', checks: ALL, reviews: [
    R('Alexei', 'RU', '2026-10', 5, 'ru', 'Хорошая разминка, Beam объясняет понятно, по-русски знает основные слова.'),
    R('Sam', 'AU', '2026-09', 5, 'en', 'Proper beginner session in the park. Gloves and pads were provided.'),
    R('Mai', 'TH', '2026-09', 4, 'th', 'สนุก เหนื่อยดี เหมาะกับมือใหม่'),
  ] },
  market: { since: '2026-06', checks: ALL, reviews: [
    R('Ji-woo', 'KR', '2026-10', 5, 'ko', '새벽 꽃시장 분위기가 최고였어요. 사진 스팟도 알려 줬어요.'),
    R('Emma', 'NZ', '2026-10', 5, 'en', 'Worth the early start. Mint was patient and easy to find at the exit.'),
    R('Nan', 'TH', '2026-08', 5, 'th', 'ตื่นเช้าแต่คุ้ม ได้พวงมาลัยกลับบ้านด้วย'),
  ] },
  river: { since: '2026-08', checks: ALL, reviews: [
    R('Tom', 'UK', '2026-10', 5, 'en', 'Gentle ride, lots of shade and stops. Golf checked the bikes before we left.'),
    R('Anya', 'RU', '2026-09', 4, 'ru', 'Красиво и спокойно, только жарко днём.'),
    R('Wei', 'SG', '2026-09', 5, 'en', 'Great escape from the city. The boat crossing was easy.'),
  ] },
  temple: { since: '2026-05', checks: ALL, reviews: [
    R('Meera', 'IN', '2026-10', 5, 'hi', 'शाम की सैर बहुत सुंदर थी, नोक ने नदी किनारे फ़ोटो की सबसे अच्छी जगहें दिखाईं।'),
    R('Rachel', 'US', '2026-10', 5, 'en', 'Lovely slow walk by the river at sunset. Nok made me feel safe the whole time.'),
    R('Aom', 'TH', '2026-09', 5, 'th', 'เดินสบายๆ วิวสวยมาก'),
  ] },
  oldtown: { since: '2026-07', checks: ALL, reviews: [
    R('Aarav', 'IN', '2026-10', 5, 'en', 'Ken volunteers and it shows: no rush, lots of stories about the old shophouses.'),
    R('Kenji', 'JP', '2026-09', 5, 'en', 'Started exactly on time. Easy pace.'),
    R('Fah', 'TH', '2026-09', 4, 'th', 'ได้รู้ประวัติตลาดน้อยเยอะเลย'),
  ] },
  night: { since: '2026-06', checks: ALL, reviews: [
    R('王伟', 'CN', '2026-10', 5, 'zh', 'Kwan 会说中文，点菜很方便。'),
    R('Daniel', 'DE', '2026-10', 5, 'en', 'Fun evening, good pace, she told us which stalls take QR.'),
    R('Bee', 'TH', '2026-09', 5, 'th', 'อร่อยทุกร้าน ไม่ต้องต่อคิวนาน'),
  ] },
  cafe: { since: '2026-08', checks: ALL, reviews: [
    R('Aisyah', 'MY', '2026-10', 5, 'ms', 'Kafe pilihan Bank sangat sedap dan dia faham keperluan halal saya.'),
    R('Ben', 'UK', '2026-10', 5, 'en', 'Relaxed afternoon, short walks between cafés.'),
    R('Pim', 'TH', '2026-09', 5, 'th', 'ขนมไทยอร่อย ร้านน่ารักทุกร้าน'),
  ] },
  cook: { since: '2026-05', checks: ALL, reviews: [
    R('Fatima', 'AE', '2026-10', 5, 'en', 'No pork or alcohol, a clean kitchen, and Fon explained every step.'),
    R('Su-bin', 'KR', '2026-10', 5, 'ko', '그린커리를 처음부터 만들었어요. 레시피도 받았어요.'),
    R('Mark', 'US', '2026-09', 5, 'en', 'Small group, hands-on, we ate everything we cooked.'),
  ] },
}
const DEFAULT: Omit<HostInfo, 'g'> = { since: '2026-09', checks: ['id', 'face', 'phone', 'place'], reviews: [] }

export const hostInfo = (a: Act): HostInfo => {
  const base = isProdBuild() ? DEFAULT : (HOSTS[a.id] || DEFAULT)
  return { ...base, g: a.f === 1 ? 'f' : 'm' }
}

/** "First 3 bookings: may bring a friend" only applies while the host really is new (fewer than 3 reviews). */
export const friendApplies = (a: Act): boolean => !!a.bringFriendFirst3 && a.rev < 3

/** The viewer's own language as a host-language code. Malay is MS (never silently English). */
export const MYLANG: Record<Lang, string> = { en: 'EN', zh: 'ZH', ko: 'KO', hi: 'HI', ru: 'RU', ms: 'MS', th: 'TH' }
const MS_NAME: Record<Lang, string> = { en: 'Malay', zh: '马来语', ko: '말레이어', hi: 'मलय', ru: 'малайский', ms: 'Bahasa Melayu', th: 'มลายู' }
/** Name of a language code in the viewer's language. */
export const langName = (code: string): string => (code === 'MS' ? MS_NAME[S.lang] : LN[code]?.[S.lang] || code)
/** The viewer's own language, named in the viewer's language. */
export const myLangName = (): string => langName(MYLANG[S.lang])
export const speaksMine = (a: Act): boolean => a.langs.includes(MYLANG[S.lang])

/** Blocked hosts (block state set in chat, area C: ids are 'host:' + activity id). Read from the store directly. */
export const isBlockedAct = (a: Act): boolean => (S.blocked || []).some((b) => b.id === 'host:' + a.id)

/** Avatar colours per host: a stable pair from the name (nicer than one flat colour for everyone). */
const TONES: [string, string][] = [['#4656FF', '#1A2280'], ['#FF7A59', '#A83A1E'], ['#2BB673', '#0F6B40'], ['#C05BFF', '#5B1F8F'], ['#FFB21E', '#B86E00'], ['#1FB6D9', '#0B5E78'], ['#FF5C8A', '#9A1F45']]
export const toneOf = (name: string): [string, string] => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length] }
