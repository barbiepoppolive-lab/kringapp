/* Explore: one screen, two panes (Experiences | Locals slide inside the same screen).
   R7 locked spec (Sections 2, 3, 4):
   - Header: 3D/4D animated Kring logo (Experiences & Locals ONLY), BKK | PTY toggle, language globe.
   - Top text tabs: Experiences | Locals (16px, active white 600 + 2px white underline).
   - Experiences: 64x64 category photo tiles -> 48px search field with 40x40 Filters icon button inside right -> When row -> calm 210px-photo cards.
   - Locals: 66px host stories row (Locals ONLY, unseen gold ring first, seen grey ring second) -> trust line + single Filters pill -> 2-column 4:5 portrait host cards with neutral outline-person placeholder. */
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import { S, update, useS } from '../core/store'
import { t, ACTS, ALIAS, SL, aTitle, hostName, baht, ph, ini, type Act } from '../core/data'
import { loadLiveActivities } from '../core/liveActivities'
import { hostInfo, speaksMine, myLangName, isBlockedAct } from '../core/hosts'
import { HostAv, HostSheet, genderWord } from './hostProfile'
import { getStoryGroups, groupKey, amHost } from '../core/stories'
import { register, go, toast } from '../core/router'
import { buzz, tick } from '../core/sound'
import { I, Ic, Head, Tabs, Sheet } from '../ui/kit'
import { searchArea, kmFromArea, areaLabel as searchAreaLabel } from '../core/places'

type City = 'bkk' | 'pty'
type WhenFilter = 'any' | 'tonight' | 'tomorrow' | 'weekend'
interface AreaInfo { en: string; th: string; city: City; lat: number; lng: number; alias: string; tags: string[] }
const AREA: Record<string, AreaInfo> = {
  eat: { en: 'Yaowarat', th: 'เยาวราช', city: 'bkk', lat: 13.7429, lng: 100.5101, alias: 'yaowarat chinatown samphanthawong เยาวราช สัมพันธวงศ์ ไชน่าทาวน์ 唐人街 耀华力 차이나타운 야오와랏 चाइनाटाउन यावोवारात яоварат чайнатаун', tags: [] },
  muay: { en: 'Lumpini', th: 'ลุมพินี', city: 'bkk', lat: 13.7314, lng: 100.5414, alias: 'lumpini lumphini silom sathorn ลุมพินี สีลม สาทร 伦披尼 룸피니 लुम्पिनी лумпини', tags: ['family'] },
  market: { en: 'Pak Khlong', th: 'ปากคลองตลาด', city: 'bkk', lat: 13.7442, lng: 100.4942, alias: 'pak khlong talat sanam chai rattanakosin old town ปากคลองตลาด สนามไชย รัตนโกสินทร์ 花市 帕空花市 빡끌롱 पाक क्लोंग пак клонг', tags: ['family'] },
  river: { en: 'Bang Krachao', th: 'บางกระเจ้า', city: 'bkk', lat: 13.6935, lng: 100.5653, alias: 'bang krachao khlong toei sukhumvit asok บางกระเจ้า คลองเตย สุขุมวิท อโศก 曼加超 素坤逸 방끄라짜오 수쿰윗 бангкрачао сукхумвит', tags: ['family'] },
  temple: { en: 'Tha Tien', th: 'ท่าเตียน', city: 'bkk', lat: 13.7464, lng: 100.4913, alias: 'tha tien riverside sunset photo walk chao phraya ท่าเตียน ริมน้ำ เจ้าพระยา ถ่ายรูป 塔田 河畔 日落 摄影 타티안 강변 노을 사진 था तियन नदी सूर्यास्त тха тьен закат река фото', tags: [] },
  oldtown: { en: 'Talat Noi', th: 'ตลาดน้อย', city: 'bkk', lat: 13.7349, lng: 100.5137, alias: 'talat noi talad noi charoen krung ตลาดน้อย เจริญกรุง 老城 嗒叻仔 딸랏노이 तलात नोई талат ной', tags: [] },
  night: { en: 'Huai Khwang', th: 'ห้วยขวาง', city: 'bkk', lat: 13.7787, lng: 100.5737, alias: 'huai khwang ratchada asok sukhumvit ห้วยขวาง รัชดา อโศก 汇权 拉差达 후아이쾅 हुआई ख्वांग хуайкхванг', tags: [] },
  cafe: { en: 'Ari', th: 'อารีย์', city: 'bkk', lat: 13.7797, lng: 100.5446, alias: 'ari aree phahon yothin อารีย์ อารี พหลโยธิน 阿黎 아리 आरी ари', tags: ['family'] },
  cook: { en: 'Silom', th: 'สีลม', city: 'bkk', lat: 13.7286, lng: 100.534, alias: 'silom sathorn bang rak สีลม สาทร บางรัก 是隆 실롬 सिलोम силом', tags: ['family'] },
}
const HOTEL_AREAS: [string, string, string][] = [['sukhumvit', 'Sukhumvit / Asok', 'สุขุมวิท / อโศก'], ['thonglor', 'Thonglor', 'ทองหล่อ'], ['siam', 'Siam', 'สยาม']]
const AREA0: AreaInfo = { en: 'Bangkok', th: 'กรุงเทพฯ', city: 'bkk', lat: 13.75, lng: 100.52, alias: '', tags: [] }
const areaOf = (a: Act): AreaInfo =>
  AREA[a.id] || {
    en: a.liveArea || AREA0.en,
    th: a.liveAreaTh || a.liveArea || AREA0.th,
    city: 'bkk',
    lat: a.meetLat ?? AREA0.lat,
    lng: a.meetLng ?? AREA0.lng,
    alias: `${a.liveArea || ''} ${a.liveAreaTh || ''}`,
    tags: [],
  }
