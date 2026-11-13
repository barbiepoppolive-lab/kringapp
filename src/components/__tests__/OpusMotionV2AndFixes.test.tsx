import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import confetti from 'canvas-confetti'
import {
  KRING_BRAND_FIREWORK_COLORS,
  KRING_FIXED_STICKERS,
  computeFixedStickerSplit,
  isLoyKrathongSeason,
  triggerApproachTick10m,
  triggerChaoPhrayaFireworks,
  triggerContactOneShot30ms,
} from '../../lib/kringCreativeEngine'
import { isFemaleTravellerProfile, setProfileGender } from '../../lib/profileStore'
import ExperiencesTab, { type TabLocal } from '../experiences/ExperiencesTab'
import ExperienceCard from '../experiences/ExperienceCard'
import { EXPERIENCES, localProfile } from '../../lib/experiences'
import { StickerTray } from '../chat/ThaiChat'
import BumpModal, { BUMP_ACT_TIMINGS, BUMP_TIP_CHIPS } from '../booking/BumpModal'
import { __resetPlanStore, acceptOffer, createOffer, getPlanStore } from '../../lib/planStore'

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}))

const DEMO_LOCALS: TabLocal[] = [
  {
    id: 'ploy',
    name: 'Ploy',
    photo: '/hosts/ploy.jpg',
    pinned: false,
    live: true,
    profile: localProfile({ id: 'ploy', name: 'Ploy' }),
  },
  {
    id: 'ken',
    name: 'Ken',
    photo: '/hosts/ken.jpg',
    pinned: false,
    live: true,
    profile: localProfile({ id: 'ken', name: 'Ken' }),
  },
]

