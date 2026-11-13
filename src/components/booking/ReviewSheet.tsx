import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Sheet from '../ui/Sheet'
import { KringMark } from '../ui/KringMark'
import { triggerHaptic } from '../../lib/haptics'
import { myReview, reviewBooking, type Booking, type PlanSide } from '../../lib/planStore'
import { reducedMotion } from './parts'
import { shareTargets } from '../../lib/share'
import './booking.css'

/**
 * Kring · Review, then share (round 1 A8).
 *
 * Five stars (fill left→right 110 ms apart, overshoot 1.12, bouncy), quick tags, one line → Post review
 * (`reviewBooking`, one per booking) → a 9:16 share card with kring.app/@local swings in from rotateY −70°
 * (spring.bouncy) and rests at a slight 3D angle. LINE (line.me share link) / IG story (Web Share with the PNG when the
 * phone supports it) / Save (PNG drawn on a canvas — no server). Brings the local new guests.
 * Testids: kring-review-sheet, kring-review-star-{1..5}, kring-review-tag, kring-review-text, kring-review-post,
 *          kring-share-card, kring-share-line, kring-share-ig, kring-share-save.
 */

export const REVIEW_TAGS: Array<{ en: string; th: string }> = [
  { en: 'Great food', th: 'อาหารอร่อย' },
  { en: 'Felt safe', th: 'รู้สึกปลอดภัย' },
  { en: 'On time', th: 'ตรงเวลา' },
  { en: 'Knows the area', th: 'รู้จักพื้นที่ดี' },
  { en: 'Fair price', th: 'ราคายุติธรรม' },
  { en: 'Great English', th: 'ภาษาอังกฤษดี' },
]

/** T3 · mutual reviews: what a local can say about her guest */
export const GUEST_REVIEW_TAGS: Array<{ en: string; th: string }> = [
  { en: 'On time', th: 'ตรงเวลา' },
  { en: 'Kind', th: 'ใจดี' },
  { en: 'Respectful', th: 'สุภาพ' },
  { en: 'Curious', th: 'ช่างถาม' },
  { en: 'Fun to host', th: 'พาเที่ยวสนุก' },
  { en: 'Easy to talk to', th: 'คุยง่าย' },
]

export interface ReviewSheetProps {
  open: boolean
  booking: Booking | null
  th: boolean
  /** who is reviewing: the guest reviews the local (default), the local reviews the guest (T3 · mutual) */
  side?: PlanSide
  photo?: string
  onClose: () => void
}

export function localHandle(name: string): string {
  return `kringapp.com/@${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`
}

/** Draws the 9:16 share card on a canvas (1080×1920) — used for Save and for the IG story share. */
async function drawCard(b: Booking, stars: number, text: string, photo?: string, other = b.localName): Promise<Blob | null> {
  try {
    const W = 1080
    const H = 1920
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')
    if (!g) return null
    const bg = g.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#3446FF')
    bg.addColorStop(0.55, '#0A0B1E')
    bg.addColorStop(1, '#1B1206')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    if (photo) {
      await new Promise<void>((res) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const s = Math.max(W / img.width, (H * 0.7) / img.height)
          g.globalAlpha = 0.85
          g.drawImage(img, (W - img.width * s) / 2, 0, img.width * s, img.height * s)
          g.globalAlpha = 1
          res()
        }
        img.onerror = () => res()
        img.src = photo
      })
    }
    const fade = g.createLinearGradient(0, H * 0.35, 0, H)
    fade.addColorStop(0, 'rgba(10,11,30,0)')
    fade.addColorStop(1, 'rgba(10,11,30,.96)')
    g.fillStyle = fade
    g.fillRect(0, 0, W, H)
    // rings
    g.lineWidth = 14
    g.strokeStyle = '#7381FF'
    g.beginPath()
    g.arc(130, 140, 46, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = '#FFB21E'
    g.beginPath()
    g.arc(204, 140, 46, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#FFF6E6'
    g.font = '800 64px "Plus Jakarta Sans", sans-serif'
    g.fillText('Kring', 280, 162)
    g.fillStyle = '#FFB21E'
    g.font = '700 86px sans-serif'
    g.fillText('★'.repeat(stars) + '☆'.repeat(5 - stars), 90, H - 640)
    g.fillStyle = '#FFF6E6'
    g.font = '800 84px "Plus Jakarta Sans", sans-serif'
    const title = `${b.experienceTitle ?? 'Experience'} with ${other}`
    wrap(g, title, 90, H - 520, W - 180, 96)
    g.fillStyle = 'rgba(255,246,230,.82)'
    g.font = '500 52px "Plus Jakarta Sans", sans-serif'
    if (text) wrap(g, `“${text}”`, 90, H - 300, W - 180, 66)
    g.fillStyle = '#FFB21E'
    g.font = '600 44px ui-monospace, monospace'
    g.fillText(localHandle(b.localName), 90, H - 110)
    return await new Promise((res) => c.toBlob((bl) => res(bl), 'image/png'))
  } catch {
    return null
  }
}