export const areaName = (a: Act): string => (S.lang === 'th' ? areaOf(a).th : areaOf(a).en)
const TAGW: Record<string, string> = {
  halal: 'halal ฮาลาล 清真 할랄 हलाल халяль mesra',
  jain: 'jain jaina no onion no garlic เชน ไม่ใส่หัวหอม กระเทียม 耆那 无洋葱 无大蒜 자이나 जैन बिना प्याज़ बिना लहसुन джайн без лука без чеснока',
  veg: 'veg vegetarian vegan มังสวิรัติ เจ 素食 채식 비건 शाकाहारी вегетариан sayur',
  family: 'kids kid family children child เด็ก ครอบครัว 亲子 儿童 孩子 가족 아이 बच्चे परिवार дети семья kanak keluarga',
  evening: 'tonight evening คืนนี้ ตอนเย็น 今晚 晚上 오늘밤 저녁 आज रात शाम вечер сегодня malam',
}
const TEMPLE_Q = /temple|\bwat\b|wat ?(arun|pho|phra)|grand palace|palace|วัด|วัง|寺|庙|宫|사원|절|왕궁|मंदिर|महल|храм|дворец|ват |kuil|istana|ayutthaya|อยุธยา|大城|아유타야|अयुत्थया|аюттхая/i
const PATTAYA = /pattaya|พัทยา|芭提雅|芭堤雅|파타야|पटाया|паттайя|jomtien|จอมเทียน/i

const hm = (s: string): number => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
const fmt = (n: number): string => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const startOf = (a: Act): string => SL(a)[1]
export const timeRange = (a: Act): string => { const s = hm(startOf(a)); return `${fmt(s)}–${fmt(s + Math.round(a.h * 60))}` }
const tagsOf = (a: Act): string[] => {
  const x = [...areaOf(a).tags]
  if (a.halal) x.push('halal')
  if (a.veg) x.push('veg')
  if (a.jain) x.push('jain')
  if (hm(startOf(a)) >= 17 * 60) x.push('evening')
  return x
}
const qOf = (a: Act): string => {
  const tg = tagsOf(a)
  return [aTitle(a), a.th, a.host, a.hostTh, t('c_' + a.cat), ALIAS[a.id] || '', areaOf(a).en, areaOf(a).th, areaOf(a).alias,
    ...tg.map((k) => TAGW[k] || ''), a.halal ? t('halalOk') : '', a.veg ? t('vegOk') : '', a.jain ? t('jainOk') + ' ' + t('d_jain') : '', tg.includes('evening') ? t('tonight') : '']
    .join(' ').toLowerCase()
}
const km = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

