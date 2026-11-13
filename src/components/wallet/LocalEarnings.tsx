import { useMemo, useState, type CSSProperties } from 'react'
import { usePlanStore, hostShareThb } from '../../lib/planStore'
import { localMoneyRows, whenLabel } from './bookingMoney'
import { formatBahtValue } from '../../lib/money'
import { triggerHaptic } from '../../lib/haptics'
import { useTr, useIsThai, WPage, type Tr } from '../vip/walletKit'
import { cardSettleDate, KSheet, RollingBaht, shortDay } from './kringKit'

/**
 * K5 · B8 + A9 · KRING FIX2 — the Local's earnings page inside Wallet.
 *   Ready (marigold, rolls up) · This month · Pending ⓘ
 *   "Card payments take 3 days · ฿X available Fri 24 Oct" + a 4-day track
 *   Income by source (Experiences · Gifts · Invites) — bars grow 60 ms apart; every row opens its list
 *   Withdraw ฿X to PromptPay (the hub's existing cash-out request, behind the PIN pad in CashOutSheet)
 *
 * Numbers are HER real ones (planStore bookings + gifts): a brand-new Local sees ฿0 and a friendly empty state.
 * Demo sessions can flip to a clearly labelled "Example month" — the example figures are shown INSTEAD of hers,
 * never added to them, and nothing in it can be withdrawn. There are no paid time extensions (founder, fix round 2).
 */

export type SourceId = 'experiences' | 'gifts' | 'invites'
export type EntryStatus = 'held' | 'settling' | 'available'
export interface EarningEntry {
  id: string
  source: SourceId
  title: string
  sub: string
  thb: number
  at: number
  status: EntryStatus
  method: 'card' | 'promptpay'
  guests?: number
}

const DAY = 24 * 3600_000

/** The labelled "Example month" (demo sessions only, shown instead of her own numbers — never summed with them). */
function demoEntries(now: number, tr: Tr): EarningEntry[] {
  const d = (n: number) => now - n * DAY
  const ex = (id: string, title: string, guests: number, thb: number, daysAgo: number, status: EntryStatus = 'available', method: 'card' | 'promptpay' = 'promptpay'): EarningEntry => ({
    id,
    source: 'experiences',
    title,
    sub: tr(`${guests} ${guests === 1 ? 'guest' : 'guests'}`, `แขก ${guests} คน`),
    thb,
    at: d(daysAgo),
    status,
    method,
    guests,
  })
  return [
    ex('dx1', tr('Yaowarat street-food walk · Sarah', 'เดินกินเยาวราช · Sarah'), 2, 1200, 1, 'settling', 'card'),
    ex('dx2', tr('Temple morning · Ken', 'ไหว้พระยามเช้า · Ken'), 1, 900, 2),
    ex('dx3', tr('Flower market at dawn · Mia', 'ตลาดดอกไม้ยามเช้า · Mia'), 2, 1300, 6),
    ex('dx4', tr('Muay Thai gym class · Leo', 'คลาสมวยไทย · Leo'), 1, 1100, 8),
    ex('dx5', tr('Chinatown food walk · Ana', 'เดินกินไชน่าทาวน์ · Ana'), 3, 1500, 11),
    ex('dx6', tr('Canal boat & market · Tom', 'ล่องเรือคลอง · Tom'), 2, 1400, 14),
    ex('dx7', tr('Herbal spa afternoon · Jo', 'สปาสมุนไพร · Jo'), 1, 1100, 17),
    ex('dx8', tr('Thai cooking class · Eva', 'คลาสทำอาหารไทย · Eva'), 2, 900, 19),
    { id: 'dg1', source: 'gifts', title: tr('Thank-you gift · Mia', 'ของขวัญขอบคุณ · Mia'), sub: tr('after the flower market', 'หลังทริปตลาดดอกไม้'), thb: 400, at: d(6), status: 'available', method: 'promptpay' },
    { id: 'dg2', source: 'gifts', title: tr('Thank-you gift · Ken', 'ของขวัญขอบคุณ · Ken'), sub: tr('after the temple morning', 'หลังทริปไหว้พระ'), thb: 240, at: d(2), status: 'available', method: 'promptpay' },
    { id: 'di1', source: 'invites', title: tr('Nok joined and booked', 'Nok สมัครและจองแล้ว'), sub: tr('invite reward', 'รางวัลชวนเพื่อน'), thb: 400, at: d(9), status: 'available', method: 'promptpay' },
  ]
}

