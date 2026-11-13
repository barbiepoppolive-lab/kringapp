import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import LoginSheet from '../components/LoginSheet'
import CityAwareBanner from '../components/ui/CityAwareBanner'
import { AuthProvider, DEMO_TRAVELER_SESSION, isHosting } from '../context/AuthContext'
import { LanguageProvider } from '../i18n/LanguageContext'
import { getCity, setCity } from '../lib/experiences'
import { awayFromHome, getHomeCity, setHomeCity } from '../lib/homeCity'

/** KRING T3 · W1 shell: no modes, city-aware banner, Thai-first LINE sign-in, never the 80% share. */

beforeEach(() => window.localStorage.clear())

describe('home city (lib/homeCity)', () => {
  it('reads the stored home city, falls back to the profile city, and is never "away" when unknown', () => {
    expect(getHomeCity()).toBeNull()
    expect(awayFromHome('pattaya', null)).toBe(false)
    window.localStorage.setItem('chon_profile_v1', JSON.stringify({ v: 1, city: 'Bangkok' }))
    expect(getHomeCity()).toBe('bangkok')
    setHomeCity('pattaya')
    expect(getHomeCity()).toBe('pattaya')
    expect(awayFromHome('bangkok', 'pattaya')).toBe(true)
    expect(awayFromHome('pattaya', 'pattaya')).toBe(false)
  })
})

describe('city-aware banner', () => {
  it('says "You’re in Pattaya · locals here" when away, in Thai too, and "See Bangkok instead" switches the city', () => {
    setHomeCity('bangkok')
    setCity('pattaya')
    const { unmount } = render(<CityAwareBanner language="en" />)
    expect(screen.getByTestId('city-away-banner')).toHaveTextContent('You’re in Pattaya · locals here')
    expect(screen.getByTestId('city-away-banner')).toHaveTextContent('Home: Bangkok')
    unmount()
    render(<CityAwareBanner language="th" />)
    expect(screen.getByTestId('city-away-banner')).toHaveTextContent('คุณอยู่พัทยา · โลคอลที่นี่')
    expect(screen.getByTestId('city-away-home-btn')).toHaveTextContent('ดูกรุงเทพฯแทน')
    act(() => {
      fireEvent.click(screen.getByTestId('city-away-home-btn'))
    })
    expect(getCity()).toBe('bangkok')
    expect(screen.queryByTestId('city-away-banner')).toBeNull()
  })

  it('shows nothing at home', () => {
    setHomeCity('bangkok')
    setCity('bangkok')
    render(<CityAwareBanner language="en" />)
    expect(screen.queryByTestId('city-away-banner')).toBeNull()
  })
})

describe('Thai-first sign-in', () => {
  it('Thai language puts LINE first as the big button; English keeps Google first', () => {
    window.localStorage.setItem('chon_language', 'th')
    const { unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <LoginSheet />
        </AuthProvider>
      </LanguageProvider>,
    )
    const line = screen.getByTestId('login-line-btn')
    const google = screen.getByTestId('login-continue-btn')
    expect(line).toHaveTextContent('เข้าสู่ระบบด้วย LINE')
    expect(line.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('login-line-first-note')).toHaveTextContent('LINE ขึ้นก่อน')
    expect(document.body.textContent).not.toMatch(/80\s*%/)
    unmount()
    window.localStorage.setItem('chon_language', 'en')
    render(
      <LanguageProvider>
        <AuthProvider>
          <LoginSheet />
        </AuthProvider>
      </LanguageProvider>,
    )
    expect(screen.getByTestId('login-continue-btn')).toHaveTextContent('Continue with Google')
    expect(screen.queryByTestId('login-line-first-note')).toBeNull()
    expect(document.body.textContent).not.toMatch(/80\s*%/)
  })
})

describe('no modes', () => {
  it('a legacy Local session gets the same header, dock and Experiences feed as a traveller (no Local home)', () => {
    render(<App initialSession={{ ...DEMO_TRAVELER_SESSION, role: 'host', displayName: 'Ploy' }} />)
    for (const name of ['✦ Experiences', '฿ Kring Price', '💬 Chats', '👤 Me']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-dock')).toHaveTextContent('Kring Price')
    expect(screen.queryByTestId('host-back-to-home-btn')).toBeNull()
    // the header pill is the same ฿ balance for everyone (no "ready" variant)
    expect(screen.getByTestId('header-wallet-balance')).not.toHaveTextContent(/ready|ถอนได้/)
  })

  it('hosting is derived from activity, never from a picked mode', () => {
    expect(isHosting('guest', { experiences: [] }, { host: {}, hostSettings: {} })).toBe(false)
    expect(isHosting('guest', { experiences: [{ id: 'x' }] }, { host: {}, hostSettings: {} })).toBe(true)
    expect(isHosting('guest', {}, { host: { a: {} as never }, hostSettings: {} })).toBe(true)
    expect(isHosting('host', {}, { host: {}, hostSettings: {} })).toBe(true)
  })
})