describe('Opus 2 Open Fixes + Locked Look + MOTION v2 (V2.1–V2.4)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    delete document.documentElement.dataset.reduceMotion
    vi.clearAllMocks()
  })

  describe('Fix #1 — Women-for-Women Comfort Filter Visibility', () => {
    it('hides women-hosts-for-women-toggle for male/non-female profiles and renders it ONLY when profile gender is woman', () => {
      // Default / male profile -> hidden
      setProfileGender('man')
      expect(isFemaleTravellerProfile()).toBe(false)

      render(
        <ExperiencesTab
          language="en"
          locals={DEMO_LOCALS}
          localsPane={<div />}
          onOpenLocal={() => {}}
          onMessage={() => {}}
        />,
      )

      fireEvent.click(screen.getByTestId('experience-filters-btn'))
      expect(screen.queryByTestId('women-hosts-for-women-toggle')).toBeNull()

      // Switch signed-in profile to woman -> toggle becomes visible
      act(() => {
        setProfileGender('woman')
      })
      expect(isFemaleTravellerProfile()).toBe(true)
      const toggle = screen.getByTestId('women-hosts-for-women-toggle')
      expect(toggle).toBeInTheDocument()
      expect(toggle).toHaveAttribute('aria-checked', 'false')

      // Toggling does not leak into window.location / URL state
      const beforeUrl = window.location.href
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-checked', 'true')
      expect(window.location.href).toBe(beforeUrl)
    })
  })

  describe('Fix #2 — Brand-Only Colors + Reduced Motion in triggerChaoPhrayaFireworks', () => {
    it('uses strictly Kring brand colors without pink (#F43F5E) or emerald (#10B981)', () => {
      expect(KRING_BRAND_FIREWORK_COLORS).toEqual([
        '#FFB21E',
        '#FFD067',
        '#7381FF',
        '#3446FF',
        '#9B5CFF',
      ])
      expect(KRING_BRAND_FIREWORK_COLORS).not.toContain('#F43F5E')
      expect(KRING_BRAND_FIREWORK_COLORS).not.toContain('#10B981')
    })

    it('skips confetti completely when prefers-reduced-motion is active', () => {
      vi.useFakeTimers()
      document.documentElement.dataset.reduceMotion = 'true'
      triggerChaoPhrayaFireworks(2)
      vi.runAllTimers()
      expect(confetti).not.toHaveBeenCalled()

      delete document.documentElement.dataset.reduceMotion
      // Stub matchMedia to false
      const origMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
      triggerChaoPhrayaFireworks(1)
      vi.runAllTimers()
      expect(confetti).toHaveBeenCalledTimes(1)
      expect(confetti).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: ['#FFB21E', '#FFD067', '#7381FF', '#3446FF', '#9B5CFF'],
          disableForReducedMotion: true,
        }),
      )
      window.matchMedia = origMatchMedia
      vi.useRealTimers()
    })
  })

  describe('V2.1 — Tilt Depth (HOME ExperienceCard)', () => {
    it('renders 3 tilt layers (photo, title, price-glass) in Cinema mode and triggers startViewTransition on price-glass tap', () => {
      const origMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
      const exp = EXPERIENCES[0]
      const onOpen = vi.fn()
      const startVT = vi.fn((cb?: () => void) => {
        cb?.()
        return {
          ready: Promise.resolve(),
          finished: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: vi.fn(),
        }
      })
      ;(document as unknown as { startViewTransition?: unknown }).startViewTransition = startVT

      render(
        <ExperienceCard
          experience={exp}
          hosts={[{ id: 'ploy', name: 'Ploy', photo: '/hosts/ploy.jpg' }]}
          hero
          onOpen={onOpen}
        />,
      )

      const card = screen.getByTestId(`experience-card-${exp.id}`)
      expect(card).toHaveAttribute('data-look', 'cinema')
      expect(card).toHaveAttribute('data-tilt-layers', '3')

      const priceGlass = screen.getByTestId(`experience-price-glass-${exp.id}`)
      expect(priceGlass).toHaveAttribute('data-tilt-layer', 'price-glass')

      fireEvent.click(priceGlass)
      expect(startVT).toHaveBeenCalledTimes(1)
      expect(onOpen).toHaveBeenCalledWith(exp)

      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
      window.matchMedia = origMatchMedia
    })
  })

  describe('V2.2 — River Lens & Loy Krathong Seasonal Card (Nov 1–15)', () => {
    it('detects Nov 1–15 accurately for Loy Krathong and renders seasonal card when active', () => {
      expect(isLoyKrathongSeason(new Date('2026-11-01T12:00:00Z'))).toBe(true)
      expect(isLoyKrathongSeason(new Date('2026-11-15T18:00:00Z'))).toBe(true)
      expect(isLoyKrathongSeason(new Date('2026-10-25T12:00:00Z'))).toBe(false)
      expect(isLoyKrathongSeason(new Date('2026-11-16T12:00:00Z'))).toBe(false)

      window.localStorage.setItem('kring_loy_krathong_override', 'true')
      render(
        <ExperiencesTab
          language="en"
          locals={DEMO_LOCALS}
          localsPane={<div />}
          onOpenLocal={() => {}}
          onMessage={() => {}}
        />,
      )
      expect(screen.getByTestId('loy-krathong-seasonal-card')).toBeInTheDocument()
      expect(document.getElementById('kring-river-lens')).not.toBeNull()
    })
  })

  describe('V2.3 — Living Thai Type + Fixed-Outcome Stickers (80% fixed, 0% random)', () => {
    it('defines the 4 fixed-outcome stickers (19, 19, 39, 99 THB) with 80% host share and 0% random pool', () => {
      expect(KRING_FIXED_STICKERS.map((s) => `${s.th} ฿${s.thb}`)).toEqual([
        'ขอบคุณค่า ฿19',
        'สู้ ๆ ฿19',
        'อร่อยมาก ฿39',
        'กริ๊ง! ฿99',
      ])
      for (const s of KRING_FIXED_STICKERS) {
        expect(s.hostShareRate).toBe(0.8)
        expect(s.randomPoolRate).toBe(0)
        const split = computeFixedStickerSplit(s.thb)
        expect(split.hostNetThb).toBeCloseTo(s.thb * 0.8, 2)
        expect(split.randomPoolRate).toBe(0)
      }

      const onSticker = vi.fn()
      render(
        <StickerTray
          open
          th={false}
          onSticker={onSticker}
          onEmoji={() => {}}
          onClose={() => {}}
        />,
      )
      const kringSticker = screen.getByTestId('chat-fixed-sticker-kring-99')
      expect(kringSticker).toHaveAttribute('data-host-share', '80')
      expect(kringSticker).toHaveAttribute('data-random-pool', '0')
      fireEvent.click(kringSticker)
      expect(onSticker).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'kring-99',
          text: 'กริ๊ง! ฿99',
        }),
      )
    })
  })

  describe('V2.4 — Bump in 3 Acts (BumpModal.tsx)', () => {
    it('supports Act 1 (10m approach ticks <=100m), Act 2 (30ms haptic + #9B5CFF flash + shockwave), and Act 3 (release line + 50/100/200/500 tips + Add Next Activity)', () => {
      expect(BUMP_TIP_CHIPS).toEqual([50, 100, 200, 500])
      expect(BUMP_ACT_TIMINGS.violetFlashColor).toBe('#9B5CFF')
      expect(BUMP_ACT_TIMINGS.approachVibrateMs).toBe(8)
      expect(BUMP_ACT_TIMINGS.contactVibrateMs).toBe(30)

      const origMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
      const vibrateSpy = vi.fn(() => true)
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
        writable: true,
      })

      expect(triggerApproachTick10m()).toBe(true)
      expect(vibrateSpy).toHaveBeenCalledWith(8)
      expect(triggerContactOneShot30ms()).toBe(true)
      expect(vibrateSpy).toHaveBeenCalledWith(30)

      __resetPlanStore()
      const onDelta = (e: Event) => {
        ;(e as CustomEvent<{ accepted?: boolean }>).detail.accepted = true
      }
      window.addEventListener('chon:wallet-delta', onDelta)
      const now = new Date()
      const bkk = new Date(now.getTime() + 7 * 3600_000)
      const endBkk = new Date(now.getTime() + 7 * 3600_000 + 120 * 60_000)
      const date = bkk.toISOString().slice(0, 10)
      const hh = String(bkk.getUTCHours()).padStart(2, '0')
      const mm = String(bkk.getUTCMinutes()).padStart(2, '0')
      const ehh = String(endBkk.getUTCHours()).padStart(2, '0')
      const emm = String(endBkk.getUTCMinutes()).padStart(2, '0')
      const offer = createOffer(
        {
          experienceTitle: 'Sunset walk',
          guestId: 'alex',
          guestName: 'Alex',
          localId: 'kwan',
          localName: 'Kwan',
          fromThb: 1200,
          terms: {
            priceThb: 1200,
            date,
            start: `${hh}:${mm}`,
            end: `${ehh}:${emm}`,
            venue: 'Wat Mangkon MRT · exit 1',
            groupSize: 1,
          },
        },
        'guest',
      )!
      const booking = acceptOffer(offer.id, 'host')!

      const onTip = vi.fn()
      const onAddNext = vi.fn()
      render(
        <BumpModal
          booking={booking}
          side="guest"
          th={false}
          initialDistanceM={80}
          onClose={() => {}}
          onTip={onTip}
          onAddNextActivity={onAddNext}
        />,
      )

      const dialog = screen.getByTestId('kring-bump')
      expect(dialog).toHaveAttribute('data-act', 'approach')
      expect(dialog).toHaveAttribute('data-distance-m', '80')

      // Step 10m closer -> triggers 8ms approach tick
      vibrateSpy.mockClear()
      fireEvent.click(screen.getByTestId('kring-bump-approach-step'))
      expect(dialog).toHaveAttribute('data-distance-m', '70')
      expect(vibrateSpy).toHaveBeenCalledWith(8)

      // Trigger bump -> transitions to Act 3 in instant test environment
      const stage = screen.getByTestId('kring-bump-stage')
      fireEvent.keyDown(stage, { key: 'Enter' })

      expect(getPlanStore().bookings[booking.id]?.status).toBe('released')
      expect(screen.getByTestId('kring-bump-violet-flash')).toHaveAttribute('data-color', '#9B5CFF')
      expect(screen.getByTestId('kring-bump-shockwave')).toHaveAttribute('data-window-ms', '120-600')
      expect(screen.getByTestId('kring-bump-gold-coin')).toHaveAttribute('data-window-ms', '600-1400')
      expect(screen.getByTestId('kring-bump-act3-release-line')).toHaveTextContent('Released to Kwan ฿960')

      // Tip chips (50, 100, 200, 500) & Add Next Activity
      for (const tip of BUMP_TIP_CHIPS) {
        expect(screen.getByTestId(`kring-bump-tip-${tip}`)).toBeInTheDocument()
      }
      fireEvent.click(screen.getByTestId('kring-bump-tip-100'))
      expect(onTip).toHaveBeenCalledWith(100)

      const addNextBtn = screen.getByTestId('kring-bump-add-next')
      expect(addNextBtn).toHaveAttribute('data-requires-own-bump', 'true')
      fireEvent.click(addNextBtn)
      expect(onAddNext).toHaveBeenCalledTimes(1)

      // Ensure zero '%' text inside kring-bump
      expect(dialog).not.toHaveTextContent('%')

      window.removeEventListener('chon:wallet-delta', onDelta)
      window.matchMedia = origMatchMedia
    })
  })
})
