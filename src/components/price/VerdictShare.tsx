import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { bahtLabel } from '../pulse/floorPrices'
import KringMark, { drawKringMark } from './KringMark'
import ShareChips from '../ui/ShareChips'
import Gauge, { drawGauge } from './Gauge'
import { CHECK_KINDS, gaugeAngleForTimes, rangeLabel, shortDate, timesLabel, type KringCity, type Verdict } from './priceData'

/**
 * K4 · B3 — the 9:16 verdict card, made for a LINE chat or an IG story. No names, no faces: safe to post.
 * On screen it is DOM (flies up from rotateX 40° at .7, then sways like a held phone); Save / Share draw the same card
 * on a 1080×1920 canvas. Share uses the Web Share API with the image file where the phone supports it, then the text
 * + link, then falls back to saving the image. Copy link copies kring.app/check?q=… (opens the same Price Check).
 */
const W = 1080
const H = 1920

export function checkLink(quote: string, city: KringCity): string {
  return `https://kringapp.com/check?city=${city}&q=${encodeURIComponent(quote.trim().slice(0, 120))}`
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function stampText(v: Verdict): string {
  if (v.tone === 'bad') return `${timesLabel(v.times)} TOO HIGH`
  if (v.tone === 'high') return 'A BIT HIGH'
  return v.tone === 'ok' ? 'USUAL PRICE' : 'GOOD PRICE'
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 2): number {
  const words = text.split(/\s+/)
  let line = ''
  let lines = 0
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > maxW && line) {
      lines++
      if (lines === maxLines) {
        ctx.fillText(`${line}…`, x, y)
        return y + lh
      }
      ctx.fillText(line, x, y)
      y += lh
      line = words[i]
    } else line = test
  }
  if (line) ctx.fillText(line, x, y)
  return y + lh
}

