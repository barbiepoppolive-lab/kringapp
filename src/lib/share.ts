/**
 * KRING FIX3 · one share helper for every share sheet (bump share card, Price Check verdict, profile / invite).
 *
 * Founder: plain labelled chips — no brand logos or colours. Order: native share sheet (when the device has one),
 * LINE, WeChat, 小红书, Copy link.
 *  - native  → navigator.share({ title, text, url })
 *  - line    → opens https://line.me/R/share?text=<text + url> (LINE's official share URL)
 *  - wechat  → WeChat has no public web share URL: copies the LINK + toast "paste it in WeChat"
 *  - xhs     → 小红书 has no web share URL either: copies TEXT + LINK + toast "paste it in 小红书"
 *  - copy    → copies the link
 *
 *   import { shareTargets, runShare } from '../lib/share'
 *   shareTargets(text, url, { lang: 'th' }).map((t) => <button onClick={() => t.run()}>{t.label}</button>)
 *   // or the ready-made chips: <ShareChips text={…} url={…} lang={…} testIdPrefix="price-share" />
 *
 * `url` may be given with or without a scheme (kring.app/@ploy → https://kring.app/@ploy).
 * Toasts go through the one top island (chon:island). Never throws.
 */

export type ShareTargetId = 'native' | 'line' | 'wechat' | 'xhs' | 'copy'
export type ShareLang = 'en' | 'th' | 'zh'
/** what happened: shared (native) · opened (LINE) · copied (WeChat / 小红书 / copy) · cancelled · failed */
export type ShareOutcome = 'shared' | 'opened' | 'copied' | 'cancelled' | 'failed'

export interface ShareOptions {
  title?: string
  lang?: ShareLang | string
  /** show the top-island toast after a copy (default true) */
  toast?: boolean
  /** limit / reorder the targets (default: all, native first when available) */
  only?: ShareTargetId[]
  /** called after every run with its outcome (analytics, "✓ copied" states) */
  onDone?: (id: ShareTargetId, outcome: ShareOutcome) => void
}

export interface ShareTarget {
  id: ShareTargetId
  /** plain label in the reader's language */
  label: string
  run: () => Promise<ShareOutcome>
}

const LABELS: Record<ShareTargetId, Record<ShareLang, string>> = {
  native: { en: 'Share…', th: 'แชร์…', zh: '分享…' },
  line: { en: 'LINE', th: 'LINE', zh: 'LINE' },
  wechat: { en: 'WeChat', th: 'WeChat', zh: '微信' },
  xhs: { en: '小红书', th: '小红书', zh: '小红书' },
  copy: { en: 'Copy link', th: 'คัดลอกลิงก์', zh: '复制链接' },
}

const TOASTS: Record<'wechat' | 'xhs' | 'copy' | 'failed', Record<ShareLang, string>> = {
  wechat: { en: 'Link copied · paste it in WeChat', th: 'คัดลอกลิงก์แล้ว · วางใน WeChat ได้เลย', zh: '链接已复制 · 打开微信粘贴即可' },
  xhs: { en: 'Text + link copied · paste it in 小红书', th: 'คัดลอกข้อความและลิงก์แล้ว · วางใน 小红书 ได้เลย', zh: '文案和链接已复制 · 打开小红书粘贴即可' },
  copy: { en: 'Link copied', th: 'คัดลอกลิงก์แล้ว', zh: '链接已复制' },
  failed: { en: 'Couldn’t copy · long-press the link instead', th: 'คัดลอกไม่ได้ · กดค้างที่ลิงก์แทน', zh: '无法复制 · 请长按链接' },
}

function langOf(l?: string): ShareLang {
  return l === 'th' ? 'th' : l === 'zh' ? 'zh' : 'en'
}

/** kring.app/@ploy → https://kring.app/@ploy (leaves full URLs alone) */
export function absoluteUrl(url: string): string {
  const u = (url ?? '').trim()
  if (!u) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u.replace(/^\/+/, '')}`
}

export function canNativeShare(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function'
  } catch {
    return false
  }
}

/** Clipboard API first, then the old textarea + execCommand path (in-app browsers). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }
  try {
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy')
    ta.remove()
    return !!ok
  } catch {
    return false
  }
}

function toast(text: string, tone: 'green' | 'red' = 'green') {
  try {
    window.dispatchEvent(new CustomEvent('chon:island', { detail: { text, tone, icon: tone === 'green' ? '✓' : '!', ms: 2400 } }))
  } catch {
    // no window
  }
}

/** Run one target. */
export async function runShare(id: ShareTargetId, text: string, url: string, opts: ShareOptions = {}): Promise<ShareOutcome> {
  const L = langOf(opts.lang)
  const link = absoluteUrl(url)
  const both = link && !text.includes(url) && !text.includes(link) ? `${text} ${link}`.trim() : text
  const wantToast = opts.toast !== false
  let out: ShareOutcome = 'failed'
  try {
    if (id === 'native') {
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
      if (typeof nav.share !== 'function') out = (await copyToClipboard(both)) ? 'copied' : 'failed'
      else
        out = await nav.share({ title: opts.title, text, url: link || undefined }).then(
          () => 'shared' as const,
          (e: unknown) => ((e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed'),
        )
    } else if (id === 'line') {
      const w = window.open(`https://line.me/R/share?text=${encodeURIComponent(both)}`, '_blank', 'noopener,noreferrer')
      out = w === null && typeof window.open !== 'function' ? 'failed' : 'opened'
    } else {
      const payload = id === 'xhs' ? both : link || both
      out = (await copyToClipboard(payload)) ? 'copied' : 'failed'
      if (wantToast) toast(out === 'copied' ? TOASTS[id][L] : TOASTS.failed[L], out === 'copied' ? 'green' : 'red')
    }
  } catch {
    out = 'failed'
  }
  opts.onDone?.(id, out)
  return out
}

/** The share targets in order (native first only when the device has a share sheet). */
export function shareTargets(text: string, url: string, opts: ShareOptions = {}): ShareTarget[] {
  const L = langOf(opts.lang)
  const base: ShareTargetId[] = opts.only ?? ['native', 'line', 'wechat', 'xhs', 'copy']
  const ids = base.filter((id) => id !== 'native' || canNativeShare())
  return ids.map((id) => ({ id, label: LABELS[id][L], run: () => runShare(id, text, url, opts) }))
}