type FKey = 'under' | 'women' | 'halal' | 'veg' | 'jain' | 'lang'
interface Filt { cat: string; q: string; under: boolean; women: boolean; halal: boolean; veg: boolean; jain: boolean; lang: boolean }
const FKEYS: FKey[] = ['under', 'women', 'halal', 'veg', 'jain', 'lang']
const FLABEL: Record<FKey, string> = { under: 'f_under', women: 'f_women', halal: 'halalOk', veg: 'vegOk', jain: 'jainOk', lang: 'speaksL' }
const fLabel = (k: FKey): string => (k === 'lang' ? t('speaksL', { l: myLangName() }) : t(FLABEL[k]))
export const browseDiet = (): ('halal' | 'veg' | 'jain')[] => (KEEP ? [...(KEEP.F.halal ? ['halal' as const] : []), ...(KEEP.F.veg ? ['veg' as const] : []), ...(KEEP.F.jain ? ['jain' as const] : [])] : [])
interface Keep { F: Filt; area: string | null; me: { lat: number; lng: number } | null }
let KEEP: Keep | null = null
const WK = 'kr6_fWomen'
const womenSaved = (): boolean => { try { return localStorage.getItem(WK) === '1' } catch { return false } }
const saveWomen = (on: boolean): void => { try { if (on) localStorage.setItem(WK, '1'); else localStorage.removeItem(WK) } catch { /* ignore */ } }
const keep0 = (): Keep => ({
  F: { cat: 'all', q: '', under: false, women: womenSaved(), halal: S.diet.includes('halal'), veg: S.diet.includes('veg'), jain: S.diet.includes('jain'), lang: false },
  area: null, me: null,
})

/** First start time from 17:00 on (an evening session, same cut-off as the "Tonight" word on cards). */
const eveningSlot = (a: Act): string | undefined => SL(a).find((x) => hm(x) >= 17 * 60)

const matchesWhen = (a: Act, when: WhenFilter): boolean => {
  if (when === 'any') return true
  if (when === 'tonight') return !!eveningSlot(a)
  return true
}

const ok = (F: Filt, a: Act, card: boolean, area: string | null, when: WhenFilter): boolean =>
  (F.cat === 'all' || !card || a.cat === F.cat) &&
  matchesWhen(a, when) &&
  (!F.q || F.q.split(/\s+/).every((w) => qOf(a).includes(w))) && (!F.under || a.price < 1000) &&
  (!F.women || S.gender === 'm' || a.f === 1) && (!F.halal || !!a.halal) && (!F.veg || !!a.veg) && (!F.jain || !!a.jain) &&
  (!F.lang || speaksMine(a)) && (!area || areaOf(a).en === area)

function TempleHint() {
  return (
    <button type="button" className="glass card row" id="temple-hint" data-go="tours" data-how="f" style={{ gap: 10, alignItems: 'center', textAlign: 'left', width: '100%', marginBottom: 12 }}>
      <span style={{ color: 'var(--gold2)', flex: 'none' }}><Ic p={I.shield} s={22} /></span>
      <span className="col grow" style={{ gap: 2 }}><b style={{ fontSize: 14.5 }}>{t('templeHintT')}</b><span className="small">{t('templeHintS')}</span></span>
      <Ic p={I.chev} s={16} />
    </button>
  )
}

function Heart({ a, s, style }: { a: Act; s: number; style?: CSSProperties }) {
  const on = !!S.saved[a.id]
  return (
    <button type="button" className="hrt" data-heart={a.id} aria-pressed={on} aria-label={t('saveAct', { a: aTitle(a) })} style={{ ...(on ? { color: '#FFD067' } : undefined), ...style }}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: I.heart }} />
    </button>
  )
}

/** Category photo tiles for Experiences (R7 Section 3). */
const CAT_TILES: { id: string; img?: string }[] = [
  { id: 'all' },
  { id: 'eat', img: 'yaowarat-food' },
  { id: 'market', img: 'flower-market' },
  { id: 'muay', img: 'muay-thai' },
  { id: 'river', img: 'canal-longtail' },
  { id: 'cook', img: 'cooking-class' },
]

/** Short calm specialty label for Locals 2-line subtitle. */
function localSpec(a: Act): string {
  const key = `locSpec_${a.id}`
  const tr = t(key)
  return tr !== key ? tr : t('c_' + a.cat)
}

