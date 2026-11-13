import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import { prefersReducedMotion } from '../../design/motion'
import { bahtLabel } from '../pulse/floorPrices'
import Gauge from './Gauge'
import VerdictShare from './VerdictShare'
import { CHECK_KINDS, gaugeAngleForTimes, guessKind, parseAmount, rangeLabel, ruleFor, timesLabel, verdictFor, type CheckKind, type KringAction, type KringCity, type Verdict } from './priceData'

/**
 * K4 · Price Check — the hero of Kring Price (B2 / B9).
 * Type or paste a street quote → the chip picks itself → "Check this price" → gauge + verdict ("4× too high · usual
 * ฿300–400" + one short reason) → the Kring alternative ("Book ours ฿680") and a 9:16 share card.
 * Follows the city switch (Bangkok / Pattaya rules). Pure display: no money moves here; "Book ours" opens the existing
 * ride / eSIM flow or the experience in Experiences.
 *
 * Kept test ids: scam-ai-custom-input · scam-ai-check-btn · scam-ai-custom-verdict · scam-book-fixed-btn.
 */
export interface PriceCheckHandle {
  focus: () => void
  /** prefill a quote and run the check (share links: ?check=…) */
  run: (text: string) => void
}

export function verdictHeadline(v: Verdict, lang: string): string {
  const th = lang === 'th'
  if (v.tone === 'bad') return th ? `แพงกว่าปกติ ${timesLabel(v.times)}` : `${timesLabel(v.times)} too high`
  if (v.tone === 'high') return th ? 'แพงไปหน่อย' : 'A bit high'
  if (v.tone === 'ok') return th ? 'ราคาปกติ' : 'That’s the usual price'
  return th ? 'ราคาดีเลย' : 'Good price'
}
export function usualLine(v: Verdict, lang: string): string {
  return `${lang === 'th' ? 'ราคาปกติ' : 'usual'} ${rangeLabel(v.lo, v.hi)}`
}

const EXAMPLES: Record<KringCity, { en: string; th: string }> = {
  bangkok: { en: 'Taxi airport → Sukhumvit ฿1,500 no meter', th: 'แท็กซี่ สนามบิน → สุขุมวิท 1,500 บาท ไม่กดมิเตอร์' },
  // FIX1 · founder default: the Price Check example is the SPEEDBOAT FARE (one way); the catalogue item is the island
  // day with a local (from ฿1,500) — two different things, labelled so they never contradict.
  pattaya: { en: 'Koh Larn speedboat ฿1,800 per person, one way', th: 'สปีดโบ๊ทไปเกาะล้าน 1,800 บาท/คน เที่ยวเดียว' },
}

