import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GuestPrivacyVault, {
  DEMO_VAULT_RETAINED,
  type GuestPrivacyVaultProps,
} from '../components/guest/GuestPrivacyVault'
import TrustScorecard, {
  DEMO_GHOST_PROFILE,
  type GuestTrustProfile,
} from '../components/guest/TrustScorecard'

const RETAINED = DEMO_VAULT_RETAINED

function renderVault(options: Partial<GuestPrivacyVaultProps> = {}) {
  const onHibernate = vi.fn()
  const onUnlock = vi.fn()
  const onDeleteAccount = vi.fn()

  render(
    <GuestPrivacyVault
      guestId="ghost-guest-8842"
      retained={RETAINED}
      initialPin="1234"
      chatCount={12}
      notificationCount={34}
      onHibernate={onHibernate}
      onUnlock={onUnlock}
      onDeleteAccount={onDeleteAccount}
      {...options}
    />,
  )

  return { onHibernate, onUnlock, onDeleteAccount }
}

function hibernate() {
  fireEvent.click(screen.getByRole('button', { name: /airport hibernation mode/i }))
}

function enterUnlockPin(pin: string) {
  fireEvent.change(screen.getByLabelText(/enter your vault pin/i), { target: { value: pin } })
  fireEvent.click(screen.getByRole('button', { name: /unlock vault/i }))
}

function startDeleteAccount() {
  fireEvent.click(screen.getByRole('button', { name: /delete account & wipe all data/i }))
  return screen.getByRole('group', { name: /pdpa account deletion/i })
}

function confirmDeleteAccount() {
  const confirmGroup = startDeleteAccount()
  fireEvent.click(within(confirmGroup).getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: /permanently delete my account/i }))
}

function ghostProfile(overrides: Partial<GuestTrustProfile> = {}): GuestTrustProfile {
  return { ...DEMO_GHOST_PROFILE, ...overrides }
}

function renderScorecard(profile: GuestTrustProfile = ghostProfile(), holdDurationMs?: number) {
  render(<TrustScorecard profile={profile} holdDurationMs={holdDurationMs} />)
  return screen.getByRole('button', { name: /hold to view/i })
}

describe('Guest Privacy Vault — 4-digit vault PIN setup', () => {
  it('keeps the vault locked until a matching 4-digit PIN is saved', () => {
    renderVault({ initialPin: null })

    expect(screen.getByRole('heading', { name: /set your 4-digit vault pin/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /airport hibernation mode/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Vault PIN'), { target: { value: '12a3' } })
    fireEvent.click(screen.getByRole('button', { name: /save vault pin/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/exactly 4 digits/i)
    expect(screen.queryByRole('button', { name: /airport hibernation mode/i })).not.toBeInTheDocument()
  })

  it('refuses mismatched PIN confirmations, then opens the vault for a matching pair', () => {
    renderVault({ initialPin: null })

    fireEvent.change(screen.getByLabelText('Vault PIN'), { target: { value: '1234' } })
    fireEvent.change(screen.getByLabelText('Confirm vault PIN'), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: /save vault pin/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i)
    expect(screen.queryByRole('button', { name: /airport hibernation mode/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Confirm vault PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /save vault pin/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /vault ready/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /airport hibernation mode/i })).toBeEnabled()
  })

  it('accepts digits only and caps the PIN at 4 characters', () => {
    renderVault({ initialPin: null })

    const pinInput = screen.getByLabelText('Vault PIN') as HTMLInputElement
    fireEvent.change(pinInput, { target: { value: '12ab34cd56' } })

    expect(pinInput.value).toBe('1234')
    expect(pinInput.maxLength).toBe(4)
  })
})

describe('Guest Privacy Vault — 1-Tap Airport Hibernation Mode', () => {
  it('locks the account behind the PIN and wipes local chats and notifications in one tap', () => {
    const { onHibernate } = renderVault()

    expect(screen.getByRole('heading', { name: /vault ready/i })).toBeInTheDocument()
    hibernate()

    expect(onHibernate).toHaveBeenCalledTimes(1)
    expect(onHibernate).toHaveBeenCalledWith({
      guestId: 'ghost-guest-8842',
      wipedChats: 12,
      wipedNotifications: 34,
      retained: RETAINED,
      hibernatedAt: expect.any(String),
    })

    const summary = within(screen.getByRole('list', { name: /hibernation summary/i }))
    expect(summary.getByText('12')).toBeInTheDocument()
    expect(summary.getByText('34')).toBeInTheDocument()
    expect(summary.getByText(/gold front-row vip/i)).toBeInTheDocument()
    expect(summary.getByText(/฿12\.50 balance/i)).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /airport hibernation mode/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/enter your vault pin/i)).toBeInTheDocument()
  })

  it('rejects a wrong unlock PIN and unlocks with the correct one', () => {
    const { onUnlock } = renderVault()
    hibernate()

    enterUnlockPin('9999')

    expect(screen.getByRole('alert')).toHaveTextContent(/wrong pin/i)
    expect(onUnlock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/enter your vault pin/i)).toBeInTheDocument()

    enterUnlockPin('1234')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onUnlock).toHaveBeenCalledTimes(1)
    expect(onUnlock).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: 'ghost-guest-8842', wipedChats: 12, wipedNotifications: 34 }),
    )
    expect(screen.getByRole('heading', { name: /vault ready/i })).toBeInTheDocument()
    expect(screen.getByText(/last hibernation:/i)).toBeInTheDocument()
  })

  it('shows what stays safe while hibernated and wipes nothing on the device', () => {
    renderVault()

    const contents = within(screen.getByRole('list', { name: /vault contents/i }))
    expect(contents.getByText('Gold Front-Row VIP')).toBeInTheDocument()
    expect(contents.getByText(/face \/ passport ✅/i)).toBeInTheDocument()
    expect(contents.getByText(/฿12\.50/)).toBeInTheDocument()
    expect(screen.getByText(/wipes 12 local chats and 34 notifications/i)).toBeInTheDocument()
  })
})

