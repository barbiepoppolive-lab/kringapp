import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetPlanStore, acceptOffer, createOffer, getPlanStore } from '../../lib/planStore'
import BumpCheckIn from './BumpCheckIn'

/** KRING FIX1 · F4 — the rebuilt กริ๊ง! bump: gated by canRelease, releases once, real names, the money lands in her ring. */

const onDelta = (e: Event) => {
  ;(e as CustomEvent<{ accepted?: boolean }>).detail.accepted = true
}
const pad = (n: number) => String(n).padStart(2, '0')
/** a Bangkok wall-clock date + HH:MM `mins` from now */
function bkk(mins: number) {
  const d = new Date(Date.now() + 7 * 3600_000 + mins * 60_000)
  return { date: d.toISOString().slice(0, 10), clock: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
}
function book(startInMins: number) {
  const s = bkk(startInMins)
  const e = bkk(startInMins + 180)
  const o = createOffer(
    {
      experienceTitle: 'Yaowarat street-food walk',
      guestId: 'wei',
      guestName: 'Wei',
      localId: 'kwan',
      localName: 'Kwan',
      fromThb: 1200,
      terms: { priceThb: 1200, date: s.date, start: s.clock, end: e.clock, venue: 'Wat Mangkon MRT · exit 1', groupSize: 1 },
    },
    'guest',
  )!
  return acceptOffer(o.id, 'host')!
}

beforeEach(() => {
  __resetPlanStore()
  window.localStorage.clear()
  window.addEventListener('chon:wallet-delta', onDelta)
})
afterEach(() => window.removeEventListener('chon:wallet-delta', onDelta))

describe('BumpCheckIn (F4 rebuild)', () => {
  it('inside the window: the hold releases ONCE to the local, names both people and fills her goal ring', async () => {
    const b = book(-10)
    const released: unknown[] = []
    const onRel = (e: Event) => released.push((e as CustomEvent).detail)
    window.addEventListener('kring:released', onRel)
    let how: string | null = null
    render(<BumpCheckIn booking={b} side="guest" th={false} onClose={() => {}} onReleased={(_bk, m) => (how = m)} />)
    expect(screen.getByTestId('kring-bump')).toHaveAttribute('data-phase', 'ready')
    expect(screen.getByTestId('kring-bump')).toHaveTextContent('Yaowarat street-food walk')
    expect(screen.queryByTestId('kring-bump-locked')).toBeNull()
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('kring-bump-stage'), { key: 'Enter' })
    })
    window.removeEventListener('kring:released', onRel)
    expect(getPlanStore().bookings[b.id]).toMatchObject({ status: 'released', method: 'bump' })
    expect(how).toBe('bump')
    expect(released).toHaveLength(1)
    expect(screen.getByTestId('kring-bump')).toHaveAttribute('data-phase', 'released')
    expect(screen.getByTestId('kring-bump-word')).toHaveTextContent('กริ๊ง!')
    const card = screen.getByTestId('kring-bump-released')
    // KRING T3 · the same card on both phones; the guest's pill says what she paid — no percentage anywhere
    expect(card).toHaveTextContent('You both went กริ๊ง!')
    expect(card).toHaveTextContent('Yaowarat street-food walk')
    expect(screen.getByTestId('kring-bump-money')).toHaveTextContent('Paid to Kwan ฿1,200')
    expect(screen.getByTestId('kring-bump')).not.toHaveTextContent('%')
    // ฿960 of the default ฿2,200 day goal
    expect(screen.getByTestId('kring-bump-goal')).toHaveAttribute('data-pct', '44')
    // a second bump never releases twice
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('kring-bump-stage'), { key: 'Enter' })
    })
    expect(released).toHaveLength(1)
  })

  it('too early: says when and where it opens, and neither the bump nor the QR moves money', async () => {
    const b = book(26 * 60)
    render(<BumpCheckIn booking={b} side="guest" th={false} onClose={() => {}} />)
    expect(screen.getByTestId('kring-bump-locked')).toHaveTextContent(/Opens .*at \d\d:\d\d at Wat Mangkon MRT/)
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('kring-bump-stage'), { key: 'Enter' })
      fireEvent.pointerDown(screen.getByTestId('kring-bump-stage'))
    })
    fireEvent.click(screen.getByTestId('kring-bump-qr-open'))
    expect(screen.getByTestId('kring-bump-qr-scan')).toBeDisabled()
    expect(getPlanStore().bookings[b.id].status).toBe('held')
  })

  it('the venue QR releases the same way (method qr)', async () => {
    const b = book(-5)
    render(<BumpCheckIn booking={b} side="host" th={false} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('kring-bump-qr-open'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('kring-bump-qr-scan'))
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(getPlanStore().bookings[b.id]).toMatchObject({ status: 'released', method: 'qr' })
    // V4.3 Option A: the check-in stage shows the unified booking amount without upfront fee math
    // KRING T3 · the local sees her own amount, never a percentage
    expect(screen.getByTestId('kring-bump-released')).toHaveTextContent('You both went กริ๊ง!')
    expect(screen.getByTestId('kring-bump-money')).toHaveTextContent('Released to you ฿960')
    expect(screen.getByTestId('kring-bump-done')).toHaveTextContent('Done · review Wei')
  })

  it('never prints a placeholder name: the signed-in guest shows by their profile name', () => {
    window.localStorage.setItem('chon_profile_v1', JSON.stringify({ v: 1, name: 'Wei Chen', gender: 'man', prefs: [], city: 'Bangkok', langs: ['en'], notifications: true, sounds: true, completedAt: 'x' }))
    const b = { ...book(-10), guestName: 'Demo Traveler' }
    render(<BumpCheckIn booking={b} side="guest" th={false} onClose={() => {}} />)
    expect(screen.getByTestId('kring-bump')).not.toHaveTextContent(/Demo Traveler/i)
    expect(screen.getByTestId('kring-bump')).toHaveTextContent('Wei Chen')
  })

  it('KRING FIX2 · Ploy 29/33: each phone shows its OWNER — "Your phone" is the viewer, the other is labelled by name', () => {
    const b = book(-10)
    const { unmount } = render(<BumpCheckIn booking={b} side="guest" th={false} onClose={() => {}} />)
    const guestPhone = document.querySelector('.kc-phone[data-owner="guest"]')!
    const localPhone = document.querySelector('.kc-phone[data-owner="local"]')!
    expect(guestPhone.querySelector('.kc-plabel')).toHaveTextContent('Your phone')
    expect(guestPhone.querySelector('.kc-pname')).toHaveTextContent('Wei')
    expect(localPhone.querySelector('.kc-plabel')).toHaveTextContent('Kwan’s phone')
    expect(localPhone.querySelector('.kc-pname')).toHaveTextContent('Kwan')
    expect(localPhone.querySelector('[data-testid="kring-bump-goal"]')).not.toBeNull()
    unmount()
    // the Local's view, in Thai
    render(<BumpCheckIn booking={b} side="host" th onClose={() => {}} />)
    const g2 = document.querySelector('.kc-phone[data-owner="guest"]')!
    const l2 = document.querySelector('.kc-phone[data-owner="local"]')!
    expect(g2.querySelector('.kc-plabel')).toHaveTextContent('โทรศัพท์ Wei')
    expect(g2.querySelector('.kc-pname')).toHaveTextContent('Wei')
    expect(l2.querySelector('.kc-plabel')).toHaveTextContent('โทรศัพท์คุณ')
    expect(l2.querySelector('.kc-pname')).toHaveTextContent('Kwan')
  })

  it('KRING FIX2 · Marco 2: the ending carries a share card (We went กริ๊ง! · experience · ASCII link) with Share / Done', async () => {
    window.localStorage.setItem('chon_profile_v1', JSON.stringify({ v: 1, name: 'พลอย', gender: 'woman', prefs: [], city: 'Bangkok', langs: ['th'], notifications: true, sounds: true, completedAt: 'x' }))
    const b = book(-10)
    render(<BumpCheckIn booking={b} side="guest" th={false} onClose={() => {}} />)
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('kring-bump-stage'), { key: 'Enter' })
    })
    const share = screen.getByTestId('kring-bump-share-card')
    expect(share).toHaveTextContent('พลอย × Kwan')
    expect(share).toHaveTextContent('กริ๊ง!')
    expect(share).toHaveTextContent('Yaowarat street-food walk')
    expect(share).toHaveTextContent('kringapp.com/@ploy')
    expect(screen.getByTestId('kring-bump-share')).toHaveTextContent('Share')
    expect(screen.getByTestId('kring-bump-done')).toBeInTheDocument()
    // KRING FIX3 · founder: Share opens plain chips incl. WeChat + 小红书
    fireEvent.click(screen.getByTestId('kring-bump-share'))
    expect(screen.getByTestId('kring-bump-share-wechat')).toHaveTextContent('WeChat')
    expect(screen.getByTestId('kring-bump-share-xhs')).toHaveTextContent('小红书')
    expect(screen.getByTestId('kring-bump-share-line')).toBeInTheDocument()
  })

  it('KRING FIX3 r4 · Ploy: a trip on another day fills THAT day’s goal and stamps its own day/time, never today', async () => {
    // a released trip TODAY for the same local must not count towards another day's ring
    const todays = book(-10)
    render(<BumpCheckIn booking={todays} side="host" th={false} onClose={() => {}} />)
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('kring-bump-stage'), { key: 'Enter' })
    })
    cleanup()
    // a trip two days ahead, released through the demo skip path (status flipped as checkInBooking would)
    const later = book(2 * 24 * 60)
    const at = Date.now()
    const st = getPlanStore()
    st.bookings[later.id] = { ...st.bookings[later.id], status: 'released', metAt: at, releasedAt: at, method: 'bump' }
    render(<BumpCheckIn booking={st.bookings[later.id]} side="host" th={false} onClose={() => {}} />)
    const card = screen.getByTestId('kring-bump-released')
    expect(card).not.toHaveTextContent(/today/i)
    expect(screen.getByTestId('kring-bump-goal')).toHaveAttribute('data-pct', '44')
    expect(card).not.toHaveTextContent('%')
    expect(card).toHaveTextContent(`Checked in ${later.terms.start}`.replace('Checked in ', ''))
    expect(screen.getByTestId('kring-bump-goal').parentElement).not.toHaveTextContent('Today’s goal')
  })

  it('Thai: the locked state reads in Thai', () => {
    const b = book(26 * 60)
    render(<BumpCheckIn booking={b} side="host" th onClose={() => {}} />)
    expect(screen.getByTestId('kring-bump-locked')).toHaveTextContent(/เปิดให้กริ๊ง/)
  })

  it('V4.3 Option A: flying coin and phone badge show unified booking amount (+฿1,200) without upfront 80% math', () => {
    const b = book(-10)
    render(<BumpCheckIn booking={b} side="guest" th={false} onClose={() => {}} />)
    expect(document.querySelector('.kc-plus')).toHaveTextContent('+฿1,200')
    expect(document.querySelector('.kc-coin')).toHaveTextContent('+฿1,200')
  })
})
