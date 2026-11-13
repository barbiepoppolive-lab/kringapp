import { afterEach, describe, expect, it, vi } from 'vitest'
import { absoluteUrl, runShare, shareTargets } from './share'

/** KRING FIX3 · founder: every share sheet offers WeChat + 小红书 as plain chips (no public web share URL for either). */

const nav = navigator as unknown as { share?: unknown }
afterEach(() => {
  delete nav.share
  vi.restoreAllMocks()
})

function mockClipboard() {
  const writes: string[] = []
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void writes.push(t) } })
  return writes
}

describe('share helper', () => {
  it('lists LINE · WeChat · 小红书 · Copy link, with the native sheet first only when the device has one', () => {
    expect(shareTargets('t', 'kringapp.com/@ploy').map((x) => x.id)).toEqual(['line', 'wechat', 'xhs', 'copy'])
    nav.share = async () => undefined
    const zh = shareTargets('t', 'kringapp.com/@ploy', { lang: 'zh' })
    expect(zh.map((x) => x.id)).toEqual(['native', 'line', 'wechat', 'xhs', 'copy'])
    expect(zh.map((x) => x.label)).toEqual(['分享…', 'LINE', '微信', '小红书', '复制链接'])
  })

  it('WeChat copies the link and tells you to paste it in WeChat; 小红书 copies text + link', async () => {
    const writes = mockClipboard()
    const toasts: string[] = []
    const on = (e: Event) => toasts.push((e as CustomEvent<{ text: string }>).detail.text)
    window.addEventListener('chon:island', on)
    expect(await runShare('wechat', 'We went กริ๊ง! · Yaowarat', 'kringapp.com/@wei')).toBe('copied')
    expect(await runShare('xhs', 'We went กริ๊ง! · Yaowarat', 'kringapp.com/@wei', { lang: 'th' })).toBe('copied')
    window.removeEventListener('chon:island', on)
    expect(writes).toEqual(['https://kringapp.com/@wei', 'We went กริ๊ง! · Yaowarat https://kringapp.com/@wei'])
    expect(toasts[0]).toMatch(/paste it in WeChat/)
    expect(toasts[1]).toMatch(/小红书/)
  })

  it('LINE opens the official share URL; native uses navigator.share', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    await runShare('line', 'hi', 'kringapp.com/@wei')
    expect(open.mock.calls[0][0]).toBe(`https://line.me/R/share?text=${encodeURIComponent('hi https://kringapp.com/@wei')}`)
    const got: unknown[] = []
    nav.share = async (d: unknown) => void got.push(d)
    expect(await runShare('native', 'hi', 'kringapp.com/@wei', { title: 'Kring' })).toBe('shared')
    expect(got[0]).toEqual({ title: 'Kring', text: 'hi', url: 'https://kringapp.com/@wei' })
  })

  it('absoluteUrl adds https only when missing', () => {
    expect(absoluteUrl('kringapp.com/@ploy')).toBe('https://kringapp.com/@ploy')
    expect(absoluteUrl('https://kringapp.com')).toBe('https://kringapp.com')
  })
})