describe('Guest Privacy Vault — PDPA delete account', () => {
  it('requires an explicit confirmation before the account can be deleted', () => {
    renderVault()
    const confirmGroup = startDeleteAccount()

    expect(screen.getByRole('button', { name: /permanently delete my account/i })).toBeDisabled()
    expect(screen.getByText(/raw selfie and gallery photos/i)).toBeInTheDocument()

    fireEvent.click(within(confirmGroup).getByRole('checkbox'))

    expect(screen.getByRole('button', { name: /permanently delete my account/i })).toBeEnabled()
  })

  it('wipes the account and all raw biometric photos for a clean account', () => {
    const { onDeleteAccount } = renderVault()

    confirmDeleteAccount()

    expect(onDeleteAccount).toHaveBeenCalledTimes(1)
    expect(onDeleteAccount).toHaveBeenCalledWith({
      userId: 'ghost-guest-8842',
      rawSelfieUrl: null,
      galleryPhotoUrls: [],
      retainedFaceVector: null,
      wipedAt: expect.any(String),
    })

    expect(screen.getByRole('heading', { name: /account deleted/i })).toBeInTheDocument()
    expect(screen.getByText(/wiped on/i)).toBeInTheDocument()
    expect(screen.getByText(/raw selfie photo: deleted/i)).toBeInTheDocument()
    expect(screen.getByText(/gallery photos: deleted/i)).toBeInTheDocument()
    expect(screen.getByText(/fraud-prevention face vector: not retained/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /airport hibernation mode/i })).not.toBeInTheDocument()
  })

  it('retains only the non-reversible fraud vector for a banned account', () => {
    const { onDeleteAccount } = renderVault({
      pdpaUser: {
        userId: 'ghost-guest-8842',
        isBanned: true,
        rawSelfieUrl: 'https://storage.local/ghost-selfie.jpg',
        galleryPhotoUrls: ['https://storage.local/one.jpg', 'https://storage.local/two.jpg'],
        faceVector: [1, 0, 0],
      },
    })

    confirmDeleteAccount()

    expect(onDeleteAccount).toHaveBeenCalledWith({
      userId: 'ghost-guest-8842',
      rawSelfieUrl: null,
      galleryPhotoUrls: [],
      retainedFaceVector: [1, 0, 0],
      wipedAt: expect.any(String),
    })
    expect(screen.getByText(/retained hash only \(banned account\)/i)).toBeInTheDocument()
  })

  it('allows a full delete straight from the hibernated locked state', () => {
    const { onDeleteAccount } = renderVault()
    hibernate()

    confirmDeleteAccount()

    expect(onDeleteAccount).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: /account deleted/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/enter your vault pin/i)).not.toBeInTheDocument()
  })
})