const PriceCheck = forwardRef<PriceCheckHandle, {
  city: KringCity
  lang: string
  onCityToggle: () => void
  onAction: (a: KringAction) => void
}>(function PriceCheck({ city, lang, onCityToggle, onAction }, ref) {
  const th = lang === 'th'
  const [text, setText] = useState('')
  const [kind, setKind] = useState<CheckKind | null>(null)
  const [kindPinned, setKindPinned] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'checking' | 'done'>('idle')
  const [result, setResult] = useState<Verdict | null>(null)
  const [noAmount, setNoAmount] = useState(false)
  const [unknown, setUnknown] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [booked, setBooked] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const timer = useRef(0)
  const kinds = CHECK_KINDS[city]

  // the chip picks itself from what was typed (until the traveller taps one)
  const autoKind = useMemo(() => guessKind(text, city), [text, city])
  const activeKind: CheckKind | null = kindPinned ? kind : autoKind ?? kind
  useEffect(() => {
    // a new city resets the answer (its rules differ); keep the text
    setPhase('idle')
    setResult(null)
    if (kind && !CHECK_KINDS[city].some((k) => k.id === kind)) setKind(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const check = (raw = text, k: CheckKind | null = activeKind) => {
    window.clearTimeout(timer.current)
    const amount = parseAmount(raw)
    setNoAmount(amount === null)
    setBooked(false)
    if (amount === null) {
      setPhase('done')
      setResult(null)
      setUnknown(false)
      triggerHaptic('select')
      return
    }
    const kk = k ?? guessKind(raw, city) ?? (city === 'pattaya' ? 'boat' : 'taxi')
    const rule = ruleFor(kk, raw, city)
    if (!rule) {
      setUnknown(true)
      setResult(null)
      setPhase('done')
      return
    }
    setUnknown(false)
    const v = verdictFor(amount, rule, raw)
    setPhase('checking')
    timer.current = window.setTimeout(
      () => {
        setResult(v)
        setPhase('done')
        triggerHaptic(v.tone === 'bad' || v.tone === 'high' ? 'warning' : 'success')
        window.requestAnimationFrame(() => rootRef.current?.querySelector('.kp-verdict')?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }))
      },
      prefersReducedMotion() || import.meta.env.MODE === 'test' ? 0 : 650,
    )
  }

  useImperativeHandle(ref, () => ({
    focus: () => {
      rootRef.current?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      window.setTimeout(() => inputRef.current?.focus(), 250)
    },
    run: (t: string) => {
      setText(t)
      setKindPinned(false)
      check(t, guessKind(t, city))
    },
  }))

  const paste = async () => {
    triggerHaptic('tap')
    try {
      const t = await navigator.clipboard?.readText?.()
      if (t && t.trim()) {
        setText(t.trim().slice(0, 160))
        setPhase('idle')
        return
      }
    } catch {
      // no clipboard permission: just focus the box
    }
    inputRef.current?.focus()
  }

  const kr = result?.rule.kring ?? null
  const krCheaper = !!(kr && result && kr.thb < result.amount)
  const open = text.trim().length > 0 || phase !== 'idle'
  const cityName = city === 'pattaya' ? (th ? 'พัทยา' : 'Pattaya') : th ? 'กรุงเทพฯ' : 'Bangkok'

  return (
    <section ref={rootRef} className={`kp-check${open ? ' is-open' : ''}`} aria-label="Price Check" data-testid="kp-price-check">
      <div className="kp-check-h">
        <span className="kp-eyebrow">
          <i aria-hidden="true">⚖️</i> {th ? 'เช็คราคา' : 'Price Check'}<span className="kp-eyebrow-2"> · {th ? 'Price Check' : 'เช็คราคา'}</span>
        </span>
        <button type="button" className="kp-citychip" onClick={onCityToggle} aria-label={th ? `เมือง: ${cityName} แตะเพื่อเปลี่ยน` : `City: ${cityName}. Tap to switch`}>
          📍 {cityName} <span aria-hidden="true">▾</span>
        </button>
      </div>
      <label className="kp-check-box">
        <span className="kp-check-q">{th ? 'โดนเสนอราคาเท่าไหร่' : 'What were you quoted?'}</span>
        <textarea
          ref={inputRef}
          rows={open ? 2 : 1}
          data-testid="scam-ai-custom-input"
          value={text}
          maxLength={160}
          onChange={(e) => {
            setText(e.target.value)
            if (phase === 'done') setPhase('idle')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (text.trim()) check()
            }
          }}
          placeholder={th ? `เช่น ${EXAMPLES[city].th}` : `e.g. ${EXAMPLES[city].en}`}
          aria-label={th ? 'ราคาที่โดนเสนอ' : 'The quote you got'}
          enterKeyHint="go"
        />
        {!text.trim() ? (
          <button type="button" className="kp-paste" onClick={paste}>
            {th ? 'วาง' : 'Paste'}
          </button>
        ) : null}
      </label>
      {open ? (
        <div className="kp-chips" role="radiogroup" aria-label={th ? 'ประเภท' : 'What is it'}>
          {kinds.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={activeKind === k.id}
              onClick={() => {
                triggerHaptic('select')
                setKind(k.id)
                setKindPinned(true)
                if (phase === 'done') setPhase('idle')
              }}
            >
              <span aria-hidden="true">{k.emoji}</span> {th ? k.th : k.en}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="kp-example" onClick={() => { triggerHaptic('tap'); setText(th ? EXAMPLES[city].th : EXAMPLES[city].en) }}>
          {th ? 'ลองตัวอย่าง ›' : 'Try an example ›'}
        </button>
      )}
      {open ? (
        <button
          type="button"
          className={`kp-btn kp-btn-gold kp-btn-block${phase === 'checking' ? ' is-busy' : ''}`}
          data-testid="scam-ai-check-btn"
          disabled={!text.trim() || phase === 'checking'}
          onClick={() => {
            triggerHaptic('tap')
            check()
          }}
        >
          <span key={phase === 'checking' ? 'b' : 'a'} className="kp-swap">
            {phase === 'checking'
              ? city === 'pattaya'
                ? th ? 'กำลังเช็คราคาพัทยา…' : 'Checking Pattaya quotes…'
                : th ? 'กำลังเช็คราคาจริง…' : 'Checking real fares…'
              : th ? 'เช็คราคานี้ · Check' : 'Check this price · เช็คเลย'}
          </span>
        </button>
      ) : null}

      {phase === 'done' && noAmount ? (
        <p className="kp-check-hint" role="status">{th ? 'ใส่ตัวเลขราคาที่เขาบอกด้วย เช่น 400' : 'Add the price they told you, e.g. 400.'}</p>
      ) : null}
      {phase === 'done' && unknown ? (
        <p className="kp-check-hint" role="status">
          {th ? 'ยังไม่มีราคาปกติของอันนี้ในเมืองนี้ ลองถามโลคอลในแชตได้นะ' : 'We don’t have a usual price for that here yet. Ask a Kring local in chat.'}
        </p>
      ) : null}

      {phase === 'done' && result ? (
        <div className={`kp-verdict is-${result.tone}`} data-testid="scam-ai-custom-verdict" role="status" aria-live="polite">
          <Gauge angle={result.angle} labels={[th ? 'ปกติ' : 'usual', '4×+']} ticks={[[gaugeAngleForTimes(2), '2×'], [gaugeAngleForTimes(3), '3×']]} testId="kp-gauge" />
          <b className="kp-v-head">{verdictHeadline(result, lang)}</b>
          <p className="kp-v-why">
            <span className="kp-v-usual">{usualLine(result, lang)}</span>
            {': '}
            {th ? result.rule.reason.th : result.rule.reason.en}
          </p>
          <div className="kp-v-links">
            {result.rule.kind === 'taxi' || result.rule.kind === 'tuk' ? (
              <button type="button" className="kp-link" data-testid="kp-diy-link" onClick={() => window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: { section: 'driver' } }))}>
                {th ? result.rule.diy.th : result.rule.diy.en} ›
              </button>
            ) : (
              <span className="kp-diy">{th ? result.rule.diy.th : result.rule.diy.en}</span>
            )}
            <button type="button" className="kp-link kp-link-share" data-testid="kp-share-verdict" onClick={() => { triggerHaptic('tap'); setShareOpen(true) }}>
              ⤴ {th ? 'แชร์ผลเช็ค' : 'Share verdict'}
            </button>
          </div>
          {kr ? (
            <div className="kp-ours">
              <div className="kp-ours-t">
                <span className="kp-ours-k">
                  {result.rule.kind === 'boat'
                    ? th ? 'หรือเที่ยวทั้งวันกับโลคอล · ราคากริ๊ง' : 'Or make a day of it · Kring price'
                    : krCheaper ? (th ? 'หรือจองของเรา · ราคากริ๊ง' : 'Or book ours · Kring price') : th ? 'ราคากริ๊ง' : 'Kring price'}
                </span>
                <b>{th ? kr.title.th : kr.title.en}</b>
                <small>
                  {th ? kr.sub.th : kr.sub.en}
                  {/* FIX2 · Wei 8 — say it when ours sits inside the usual range (tuk-tuk ฿150 = the top of ฿80–150) */}
                  {kr.action.kind !== 'experience' && kr.thb >= result.lo && kr.thb <= result.hi
                    ? kr.thb === result.hi
                      ? th ? ' · ราคาสูงสุดของช่วงปกติ แต่ตายตัว' : ' · the top of the usual range, fixed'
                      : th ? ' · อยู่ในช่วงราคาปกติ ตายตัว' : ' · inside the usual range, fixed'
                    : ''}
                </small>
              </div>
              <b className="kp-ours-p">{kr.action.kind === 'experience' ? <small>{th ? 'เริ่ม' : 'from'}</small> : null}{bahtLabel(kr.thb)}</b>
              <button
                type="button"
                className="kp-btn kp-btn-gold kp-btn-block"
                data-testid="scam-book-fixed-btn"
                disabled={booked}
                onClick={() => {
                  triggerHaptic('success')
                  setBooked(true)
                  onAction(kr.action)
                }}
              >
                {booked
                  ? th ? 'เปิดการจองแล้ว ✓' : 'Opening your booking ✓'
                  : kr.action.kind === 'experience'
                    ? th ? `ดูกับโลคอล · ${bahtLabel(kr.thb)}` : `See it with a local · ${bahtLabel(kr.thb)}`
                    : th ? `จองของเรา ${bahtLabel(kr.thb)}` : `Book ours ${bahtLabel(kr.thb)}`}
              </button>
              <small className="kp-ours-note">
                {kr.action.kind === 'experience'
                  ? th ? 'ราคาเดียวกันทุกพาสปอร์ต · ยอดจอง พักไว้จนเจอกัน' : 'Same price for every passport · booking held until you meet'
                  : th ? 'ราคาเดียวกันทุกพาสปอร์ต · รวมทุกอย่างแล้ว' : 'Same price for every passport · all-in, nothing added'}
              </small>
            </div>
          ) : null}
        </div>
      ) : null}

      {result ? <VerdictShare open={shareOpen} onClose={() => setShareOpen(false)} verdict={result} quote={text} city={city} lang={lang} /> : null}
    </section>
  )
})

export default PriceCheck
