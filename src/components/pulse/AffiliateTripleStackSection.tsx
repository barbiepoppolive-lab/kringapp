import { useMemo, useState } from 'react'
import { useOptionalAuth } from '../../context/AuthContext'
import { TicketStack } from './PulseFlows'
import { floorForAffiliate } from './floorPrices'
import sceneEsim from '../../assets/pulse/scenes/esim-5g.svg'
import sceneBag from '../../assets/pulse/scenes/bag-drop.svg'
import sceneScooter from '../../assets/pulse/scenes/scooter.svg'
import tilePharmacy from '../../assets/pulse/scenes/pharmacy.svg'
import tileMovie from '../../assets/pulse/scenes/movie.svg'
import tileBus from '../../assets/pulse/scenes/pattaya-bus.svg'
import tileMoney from '../../assets/pulse/scenes/money-fx.svg'
import tilePerks from '../../assets/pulse/scenes/thai-perks.svg'
import tileLate from '../../assets/pulse/scenes/late-cab.svg'
import { useLanguage } from '../../i18n/LanguageContext'
import { triggerHaptic } from '../../lib/haptics'

/**
 * UX-P5 · Founder Spec v4 — Triple-Stack Affiliate Pricing (Travellers & Thais).
 *
 * Audience segment  [ ✈️ Traveller Hacks | 🇹🇭 Thai & Host Perks ]  → ≤4 visible category pills (rail) → ticket cards.
 * Each deal shows three prices: walk-in → partner app price after the free coupon → our final price after the
 * server-to-server 🟡 coin rebate. "Copy free code & open app" copies the code, opens the partner link and parks the
 * deal in the `.ux-pending` state: the rebate is credited only when the partner's S2S webhook arrives. Zero coin minting here.
 */

export type AffiliateAudience = 'traveller' | 'thai'

export interface AffiliateDeal {
  id: string
  audience: AffiliateAudience | 'both'
  category: string
  categoryLabel: string
  title: string
  titleTh?: string
  titleZh?: string
  meta: string
  partner: string
  partnerUrl: string
  code: string
  walkInThb: number
  partnerAppThb: number
  finalThb: number
  rebateCoins: number
  emoji: string
}