function Explore({ start }: { start: 'exp' | 'loc' }) {
  const st = useS()
  useEffect(() => { void loadLiveActivities() }, [])
  const woman = st.gender !== 'm'
  if (!KEEP) KEEP = keep0()
  const [seg, setSeg] = useState<'exp' | 'loc'>(start)
  const [F, setF] = useState<Filt>(KEEP.F)
  const [A, setAState] = useState<Filt>(KEEP.F)
  const [area, setAreaState] = useState<string | null>(KEEP.area)
  const [meAt, setMeState] = useState<{ lat: number; lng: number } | null>(KEEP.me)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(KEEP.F.q)
  const [nearOpen, setNearOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [hostOpen, setHostOpen] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const city: City = st.city || 'bkk'
  const when: WhenFilter = st.when || 'any'

  const setA = (nf: Filt) => { setAState(nf); KEEP!.F = nf; saveWomen(nf.women) }
  const setCity = (c: City) => { update((s) => { s.city = c }) }
  const setWhen = (w: WhenFilter) => { update((s) => { s.when = w }); tick(0.55, 0.05) }
  const setArea = (x: string | null) => { setAreaState(x); KEEP!.area = x }
  const setMe = (x: { lat: number; lng: number } | null) => { setMeState(x); KEEP!.me = x }
  const applyWith = (nf: Filt) => { setF(nf); setA(nf) }
  const switchSeg = (to: 'exp' | 'loc') => {
    if (to === seg) return
    setSeg(to); tick(0.6, 0.07); buzz(8)
    try { history.replaceState(null, '', '#' + (to === 'loc' ? 'locals' : 'experiences')) } catch { /* ignore */ }
  }

  let list = ACTS.filter((a) => !isBlockedAct(a))
  if (meAt) list.sort((x, y) => km(meAt.lat, meAt.lng, areaOf(x).lat, areaOf(x).lng) - km(meAt.lat, meAt.lng, areaOf(y).lat, areaOf(y).lng))
  const pattayaAsked = city === 'pty' || PATTAYA.test(A.q)
  if (pattayaAsked) list = list.filter((a) => areaOf(a).city === 'pty')
  else list = list.filter((a) => areaOf(a).city === city)
  const qA = PATTAYA.test(A.q) ? { ...A, q: A.q.replace(PATTAYA, '').trim() } : A
  const nApplied = FKEYS.filter((k) => A[k] && (k !== 'women' || woman)).length
  const sa = searchArea(qA.q)
  const qB = sa ? { ...qA, q: sa.rest } : qA
  const dA = (a: Act): number => (sa ? kmFromArea(a, sa.area) ?? 999 : 0)
  const nearArea = (xs: Act[]): Act[] => {
    if (!sa) return xs
    const sorted = [...xs].sort((x, y) => dA(x) - dA(y))
    const inR = sorted.filter((a) => dA(a) <= sa.area.km)
    const ride = Math.max(5, sa.area.km * 1.5)
    const more = sorted.filter((a) => dA(a) > sa.area.km && dA(a) <= ride)
    const out = [...inR, ...more]
    return out.length ? out : sorted.filter((a) => dA(a) < 999).slice(0, 3)
  }
  const expAll = list.filter((a) => ok(qB, a, true, area, when))
  const fSa = searchArea(F.q)
  const liveCount = nearArea(list.filter((a) => ok(fSa ? { ...F, q: fSa.rest } : F, a, true, area, when))).length
  const areaNone = !!sa && expAll.length > 0 && !expAll.some((a) => dA(a) <= sa.area.km)
  const expShown = nearArea(expAll)
  const locShown = nearArea(list.filter((a) => ok(qB, a, false, area, 'any') && !(st.reportedClips && st.reportedClips[a.id])))
  const areaHead = sa && expShown.length > 0 ? <span className="small" id="area-q" role="status" style={{ display: 'block', margin: '0 0 10px' }}>{t(areaNone ? 'areaNone' : 'areaNear', { area: searchAreaLabel(sa.area) })}</span> : null
  const distTxt = (a: Act): string | null => (meAt ? km(meAt.lat, meAt.lng, areaOf(a).lat, areaOf(a).lng).toFixed(1) + ' km' : sa && dA(a) < 999 ? dA(a).toFixed(1) + ' km' : null)

  // stories row follows the same city and Locals filters as the host cards below it (the host's own ring always shows)
  const storyGroups = getStoryGroups().filter((g) => g.mine || locShown.some((a) => a.id === g.actId))

  const onRoot = (e: MouseEvent<HTMLDivElement>) => {
    const tg = e.target as HTMLElement
    if (tg.closest('[data-heart]')) return
    const tb = tg.closest<HTMLElement>('[data-go="experiences"]')
    if (tb) { e.stopPropagation(); switchSeg('exp'); return }
    const hb = tg.closest<HTMLElement>('[data-host]')
    if (hb) { setHostOpen(hb.dataset.host!); tick(0.6, 0.06); return }
    const k = tg.closest<HTMLElement>('[data-card]')
    if (k) {
      S.act = k.dataset.card!
      go('detail', 'r')
      update((s) => { s.from.detail = seg === 'loc' ? 'locals' : 'experiences' })
    }
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) { toast(t('nearOff'), 'err'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setArea(null); setNearOpen(false); toast(t('nearOn'), 'ok') },
      () => { setLocating(false); toast(t('nearOff'), 'err') },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  }

  /** R7 Section 3 calm activity card: 210px photo + heart only; title 17px/600; "Area · Tonight 18:30 · ฿1,000"; 24px avatar + "with Nicha · ★ 4.9". */
  const card = (a: Act) => {
    const d = distTxt(a)
    const slot = (when === 'tonight' && eveningSlot(a)) || startOf(a)
    // never "Tonight 06:30": the day word follows the real start time
    const whenTxt = when === 'tomorrow' ? t('whenTomorrow') : when === 'weekend' ? t('whenWeekend') : hm(slot) >= 17 * 60 ? t('tonight') : t('stToday')
    const priceTxt = a.isVolunteer || a.price === 0 ? t('volFree') : baht(a.price)
    return (
      <div key={a.id} className="xcard" style={{ position: 'relative' }}>
        <button type="button" data-card={a.id} data-cat={a.cat} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', textAlign: 'left' }}>
          <div className="xc-photo">
            <img src={ph(a.img)} alt="" />
          </div>
          <div className="xc-body">
            <span className="xt">{aTitle(a)}</span>
            <span className="xc-meta">
              {areaName(a)}{d ? ' · ' + d : ''} · {whenTxt} {slot} · <b>{priceTxt}</b>
            </span>
            <span className="xc-host">
              <HostAv a={a} s={24} />
              <span>{t('withHost', { host: hostName(a) })}{a.rev > 0 ? ` · ★ ${a.rating}` : ''}</span>
            </span>
          </div>
        </button>
        <Heart a={a} s={18} />
      </div>
    )
  }

  /** R7 Section 4 Locals portrait card: 2-column 4:5 (214px tall) with #1A1E38->#11142A outline-person placeholder when no portrait;
   *  name 16px/600 + blue verified tick; two 13px muted lines ("Woman host · ★ 4.9" / "Street food · Yaowarat"). */
  const tile = (a: Act) => {
    const hi = hostInfo(a)
    const customPhoto = a.id === st.act && st.prof.hostPhoto ? st.prof.hostPhoto : hi.photo ? ph(hi.photo) : undefined
    return (
      <button
        key={a.id}
        type="button"
        className="lcard"
        data-host={a.id}
        aria-haspopup="dialog"
        aria-label={t('hpOpen', { host: hostName(a) })}
      >
        <div className="lc-port">
          {customPhoto ? (
            <img src={customPhoto} alt="" />
          ) : (
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none" stroke="#3A4066" strokeWidth="1.2" aria-hidden="true">
              <circle cx="48" cy="36" r="14" />
              <path d="M22 82c4-14 14-22 26-22s22 8 26 22" />
            </svg>
          )}
        </div>
        <div className="lc-info">
          <div className="lname">
            <span>{hostName(a)}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#7381FF" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.6 2.6 5.4-5.6" fill="none" stroke="#05060D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="lmeta">{genderWord(hi)}{a.rev > 0 ? ` · ★ ${a.rating}` : ''}</div>
          <div className="lmeta">{localSpec(a)} · {areaName(a)}</div>
        </div>
      </button>
    )
  }

  const fchip = (k: FKey, label: string, ic?: string) => (
    <button key={k} type="button" className={`chip ${F[k] ? 'on' : ''}`} data-fk={k} aria-pressed={F[k]} onClick={() => { setF({ ...F, [k]: !F[k] }); tick(0.6, 0.06) }}>{ic && <Ic p={ic} s={15} />}{label}</button>
  )
  const areaLabel = area ? (S.lang === 'th' ? Object.values(AREA).find((x) => x.en === area)?.th || area : area) : null
  const pills: { k: string; label: string; off: () => void }[] = [
    ...FKEYS.filter((k) => A[k] && (k !== 'women' || woman)).map((k) => ({ k, label: fLabel(k), off: () => applyWith({ ...A, [k]: false }) })),
    ...(areaLabel ? [{ k: 'area', label: areaLabel, off: () => setArea(null) }] : []),
    ...(meAt ? [{ k: 'near', label: t('nearMe'), off: () => setMe(null) }] : []),
  ]
  const Empty = () => (
    <div className="empty" role="status">
      {pattayaAsked ? (
        <><b style={{ color: '#EEF0FA', fontSize: 16 }}>{t('pattayaSoon')}</b><br />{t('pattayaSub')}</>
      ) : ACTS.length === 0 ? (
        <><b style={{ color: '#EEF0FA', fontSize: 16 }}>กิจกรรมแรกกำลังมา เปิดตัวพฤศจิกายน</b></>
      ) : (
        t('noResults')
      )}
      {pattayaAsked && <><br /><button type="button" className="chip" style={{ marginTop: 12 }} onClick={() => { setCity('bkk'); setQ(''); applyWith({ ...A, q: '' }) }}>{t('city_bkk')}</button></>}
    </div>
  )
  const areas = Object.values(AREA).filter((x) => x.city === city)

  return (
    <div style={{ display: 'contents' }} onClick={onRoot}>
      <Head />
      <h1 className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{seg === 'loc' ? t('t_locals') : t('t_explore')}</h1>

      {/* Top text tabs: Experiences | Locals (R7 Section 2) */}
      <nav className="r7-tabs" id="seg" role="tablist" aria-label={t('t_explore')}>
        <button type="button" role="tab" className={seg === 'exp' ? 'on' : ''} data-seg="exp" aria-selected={seg === 'exp'} onClick={() => switchSeg('exp')}>{t('t_exp')}</button>
        <button type="button" role="tab" className={seg === 'loc' ? 'on' : ''} data-seg="loc" aria-selected={seg === 'loc'} onClick={() => switchSeg('loc')}>{t('t_locals')}</button>
      </nav>

      <div className="trackw"><div className={`track ${seg === 'loc' ? 'loc' : ''}`} id="track">
        {/* ==================== EXPERIENCES PANE (R7 Section 3) ==================== */}
        <div className="pane" id="pExp" aria-hidden={seg !== 'exp'} {...(seg !== 'exp' ? { inert: '' } : {})}>
          {/* 1. Category photo tiles */}
          <div className="cat-tiles" id="cats">
            {CAT_TILES.map((c) => {
              const on = A.cat === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`cat-tile ${on ? 'on' : ''}`}
                  data-c={c.id}
                  aria-pressed={on}
                  onClick={() => { tick(0.5, 0.06); applyWith({ ...A, cat: c.id }) }}
                >
                  <div className={`ct-box ${c.id === 'all' ? 'all-box' : ''}`}>
                    {c.id === 'all' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
                        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
                        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
                        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
                      </svg>
                    ) : (
                      <img src={ph(c.img!)} alt="" />
                    )}
                  </div>
                  <span className="ct-lbl">{c.id === 'all' ? t('allCat') : t('c_' + c.id)}</span>
                </button>
              )
            })}
          </div>

          {/* 2. Search field with Filters icon button inside right */}
          <div style={{ padding: '10px 0 0' }}>
            <div className="search">
              <Ic p={I.search} s={18} />
              <input
                id="q"
                type="search"
                placeholder={t('searchR7')}
                aria-label={t('search')}
                autoComplete="off"
                value={q}
                onChange={(e) => { setQ(e.target.value); applyWith({ ...F, q: e.target.value.trim().toLowerCase() }) }}
              />
              {q && (
                <button type="button" aria-label={t('clearSearch')} onClick={() => { setQ(''); applyWith({ ...F, q: '' }) }} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', color: '#9AA0BF' }}>
                  <Ic p={I.close} s={15} />
                </button>
              )}
              <button
                type="button"
                className="fbtn-in"
                id="fopen"
                aria-label={t('filters')}
                aria-haspopup="dialog"
                onClick={() => { setF(A); setOpen(true); tick(0.6, 0.07) }}
              >
                <Ic p={I.filter} s={18} />
                {nApplied > 0 && <span className="cnt" id="fcnt">{nApplied}</span>}
              </button>
            </div>
          </div>

          {/* 3. When row: Any day · Tonight · Tomorrow · This weekend (+ Area picker button) */}
          <div className="when-row" role="group" aria-label={t('whenLabel')}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#9AA0BF', marginRight: 2, flex: 'none' }}>{t('whenLabel')}</span>
            {([
              ['any', 'whenAny'],
              ['tonight', 'whenTonight'],
              ['tomorrow', 'whenTomorrow'],
              ['weekend', 'whenWeekend'],
            ] as [WhenFilter, string][]).map(([w, labelKey]) => (
              <button
                key={w}
                type="button"
                className={when === w ? 'on' : ''}
                aria-pressed={when === w}
                data-when={w}
                onClick={() => setWhen(w)}
              >
                {t(labelKey)}
              </button>
            ))}
            <button
              type="button"
              id="nearby-btn"
              className={area || meAt ? 'on' : ''}
              aria-pressed={!!(area || meAt)}
              aria-haspopup="dialog"
              onClick={() => { tick(0.5, 0.06); setNearOpen(true) }}
              style={{ marginLeft: 'auto', gap: 4 }}
            >
              <Ic p={I.pin} s={14} />{areaLabel || (meAt ? t('nearMe') : t('areaBtn'))}
            </button>
          </div>

          {pills.length > 0 && <div className="chips" style={{ marginBottom: 10 }} aria-label={t('filters')}>{pills.map((p) => (
            <button key={p.k} type="button" className="chip on" aria-label={t('rmFilter', { f: p.label })} onClick={() => { p.off(); tick(0.5, 0.05) }}>{p.label}<i aria-hidden="true" style={{ fontStyle: 'normal', marginLeft: 4 }}>×</i></button>))}</div>}

          {TEMPLE_Q.test(A.q) && <TempleHint />}
          {areaHead}

          {/* 4. Activity cards */}
          <div style={{ paddingTop: 4 }}>
            {expShown.map(card)}
          </div>
          {expShown.length === 0 && !TEMPLE_Q.test(A.q) && <Empty />}
          <button type="button" className="sharebar" id="host-own" aria-haspopup="dialog" style={{ margin: '8px 0 0', width: '100%' }} onClick={() => setShareOpen(true)}>
            <i><Ic p={I.plus} s={20} /></i>
            <span className="col grow"><b>{t('hostOwnT')}</b><span className="small">{t('hostOwnS')}</span></span>
            <Ic p={I.chev} s={18} />
          </button>
        </div>

        {/* ==================== LOCALS PANE (R7 Section 4) ==================== */}
        <div className="pane" id="pLoc" aria-hidden={seg !== 'loc'} {...(seg !== 'loc' ? { inert: '' } : {})}>
          {/* 1. Host stories row (Locals ONLY, never on Experiences) */}
          <div className="stories-row" id="locals-stories" aria-label={t('storiesRowLabel')}>
            {amHost() && (
              <button
                type="button"
                className="st-item"
                id="st-add-own"
                onClick={() => { update((s) => { s.from['story-create'] = 'locals' }); go('story-create', 'b') }}
              >
                <div className="st-ring">
                  <div className="st-in">
                    {st.prof.hostPhoto ? <img src={st.prof.hostPhoto} alt="" /> : <span style={{ fontWeight: 600, color: '#C9CDE6' }}>{ini(st.prof.name || 'H')}</span>}
                  </div>
                  <span className="st-plus" aria-hidden="true">+</span>
                </div>
                <span className="st-lbl">{t('stPostStory')}</span>
              </button>
            )}
            {storyGroups.map((g) => {
              const nm = st.lang === 'th' ? g.hostTh : g.host
              return (
                <button
                  key={groupKey(g)}
                  type="button"
                  className={`st-item ${g.unseen ? 'unseen' : ''}`}
                  data-story-host={groupKey(g)}
                  onClick={() => {
                    update((s) => { s.storyHost = groupKey(g); s.storyIdx = 0 })
                    tick(0.6, 0.05)
                    go('story', 'f')
                  }}
                >
                  <div className={`st-ring ${g.unseen ? 'unseen' : ''}`}>
                    <div className="st-in">
                      <img src={g.coverUrl} alt="" />
                    </div>
                  </div>
                  <span className="st-lbl">{g.mine ? t('stYourStory') : nm}</span>
                </button>
              )
            })}
          </div>

          {/* 2. Trust line + single Filters pill (no Everyone / Women / Hindi chips) */}
          <div className="loc-bar">
            <span className="loc-trust">{t('localsTrustLine')}</span>
            <button
              type="button"
              className="fbtn"
              id="fopen-loc"
              aria-haspopup="dialog"
              onClick={() => { setF(A); setOpen(true); tick(0.6, 0.07) }}
            >
              <Ic p={I.filter} s={15} />
              <span>{nApplied > 0 ? `${t('filters')} · ${nApplied}` : t('filters')}</span>
            </button>
          </div>

          {pills.length > 0 && <div className="chips" style={{ marginBottom: 10 }}>{pills.map((p) => (
            <button key={p.k} type="button" className="chip on" aria-label={t('rmFilter', { f: p.label })} onClick={() => { p.off(); tick(0.5, 0.05) }}>{p.label}<i aria-hidden="true" style={{ fontStyle: 'normal', marginLeft: 4 }}>×</i></button>))}</div>}

          {TEMPLE_Q.test(A.q) && <TempleHint />}
          {areaHead}

          {/* 3. 2-column 4:5 portrait host cards */}
          <div className="lgrid" id="locals-grid">{locShown.map(tile)}</div>
          {locShown.length === 0 && !TEMPLE_Q.test(A.q) && <Empty />}
          <button type="button" className="sharebar" id="host-own-loc" aria-haspopup="dialog" style={{ margin: '18px 0 0', width: '100%' }} onClick={() => setShareOpen(true)}>
            <i><Ic p={I.plus} s={20} /></i>
            <span className="col grow"><b>{t('hostOwnT')}</b><span className="small">{t('hostOwnS')}</span></span>
            <Ic p={I.chev} s={18} />
          </button>
        </div>
      </div></div>

      <Sheet open={nearOpen} onClose={() => setNearOpen(false)} label={t('nearTitle')}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t('nearTitle')}</h2>
        <span className="small">{t('nearWhy')}</span>
        <button type="button" className="btn gold" id="near-me-btn" disabled={locating} onClick={useMyLocation}>{locating ? <span className="spin" /> : <><Ic p={I.loc} s={18} />{t('nearUse')}</>}</button>
        <span className="eyebrow">{t('nearPick')}</span>
        <div className="chips" id="area-chips">
          <button type="button" className={`chip ${!area ? 'on' : ''}`} aria-pressed={!area} onClick={() => { setArea(null); setNearOpen(false) }}>{t('allAreas')}</button>
          {areas.map((x) => (
            <button key={x.en} type="button" className={`chip ${area === x.en ? 'on' : ''}`} aria-pressed={area === x.en} lang={S.lang === 'th' ? 'th' : 'en'}
              onClick={() => { setArea(x.en); setMe(null); setNearOpen(false); tick(0.6, 0.06) }}>{S.lang === 'th' ? x.th : x.en}</button>
          ))}
          {city === 'bkk' && HOTEL_AREAS.map(([w, en, th]) => (
            <button key={w} type="button" className={`chip ${A.q === w ? 'on' : ''}`} aria-pressed={A.q === w} data-near-q={w} lang={S.lang === 'th' ? 'th' : 'en'}
              onClick={() => { setArea(null); setMe(null); setQ(S.lang === 'th' ? th : en); applyWith({ ...A, q: w }); setNearOpen(false); tick(0.6, 0.06) }}>{S.lang === 'th' ? th : en}</button>
          ))}
        </div>
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} label={t('filtersTitle')}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t('filtersTitle')}</h2>
        <div className="chips" id="fchips">
          {fchip('under', t('f_under'))}
          {woman && fchip('women', t('f_women'), I.shield)}
          {fchip('halal', t('halalOk'))}
          {fchip('veg', t('vegOk'))}
          {fchip('jain', t('jainOk'))}
          {fchip('lang', fLabel('lang'), I.globe)}
        </div>
        {F.lang && !ACTS.some(speaksMine) && <span className="small" role="status">{t('noLangYet', { l: myLangName() })}</span>}
        <button type="button" className="btn gold" id="fapply" onClick={() => { setA(F); setOpen(false); tick(0.8, 0.08) }}>{t('apply', { n: liveCount })}</button>
      </Sheet>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} label={t('hostOwnT')}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t('hostOwnT')}</h2>
        <span className="lead" style={{ fontSize: 14.5 }}>{t('hostOwnS')}</span>
        <span className="small">{t('hostOwnBody')}</span>
        <button type="button" className="btn gold" id="host-own-go" data-go="hverify" onClick={() => setShareOpen(false)}>{t('hostOwnGo')}</button>
        <button type="button" className="btn ghost" onClick={() => setShareOpen(false)}>{t('hostOwnNo')}</button>
      </Sheet>

      {hostOpen && (() => { const ha = ACTS.find((x) => x.id === hostOpen)!; return (
        <HostSheet a={ha} open onClose={() => setHostOpen(null)}
          onSee={() => { setHostOpen(null); S.act = ha.id; go('detail', 'r'); update((x) => { x.from.detail = 'locals' }) }} />
      ) })()}
      <Tabs active={seg === 'loc' ? 'locals' : 'experiences'} />
    </div>
  )
}

const Experiences = () => <Explore start="exp" />
const Locals = () => <Explore start="loc" />

register(
  { id: 'experiences', flow: 't', title: 'Explore', C: Experiences },
  { id: 'locals', flow: 't', title: 'Locals', C: Locals },
)
