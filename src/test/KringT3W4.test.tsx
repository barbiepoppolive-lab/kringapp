import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WalletHome from '../components/vip/WalletHome'
import MyProfile from '../components/profile/MyProfile'
import { __resetRolledBalance } from '../components/vip/walletKit'
import { __resetPlanStore } from '../lib/planStore'
import { AuthProvider } from '../context/AuthContext'
import { getHomeCity } from '../lib/homeCity'
import {
  isListingLive,
  liveListings,
  markIdVerified,
  OPEN_SHARE_EVENT,
  openShareFlow,
  readPresence,
  removeListing,
  setListingLive,
  upsertListing,
  writePresence,
} from '../context/presence'

/** KRING T3 · W4 — Me for everyone: no role tiles, one wallet (in + out), Your experiences Live / Paused each, ✓ Local. */

const signIn = (userId: string, role = 'guest', displayName = 'Ploy', isDemoMode = true) =>
  window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId, role, displayName, isDemoMode, provider: 'line', ageConfirmedAt: new Date().toISOString() }))

const hostProps = { readyThb: 0, points: 0, feeThb: 0, canCashOut: false, onConfirmCashout: () => {} }
const renderMe = (granted: Array<'host' | 'agency'> = []) =>
  render(
    <AuthProvider>
      <WalletHome mode="traveller" onModeChange={() => {}} grantedByAuth={granted} language="en" paidCoins={100_000} bonusCoins={0} isDemoMode host={hostProps} activeHosts={0} friendPaidCoins={0} />
    </AuthProvider>,
  )

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  signIn('ploy-1')
  __resetPlanStore()
  __resetRolledBalance()
})
afterEach(() => cleanup())

describe('presence · Live / Paused per listing (the share flow API)', () => {
  it('upsertListing → Live only after the ID check; each listing pauses on its own; global pause pauses all', () => {
    upsertListing({ id: 'share-cafe-ari', priceThb: 450, title: 'Café hop in Ari', area: 'Ari', live: true })
    upsertListing({ id: 'talat-noi', priceThb: 500, title: 'Talat Noi photo walk', live: true })
    expect(readPresence().setup).toBe(true)
    expect(readPresence().live).toBe(false) // no ID check yet
    expect(liveListings()).toEqual([])
    markIdVerified('ploy-1')
    expect(readPresence().live).toBe(true)
    expect(liveListings().map((x) => x.id)).toEqual(['share-cafe-ari', 'talat-noi'])
    setListingLive('talat-noi', false)
    expect(isListingLive('talat-noi')).toBe(false)
    expect(isListingLive('share-cafe-ari')).toBe(true)
    expect(readPresence().live).toBe(true)
    setListingLive('share-cafe-ari', false)
    expect(readPresence().live).toBe(false)
    writePresence({ live: true }) // legacy switch: none on → all back on
    expect(liveListings()).toHaveLength(2)
    writePresence({ live: false })
    expect(readPresence().experiences?.every((x) => x.live === false)).toBe(true)
    removeListing('talat-noi')
    expect(readPresence().experiences?.map((x) => x.id)).toEqual(['share-cafe-ari'])
    expect(readPresence().experiences?.[0]).toMatchObject({ title: 'Café hop in Ari', area: 'Ari', priceThb: 450 })
  })
  it('openShareFlow reports whether the share sheet took it', () => {
    expect(openShareFlow('me')).toBe(false)
    const take = (e: Event) => ((e as CustomEvent<{ handled?: boolean }>).detail.handled = true)
    window.addEventListener(OPEN_SHARE_EVENT, take)
    expect(openShareFlow('me')).toBe(true)
    window.removeEventListener(OPEN_SHARE_EVENT, take)
  })
})

describe('Me · one app', () => {
  it('no Traveller · Local · Agency tiles; one wallet card with money in + out; never a percentage', () => {
    renderMe()
    expect(screen.queryByTestId('wallet-role-tiles')).toBeNull()
    expect(screen.queryByText(/Using Kring as/i)).toBeNull()
    expect(screen.getByTestId('me-wallet-card')).toHaveTextContent('Wallet · one balance')
    expect(screen.getByTestId('wallet-money-in')).toHaveTextContent('+฿0')
    expect(screen.getByTestId('wallet-money-out')).toHaveTextContent('−฿0')
    expect(screen.getByTestId('wallet-home-topup')).toBeInTheDocument()
    expect(screen.getByTestId('wallet-home-withdraw')).toBeInTheDocument()
    expect(screen.getByTestId('me-activity')).toBeInTheDocument()
    expect(screen.getByTestId('me-share-something')).toHaveTextContent('Share something you love')
    expect(screen.getByTestId('wallet-home')).not.toHaveTextContent(/\d+\s?%/)
  })
  it('Your experiences: each listing has its own switch; ✓ Local badge after the ID check', () => {
    upsertListing({ id: 'share-cafe-ari', priceThb: 450, title: 'Café hop in Ari', live: true })
    upsertListing({ id: 'talat-noi', priceThb: 500, title: 'Talat Noi photo walk', live: false })
    markIdVerified('ploy-1')
    renderMe()
    expect(screen.getByTestId('me-local-badge')).toHaveTextContent('Local')
    const a = screen.getByTestId('me-listing-switch-share-cafe-ari')
    const b = screen.getByTestId('me-listing-switch-talat-noi')
    expect(a).toHaveAttribute('aria-checked', 'true')
    expect(a).toHaveTextContent('Live')
    expect(b).toHaveAttribute('aria-checked', 'false')
    expect(b).toHaveTextContent('Paused')
    act(() => fireEvent.click(b))
    expect(isListingLive('talat-noi')).toBe(true)
    act(() => fireEvent.click(a))
    expect(isListingLive('share-cafe-ari')).toBe(false)
    expect(isListingLive('talat-noi')).toBe(true)
    expect(screen.getByTestId('me-listing-sub-share-cafe-ari')).toHaveTextContent('฿450')
    expect(screen.getByTestId('me-your-experiences')).not.toHaveTextContent('%')
  })
  it('agency tools only for an agency account, from Settings', () => {
    renderMe()
    fireEvent.click(screen.getByTestId('wallet-home-settings'))
    expect(screen.queryByTestId('settings-agency-row')).toBeNull()
    cleanup()
    signIn('ag-1', 'agency', 'Team BKK')
    renderMe(['host', 'agency'])
    fireEvent.click(screen.getByTestId('wallet-home-settings'))
    fireEvent.click(screen.getByTestId('settings-agency-row'))
    expect(screen.getByTestId('wallet-agency-tools-page')).toBeInTheDocument()
  })
})

describe('My profile · ✓ Local badge, home city, no role switch', () => {
  it('shows the badge after the ID check, sets the home city, and has no role pill or 80% copy', () => {
    markIdVerified('ploy-1')
    render(
      <AuthProvider>
        <MyProfile onClose={() => {}} />
      </AuthProvider>,
    )
    expect(screen.getByTestId('profile-verified-badge')).toHaveTextContent('✓ Local')
    expect(screen.queryByTestId('profile-role-pill')).toBeNull()
    fireEvent.click(screen.getByTestId('profile-home-city-pattaya'))
    expect(getHomeCity()).toBe('pattaya')
    expect(screen.getByTestId('profile-home-city-pattaya')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('my-profile')).not.toHaveTextContent('80%')
  })
})
