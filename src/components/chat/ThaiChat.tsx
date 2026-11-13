import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import { KRING_FIXED_STICKERS, triggerChaoPhrayaFireworks } from '../../lib/kringCreativeEngine'

/**
 * Kring chat · what Thais actually send (round 3 R6 + the familiar patterns: reactions, swipe-to-reply, read receipts).
 *
 *  <BubbleLine>    wraps one chat line: long-press (450 ms) or double-tap → the reaction bar springs out of the bubble
 *                  (items 40 ms apart, bouncy) while the rest of the chat dims to 25 %; the bubble lifts to 1.04.
 *                  Drag the bubble right 34 px → ↩ fades in, release → reply (the quote appears above the composer).
 *                  Reactions sit on the bubble's corner as "🙏 1" pills (pop, bouncy). Light haptic 10 ms.
 *  <StickerTray>   tabs: Thai slang (8 chunky text stickers with a tiny English gloss) · Emoji · 🎁 Gifts (opens the
 *                  existing, FROZEN gift tray unchanged). The polite particle follows the user's setting (ค่ะ / ครับ).
 *  <StickerBubble> the sent sticker: launches from the tray, overshoots 1.08 with a −12° → 4° wobble, settles.
 *  <ReplyBar>      the quote above the composer (✕ to drop it).
 *  <ReadMark>      "อ่านแล้ว 18:02" under my last message (the LINE convention travellers learn on day one).
 * Rules: no hearts, kisses or winks; 🥹 means touched / grateful. No Kring emoji in chat (the two-ring mark is brand-only).
 */

export const THAI_REACTIONS = ['🙏', '😆', '555', '👍', '🥹', '😱', '👌'] as const
const MORE_REACTIONS = ['😊', '🔥', '🎉', '💯', '👏', '🤣']

export type Particle = 'ka' | 'krub'
const PARTICLE_KEY = 'kring_particle_v1'

export function readParticle(): Particle {
  try {
    return window.localStorage.getItem(PARTICLE_KEY) === 'krub' ? 'krub' : 'ka'
  } catch {
    return 'ka'
  }
}
export function writeParticle(p: Particle) {
  try {
    window.localStorage.setItem(PARTICLE_KEY, p)
  } catch {
    // storage blocked: the choice lasts for this session
  }
}

export interface Sticker {
  id: string
  text: string
  gloss: string
  tone: 'marigold' | 'anchan' | 'jasmine' | 'violet'
}

export function thaiStickers(p: Particle): Sticker[] {
  const pol = p === 'krub' ? 'ครับ' : 'ค่ะ'
  return [
    { id: '555', text: '555', gloss: 'haha', tone: 'marigold' },
    { id: 'fin', text: 'ฟิน', gloss: 'so good', tone: 'anchan' },
    { id: 'pang', text: 'ปัง!', gloss: 'awesome', tone: 'marigold' },
    { id: 'jueng', text: 'จึ้ง', gloss: 'stunning', tone: 'violet' },
    { id: 'tailaew', text: 'ตายแล้ว 😱', gloss: 'OMG', tone: 'jasmine' },
    { id: 'okay', text: `โอเค${pol} 👌`, gloss: 'okay!', tone: 'anchan' },
    { id: 'thanks', text: `ขอบคุณ${pol} 🙏`, gloss: 'thank you', tone: 'jasmine' },
    { id: 'sueng', text: 'ซึ้ง 🥹', gloss: 'touched', tone: 'violet' },
  ]
}

const EMOJI = ['😊', '😆', '🤣', '🥹', '😱', '🙏', '👍', '👌', '👏', '🔥', '🎉', '💯', '🌧️', '☀️', '🛺', '🍜', '🥭', '🧋', '📍', '⏰']

/* ------------------------------------------------------------------ */

export interface BubbleLineProps {
  mine: boolean
  reactions?: string[]
  onReact?: (r: string) => void
  onReply?: () => void
  /** the quoted message this one answers */
  quote?: { who: string; text: string }
  className?: string
  testId?: string
  children: ReactNode
  /** the avatar (their side) */
  lead?: ReactNode
  /** under the bubble (read receipt) */
  after?: ReactNode
  th: boolean
}

const LONG_MS = 450
const SWIPE_PX = 34