interface LoosePlan {
  id: string
  guest?: string
  venue?: string
  time?: string
  receiveThb?: number
  state?: string
  updatedAt?: number
  releasedAt?: number
}

/** Store-derived entries (a confirmed plan is held until the bump; a released one is available). */
function storeEntries(store: ReturnType<typeof usePlanStore>, tr: Tr, th: boolean): EarningEntry[] {
  const out: EarningEntry[] = []
  // KRING FIX1 · her bookings (planStore, the same record the ticket and Local home read): held until กริ๊ง!, then
  // released (PromptPay → straight to Ready). Every one names its experience.
  for (const r of localMoneyRows(store)) {
    if (r.state === 'refunded') continue
    const released = r.state === 'released'
    out.push({
      id: `bk-${r.id}`,
      source: 'experiences',
      title: `${r.title ?? tr('Experience', 'ประสบการณ์')} · ${r.guest}`,
      sub: released
        ? tr(`released after Kring!${r.venue ? ` at ${r.venue}` : ''}`, `โอนแล้วหลังกริ๊ง!${r.venue ? ` ที่ ${r.venue}` : ''}`)
        : `${whenLabel(r.date, r.start, th)} · ${tr('held until you meet', 'พักไว้จนเจอกัน')}`,
      thb: r.receiveThb,
      at: released ? r.releasedAt ?? r.at : r.at,
      status: released ? 'available' : 'held',
      method: 'promptpay',
      guests: 1,
    })
  }
  for (const raw of Object.values(store.host ?? {}) as LoosePlan[]) {
    const released = Boolean(raw.releasedAt) || raw.state === 'released' || raw.state === 'completed'
    if (raw.state !== 'confirmed' && !released) continue
    out.push({
      id: `pl-${raw.id}`,
      source: 'experiences',
      title: `${raw.venue ?? tr('Experience', 'ประสบการณ์')}${raw.guest ? ` · ${raw.guest}` : ''}`,
      sub: released ? tr('released after Kring!', 'โอนแล้วหลังกริ๊ง!') : tr(`${raw.time ?? ''} · held until you meet`.trim(), `${raw.time ?? ''} · พักไว้จนเจอกัน`.trim()),
      thb: Math.max(0, Math.round(raw.receiveThb ?? 0)),
      at: raw.updatedAt ?? Date.now(),
      status: released ? 'available' : 'held',
      method: 'promptpay',
      guests: 1,
    })
  }
  const gifts = (store.gifts ?? {}) as Record<string, Array<{ id?: string; name?: string; nameTh?: string; thb?: number; at?: number; promoFunded?: boolean }>>
  for (const [key, list] of Object.entries(gifts)) {
    for (const g of Array.isArray(list) ? list : []) {
      if (typeof g?.at !== 'number' || g.promoFunded) continue
      const who = (store.host ?? {})[key]?.guest ?? key
      out.push({
        id: g.id ?? `gf-${key}-${g.at}`,
        source: 'gifts',
        title: tr(`Thank-you gift · ${who}`, `ของขวัญขอบคุณ · ${who}`),
        sub: tr('in your chat', 'ในแชท'),
        thb: hostShareThb(Math.max(0, Number(g.thb) || 0)),
        at: g.at,
        status: 'available',
        method: 'promptpay',
      })
    }
  }
  return out
}