export async function renderVerdictPng(v: Verdict, quote: string, city: KringCity, kindLabel: string): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const font = (w: number, s: number) => `${w} ${s}px "Plus Jakarta Sans", "IBM Plex Sans Thai", "Noto Sans Thai", system-ui, sans-serif`
  // night card: Bangkok night + anchan glow top-left, red glow behind the quote
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#12143A')
  bg.addColorStop(1, '#0A0B1E')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.2, H * 0.08, 0, W * 0.2, H * 0.08, W * 0.9)
  glow.addColorStop(0, 'rgba(52,70,255,.35)')
  glow.addColorStop(1, 'rgba(52,70,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const red = ctx.createRadialGradient(W / 2, 640, 0, W / 2, 640, 520)
  red.addColorStop(0, 'rgba(255,45,85,.22)')
  red.addColorStop(1, 'rgba(255,45,85,0)')
  ctx.fillStyle = red
  ctx.fillRect(0, 300, W, 800)
  // header
  drawKringMark(ctx, 120, 150, 30)
  ctx.fillStyle = '#FFF6E6'
  ctx.font = font(800, 64)
  ctx.textBaseline = 'middle'
  ctx.fillText('kring', 200, 152)
  ctx.font = font(700, 30)
  ctx.fillStyle = 'rgba(255,246,230,.6)'
  ctx.textAlign = 'right'
  ctx.fillText('PRICE CHECK · เช็คราคา', W - 90, 152)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  // what was quoted
  ctx.fillStyle = 'rgba(255,246,230,.82)'
  ctx.font = font(700, 44)
  ctx.fillText(`${kindLabel} · ${city === 'pattaya' ? 'Pattaya' : 'Bangkok'}`, 90, 330)
  ctx.font = font(500, 38)
  ctx.fillStyle = 'rgba(255,246,230,.6)'
  wrap(ctx, `“${quote.trim()}”`, 90, 390, W - 180, 50, 2)
  // the quote, struck by the red laser
  const q = bahtLabel(v.amount)
  ctx.font = font(800, 210)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FF5470'
  ctx.shadowColor = 'rgba(255,45,85,.8)'
  ctx.shadowBlur = 40
  ctx.fillText(q, W / 2, 700)
  const qw = ctx.measureText(q).width
  ctx.shadowBlur = 30
  ctx.fillStyle = '#FF2D55'
  ctx.fillRect(W / 2 - qw / 2 - 30, 626, qw + 60, 12)
  ctx.shadowBlur = 0
  // gauge + stamp
  drawGauge(ctx, W / 2, 1140, 300, v.angle)
  ctx.save()
  ctx.translate(W / 2, 1270)
  ctx.rotate((-4 * Math.PI) / 180)
  ctx.font = font(900, 96)
  const st = stampText(v)
  const sw = ctx.measureText(st).width + 80
  const tone = v.tone === 'bad' || v.tone === 'high' ? '#FF3B5C' : '#3DDC97'
  ctx.strokeStyle = tone
  ctx.lineWidth = 8
  ctx.strokeRect(-sw / 2, -78, sw, 132)
  ctx.fillStyle = tone
  ctx.fillText(st, 0, 22)
  ctx.restore()
  // usual price
  ctx.fillStyle = 'rgba(61,220,151,.12)'
  ctx.beginPath()
  ctx.roundRect?.(110, 1400, W - 220, 230, 36)
  ctx.fill()
  ctx.fillStyle = '#FFF6E6'
  ctx.font = font(800, 60)
  ctx.fillText(`Usual ${rangeLabel(v.lo, v.hi)}`, W / 2, 1490)
  ctx.font = font(600, 36)
  ctx.fillStyle = 'rgba(255,246,230,.7)'
  ctx.fillText(`ราคาปกติ · ${v.rule.reason.en}`.slice(0, 64), W / 2, 1570)
  // footer
  ctx.textAlign = 'left'
  ctx.font = font(700, 36)
  ctx.fillStyle = '#FFB21E'
  ctx.fillText('kringapp.com/check', 90, H - 120)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,246,230,.6)'
  ctx.fillText(shortDate(todayIso()), W - 90, H - 120)
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function VerdictShare({ open, onClose, verdict: v, quote, city, lang }: { open: boolean; onClose: () => void; verdict: Verdict; quote: string; city: KringCity; lang: string }) {
  const th = lang === 'th'
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const kindLabel = useMemo(() => CHECK_KINDS[city].find((k) => k.id === v.rule.kind)?.en ?? 'Quote', [city, v.rule.kind])
  const link = checkLink(quote, city)
  const shareText = th
    ? `เช็คราคากับกริ๊ง: ${bahtLabel(v.amount)} ${v.tone === 'bad' ? `แพงกว่าปกติ ${timesLabel(v.times)}` : ''} · ราคาปกติ ${rangeLabel(v.lo, v.hi)}`
    : `Kring Price Check: ${bahtLabel(v.amount)} is ${v.tone === 'bad' ? `${timesLabel(v.times)} too high` : v.tone === 'high' ? 'a bit high' : 'about right'} · usual ${rangeLabel(v.lo, v.hi)}`
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const share = async () => {
    triggerHaptic('tap')
    setBusy(true)
    try {
      const blob = await renderVerdictPng(v, quote, city, kindLabel)
      const file = blob ? new File([blob], 'kring-price-check.png', { type: 'image/png' }) : null
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Kring Price Check', text: `${shareText} ${link}` })
        setToast(th ? 'แชร์แล้ว' : 'Shared')
      } else if (canShare) {
        await navigator.share({ title: 'Kring Price Check', text: shareText, url: link })
        setToast(th ? 'แชร์แล้ว' : 'Shared')
      } else if (blob) {
        download(blob, 'kring-price-check.png')
        setToast(th ? 'บันทึกแล้ว · พร้อมลงสตอรี่' : 'Saved · ready for your story')
      }
    } catch {
      // the share sheet was closed: nothing to say
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    triggerHaptic('tap')
    setBusy(true)
    const blob = await renderVerdictPng(v, quote, city, kindLabel)
    setBusy(false)
    if (blob) {
      download(blob, 'kring-price-check.png')
      triggerHaptic('medium')
      setToast(th ? 'บันทึกแล้ว · พร้อมลงสตอรี่' : 'Saved · ready for your story')
    }
  }
  const copy = async () => {
    triggerHaptic('tap')
    try {
      await navigator.clipboard.writeText(link)
      setToast(th ? 'คัดลอกลิงก์แล้ว' : 'Link copied')
    } catch {
      setToast(link)
    }
  }

  const bad = v.tone === 'bad' || v.tone === 'high'
  return (
    <Sheet open={open} onClose={onClose} testId="kp-verdict-share" title={th ? 'แชร์ผลเช็คราคา' : 'Share verdict'} subtitle={th ? 'ขนาดสตอรี่ 9:16' : '9:16 story size'} detents={['92%']} initialDetent="92%">
      <div className="kp-share">
        <div className="kp-vcard-stage">
          <div className={`kp-vcard${bad ? ' is-bad' : ' is-good'}`} data-testid="kp-verdict-card" role="img" aria-label={shareText}>
            <span className="kp-vc-sheen" aria-hidden="true" />
            <div className="kp-vc-top">
              <KringMark size={14} word />
              <span>PRICE CHECK</span>
            </div>
            <div className="kp-vc-what">
              <b>{kindLabel} · {city === 'pattaya' ? 'Pattaya' : 'Bangkok'}</b>
              <small>“{quote.trim().slice(0, 70)}{quote.trim().length > 70 ? '…' : ''}”</small>
            </div>
            <div className="kp-vc-quote">
              <span className="kp-laser is-lit is-glow" data-p={bahtLabel(v.amount)}>{bahtLabel(v.amount)}</span>
            </div>
            <Gauge angle={v.angle} labels={[th ? 'ปกติ' : 'usual', '4×+']} ticks={[[gaugeAngleForTimes(2), '2×'], [gaugeAngleForTimes(3), '3×']]} size="sm" live={open} />
            <span className="kp-vc-stamp">{stampText(v)}</span>
            <div className="kp-vc-usual">
              <b>Usual {rangeLabel(v.lo, v.hi)}</b>
              <small>ราคาปกติ · {v.rule.reason.en}</small>
            </div>
            <div className="kp-vc-foot">
              <span>kringapp.com/check</span>
              <span>{shortDate(todayIso(), lang)}</span>
            </div>
          </div>
        </div>
        <div className="kp-share-btns">
          <button type="button" onClick={share} disabled={busy} data-testid="kp-share-native">
            <i aria-hidden="true">⤴</i>
            <span>{canShare ? (th ? 'แชร์' : 'Share') : th ? 'แชร์' : 'Share'}</span>
          </button>
          <button type="button" onClick={save} disabled={busy} data-testid="kp-share-save">
            <i aria-hidden="true">⤓</i>
            <span>{th ? 'บันทึกรูป' : 'Save image'}</span>
          </button>
          <button type="button" onClick={copy} data-testid="kp-share-copy">
            <i aria-hidden="true">🔗</i>
            <span>{th ? 'คัดลอกลิงก์' : 'Copy link'}</span>
          </button>
        </div>
        {/* FIX3 · founder / Wei — LINE, WeChat and 小红书 as plain chips (WeChat copies the link, 小红书 the text + link) */}
        <ShareChips text={shareText} url={link} title="Kring Price Check" lang={lang} testIdPrefix="kp-share" only={['line', 'wechat', 'xhs']} />
        <p className="kp-share-note">{th ? 'ไม่มีชื่อ ไม่มีหน้า ส่งใน LINE, WeChat หรือลง 小红书 ได้สบายใจ' : 'No names, no faces — safe for LINE, WeChat, 小红书 or your story.'}</p>
        {toast ? (
          <p className="kp-toast" role="status">
            ✓ {toast}
          </p>
        ) : null}
      </div>
    </Sheet>
  )
}