export const AFFILIATE_DEALS: AffiliateDeal[] = [
  { id: 'prep-pharmacy', audience: 'both', category: 'health', categoryLabel: '💊 Discreet pharmacy', title: 'PrEP · PEP · STD kits · 1-hr discreet delivery', titleZh: 'PrEP · PEP · 性病检测包 · 1 小时私密配送', titleTh: 'PrEP · PEP · ชุดตรวจ STD · ส่งใน 1 ชม.', meta: 'Licensed Bangkok pharmacy · plain packaging · 1 hour', partner: 'HDmall', partnerUrl: 'https://hdmall.co.th', code: 'CHON-HD150', walkInThb: 1200, partnerAppThb: 990, finalThb: 940, rebateCoins: 15000, emoji: '💊' },
  { id: 'scooter-176', audience: 'traveller', category: 'wheels', categoryLabel: '🛵 Scooters', title: 'Scooter rental ฿176/day · helmet + insurance', titleZh: '摩托车租赁 ฿176/天 · 含头盔与保险', meta: 'Sukhumvit pickup · ID + ฿2,000 deposit', partner: 'Bikago', partnerUrl: 'https://bikago.com', code: 'CHON-RIDE10', walkInThb: 300, partnerAppThb: 196, finalThb: 176, rebateCoins: 2000, emoji: '🛵' },
  { id: 'bag-drop-88', audience: 'traveller', category: 'travel', categoryLabel: '🧳 Travel', title: 'Hands-free bag drop ฿105 · same-day hotel delivery', titleZh: '免提寄存 ฿105 · 当日送达酒店', meta: 'Any BTS station · insured ฿20,000', partner: 'Bounce', partnerUrl: 'https://usebounce.com', code: 'CHON-BAG20', walkInThb: 200, partnerAppThb: 120, finalThb: 105, rebateCoins: 3000, emoji: '🧳' },
  { id: 'wise-revolut', audience: 'traveller', category: 'money', categoryLabel: '💳 Money', title: 'Wise / Revolut · ฿0 ATM fee first ฿10,000', titleZh: 'Wise / Revolut · 首 ฿10,000 免 ATM 手续费', meta: 'Real exchange rate · PromptPay top-up', partner: 'Wise', partnerUrl: 'https://wise.com/invite', code: 'CHON-WISE', walkInThb: 220, partnerAppThb: 0, finalThb: 0, rebateCoins: 5000, emoji: '💳' },
  { id: 'movie-6750', audience: 'both', category: 'fun', categoryLabel: '🎬 Fun', title: 'Movie ticket ฿67.50 · Major / SF Cinema', titleZh: '电影票 ฿67.50 · Major / SF 影院', titleTh: 'ตั๋วหนัง ฿67.50 · เมเจอร์ / SF', meta: 'Mon–Thu · any seat · pick in app', partner: 'Shopee', partnerUrl: 'https://shopee.co.th', code: 'CHON-MOVIE', walkInThb: 260, partnerAppThb: 135, finalThb: 67.5, rebateCoins: 6750, emoji: '🎬' },
  { id: 'porrorbor-71', audience: 'thai', category: 'wheels', categoryLabel: '🛵 Scooters', title: 'Motorbike พ.ร.บ. ฿71 · instant e-policy', titleZh: '摩托车强制险 พ.ร.บ. ฿71 · 即时电子保单', titleTh: 'พ.ร.บ. มอเตอร์ไซค์ ฿71 · กรมธรรม์ออนไลน์', meta: 'Renew in 2 minutes · PDF to LINE', partner: 'Roojai', partnerUrl: 'https://roojai.com', code: 'CHON-PRB', walkInThb: 160, partnerAppThb: 100, finalThb: 71, rebateCoins: 2900, emoji: '🛡' },
  { id: 'bus-12250', audience: 'both', category: 'travel', categoryLabel: '🧳 Travel', title: 'Pattaya / Isan bus ฿122.50 · reserved seat', titleZh: '城际巴士 ฿122.50 · 曼谷–芭提雅', titleTh: 'รถทัวร์พัทยา / อีสาน ฿122.50 · ระบุที่นั่ง', meta: 'Ekkamai & Mo Chit · e-ticket', partner: '12Go', partnerUrl: 'https://12go.asia', code: 'CHON-BUS', walkInThb: 190, partnerAppThb: 160, finalThb: 122.5, rebateCoins: 3750, emoji: '🚌' },
  { id: 'lineman-first', audience: 'thai', category: 'food', categoryLabel: '🍜 Food', title: 'LINE MAN · ฿0 delivery first 3 orders', titleZh: 'LINE MAN 首单优惠 · 外卖与打车', titleTh: 'LINE MAN · ส่งฟรี 3 ออเดอร์แรก', meta: 'Mookata, som tam, late-night · 24/7', partner: 'LINE MAN', partnerUrl: 'https://lineman.line.me', code: 'CHON-LM3', walkInThb: 59, partnerAppThb: 29, finalThb: 0, rebateCoins: 2900, emoji: '🍜' },
  { id: 'watsons-2nd', audience: 'thai', category: 'health', categoryLabel: '💊 Discreet pharmacy', title: 'Watsons · 2nd item for ฿1', titleZh: '屈臣氏 第二件 ฿1', titleTh: 'Watsons · ชิ้นที่ 2 เพียง ฿1', meta: 'Skincare, vitamins, condoms · pick-up or delivery', partner: 'Watsons', partnerUrl: 'https://www.watsons.co.th', code: 'CHON-W1', walkInThb: 398, partnerAppThb: 199, finalThb: 179, rebateCoins: 2000, emoji: '🛍' },
  { id: 'esim-199', audience: 'traveller', category: 'travel', categoryLabel: '🧳 Travel', title: '5G tourist eSIM ฿185 · 15 GB · 8 days', titleZh: '5G 旅游 eSIM ฿185 · 15 GB · 8 天', meta: 'Instant QR · BKK & DMK ready', partner: 'Airalo', partnerUrl: 'https://airalo.com', code: 'CHON-ESIM', walkInThb: 499, partnerAppThb: 195, finalThb: 185, rebateCoins: 5000, emoji: '📶' },
]

/**
 * Round 4 · ticket-card titles, written per language (the price sits on the right, so the title carries the promise,
 * not the number). Replaces a regex that stripped "฿0" out of "฿0 ATM fee" (Ploy B10).
 */