/** Her month (`example` false) or the labelled example month (`example` true) — one or the other, never mixed. */
export function useLocalEarnings(example: boolean) {
  const store = usePlanStore()
  const tr = useTr()
  const th = useIsThai()
  return useMemo(() => {
    const now = Date.now()
    const rawList = example ? demoEntries(now, tr) : storeEntries(store, tr, th)
    const completedCount = rawList.filter((e) => e.source === 'experiences').length
    const isNewLocal = !example && completedCount < 5
    const list = rawList
      // a card payment whose clearing days (3d Trusted / 14d New) are up is simply available
      .map((e) => (e.status === 'settling' && cardSettleDate(e.at, isNewLocal).getTime() <= now ? { ...e, status: 'available' as const } : e))
      .sort((a, b) => b.at - a.at)
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const month = list.filter((e) => e.at >= monthStart.getTime() || example)
    const sum = (xs: EarningEntry[]) => xs.reduce((a, e) => a + e.thb, 0)
    const bySource = (['experiences', 'gifts', 'invites'] as SourceId[]).map((id) => {
      const xs = month.filter((e) => e.source === id)
      return { id, thb: sum(xs), count: xs.length, guests: xs.reduce((a, e) => a + (e.guests ?? 0), 0), list: xs }
    })
    const pendingList = list.filter((e) => e.status !== 'available')
    const settling = list.filter((e) => e.status === 'settling')
    const nextSettle = settling.length ? cardSettleDate(Math.min(...settling.map((e) => e.at)), isNewLocal) : null
    return {
      list,
      monthThb: sum(month),
      pendingThb: sum(pendingList),
      heldThb: sum(list.filter((e) => e.status === 'held')),
      settlingThb: sum(settling),
      nextSettle,
      bySource,
      availableThb: sum(list.filter((e) => e.status === 'available')),
    }
  }, [store, tr, th, example])
}

const SOURCE_META: Record<SourceId, { icon: string; en: string; th: string; pageEn?: string; pageTh?: string }> = {
  experiences: { icon: '✦', en: 'Experiences', th: 'ประสบการณ์' },
  gifts: { icon: '🎁', en: 'Gifts', th: 'ของขวัญ', pageEn: 'Gifts · thank-yous', pageTh: 'ของขวัญขอบคุณ' },
  invites: { icon: '🤝', en: 'Invites', th: 'ชวนเพื่อน' },
}

