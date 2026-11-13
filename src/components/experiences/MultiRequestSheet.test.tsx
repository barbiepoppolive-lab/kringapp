import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import MultiRequestSheet, { type RequestLocal } from './MultiRequestSheet'
import { getExperience, localProfile, LOCAL_PROFILES, venueFor } from '../../lib/experiences'
import { broadcastBalance } from '../vip/walletKit'

const L = (id: string, name: string, pinned = true): RequestLocal => ({ id, name, photo: '', profile: LOCAL_PROFILES[id] ?? localProfile({ id, name }), pinned })

describe('KRING FIX2 · F3 · the one booking sheet', () => {
  it('Wei 18–20 · V3 — one local: Book pops up THE card ("Send request", Trip fee ฿1,200, no second "Book"), a named meeting point', () => {
    const { rerender } = render(<MultiRequestSheet open onClose={() => {}} experience={getExperience('street-food-walk')!} locals={[L('host-kwan', 'Kwan')]} initialSelected={['host-kwan']} mode="single" />)
    const sheet = screen.getByTestId('multi-request-sheet')
    expect(sheet).toHaveAttribute('aria-label', 'Book a local')
    expect(screen.getByTestId('mr-send')).toHaveTextContent('Send request')
    expect(screen.queryByTestId('mr-offer')).toBeNull()
    expect(within(sheet).getAllByRole('button').filter((b) => /^Book\b/.test(b.textContent ?? ''))).toHaveLength(0)
    expect(sheet).toHaveTextContent('Your card with Kwan')
    expect(screen.getByTestId('kring-card-fee')).toHaveTextContent('฿1,200')
    expect(screen.getByTestId('kring-card-fee')).toHaveTextContent('Trip fee')
    expect(sheet).toHaveTextContent('Yaowarat Rd, Chinatown')
    expect(sheet).toHaveTextContent('Kwan allows suggestions')
    expect(sheet).not.toHaveTextContent(/\bprice\b/i)
    expect(sheet).not.toHaveTextContent(/\btip\b/i)
    expect(sheet).not.toHaveTextContent('all-in')
    expect(sheet).not.toHaveTextContent('public reception')
    rerender(<MultiRequestSheet open onClose={() => {}} experience={getExperience('street-food-walk')!} locals={[L('host-kwan', 'Kwan')]} initialSelected={['host-kwan']} mode="single" language="th" />)
    expect(screen.getByTestId('multi-request-sheet')).toHaveTextContent('ค่าทริป')
    expect(screen.getByTestId('mr-send')).toHaveTextContent('ส่งคำขอ')
    expect(screen.getByTestId('multi-request-sheet')).not.toHaveTextContent('ทิป')
    expect(screen.getByTestId('multi-request-sheet')).not.toHaveTextContent('รวมทุกอย่าง')
  })

  it('Wei 56 — several locals: asks exactly the ticked ones, shows a pinned local who doesn’t host it (never dropped silently), venue in full', () => {
    render(
      <MultiRequestSheet
        open
        onClose={() => {}}
        experience={getExperience('salon-nails')!}
        locals={[L('host-mint', 'Mint'), L('host-ploy', 'Ploy')]}
        notHosting={[L('host-bee', 'Bee')]}
        initialSelected={['host-mint', 'host-ploy']}
        mode="multi"
      />,
    )
    const sheet = screen.getByTestId('multi-request-sheet')
    expect(sheet).toHaveAttribute('aria-label', 'Ask several locals')
    expect(screen.getByTestId('mr-send')).toHaveTextContent('Ask 2 locals at once')
    expect(screen.getByTestId('mr-row-na-host-bee')).toHaveTextContent("Doesn't host this · not asked")
    expect(sheet).toHaveTextContent('Siam Paragon beauty floor (4F), Siam')
    expect(sheet).not.toHaveTextContent('Salon in a mall')
    expect(sheet).not.toHaveTextContent(/released automatically/i)
  })
})

describe('KRING FIX3 · F3', () => {
  it('Wei 3 — one venue rule: Mint does hair & nails at her own salon; Ploy\'s café hop is at the cafés, never her spa', () => {
    const salon = getExperience('salon-nails')!
    expect(venueFor(LOCAL_PROFILES['host-mint'], salon)).toMatchObject({ en: 'Nara Salon, Siam Square', own: true })
    expect(venueFor(LOCAL_PROFILES['host-ploy'], getExperience('cafe-hop-desserts')!).en).not.toMatch(/Spa/)
    render(<MultiRequestSheet open onClose={() => {}} experience={salon} locals={[L('host-mint', 'Mint')]} initialSelected={['host-mint']} mode="single" />)
    const sheet = screen.getByTestId('multi-request-sheet')
    expect(sheet).toHaveTextContent('Nara Salon, Siam Square')
    expect(sheet).toHaveTextContent('Mint hosts here · licensed business')
    expect(sheet).not.toHaveTextContent('Siam Paragon')
  })

  it('Wei 1/2 — no cash: the top-up opens with the missing cash; the "Add ฿X cash" line clears as soon as cash covers it', () => {
    broadcastBalance({ paidCoins: 0, bonusCoins: 100000 })
    const asked: number[] = []
    const on = (e: Event) => asked.push((e as CustomEvent<{ needThb: number }>).detail.needThb)
    window.addEventListener('chon:open-topup', on)
    // the App wallet refuses a hold it can't cover
    const refuse = (e: Event) => {
      const d = (e as CustomEvent<{ paidDelta?: number; accepted?: boolean }>).detail
      if ((d.paidDelta ?? 0) < 0) d.accepted = false
    }
    window.addEventListener('chon:wallet-delta', refuse)
    render(<MultiRequestSheet open onClose={() => {}} experience={getExperience('street-food-walk')!} locals={[L('host-kwan', 'Kwan')]} initialSelected={['host-kwan']} mode="single" />)
    fireEvent.click(screen.getByTestId('mr-send'))
    expect(asked).toEqual([1200])
    expect(screen.getByTestId('mr-short')).toHaveTextContent('Add ฿1,200 cash for ฿1,200')
    act(() => broadcastBalance({ paidCoins: 120000, bonusCoins: 100000 }))
    expect(screen.queryByTestId('mr-short')).toBeNull()
    window.removeEventListener('chon:open-topup', on)
    window.removeEventListener('chon:wallet-delta', refuse)
  })
})