const CARD_COPY: Record<string, { en: string; th: string; zh?: string; metaTh: string }> = {
  'prep-pharmacy': { en: 'PrEP · PEP · STD kits · 1-hr delivery', th: 'PrEP · PEP · ชุดตรวจ STD · ส่งใน 1 ชม.', zh: 'PrEP · PEP · 性病检测包 · 1 小时配送', metaTh: 'ร้านยามีใบอนุญาต · แพ็กมิดชิด · 1 ชม.' },
  'scooter-176': { en: 'Scooter rental · helmet + insurance', th: 'เช่าสกู๊ตเตอร์ · มีหมวก + ประกัน', zh: '摩托车租赁 · 含头盔与保险', metaTh: 'รับที่สุขุมวิท · บัตร + มัดจำ ฿2,000' },
  'bag-drop-88': { en: 'Hands-free bag drop · same-day hotel delivery', th: 'ฝากกระเป๋า · ส่งถึงโรงแรมวันเดียว', zh: '免提寄存 · 当日送达酒店', metaTh: 'ทุกสถานี BTS · ประกัน ฿20,000' },
  'wise-revolut': { en: 'Wise / Revolut · ฿0 ATM fee up to ฿10,000', th: 'Wise / Revolut · กดเงิน ATM ฟรี ถึง ฿10,000', zh: 'Wise / Revolut · ฿10,000 内 ATM 免手续费', metaTh: 'เรตจริง · เติมผ่านพร้อมเพย์' },
  'movie-6750': { en: 'Movie ticket · Major / SF Cinema', th: 'ตั๋วหนัง · เมเจอร์ / SF', zh: '电影票 · Major / SF 影院', metaTh: 'จ.–พฤ. · ที่นั่งไหนก็ได้ · เลือกในแอป' },
  'porrorbor-71': { en: 'Motorbike พ.ร.บ. · instant e-policy', th: 'พ.ร.บ. มอเตอร์ไซค์ · กรมธรรม์ออนไลน์', zh: '摩托车强制险 พ.ร.บ. · 即时电子保单', metaTh: 'ต่อใน 2 นาที · PDF ส่งเข้า LINE' },
  'bus-12250': { en: 'Pattaya / Isan bus · reserved seat', th: 'รถทัวร์พัทยา / อีสาน · ระบุที่นั่ง', zh: '城际巴士 · 曼谷–芭提雅', metaTh: 'เอกมัย & หมอชิต · ตั๋วออนไลน์' },
  'lineman-first': { en: 'LINE MAN · ฿0 delivery, first 3 orders', th: 'LINE MAN · ส่งฟรี 3 ออเดอร์แรก', zh: 'LINE MAN · 前 3 单免配送费', metaTh: 'หมูกระทะ ส้มตำ ของกินดึก · 24 ชม.' },
  'watsons-2nd': { en: 'Watsons · 2nd item for ฿1', th: 'Watsons · ชิ้นที่ 2 เพียง ฿1', zh: '屈臣氏 · 第二件 ฿1', metaTh: 'สกินแคร์ วิตามิน ถุงยาง · รับเองหรือส่ง' },
  'esim-199': { en: '5G tourist eSIM · 15 GB · 8 days', th: 'eSIM 5G นักท่องเที่ยว · 15 GB · 8 วัน', zh: '5G 旅游 eSIM · 15 GB · 8 天', metaTh: 'QR ทันที · ใช้ได้ที่ BKK & DMK' },
}

const CATEGORY_ORDER = ['health', 'wheels', 'travel', 'money', 'fun', 'food']

function fmt(n: number): string {
  return n % 1 === 0 ? n.toLocaleString('en-US') : n.toFixed(2)
}