export default function LocalEarnings({
  readyThb,
  isDemoMode,
  canWithdraw,
  blockedReason,
  onWithdraw,
}: {
  readyThb: number
  isDemoMode: boolean
  canWithdraw: boolean
  blockedReason?: string
  onWithdraw: () => void
}) {
  const tr = useTr()
  const th = useIsThai()
  // KRING FIX2 · Ploy 35–38: her own numbers by default; the example month is a labelled switch (demo only)
  const [exampleOn, setExample] = useState(false)
  const example = isDemoMode && exampleOn
  const e = useLocalEarnings(example)
  const ready = example ? e.availableThb : readyThb
  const empty = !example && e.list.length === 0
  const [why, setWhy] = useState(false)
  const [source, setSource] = useState<SourceId | null>(null)
  const max = Math.max(1, ...e.bySource.map((s) => s.thb))
  const settleDay = e.nextSettle ? shortDay(e.nextSettle, th) : null
  const monthName = new Date().toLocaleDateString(th ? 'th-TH' : 'en-GB', { month: 'long' })
  const open = source ? e.bySource.find((s) => s.id === source) : null

  return (
    <div className={`kw-earn${example ? ' is-example' : ''}`} data-testid="wallet-local-earnings" data-example={example ? 'true' : undefined}>
      {isDemoMode ? (
        <div className="kw-seg is-2" role="tablist" aria-label={tr('Which month', 'ดูเดือนไหน')} style={{ '--i': example ? 1 : 0 } as CSSProperties} data-testid="wallet-local-example-toggle">
          <i className="kw-seg-ind" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={!example} onClick={() => setExample(false)} data-testid="wallet-local-mine">
            {tr('My month', 'ของฉัน')}
          </button>
          <button type="button" role="tab" aria-selected={example} onClick={() => setExample(true)} data-testid="wallet-local-example">
            {tr('Example month', 'เดือนตัวอย่าง')}
          </button>
        </div>
      ) : null}
      {example ? (
        <p className="kw-example" data-testid="wallet-local-example-note">
          <b>{tr('Example', 'ตัวอย่าง')}</b> {tr('What a busy month could look like. Not your money — nothing here can be withdrawn.', 'หน้าตาเดือนที่มีงานเยอะ ไม่ใช่เงินของคุณ ถอนไม่ได้')}
        </p>
      ) : null}
      <div className="kw-st3">
        <div className="kw-st is-ready" data-testid="wallet-local-ready">
          <span className="kw-k">{example ? tr('Ready · example', 'พร้อมถอน · ตัวอย่าง') : tr('Ready', 'พร้อมถอน')}</span>
          <b>
            <RollingBaht value={ready} testId={example ? undefined : 'wallet-card-host-ready'} />
          </b>
        </div>
        <button type="button" className="kw-st m-press" onClick={() => setSource('experiences')} data-testid="wallet-local-month">
          <span className="kw-k">{tr('This month', 'เดือนนี้')}</span>
          <b>{formatBahtValue(e.monthThb)}</b>
        </button>
        <button
          type="button"
          className="kw-st m-press"
          data-testid="wallet-local-pending"
          aria-label={tr(`Pending ${formatBahtValue(e.pendingThb)} — why?`, `รอเข้า ${formatBahtValue(e.pendingThb)} — ทำไม?`)}
          onClick={() => {
            triggerHaptic('tap')
            setWhy(true)
          }}
        >
          <span className="kw-k">
            {tr('Pending', 'รอเข้า')} <i className="kw-info" aria-hidden="true">i</i>
          </span>
          <b>{formatBahtValue(e.pendingThb)}</b>
        </button>
      </div>

      {empty ? (
        <div className="kw-first" data-testid="wallet-local-empty">
          <b>{tr('Your first booking lands here', 'การจองแรกของคุณจะขึ้นที่นี่')}</b>
          <small>
            {tr(
              'A guest’s money is held until you meet, then what you receive is Ready the moment you go Kring!',
              'เงินของแขกพักไว้จนเจอกัน พอกริ๊ง! ยอดที่คุณได้รับพร้อมถอนทันที',
            )}
          </small>
        </div>
      ) : null}

      {e.pendingThb > 0 ? (
        <div className="kw-pend" data-testid="wallet-local-pending-line">
          <p>
            {e.settlingThb > 0 && settleDay ? (
              <>
                {tr('Card · 3–5 days', 'บัตร · 3–5 วัน')} · <b className="kw-mg">{tr(`${formatBahtValue(e.settlingThb)} available ${settleDay}`, `${formatBahtValue(e.settlingThb)} เข้า ${settleDay}`)}</b>
              </>
            ) : (
              <>
                {tr('Held until you meet', 'พักไว้จนเจอกัน')} · <b className="kw-mg">{tr('released right after Kring!', 'โอนทันทีหลังกริ๊ง!')}</b>
              </>
            )}
          </p>
          {e.settlingThb > 0 && e.nextSettle ? <DayTrack to={e.nextSettle} th={th} /> : null}
        </div>
      ) : null}

      <p className="kw-k kw-sec">{tr(`Income by source · ${monthName}`, `รายได้ตามที่มา · ${monthName}`)}</p>
      <div className="kw-src">
        {e.bySource.map((s, i) => {
          const meta = SOURCE_META[s.id]
          return (
            <button
              key={s.id}
              type="button"
              className="kw-so m-press"
              style={{ '--i': i, '--w': `${Math.max(s.thb > 0 ? 4 : 0, Math.round((s.thb / max) * 100))}%` } as CSSProperties}
              data-testid={`wallet-source-${s.id}`}
              onClick={() => {
                triggerHaptic('tap')
                setSource(s.id)
              }}
            >
              <span className="kw-so-n">
                <i aria-hidden="true">{meta.icon}</i> {tr(meta.en, meta.th)}
              </span>
              <span className="kw-so-bar" aria-hidden="true">
                <i />
              </span>
              <b className="kw-so-a">{formatBahtValue(s.thb)}</b>
              <svg className="kw-chev" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
              {s.id === 'experiences' && s.count > 0 ? (
                <small className="kw-so-d">
                  {tr(
                    `${s.count} ${s.count === 1 ? 'booking' : 'bookings'} · ${s.guests} ${s.guests === 1 ? 'guest' : 'guests'} · avg ${formatBahtValue(Math.round(s.thb / s.count))}`,
                    `${s.count} การจอง · แขก ${s.guests} คน · เฉลี่ย ${formatBahtValue(Math.round(s.thb / s.count))}`,
                  )}
                </small>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Kring v3.0 — Best of Both Worlds: Host Level Progression (80% -> 83% -> 85%) + Active Host Quests */}
      <div className="my-3 p-3.5 rounded-2xl c-surface-1 border c-line space-y-2.5" data-testid="wallet-host-levels-and-quests">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold">{tr('⭐ Host Level & Share Progression', '⭐ ระดับโฮสต์และส่วนแบ่งรายได้')}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-400 text-slate-950">
            {tr('80% → 83% → 85%', '80% → 83% → 85%')}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-bold">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            <div>{tr('New · 80%', 'ใหม่ · 80%')}</div>
            <div className="opacity-75">{tr('0–9 trips', '0–9 ทริป')}</div>
          </div>
          <div className="p-2 rounded-xl bg-amber-400/20 text-amber-500 border border-amber-400">
            <div>{tr('Trusted · 83%', 'Trusted · 83%')}</div>
            <div className="opacity-75">{tr('10+ · 4.7★', '10+ · 4.7★')}</div>
          </div>
          <div className="p-2 rounded-xl c-surface-2 c-text-2">
            <div>{tr('Star · 85%', 'Star · 85%')}</div>
            <div className="opacity-75">{tr('30+ · 4.8★', '30+ · 4.8★')}</div>
          </div>
        </div>
        <div className="space-y-1.5 pt-1 border-t c-line text-xs">
          <div className="font-extrabold">{tr('🔥 Active Host Quests & Guarantees', '🔥 ภารกิจโฮสต์และเงินการันตี')}</div>
          <div className="flex items-center justify-between p-2 rounded-xl c-surface-2">
            <span>{tr('🛡️ ฿500 First-Booking Guarantee (Live 7d)', '🛡️ การันตี ฿500 ทริปแรก (ออนไลน์ 7 วัน)')}</span>
            <span className="font-extrabold text-emerald-500">ACTIVE</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl c-surface-2">
            <span>{tr('🏆 +฿300 Weekly Quest (5 trips @ 4.8★+)', '🏆 โบนัสรายสัปดาห์ +฿300 (ครบ 5 ทริป 4.8★+)')}</span>
            <span className="font-extrabold text-amber-500">+฿300</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl c-surface-2">
            <span>{tr('📲 "Book Me on Kring" Personal QR (85% Share)', '📲 QR ส่วนตัว "จองฉันบนกริ๊ง" (รับ 85%)')}</span>
            <span className="font-extrabold text-indigo-400">QR Ready</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="kw-btn is-mg kw-wide m-press"
        data-testid="wallet-home-cashout"
        disabled={example || readyThb <= 0}
        onClick={() => {
          triggerHaptic('select')
          onWithdraw()
        }}
      >
        {example
          ? tr('Example only · nothing to withdraw', 'ตัวอย่างเท่านั้น · ถอนไม่ได้')
          : readyThb > 0
            ? tr(`Withdraw now · ${formatBahtValue(readyThb)} to PromptPay`, `ถอนทันที · ${formatBahtValue(readyThb)} เข้าพร้อมเพย์`)
            : tr('Nothing to withdraw yet', 'ยังไม่มียอดให้ถอน')}
      </button>
      <p className="kw-sub kw-c" data-testid="wallet-host-fee-rule">
        {!canWithdraw && blockedReason && readyThb > 0
          ? blockedReason
          : tr(
              'Trip fees go straight to PromptPay at กริ๊ง! · Gift rewards paid free Mondays (≥฿500) or ฿15 now',
              'ค่าทริปโอนเข้าพร้อมเพย์ทันทีที่แตะกริ๊ง! · ของขวัญโอนฟรีทุกวันจันทร์ (≥฿500) หรือถอนทันที ฿15',
            )}
      </p>

      <KSheet open={why} onClose={() => setWhy(false)} title={tr('Why is it pending?', 'ทำไมยังรอเข้า?')} testId="wallet-pending-sheet">
        <p className="kw-sub">
          {tr(
            'Held until you both Kring! at the venue. PromptPay lands in < 60s; cards take 3–5 days (14d for new Locals).',
            'พักยอดไว้จนกริ๊ง! กันที่ร้าน พร้อมเพย์เข้าใน < 60 วิ ส่วนบัตรใช้ 3–5 วัน (โลคอลใหม่ 14 วัน)',
          )}
        </p>
        <div className="kw-c2">
          <div>
            <span>💳 {tr('Card', 'บัตร')}</span>
            <b>{tr('3–5 days', '3–5 วัน')}</b>
            <small>{tr('14d new Locals', 'โลคอลใหม่ 14 วัน')}</small>
          </div>
          <div className="is-fast">
            <span>⚡ PromptPay</span>
            <b>{tr('< 60 sec', '< 60 วิ')}</b>
            <small>{tr('Instant Ready', 'พร้อมถอนทันที')}</small>
          </div>
        </div>
        <p className="kw-sub">{tr('Nothing for you to do. We’ll let you know when it lands.', 'ไม่ต้องทำอะไร เงินเข้าเมื่อไหร่เราจะแจ้งให้')}</p>
        <button type="button" className="kw-btn is-mg kw-wide m-press" onClick={() => setWhy(false)} data-testid="wallet-pending-ok">
          {tr('Got it', 'เข้าใจแล้ว')}
        </button>
      </KSheet>

      <WPage open={Boolean(open)} onBack={() => setSource(null)} title={open ? tr(SOURCE_META[open.id].pageEn ?? SOURCE_META[open.id].en, SOURCE_META[open.id].pageTh ?? SOURCE_META[open.id].th) : ''} testId="wallet-source-page">
        {open ? (
          <div className="kw-stack">
            <div className="kw-src-hero">
              <span className="kw-k">{tr(`${monthName} · ${open.count} ${open.count === 1 ? 'item' : 'items'}`, `${monthName} · ${open.count} รายการ`)}</span>
              <b>{formatBahtValue(open.thb)}</b>
              {open.id === 'experiences' && open.count > 0 ? (
                <small>
                  {tr(`${open.guests} guests · avg ${formatBahtValue(Math.round(open.thb / open.count))} a booking`, `แขก ${open.guests} คน · เฉลี่ย ${formatBahtValue(Math.round(open.thb / open.count))} ต่อการจอง`)}
                </small>
              ) : null}
            </div>
            {open.list.length === 0 ? (
              <p className="kw-empty">{tr('Nothing here yet this month.', 'เดือนนี้ยังไม่มีรายการ')}</p>
            ) : (
              <ol className="kw-tx">
                {open.list.map((x, i) => (
                  <li key={x.id} style={{ '--i': i } as CSSProperties}>
                    <span className="kw-grow">
                      <b>{x.title}</b>
                      <small>
                        {x.method === 'card' ? tr('Card', 'บัตร') : 'PromptPay'} · {shortDay(new Date(x.at), th)}
                        {x.sub && !/^(Card|PromptPay|บัตร)$/.test(x.sub) ? ` · ${x.sub}` : ''}
                      </small>
                    </span>
                    <b className="kw-tx-a">{formatBahtValue(x.thb)}</b>
                    <em className={`kw-tx-s is-${x.status}`}>
                      {x.status === 'available'
                        ? tr('⚡ Ready', '⚡ พร้อมถอน')
                        : x.status === 'settling'
                          ? shortDay(cardSettleDate(x.at), th)
                          : tr('Held', 'พักไว้')}
                    </em>
                  </li>
                ))}
              </ol>
            )}
            {example ? <p className="kw-fine">{tr('Example month · not your bookings', 'เดือนตัวอย่าง · ไม่ใช่การจองของคุณ')}</p> : null}
          </div>
        ) : null}
      </WPage>
    </div>
  )
}

/** Tue → Fri track with a marigold bead running toward the settle day (A9). */
function DayTrack({ to, th }: { to: Date; th: boolean }) {
  const days = [0, 1, 2, 3].map((n) => new Date(to.getTime() - (3 - n) * DAY))
  return (
    <div className="kw-days" aria-hidden="true">
      <i className="kw-days-line" />
      <b className="kw-days-bead" />
      {days.map((d, i) => (
        <span key={i} className={i === 3 ? 'is-end' : ''}>
          {i === 0 || i === 3 ? shortDay(d, th).split(' ').slice(0, 2).join(' ') : d.toLocaleDateString(th ? 'th-TH' : 'en-GB', { weekday: 'short' })}
        </span>
      ))}
    </div>
  )
}
