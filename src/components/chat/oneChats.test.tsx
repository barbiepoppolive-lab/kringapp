import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetPlanStore, createOffer } from '../../lib/planStore'
import ChatsAndPlansTab, { isHostRow } from './ChatsAndPlansTab'

/** KRING T3 · W3 — ONE Chats list for everyone: rows you join and rows you host, told apart by a tag. */
const signIn = (userId: string, displayName: string) =>
  window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId, role: 'guest', displayName, isDemoMode: false }))
const onDelta = (e: Event) => {
  ;(e as CustomEvent<{ accepted?: boolean }>).detail.accepted = true
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  __resetPlanStore()
  window.addEventListener('chon:wallet-delta', onDelta)
  signIn('wei-1', 'Wei')
})
afterEach(() => window.removeEventListener('chon:wallet-delta', onDelta))

describe('T3 · one Chats list', () => {
  it('a person who both joins and hosts sees both in ONE list, tagged "You’re joining" / "You’re hosting", with All · Joining · Hosting', () => {
    // Wei joins Mint's walk (Wei is the guest) …
    createOffer({ experienceTitle: 'Street-food walk', guestId: 'wei-1', guestName: 'Wei', localId: 'mint', localName: 'Mint', terms: { priceThb: 900, date: '2099-10-25', start: '14:00', venue: 'Yaowarat' } }, 'guest')
    // … and Mint-the-student asks Wei for English chat over coffee (Wei is the local): a request for HIS listing
    createOffer({ experienceTitle: 'English chat over coffee', guestId: 'ploy-student', guestName: 'Ploy', localId: 'wei-1', localName: 'Wei', terms: { priceThb: 300, date: '2099-10-26', start: '10:00', venue: 'Siam' } }, 'guest', Date.now(), { hold: false, demoReply: false })
    render(<ChatsAndPlansTab />)
    const list = screen.getByTestId('inbox-list-surface')
    const hosting = list.querySelectorAll('[data-side="hosting"]')
    const joining = list.querySelectorAll('[data-side="joining"]')
    expect(hosting.length).toBeGreaterThanOrEqual(1)
    expect(joining.length).toBeGreaterThanOrEqual(1)
    const ployRow = [...hosting].find((r) => r.textContent?.includes('Ploy')) as HTMLElement
    expect(ployRow).toBeTruthy()
    expect(within(ployRow).getByTestId('inbox-row-side')).toHaveTextContent('You’re hosting')
    const mintRow = [...joining].find((r) => r.textContent?.includes('Mint')) as HTMLElement
    expect(within(mintRow).getByTestId('inbox-row-side')).toHaveTextContent('You’re joining')
    // filters
    expect(screen.getByTestId('inbox-side-chips')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('inbox-filter-host'))
    expect(list.querySelectorAll('[data-side="joining"]').length).toBe(0)
    expect(list.querySelectorAll('[data-side="hosting"]').length).toBe(hosting.length)
    fireEvent.click(screen.getByTestId('inbox-filter-join'))
    expect(list.querySelectorAll('[data-side="hosting"]').length).toBe(0)
    // no percentages anywhere in the list
    expect(list.textContent).not.toMatch(/\d\s?%/)
  })

  it('opening a hosting row opens the room as the host with the living card on the local side ("Hosting" tag)', () => {
    createOffer({ experienceTitle: 'English chat over coffee', guestId: 'ploy-student', guestName: 'Ploy', localId: 'wei-1', localName: 'Wei', terms: { priceThb: 300, date: '2099-10-26', start: '10:00', venue: 'Siam' } }, 'guest', Date.now(), { hold: false, demoReply: false })
    render(<ChatsAndPlansTab />)
    const row = screen.getByTestId('inbox-list-surface').querySelector('[data-side="hosting"]') as HTMLElement
    act(() => {
      fireEvent.click(row)
    })
    expect(screen.getByTestId('chat-room-side')).toHaveTextContent('Hosting')
    expect(screen.getByTestId('kring-card-slim')).toHaveTextContent('Your turn')
    expect(isHostRow('h:g-ploystudent')).toBe(true)
    expect(isHostRow('mint')).toBe(false)
  })

  it('a traveller with no listings sees no hosting rows and no filter chips', () => {
    createOffer({ experienceTitle: 'Street-food walk', guestId: 'wei-1', guestName: 'Wei', localId: 'mint', localName: 'Mint', terms: { priceThb: 900, date: '2099-10-25', start: '14:00', venue: 'Yaowarat' } }, 'guest')
    render(<ChatsAndPlansTab />)
    expect(screen.getByTestId('inbox-list-surface').querySelectorAll('[data-side="hosting"]').length).toBe(0)
    expect(screen.queryByTestId('inbox-side-chips')).toBeNull()
  })
})