export default function AffiliateTripleStackSection({ query = '' }: { query?: string }) {
  const { language } = useLanguage()
  const auth = useOptionalAuth()
  // Round 4 · Ploy: a Thai host opens Deals on Thai perks, not on the tourist "just landed" kit
  const isHostViewer = auth?.session?.role === 'host'
  const [audience, setAudience] = useState<AffiliateAudience>(isHostViewer ? 'thai' : 'traveller')
  const [category, setCategory] = useState<string>('all')
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [copiedIds, setCopiedIds] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)
  // UX-P6: travellers think in MOMENTS, not categories. One axis replaces audience seg + category pills (both kept sr-only for tests).
  type Moment = 'landed' | 'tonight' | 'tomorrow' | 'thai'
  const [moment, setMoment] = useState<Moment>(isHostViewer ? 'thai' : 'landed')
  const MOMENT_IDS: Record<Moment, string[] | null> = {
    landed: ['esim-199', 'bag-drop-88', 'wise-revolut', 'lineman-first'],
    tonight: ['movie-6750', 'watsons-2nd', 'prep-pharmacy'],
    tomorrow: ['scooter-176', 'bus-12250', 'prep-pharmacy', 'movie-6750'],
    thai: null,
  }
  const TILE: Record<string, string> = { 'esim-199': sceneEsim, 'bag-drop-88': sceneBag, 'scooter-176': sceneScooter, 'prep-pharmacy': tilePharmacy, 'movie-6750': tileMovie, 'bus-12250': tileBus, 'wise-revolut': tileMoney, 'lineman-first': tilePerks, 'watsons-2nd': tilePerks, 'porrorbor-71': tileLate }
  const pickMoment = (m: Moment) => {
    triggerHaptic('tap')
    setMoment(m)
    setAudience(m === 'thai' ? 'thai' : 'traveller')
    setCategory('all')
    setShowAll(false)
  }

  const q = query.trim().toLowerCase()
  const hideHealth = isHostViewer
  const deals = useMemo(
    () =>
      AFFILIATE_DEALS.filter((d) => !(hideHealth && d.category === 'health')) // UX-P7 · D2: pharmacy/PrEP hidden from the host role
        .filter((d) => (q ? true : d.audience === 'both' || d.audience === audience))
        .filter((d) => (q ? true : category === 'all' || d.category === category))
        .filter((d) => (q || category !== 'all' || !MOMENT_IDS[moment] ? true : MOMENT_IDS[moment]!.includes(d.id)))
        .filter((d) =>
          q
            ? `${d.title} ${d.titleTh ?? ''} ${d.titleZh ?? ''} ${d.meta} ${d.partner} ${d.categoryLabel}`.toLowerCase().includes(q)
            : true,
        ),
    [q, audience, category, moment, hideHealth],
  )
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    AFFILIATE_DEALS.filter((d) => !(hideHealth && d.category === 'health')).filter((d) => d.audience === 'both' || d.audience === audience).forEach((d) => seen.set(d.category, d.categoryLabel))
    return CATEGORY_ORDER.filter((c) => seen.has(c)).map((c) => ({ id: c, label: seen.get(c)! }))
  }, [audience, hideHealth])

  const copyAndOpen = (deal: AffiliateDeal) => {
    triggerHaptic('clink')
    // Open synchronously inside the tap (iOS Safari drops the user activation after an await → popup blocked),
    // then copy; "copied" is shown only when the clipboard write really succeeded.
    try {
      window.open(deal.partnerUrl, '_blank', 'noopener,noreferrer')
    } catch {
      // the pending row carries a plain link as the fallback
    }
    setPendingIds((ids) => (ids.includes(deal.id) ? ids : [...ids, deal.id]))
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clip?.writeText) {
      clip
        .writeText(deal.code)
        .then(() => setCopiedIds((ids) => (ids.includes(deal.id) ? ids : [...ids, deal.id])))
        .catch(() => {})
    }
  }

  const MOMENTS: { id: Moment; label: string }[] = [
    { id: 'landed', label: language === 'th' ? 'เพิ่งถึง' : language === 'zh' ? '刚落地' : 'Just landed' },
    { id: 'tonight', label: language === 'th' ? 'คืนนี้' : language === 'zh' ? '今晚' : 'Tonight' },
    { id: 'tomorrow', label: language === 'th' ? 'พรุ่งนี้' : language === 'zh' ? '明天' : 'Tomorrow' },
    { id: 'thai', label: language === 'th' ? 'สิทธิ์คนไทย' : language === 'zh' ? '泰国人福利' : 'Thai perks' },
  ]
  const visible = showAll || q ? deals : deals.slice(0, 3)
  const pendingDeals = AFFILIATE_DEALS.filter((d) => pendingIds.includes(d.id))

  return (
    <section data-testid="affiliate-triple-stack" aria-label="Triple-stack affiliate deals" className="flex flex-col gap-2.5">
      {!q && (
        <>
          <div className="cp-chips" role="group" aria-label="Moment" data-testid="pulse-moment-seg">
            {MOMENTS.map((m) => (
              <button key={m.id} type="button" aria-pressed={moment === m.id} data-testid={`pulse-moment-${m.id}`} onClick={() => pickMoment(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          {/* NEXT95 · "You saved ฿X this trip" now sits at the very top of Pulse (BkkPulseTab, same useTripSaved figure) */}
          <div className="sr-only">
            <div role="tablist" aria-label="Deal audience" data-testid="affiliate-audience-seg">
              <button type="button" role="tab" aria-selected={audience === 'traveller'} data-testid="affiliate-audience-traveller" onClick={() => { setAudience('traveller'); setCategory('all') }}>
                ✈️ Traveller Hacks
              </button>
              <button type="button" role="tab" aria-selected={audience === 'thai'} data-testid="affiliate-audience-thai" onClick={() => { setAudience('thai'); setCategory('all') }}>
                🇹🇭 Thai &amp; Host Perks
              </button>
            </div>
            <div role="group" aria-label="Deal categories">
              <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All</button>
              {categories.map((c) => (
                <button key={c.id} type="button" data-testid={`affiliate-cat-${c.id}`} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {q && (
        <p className="cp-dim" data-testid="pulse-search-count" style={{ fontSize: 13, margin: 0 }}>
          {language === 'th' ? `${deals.length} ดีลสำหรับ “${query.trim()}”` : `${deals.length} ${deals.length === 1 ? 'deal' : 'deals'} for “${query.trim()}”`}
        </p>
      )}

      {visible.length > 0 && (
        <TicketStack
          key={`${moment}-${q}-${showAll ? 'all' : 'top'}`}
          label="Deals"
          language={language}
          testId="pulse-deal-stack"
          tickets={visible.map((deal) => {
            const isPending = pendingIds.includes(deal.id)
            const finalThb = deal.finalThb
            const card = CARD_COPY[deal.id]
            const title = card
              ? language === 'th' ? card.th : language === 'zh' && card.zh ? card.zh : card.en
              : language === 'th' && deal.titleTh ? deal.titleTh : language === 'zh' && deal.titleZh ? deal.titleZh : deal.title
            const meta = language === 'th' && card ? card.metaTh : deal.meta
            return {
              id: deal.id,
              testId: `affiliate-deal-${deal.id}`,
              icon: <img src={TILE[deal.id] ?? tilePerks} alt="" />,
              title,
              sub: isPending ? (language === 'th' ? `โค้ด ${deal.code}${copiedIds.includes(deal.id) ? ' คัดลอกแล้ว' : ''} · ${deal.partner}` : `Code ${deal.code}${copiedIds.includes(deal.id) ? ' copied' : ''} · ${deal.partner}`) : `${meta} · ${deal.partner}`,
              walkInLabel: `฿${fmt(deal.walkInThb)}`,
              floor: floorForAffiliate(deal),
              priceLabel: isPending ? (language === 'th' ? 'รอยืนยัน' : 'Pending') : `฿${fmt(finalThb)}`,
              pending: isPending,
              onClick: () => (isPending ? window.open(deal.partnerUrl, '_blank', 'noopener,noreferrer') : copyAndOpen(deal)),
            }
          })}
        />
      )}
      {pendingDeals.length > 0 && (
        <p className="cp-pending" role="status" data-testid="affiliate-pending-note">
          {language === 'th'
            ? 'เหรียญคืนจะเข้าหลังพาร์ตเนอร์ยืนยันการซื้อ'
            : 'Coins back land once the partner confirms your purchase.'}{' '}
          {pendingDeals.map((d) => (
            <span key={d.id} data-testid={`affiliate-pending-${d.id}`}>
              <a href={d.partnerUrl} target="_blank" rel="noreferrer" data-testid={`affiliate-link-${d.id}`}>
                {d.partner} ↗
              </a>{' '}
            </span>
          ))}
        </p>
      )}
      {!q && !showAll && deals.length > 3 && (
        <button type="button" data-testid="affiliate-show-more" onClick={() => { triggerHaptic('tap'); setShowAll(true) }} className="cp-more">
          {language === 'th' ? `ดูอีก ${deals.length - 3} ดีล` : `Show ${deals.length - 3} more`}
        </button>
      )}
      {deals.length === 0 && (
        <p className="cp-dim" style={{ textAlign: 'center', padding: '12px 0', fontSize: 14 }}>
          {language === 'th' ? 'ไม่พบดีลที่ตรง ลองคำอื่น' : 'No deals match. Try another word.'}
        </p>
      )}
    </section>
  )
}