describe('Trust Scorecard — Verified Ghost Profile badges', () => {
  it('shows the host every trust badge without exposing a public profile', () => {
    renderScorecard()

    expect(screen.getByRole('heading', { name: /verified ghost profile/i })).toBeInTheDocument()
    expect(screen.getByText(/never get a public browse profile/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing here is public/i)).toBeInTheDocument()
    expect(screen.getByText(/ken · osaka · 3rd trip to bangkok/i)).toBeInTheDocument()
    expect(screen.getByText(/ghost id #ghost-guest-8842/i)).toBeInTheDocument()
    expect(screen.getByText('5/5 verified')).toBeInTheDocument()

    const badges = within(screen.getByRole('list', { name: /trust badges/i }))
    expect(badges.getByText('Face / Passport Verified')).toBeInTheDocument()
    expect(badges.getByText('1-Face verified')).toBeInTheDocument()
    expect(badges.getByText('Age')).toBeInTheDocument()
    expect(badges.getByText('29 (20+ confirmed)')).toBeInTheDocument()
    expect(badges.getByText('Punctuality')).toBeInTheDocument()
    expect(badges.getByText('★ 4.9')).toBeInTheDocument()
    expect(badges.getByText('VIP Wealth Tier')).toBeInTheDocument()
    expect(badges.getByText('Gold Front-Row VIP')).toBeInTheDocument()
    expect(badges.getByText('Booking')).toBeInTheDocument()
    expect(badges.getByText('Held until you meet')).toBeInTheDocument()
  })

  it('flags pending badges when the guest is not fully verified', () => {
    renderScorecard(
      ghostProfile({
        faceVerified: false,
        treatEnvelopeLocked: false,
        extraBadges: [{ id: 'no-show', label: 'No-shows', value: '0', verified: true }],
      }),
    )

    expect(screen.getByText('4/6 verified')).toBeInTheDocument()

    const badges = within(screen.getByRole('list', { name: /trust badges/i }))
    expect(badges.getByText('Verification pending')).toBeInTheDocument()
    expect(badges.getByText('Not held yet')).toBeInTheDocument()
    expect(badges.getByText('No-shows')).toBeInTheDocument()
  })
})

describe('Trust Scorecard — watermarked hold-to-view photo', () => {
  it('keeps the photo hidden until the host presses and holds the button', () => {
    const holdButton = renderScorecard()

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(holdButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/watermarked with their ghost id/i)).toBeInTheDocument()

    fireEvent.pointerDown(holdButton)

    const preview = screen.getByRole('img', {
      name: /watermarked photo preview of ken · osaka · 3rd trip to bangkok/i,
    })
    expect(preview).toBeInTheDocument()
    expect(screen.getByText(/verified ghost #ghost-guest-8842 · 1-on-1 public venue only/i)).toBeInTheDocument()
    expect(screen.getByText(/ghost-preview\.jpg · 93% face match/i)).toBeInTheDocument()
    expect(holdButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(/watermark stays on the file/i)

    fireEvent.pointerUp(holdButton)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(holdButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('supports holding the photo with the keyboard for accessibility', () => {
    const holdButton = renderScorecard()

    fireEvent.keyDown(holdButton, { key: ' ' })
    expect(screen.getByRole('img')).toBeInTheDocument()

    fireEvent.keyUp(holdButton, { key: ' ' })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    fireEvent.keyDown(holdButton, { key: 'Enter' })
    expect(screen.getByRole('img')).toBeInTheDocument()

    fireEvent.keyUp(holdButton, { key: 'Enter' })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('hides the photo again on its own when the hold runs too long', () => {
    vi.useFakeTimers()
    try {
      const holdButton = renderScorecard(ghostProfile(), 1000)

      fireEvent.pointerDown(holdButton)
      expect(screen.getByRole('img')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(holdButton).toHaveAttribute('aria-pressed', 'false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('explains the missing photo when the guest has not shared one yet', () => {
    render(<TrustScorecard profile={ghostProfile({ photo: null })} />)

    expect(screen.getByText(/no ghost photo shared yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hold to view/i })).not.toBeInTheDocument()
  })
})
