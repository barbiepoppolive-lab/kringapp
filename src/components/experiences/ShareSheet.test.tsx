import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ShareSheet, { ShareEntry } from './ShareSheet'
import ExperienceCard from './ExperienceCard'
import { openShareFlow, readPresence } from '../../context/presence'
import ExperiencesTab from './ExperiencesTab'
import { EXPERIENCES, getExperience, readListingDetails } from '../../lib/experiences'
import { selfLocalCard } from '../../lib/selfGuard'

const signIn = (role = 'guest') =>
  window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'u-wei', role, displayName: 'Wei' }))

describe('T3 · W2 · "＋ Share something you love" (anyone can share, no Local mode)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem('kring_city_v1', 'bangkok')
  })
  afterEach(() => vi.useRealTimers())

  it('the entry reads "Share something you love · Anyone can · 3 steps" (EN + TH)', () => {
    const { rerender } = render(<ShareEntry onOpen={() => {}} />)
    expect(screen.getByTestId('share-entry')).toHaveTextContent('Share something you love')
    expect(screen.getByTestId('share-entry')).toHaveTextContent('Anyone can · 3 steps')
    rerender(<ShareEntry onOpen={() => {}} language="th" />)
    expect(screen.getByTestId('share-entry')).toHaveTextContent('แชร์สิ่งที่คุณรัก')
  })

  it('not ID-checked → step 0 "Verify your ID" (the demo check), then What · Where · Trip fee → listed through presence, Live', () => {
    vi.useFakeTimers()
    signIn('guest') // a traveller: no role switch needed
    render(<ShareSheet open onClose={() => {}} />)
    expect(screen.getByTestId('share-step-verify')).toHaveTextContent('Verify your ID')
    fireEvent.click(screen.getByTestId('share-id-start'))
    act(() => vi.advanceTimersByTime(1400))
    act(() => vi.advanceTimersByTime(1200))
    expect(screen.getByTestId('share-id-status')).toHaveTextContent('verified')
    fireEvent.click(screen.getByTestId('share-verified-next'))

    // 1 · What
    expect(screen.getByTestId('share-step-what')).toBeInTheDocument()
    expect(screen.getByTestId('share-next')).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-name'), { target: { value: 'Café hop in Ari' } })
    fireEvent.click(screen.getByTestId('share-pick-cafe-hop-desserts'))
    fireEvent.click(screen.getByTestId('share-next'))

    // 2 · Where — public places only
    const area = screen.getByTestId('share-area') as HTMLInputElement
    expect(area.value).toMatch(/Ari/)
    fireEvent.change(area, { target: { value: 'my condo, Ari' } })
    expect(screen.getByTestId('share-next')).toBeDisabled()
    expect(screen.getByTestId('share-area-note')).toHaveTextContent('Public places or licensed businesses only')
    fireEvent.change(area, { target: { value: 'Ari BTS · exit 3' } })
    fireEvent.click(screen.getByTestId('share-next'))

    // 3 · Trip fee (guided by Kring Price), never a percentage
    const fee = screen.getByTestId('share-step-fee')
    expect(screen.getByTestId('share-fee')).toHaveTextContent('฿600')
    expect(screen.getByTestId('share-kring-price')).toHaveTextContent(/Kring Price for .*฿450–฿850/)
    fireEvent.click(screen.getByTestId('share-fee-minus'))
    expect(screen.getByTestId('share-fee')).toHaveTextContent('฿550')
    expect(fee).not.toHaveTextContent('%')
    expect(screen.getByTestId('share-live')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByTestId('share-publish'))

    expect(screen.getByTestId('share-step-done')).toHaveTextContent('You’re sharing “Café hop in Ari”')
    const p = readPresence()
    expect(p).toMatchObject({ setup: true, live: true, experiences: [{ id: 'cafe-hop-desserts', priceThb: 550 }] })
    expect(readListingDetails()['cafe-hop-desserts']).toMatchObject({ name: 'Café hop in Ari', area: 'Ari BTS · exit 3' })
    // her own card exists although the stored role is "guest" (no modes)
    expect(selfLocalCard()?.experiences).toEqual([{ id: 'cafe-hop-desserts', priceThb: 550 }])
  })

  it('verified already → starts at What; "Live now?" off saves it Paused; the fee never goes under ฿300', () => {
    signIn()
    window.localStorage.setItem('kring_id_check_v1', JSON.stringify({ 'u-wei': new Date().toISOString() }))
    render(<ShareSheet open onClose={() => {}} />)
    expect(screen.queryByTestId('share-step-verify')).toBeNull()
    fireEvent.click(screen.getByTestId('share-kind-twoway'))
    fireEvent.click(screen.getByTestId('share-pick-english-chat-coffee'))
    fireEvent.click(screen.getByTestId('share-next'))
    fireEvent.click(screen.getByTestId('share-next'))
    expect(screen.getByTestId('share-fee')).toHaveTextContent('฿300')
    expect(screen.getByTestId('share-fee-minus')).toBeDisabled()
    expect(screen.getByTestId('share-twoway-note')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('share-live'))
    fireEvent.click(screen.getByTestId('share-publish'))
    expect(readPresence()).toMatchObject({ live: false, experiences: [{ id: 'english-chat-coffee', priceThb: 300 }] })
    expect(screen.getByTestId('share-step-done')).toHaveTextContent('Paused')
  })

  it('cards carry one audience tag: Two-way · Weekend trip (Thai / away from home) · For travellers — and no 80 %', () => {
    const card = (id: string, preferWeekend = false, language = 'en') =>
      render(<ExperienceCard experience={getExperience(id)!} hosts={[]} onOpen={() => {}} preferWeekend={preferWeekend} language={language} />)
    card('english-chat-coffee')
    expect(screen.getByTestId('experience-aud-english-chat-coffee')).toHaveTextContent('Two-way')
    card('night-market-tasting')
    expect(screen.getByTestId('experience-aud-night-market-tasting')).toHaveTextContent('For travellers')
    card('koh-larn-day', true, 'th')
    expect(screen.getByTestId('experience-aud-koh-larn-day')).toHaveTextContent('เที่ยวสุดสัปดาห์')
    expect(screen.getByTestId('experience-card-koh-larn-day').getAttribute('aria-label')).toContain('สำหรับคนไทยเที่ยวสุดสัปดาห์')
    for (const el of screen.getAllByRole('button')) expect(`${el.textContent} ${el.getAttribute('aria-label')}`).not.toMatch(/80\s?%/)
  })

  it('Me / My profile open it with openShareFlow(): Experiences takes it (handled) and shows the sheet', () => {
    render(<ExperiencesTab locals={[]} localsPane={null} onOpenLocal={() => {}} onMessage={() => {}} />)
    expect(screen.getByTestId('share-entry')).toBeInTheDocument()
    let handled = false
    act(() => { handled = openShareFlow('me') })
    expect(handled).toBe(true)
    expect(screen.getByTestId('share-sheet')).toBeInTheDocument()
  })

  it('the catalogue holds the five two-way experiences, hosted only by the people who list them', () => {
    const two = EXPERIENCES.filter((e) => e.twoWay).map((e) => e.id)
    expect(two).toEqual(['english-chat-coffee', 'language-exchange-kr-jp', 'interview-practice-english', 'home-dish-abroad', 'study-abroad-qa'])
    for (const id of two) expect(getExperience(id)!.audience).toEqual(['twoway'])
    expect(getExperience('koh-larn-day')!.audience).toEqual(['travellers', 'weekend'])
  })

  it('enforces PDPA biometric consent checkbox, blocks alcohol/guiding words, and supports ฿0 free two-way exchanges', () => {
    signIn()
    render(<ShareSheet open onClose={() => {}} />)
    const pdpaBox = screen.getByTestId('pdpa-biometric-consent') as HTMLInputElement
    expect(pdpaBox.checked).toBe(true)
    fireEvent.click(pdpaBox)
    expect(screen.getByTestId('share-id-start')).toBeDisabled()
    fireEvent.click(pdpaBox)
    expect(screen.getByTestId('share-id-start')).not.toBeDisabled()

    // Now test verified flow with alcohol block + ฿0 two-way exchange
    window.localStorage.setItem('kring_id_check_v1', JSON.stringify({ 'u-wei': new Date().toISOString() }))
    render(<ShareSheet open onClose={() => {}} initialExperienceId="english-chat-coffee" />)
    fireEvent.change(screen.getByTestId('share-name'), { target: { value: 'Free beer bar crawl' } })
    expect(screen.getByTestId('share-name-warn')).toBeInTheDocument()
    expect(screen.getByTestId('share-next')).toBeDisabled()
    fireEvent.change(screen.getByTestId('share-name'), { target: { value: 'English & Thai coffee exchange' } })
    fireEvent.click(screen.getByTestId('share-next'))
    fireEvent.click(screen.getByTestId('share-next'))
    fireEvent.click(screen.getByTestId('share-free-twoway-toggle'))
    expect(screen.getByTestId('share-fee')).toHaveTextContent('฿0 · Free exchange')
    fireEvent.click(screen.getByTestId('share-publish'))
    expect(readPresence().experiences).toContainEqual(expect.objectContaining({ id: 'english-chat-coffee', priceThb: 0 }))
  })
})