function wrap(g: CanvasRenderingContext2D, s: string, x: number, y: number, max: number, lh: number) {
  const words = s.split(' ')
  let line = ''
  let yy = y
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (g.measureText(t).width > max && line) {
      g.fillText(line, x, yy)
      line = w
      yy += lh
    } else line = t
  }
  if (line) g.fillText(line, x, yy)
}

export default function ReviewSheet({ open, booking, th, side = 'guest', photo, onClose }: ReviewSheetProps) {
  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [text, setText] = useState('')
  const [posted, setPosted] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const starKey = useRef(0)
  useEffect(() => {
    if (!open) return
    const mine = booking ? myReview(booking, side) : undefined
    setStars(mine?.stars ?? 0)
    setTags(mine?.tags ?? [])
    setText(mine?.text ?? '')
    setPosted(Boolean(mine))
    setNote(null)
  }, [open, booking, side])
  if (!booking) return null
  const host = side === 'host'
  // the person being reviewed; the share card always shares the LOCAL's page (hers when she is the one reviewing)
  const other = host ? booking.guestName : booking.localName
  const tagSet = host ? GUEST_REVIEW_TAGS : REVIEW_TAGS
  const handle = localHandle(booking.localName)
  const shareText = th
    ? `${booking.experienceTitle ?? 'ทริป'} กับ ${other} ${'★'.repeat(stars)} · ${handle}`
    : `${booking.experienceTitle ?? 'Experience'} with ${other} ${'★'.repeat(stars)} · ${handle}`

  const post = () => {
    if (!stars) return
    reviewBooking(booking.id, { stars, tags, text: text.trim() }, Date.now(), side)
    triggerHaptic('success', { burst: false })
    setPosted(true)
  }
  const save = async () => {
    const blob = await drawCard(booking, stars, text.trim(), photo, other)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kring-${booking.localName.toLowerCase()}.png`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
    setNote(th ? 'บันทึกรูปแล้ว' : 'Saved to your photos')
  }
  const story = async () => {
    const blob = await drawCard(booking, stars, text.trim(), photo, other)
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
    try {
      if (blob && nav.share) {
        const file = new File([blob], 'kring-story.png', { type: 'image/png' })
        if (!nav.canShare || nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], text: shareText })
          return
        }
      }
    } catch {
      return
    }
    await save()
  }

  const sheet = (
    <Sheet
      open={open}
      onClose={onClose}
      testId="kring-review-sheet"
      className="kb-tilt"
      initialDetent="92%"
      ariaLabel={th ? 'รีวิวทริป' : 'Review the experience'}
      title={posted ? (th ? 'แชร์ให้เพื่อน' : 'Share it') : th ? `ทริปกับ ${other} เป็นยังไง?` : `How was it with ${other}?`}
      subtitle={posted ? handle : booking.experienceTitle}
    >
      {!posted ? (
        <div className="kb-review">
          <div className="kb-stars" role="radiogroup" aria-label={th ? 'ให้ดาว' : 'Stars'}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={`${n}-${starKey.current}`}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n}`}
                data-testid={`kring-review-star-${n}`}
                className={n <= stars ? 'is-on' : undefined}
                style={{ ['--i' as string]: n } as CSSProperties}
                onClick={() => {
                  triggerHaptic('select')
                  starKey.current += 1
                  setStars(n)
                }}
              >
                ★
              </button>
            ))}
          </div>
          <div className="kb-tags">
            {tagSet.map((t) => {
              const on = tags.includes(t.en)
              return (
                <button
                  key={t.en}
                  type="button"
                  data-testid="kring-review-tag"
                  aria-pressed={on}
                  className={on ? 'is-on' : undefined}
                  onClick={() => {
                    triggerHaptic('select')
                    setTags((x) => (on ? x.filter((y) => y !== t.en) : [...x, t.en]))
                  }}
                >
                  {th ? t.th : t.en}
                </button>
              )
            })}
          </div>
          <textarea
            className="kb-input kb-textarea"
            data-testid="kring-review-text"
            maxLength={280}
            rows={3}
            placeholder={host ? (th ? `เล่าสั้นๆ ถึง ${other}` : `One line about ${other}`) : th ? 'เล่าสั้นๆ ให้คนต่อไป' : 'One line for the next traveller'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={th ? 'ข้อความรีวิว' : 'Review text'}
          />
          <button type="button" className="kb-btn kb-btn-gold kb-btn-block" data-testid="kring-review-post" disabled={!stars} onClick={post}>
            {th ? 'โพสต์รีวิว' : 'Post review'}
          </button>
        </div>
      ) : (
        <div className="kb-share">
          <figure
            className={`kb-share-card${reducedMotion() ? '' : ' is-swing'}`}
            data-testid="kring-share-card"
            style={
              photo
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(10,11,30,0) 35%, rgba(10,11,30,.95)), url(${photo}), radial-gradient(90% 60% at 30% 30%, rgba(255,178,30,.75), transparent 70%), radial-gradient(90% 60% at 80% 10%, rgba(52,70,255,.9), transparent 70%)`,
                  }
                : undefined
            }
          >
            <span className="kb-share-brand">
              <KringMark size={26} /> Kring
            </span>
            <figcaption>
              <span className="kb-share-stars" aria-label={`${stars} stars`}>
                {'★'.repeat(stars)}
                <i>{'★'.repeat(5 - stars)}</i>
              </span>
              <b>
                {booking.experienceTitle ?? (th ? 'ทริป' : 'Experience')} {th ? 'กับ' : 'with'} {other}
              </b>
              {booking.foundingFundedByKring && (
                <small data-testid="kring-review-founding-badge">
                  {th ? 'ทริปผู้ก่อตั้ง · สนับสนุนโดย Kring' : 'Founding booking, paid by Kring'}
                </small>
              )}
              {text.trim() ? <q>{text.trim()}</q> : null}
              <code>{handle}</code>
            </figcaption>
          </figure>
          {/* FIX3 · Wei r4: a review shares the LOCAL's page — say so (the bump card shares your own) */}
          <p className="kb-share-what" data-testid="kring-share-what">
            {host ? (th ? 'แชร์หน้าของคุณ' : 'Share your page') : th ? `แชร์หน้าของ ${booking.localName}` : `Share ${booking.localName}'s page`} · <b>{handle}</b>
          </p>
          <div className="kb-share-row">
            <a
              className="kb-btn kb-btn-gold"
              data-testid="kring-share-line"
              href={`https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => triggerHaptic('select')}
            >
              LINE
            </a>
            <button type="button" className="kb-btn kb-btn-ghost" data-testid="kring-share-ig" onClick={() => void story()}>
              {th ? 'IG สตอรี่' : 'IG story'}
            </button>
            <button type="button" className="kb-btn kb-btn-ghost" data-testid="kring-share-save" onClick={() => void save()}>
              {th ? 'บันทึก' : 'Save'}
            </button>
          </div>
          {/* FIX3 · founder: WeChat + 小红书 on every share sheet (plain labelled chips, the shared helper) */}
          <div className="kb-share-row kb-share-more" data-testid="kring-share-more">
            {shareTargets(shareText, handle, {
              lang: th ? 'th' : typeof document !== 'undefined' && document.documentElement.lang === 'zh' ? 'zh' : 'en',
              only: ['native', 'wechat', 'xhs', 'copy'],
            }).map((t) => (
              <button
                key={t.id}
                type="button"
                className="kb-btn kb-btn-ghost kb-chip-share"
                data-testid={`kring-share-${t.id}`}
                onClick={() => {
                  triggerHaptic('select')
                  void t.run()
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {note ? (
            <p className="kb-note" role="status">
              {note}
            </p>
          ) : null}
        </div>
      )}
    </Sheet>
  )
  // portalled: opened from inside the chat room, it must not inherit the room's stacking rules
  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet
}
