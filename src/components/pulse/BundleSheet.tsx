import { useMemo, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import Odometer from '../ui/Odometer'
import { triggerHaptic } from '../../lib/haptics'
import { recordTripSaving } from '../../lib/tripSavings'
import sceneCab from '../../assets/pulse/scenes/airport-cab.svg'
import sceneEsim from '../../assets/pulse/scenes/esim-5g.svg'
import sceneBag from '../../assets/pulse/scenes/bag-drop.svg'
import sceneSpa from '../../assets/pulse/scenes/spa.svg'
import sceneTable from '../../assets/pulse/scenes/rooftop-table.svg'
import tileHotel from '../../assets/pulse/scenes/hotel.svg'
import tilePharmacy from '../../assets/pulse/scenes/pharmacy.svg'
import tileFlower from '../../assets/pulse/scenes/flower.svg'
import tileLate from '../../assets/pulse/scenes/late-cab.svg'
import tileTools from '../../assets/pulse/scenes/tools-safety.svg'
import tileMoney from '../../assets/pulse/scenes/money-fx.svg'
import skylineArrival from '../../assets/pulse/skyline-arrival.svg'
import { bahtLabel, floorForItem, saveThb } from './floorPrices'
import { TwoPrice, floorWords } from './PulseFlows'
import '../../styles/deep-motion.css'

/**
 * UX-P6 · Bundles — On arrival / Evening out / Local kit (K4: Kring wording, no dating framing; ids unchanged). One switch per item, live total + savings, ONE gold CTA.
 * Checkout ends at the existing ⏳ stop-point: every item is confirmed by its own partner webhook; nothing is minted.
 * NEXT95 · every item shows Floor (cheapest elsewhere today) vs Ours from the one floorPrices table, and "you save" is
 * the sum of those savings — the same numbers as the Pulse rows and the booking flows. The trip total (Wallet) is still
 * recorded against walk-in prices, unchanged.
 */
type BundleId = 'arrival' | 'date' | 'host'
interface Item { id: string; name: string; meta: string; thb: number; walkIn: number; tile: string; on: boolean }

const BUNDLES: Record<BundleId, { title: string; sub: string; items: Item[] }> = {
  arrival: {
    title: 'Everything for your first 24 hours',
    sub: 'Just landed · Suvarnabhumi',
    items: [
      { id: 'cab', name: 'Airport cab · fixed', meta: 'Camry · tolls in · Gate 4', thb: 665, walkIn: 1200, tile: sceneCab, on: true },
      { id: 'esim', name: '5G eSIM · 15 GB', meta: '8 days · QR on arrival', thb: 185, walkIn: 499, tile: sceneEsim, on: true },
      { id: 'bag', name: 'Bag drop · hotel delivery', meta: 'Any BTS · insured', thb: 105, walkIn: 200, tile: sceneBag, on: true },
      { id: 'hotel', name: 'Hotel · local price', meta: 'Thonglor · 1 night', thb: 1550, walkIn: 2200, tile: tileHotel, on: false },
      { id: 'spa', name: 'Spa · 60 min Thai massage', meta: 'Licensed · near hotel', thb: 385, walkIn: 600, tile: sceneSpa, on: false },
      { id: 'pharm', name: 'Travel pharmacy kit', meta: 'Discreet 1-hour delivery', thb: 940, walkIn: 1200, tile: tilePharmacy, on: false },
      { id: 'flower', name: 'Jasmine garland (malai)', meta: 'A Thai thank-you · delivered to the venue', thb: 289, walkIn: 400, tile: tileFlower, on: false },
    ],
  },
  date: {
    title: 'An evening out, sorted',
    sub: 'Tonight · Bangkok',
    items: [
      { id: 'table', name: 'Rooftop table · Thai snacks', meta: 'Public terrace · ฿0 cover', thb: 0, walkIn: 600, tile: sceneTable, on: true },
      { id: 'flower', name: 'Jasmine garland (malai)', meta: 'A Thai thank-you · at the table', thb: 289, walkIn: 400, tile: tileFlower, on: false },
      { id: 'late', name: 'Cab home', meta: 'Late zone · driver card', thb: 175, walkIn: 300, tile: tileLate, on: true },
      { id: 'share', name: '1155 safety share', meta: 'Live GPS to a trusted contact', thb: 0, walkIn: 0, tile: tileTools, on: true },
    ],
  },
  host: {
    title: 'Local kit for tonight',
    sub: 'Locals · Bangkok & Pattaya',
    items: [
      { id: 'cab', name: 'Cab home', meta: 'Pre-booked · driver card', thb: 175, walkIn: 300, tile: tileLate, on: true },
      { id: 'spa', name: 'Spa · 60 min', meta: 'Tomorrow · licensed', thb: 385, walkIn: 600, tile: sceneSpa, on: false },
      { id: 'pharm', name: 'Pharmacy kit', meta: 'Discreet delivery', thb: 940, walkIn: 1200, tile: tilePharmacy, on: false },
      { id: 'pp', name: 'PromptPay payout setup', meta: 'Instant 60 s withdrawals', thb: 0, walkIn: 0, tile: tileMoney, on: true },
    ],
  },
}

export default function BundleSheet({ open, onClose, language = 'en' }: { open: boolean; onClose: () => void; language?: string }) {
  const [bundle, setBundle] = useState<BundleId>('arrival')
  const [state, setState] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const th = language === 'th'
  const items = BUNDLES[bundle].items.map((it) => ({ ...it, on: state[`${bundle}:${it.id}`] ?? it.on }))
  const { total, saved, floorSum, n } = useMemo(() => {
    const sel = items.filter((i) => i.on)
    const fl = (i: Item) => floorForItem(bundle, i.id)
    return {
      total: sel.reduce((a, i) => a + i.thb, 0),
      // the honest saving: against the cheapest price elsewhere today (same figure each row shows)
      saved: sel.reduce((a, i) => { const f = fl(i); return a + (f && f.oursThb === i.thb ? saveThb(f) : 0) }, 0),
      floorSum: sel.reduce((a, i) => { const f = fl(i); return a + (f && f.oursThb === i.thb ? f.floorThb : i.thb) }, 0),
      n: sel.length,
    }
  }, [items, bundle])
  const w = floorWords(language)
  const fmt = (v: number) => v.toLocaleString('en-US')

  return (
    <Sheet open={open} onClose={onClose} testId="bundle-sheet" title={th ? 'แพ็กเกจ · ราคากริ๊ง' : 'Bundles · Kring price'} detents={['92%']} initialDetent="92%">
      <div className="dm-bundle kp-bundle flex flex-col gap-2 px-1 pb-3">
        <div className="ux-seg" role="group" aria-label="Bundle">
          {(['arrival', 'date', 'host'] as BundleId[]).map((b) => (
            <button key={b} type="button" aria-pressed={bundle === b} data-testid={`bundle-tab-${b}`} onClick={() => { triggerHaptic('tap'); setBundle(b); setSubmitted(false) }} className="m-press">
              {b === 'arrival' ? (th ? 'เพิ่งถึง' : 'On arrival') : b === 'date' ? (th ? 'ออกไปเย็นนี้' : 'Evening out') : th ? 'ชุดโลคอล' : 'Local kit'}
            </button>
          ))}
        </div>
        <div className="ux-savings-hero" style={{ minHeight: 76 }}>
          <img src={skylineArrival} alt="" aria-hidden="true" />
          <div><div className="k">{BUNDLES[bundle].sub}</div><div className="v" style={{ fontSize: 17 }}>{BUNDLES[bundle].title}</div></div>
        </div>
        {items.map((it) => (
          <div key={it.id} className={`ux-bundle-item${it.on ? '' : ' is-off'}`} data-testid={`bundle-item-${bundle}-${it.id}`}>
            <img src={it.tile} alt="" aria-hidden="true" />
            <div className="b"><div className="t">{it.name}</div><div className="m">{it.meta}{it.walkIn > it.thb ? <> · {w.walkIn} <s>฿{fmt(it.walkIn)}</s></> : null}</div></div>
            <div className="p">
              {(() => {
                const f = floorForItem(bundle, it.id)
                return f && f.oursThb === it.thb ? <TwoPrice p={f} language={language} variant="tile" testId={`bundle-price-${bundle}-${it.id}`} /> : it.thb === 0 ? (th ? 'ฟรี' : 'Free') : `฿${fmt(it.thb)}`
              })()}
            </div>
            <button type="button" role="switch" aria-checked={it.on} aria-label={`${it.on ? 'Remove' : 'Add'} ${it.name}`} data-testid={`bundle-toggle-${bundle}-${it.id}`} className="ux-switch" disabled={submitted} onClick={() => { triggerHaptic('tap'); setState((s) => ({ ...s, [`${bundle}:${it.id}`]: !it.on })) }}><span className="sr-only">{it.name}</span></button>
          </div>
        ))}
        <div style={{ position: 'sticky', bottom: 0, paddingTop: 10, background: 'var(--surface-1)', boxShadow: '0 -1px 0 var(--line-1), 0 -14px 18px -10px var(--surface-1)' }}>
          <div className="flex items-baseline justify-between px-1 pb-2">
            <span className="ux-meta" data-testid="bundle-summary">{n} {th ? 'จาก' : 'of'} {items.length} {th ? 'รายการ' : 'selected'} · <span style={{ color: 'var(--success-text)', fontWeight: 700 }}>{th ? 'ประหยัด' : 'you save'} <Odometer value={saved} testId="bundle-saved-odometer" /></span></span>
            <b style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}><Odometer value={total} srLabel={false} /></b>
          </div>
          {saved > 0 ? (
            <p className="pl-bundle-line" data-testid="bundle-floor-line">
              {w.floor} {bahtLabel(floorSum)} · {w.ours} <b>{bahtLabel(total)}</b>
            </p>
          ) : null}
          {!submitted ? (
            <button type="button" data-testid="bundle-book-btn" disabled={n === 0} onClick={() => {
              triggerHaptic('kring', { burst: false })
              setSubmitted(true)
              // ROUND5 · each booked item adds (FLOOR − ours) to "You saved ฿X" — the same baseline every row shows
              items.filter((i) => i.on).forEach((i) => {
                const f = floorForItem(bundle, i.id)
                if (!f || f.floorThb <= i.thb) return
                const key = i.id === 'esim' ? 'esim' : bundle === 'arrival' && i.id === 'cab' ? 'ride:airport' : `${bundle}:${i.id}`
                recordTripSaving(key, f.floorThb, i.thb)
              })
            }} className="kp-btn kp-btn-gold kp-btn-block m-press">
              {th ? `จองแพ็กเกจ · ฿${fmt(total)}` : `Book bundle · ฿${fmt(total)}`}
            </button>
          ) : (
            <div className="ux-pending" role="status" data-testid="bundle-pending">⏳ {th ? 'รอพาร์ตเนอร์แต่ละรายยืนยัน — ไม่มีการตัดเงินจนกว่าจะยืนยัน' : 'Sent to each partner — nothing is charged until every item is confirmed.'}</div>
          )}
          <p className="ux-meta" style={{ textAlign: 'center', padding: '8px 0 2px' }}>{th ? 'จ่ายครั้งเดียว · พาร์ตเนอร์ยืนยันทีละรายการ · คืนเงินถ้าส่งไม่ได้' : 'Pay once · each item confirmed by its partner · refunded if a partner can\'t deliver'}</p>
        </div>
      </div>
    </Sheet>
  )
}