export function BubbleLine({ mine, reactions = [], onReact, onReply, quote, className = '', testId, children, lead, after, th }: BubbleLineProps) {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const longT = useRef<number | undefined>(undefined)
  const lastTap = useRef(0)
  const swiping = useRef(false)

  useEffect(() => () => window.clearTimeout(longT.current), [])
  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  const openBar = () => {
    triggerHaptic('light', { sound: false })
    setMore(false)
    setOpen(true)
  }
  const pick = (r: string) => {
    triggerHaptic('light', { sound: false })
    onReact?.(r)
    setOpen(false)
  }

  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    swiping.current = false
    window.clearTimeout(longT.current)
    longT.current = window.setTimeout(() => {
      if (!swiping.current) openBar()
    }, LONG_MS)
  }
  const onMove = (e: RPointerEvent) => {
    const s = start.current
    if (!s) return
    const x = e.clientX - s.x
    const y = e.clientY - s.y
    if (Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) {
      window.clearTimeout(longT.current)
      start.current = null
      setDx(0)
      return
    }
    if (x > 6 && onReply) {
      swiping.current = true
      window.clearTimeout(longT.current)
      setDx(Math.min(56, x * 0.8))
    }
  }
  const onUp = () => {
    window.clearTimeout(longT.current)
    if (swiping.current && dx >= SWIPE_PX) {
      triggerHaptic('light', { sound: false })
      onReply?.()
    }
    if (!swiping.current && start.current && Date.now() - start.current.t < LONG_MS) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        lastTap.current = 0
        openBar()
      } else lastTap.current = now
    }
    start.current = null
    swiping.current = false
    setDx(0)
  }

  const counts = reactions.reduce<Record<string, number>>((a, r) => ({ ...a, [r]: (a[r] ?? 0) + 1 }), {})
  return (
    <div className={`cp-line${mine ? ' is-me' : ''} kc-line${open ? ' is-react' : ''} ${className}`} data-testid={testId}>
      {open ? <div className="kc-dim" aria-hidden="true" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div className="kc-bar" role="menu" aria-label={th ? 'ส่งรีแอคชัน' : 'React'} data-testid="chat-reaction-bar">
          {(more ? MORE_REACTIONS : THAI_REACTIONS).map((r, i) => (
            <button key={r} type="button" role="menuitem" style={{ ['--i' as string]: i } as CSSProperties} className={r === '555' ? 'is-txt' : undefined} aria-label={r === '555' ? '555 (haha)' : r} onClick={() => pick(r)}>
              {r}
            </button>
          ))}
          {!more ? (
            <button type="button" role="menuitem" aria-label={th ? 'อีโมจิเพิ่ม' : 'More'} className="is-more" style={{ ['--i' as string]: THAI_REACTIONS.length } as CSSProperties} onClick={() => setMore(true)}>
              +
            </button>
          ) : null}
          {onReply ? (
            <button
              type="button"
              role="menuitem"
              className="is-reply"
              aria-label={th ? 'ตอบกลับ' : 'Reply'}
              onClick={() => {
                setOpen(false)
                onReply()
              }}
            >
              ↩
            </button>
          ) : null}
        </div>
      ) : null}
      {lead}
      <div className="kc-hold">
        <span className="kc-reply-ico" aria-hidden="true" style={{ opacity: Math.min(1, dx / SWIPE_PX) } as CSSProperties}>
          ↩
        </span>
        <div
          className={`kc-bub${dx ? ' is-drag' : ''}`}
          style={dx ? ({ transform: `translateX(${dx}px)` } as CSSProperties) : undefined}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => {
            e.preventDefault()
            openBar()
          }}
        >
          {quote ? (
            <span className="kc-quote">
              <b>{quote.who}</b>
              <span>{quote.text}</span>
            </span>
          ) : null}
          {children}
          {Object.keys(counts).length ? (
            <span className="kc-pills" data-testid="chat-reaction-pills">
              {Object.entries(counts).map(([r, n]) => (
                <span key={r} className="kc-pill">
                  {r} {n}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        {after}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function StickerBubble({ text, gloss, tone, fresh }: { text: string; gloss: string; tone?: Sticker['tone']; fresh?: boolean }) {
  return (
    <span className={`kc-sticker is-${tone ?? 'marigold'}${fresh ? ' is-fresh' : ''}`} data-testid="chat-sticker-bubble">
      <b>{text}</b>
      <small>{gloss}</small>
    </span>
  )
}

export function ReplyBar({ who, text, th, onClear }: { who: string; text: string; th: boolean; onClear: () => void }) {
  return (
    <div className="kc-replybar" data-testid="chat-reply-quote">
      <span className="kc-replybar-l">
        <b>{th ? `ตอบ ${who}` : `Replying to ${who}`}</b>
        <span>{text}</span>
      </span>
      <button type="button" aria-label={th ? 'ยกเลิกการตอบ' : 'Cancel reply'} onClick={onClear}>
        ✕
      </button>
    </div>
  )
}

export function ReadMark({ at }: { at: string }) {
  return (
    <span className="kc-read" data-testid="chat-read-receipt" aria-label={`Read ${at}`}>
      อ่านแล้ว {at}
    </span>
  )
}

/* ------------------------------------------------------------------ */

export interface StickerTrayProps {
  open: boolean
  th: boolean
  onSticker: (s: Sticker) => void
  onEmoji: (e: string) => void
  onGifts?: () => void
  onClose: () => void
}

export function StickerTray({ open, th, onSticker, onEmoji, onGifts, onClose }: StickerTrayProps) {
  const [tab, setTab] = useState<'slang' | 'emoji'>('slang')
  const [particle, setParticle] = useState<Particle>(() => readParticle())
  if (!open) return null
  const stickers = thaiStickers(particle)
  return (
    <div className="kc-tray" data-testid="chat-sticker-tray" role="dialog" aria-label={th ? 'สติกเกอร์' : 'Stickers'}>
      <div className="kc-tray-h">
        <div className="kc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'slang'} onClick={() => setTab('slang')}>
            {th ? 'สติกเกอร์' : 'Stickers'}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'emoji'} onClick={() => setTab('emoji')}>
            {th ? 'อีโมจิ' : 'Emoji'}
          </button>
          {onGifts ? (
            <button
              type="button"
              role="tab"
              aria-selected={false}
              data-testid="chat-sticker-gifts-tab"
              onClick={() => {
                onClose()
                onGifts()
              }}
            >
              🎁 {th ? 'ของขวัญ' : 'Gifts'}
            </button>
          ) : null}
        </div>
        <button type="button" className="kc-x" aria-label={th ? 'ปิด' : 'Close'} onClick={onClose}>
          ✕
        </button>
      </div>
      {tab === 'slang' ? (
        <>
          <div className="kc-fixed-stickers" data-testid="chat-fixed-stickers-row">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px 6px', fontSize: 11, opacity: 0.85 }}>
              <span className="kring-living-thai-type">{th ? 'สติกเกอร์กำลังใจ (โฮสต์รับ 80% คงที่ · ไม่มีสุ่ม)' : 'Animated Treat Stickers (Host receives 80% fixed · 0% random)'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}>
              {KRING_FIXED_STICKERS.map((fs) => (
                <button
                  key={fs.id}
                  type="button"
                  className="kc-st is-gold kring-fixed-sticker-btn"
                  data-testid={`chat-fixed-sticker-${fs.id}`}
                  data-host-share="80"
                  data-random-pool="0"
                  onClick={() => {
                    triggerHaptic('light', { sound: false })
                    triggerChaoPhrayaFireworks(1)
                    onSticker({
                      id: fs.id,
                      text: `${fs.th} ฿${fs.thb}`,
                      gloss: `${fs.en} · Host 80% (฿${fs.hostNetThb.toFixed(1)})`,
                      tone: fs.thb === 99 ? 'marigold' : 'violet',
                    })
                  }}
                >
                  <b className="kring-living-thai-type">
                    <span className="kring-fixed-sticker-emoji" aria-hidden="true">{fs.emoji} </span>
                    {fs.th} ฿{fs.thb}
                  </b>
                  <small>{fs.en} · 80% fixed</small>
                </button>
              ))}
            </div>
          </div>
          <div className="kc-grid">
            {stickers.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`kc-st is-${s.tone}`}
                style={{ ['--i' as string]: i } as CSSProperties}
                data-testid={`chat-sticker-${s.id}`}
                onClick={() => {
                  triggerHaptic('light', { sound: false })
                  onSticker(s)
                }}
              >
                <b>{s.text}</b>
                <small>{s.gloss}</small>
              </button>
            ))}
          </div>
          <div className="kc-particle" role="radiogroup" aria-label={th ? 'คำลงท้าย' : 'Polite ending'}>
            <span>{th ? 'คำลงท้าย' : 'Polite ending'}</span>
            {(['ka', 'krub'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={particle === p}
                onClick={() => {
                  setParticle(p)
                  writeParticle(p)
                }}
              >
                {p === 'ka' ? 'ค่ะ' : 'ครับ'}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="kc-emoji">
          {EMOJI.map((e) => (
            <button key={e} type="button" onClick={() => onEmoji(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
