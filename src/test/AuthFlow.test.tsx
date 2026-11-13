import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import AgeGateModal from '../components/AgeGateModal'
import LoginSheet from '../components/LoginSheet'
import {
  AuthProvider,
  DEMO_TRAVELER_SESSION,
  useAuth,
  type AuthContextValue,
  type AuthSession,
} from '../context/AuthContext'

const authRef: { current: AuthContextValue | null } = { current: null }

function AuthProbe() {
  authRef.current = useAuth()
  return null
}

function GateHarness() {
  const auth = useAuth()
  return (
    <AgeGateModal
      open
      isAgeConfirmed={auth.isAgeConfirmed}
      isConductAccepted={auth.isConductAccepted}
      onConfirmAge={auth.confirmAge20Plus}
      onAcceptConduct={auth.acceptCodeOfConduct}
      onComplete={() => {}}
    />
  )
}

function renderLoginSheet() {
  authRef.current = null
  return render(
    <AuthProvider>
      <AuthProbe />
      <LoginSheet />
    </AuthProvider>,
  )
}

function currentAuth(): AuthContextValue {
  if (!authRef.current) {
    throw new Error('AuthProbe did not render')
  }
  return authRef.current
}

function acceptGateInSheet() {
  fireEvent.click(screen.getByRole('checkbox', { name: /i am 20 or older/i }))
  fireEvent.click(screen.getByRole('checkbox', { name: /code of conduct/i }))
}

function acceptGateInModal() {
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /i am 20 or older/i }))
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /code of conduct/i }))
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

beforeEach(() => {
  authRef.current = null
  window.localStorage.clear()
})

describe('1-Tap Login Sheet', () => {
  it('offers 100% Free LINE Login for Thai locals, Google 1-Tap for travellers and the Agency Portal', () => {
    renderLoginSheet()

    expect(screen.getByRole('button', { name: /free line login/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1-tap with google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /agency portal login/i })).toBeInTheDocument()

    expect(screen.getByText('For Thai locals')).toBeInTheDocument()
    expect(screen.getByText('For travellers')).toBeInTheDocument()
    expect(screen.getByText('100% FREE')).toBeInTheDocument()
    expect(screen.getAllByText('Local').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Traveller').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Agency').length).toBeGreaterThan(0)
  })

  it('shows the mandatory 20+ age gate and code of conduct check', () => {
    renderLoginSheet()

    expect(screen.getByRole('heading', { name: /20\+ age gate & code of conduct/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /i am 20 or older/i })).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: /i accept the kring public experiences code of conduct/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /read the full code of conduct/i })).toBeInTheDocument()
  })

  it('does not sign anyone in before 20+ and the code of conduct are confirmed', () => {
    renderLoginSheet()

    fireEvent.click(screen.getByRole('button', { name: /free line login/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /continue/i })).toBeDisabled()

    const auth = currentAuth()
    expect(auth.session).toBeNull()
    expect(auth.canProceed).toBe(false)
    expect(auth.isAgeConfirmed).toBe(false)
    expect(auth.isConductAccepted).toBe(false)
  })

  it('blocks users who say they are under 20', () => {
    renderLoginSheet()

    fireEvent.click(screen.getByRole('button', { name: /1-tap with google/i }))
    acceptGateInModal()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /under 20/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/20\+ only/i)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /continue/i })).toBeDisabled()

    const auth = currentAuth()
    expect(auth.session).toBeNull()
    expect(auth.canProceed).toBe(false)
  })

  it('signs a confirmed 20+ person in through the 100% Free LINE login as a Traveller (Kring: no role question) and records both timestamps', () => {
    renderLoginSheet()

    acceptGateInSheet()
    fireEvent.click(screen.getByRole('button', { name: /free line login/i }))

    const auth = currentAuth()
    expect(auth.session?.provider).toBe('line')
    expect(auth.session?.role).toBe('guest')
    expect(auth.role).toBe('guest')
    expect(auth.session?.signedInAt).toMatch(ISO_TIMESTAMP)
    // KRING T3 · no role switch UI; setRole stays for back-compat callers and keeps the same session
    act(() => currentAuth().setRole('host'))
    expect(currentAuth().role).toBe('host')
    expect(currentAuth().session?.userId).toBe(auth.session?.userId)
    expect(auth.isAgeConfirmed).toBe(true)
    expect(auth.isConductAccepted).toBe(true)
    expect(auth.canProceed).toBe(true)
    expect(auth.session?.ageConfirmedAt).toMatch(ISO_TIMESTAMP)
    expect(auth.session?.conductAcceptedAt).toMatch(ISO_TIMESTAMP)
    expect(Number.isNaN(new Date(auth.session?.ageConfirmedAt ?? '').getTime())).toBe(false)
  })

  it('signs Travelers in with Google 1-Tap', () => {
    renderLoginSheet()

    acceptGateInSheet()
    fireEvent.click(screen.getByRole('button', { name: /1-tap with google/i }))

    const auth = currentAuth()
    expect(auth.session?.provider).toBe('google')
    expect(auth.session?.role).toBe('guest')
    expect(auth.canProceed).toBe(true)
  })

  it('signs agencies in through the Agency Portal', () => {
    renderLoginSheet()

    acceptGateInSheet()
    fireEvent.click(screen.getByRole('button', { name: /agency portal login/i }))

    const auth = currentAuth()
    expect(auth.session?.provider).toBe('agency')
    expect(auth.session?.role).toBe('agency')
    expect(auth.canProceed).toBe(true)
  })

  it('keeps the 20+ gate state shared between the sheet and the age gate modal', () => {
    renderLoginSheet()

    fireEvent.click(screen.getByRole('button', { name: /read the full code of conduct/i }))
    acceptGateInModal()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /continue/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /i am 20 or older/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /code of conduct/i })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /agency portal login/i }))
    expect(currentAuth().session?.role).toBe('agency')
  })
})

describe('20+ Age Gate & Code of Conduct modal', () => {
  it('keeps Continue disabled until both confirmations are ticked', () => {
    render(
      <AuthProvider>
        <AuthProbe />
        <GateHarness />
      </AuthProvider>,
    )

    const dialog = screen.getByRole('dialog')
    const continueButton = within(dialog).getByRole('button', { name: /continue/i })
    expect(continueButton).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /i am 20 or older/i }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /continue/i })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /code of conduct/i }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /continue/i })).toBeEnabled()
  })

  it('lists the public experiences code of conduct points', () => {
    render(
      <AuthProvider>
        <GateHarness />
      </AuthProvider>,
    )

    expect(screen.getByRole('heading', { name: /kring public experiences code of conduct/i })).toBeInTheDocument()
    expect(screen.getByText(/public venues only/i)).toBeInTheDocument()
    expect(screen.getByText(/promptpay or bank/i)).toBeInTheDocument()
  })

  it('refuses to proceed for a session that never accepted the code of conduct', () => {
    const partialSession: AuthSession = {
      ...DEMO_TRAVELER_SESSION,
      ageConfirmedAt: null,
      conductAcceptedAt: null,
    }

    render(
      <AuthProvider initialSession={partialSession}>
        <AuthProbe />
        <GateHarness />
      </AuthProvider>,
    )

    const auth = currentAuth()
    expect(auth.session).not.toBeNull()
    expect(auth.canProceed).toBe(false)

    acceptGateInModal()

    const unlocked = currentAuth()
    expect(unlocked.isAgeConfirmed).toBe(true)
    expect(unlocked.isConductAccepted).toBe(true)
    expect(unlocked.canProceed).toBe(true)
    expect(unlocked.session?.ageConfirmedAt).toMatch(ISO_TIMESTAMP)
    expect(unlocked.session?.conductAcceptedAt).toMatch(ISO_TIMESTAMP)
  })
})

describe('App auth flow', () => {
  it('BUG-019: cleared storage shows 20+ age gate & LoginSheet first (never skips straight to feed), and gates Try Demo Mode behind 20+ confirmation with DEMO banner', () => {
    window.localStorage.clear()
    render(<App />)

    // First screen with cleared storage is the LoginSheet + 20+ Age Gate, NOT the Experiences feed
    expect(screen.queryByRole('button', { name: '✦ Experiences' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /20\+ age gate & code of conduct/i })).toBeInTheDocument()

    // Clicking Try Demo Mode before confirming 20+ opens the AgeGateModal and blocks entry
    fireEvent.click(screen.getByTestId('try-demo-mode-btn'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /continue/i })).toBeDisabled()

    // Confirm 20+ and Code of Conduct in the modal and continue into Demo Mode
    acceptGateInModal()
    fireEvent.click(within(dialog).getByRole('button', { name: /continue/i }))

    expect(screen.getByRole('button', { name: '✦ Experiences' })).toBeInTheDocument()
    expect(screen.getByTestId('demo-mode-banner')).toHaveTextContent(/DEMO MODE/i)
    expect(screen.getByTestId('header-wallet-balance')).toHaveTextContent(/Demo/i)
  })

  it('renders the 4-tab shell for the signed in demo Traveler', () => {
    render(<App initialSession={DEMO_TRAVELER_SESSION} />)

    expect(screen.getByRole('heading', { name: /kring/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '✦ Experiences' })).toBeInTheDocument()
  })

  it('logs out to the 1-Tap Login Sheet, signs back in with LINE and lands in the same one-app shell (KRING T3: no role switch)', async () => {
    render(<App initialSession={DEMO_TRAVELER_SESSION} />)

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))

    expect(screen.queryByRole('button', { name: '✦ Experiences' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /free line login/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /20\+ age gate & code of conduct/i })).toBeInTheDocument()

    acceptGateInSheet()
    fireEvent.click(screen.getByRole('button', { name: /free line login/i }))

    // Kring R4 · a sign-in always lands on Experiences
    expect(screen.getByRole('button', { name: '✦ Experiences' })).toHaveAttribute('aria-current', 'page')

    // KRING T3 · one app: My profile has no Traveller / Local / Agency switch; the same 4 tabs for everyone
    act(() => {
      window.dispatchEvent(new CustomEvent('kring:edit-profile'))
    })
    await screen.findByTestId('my-profile-close', {}, { timeout: 5000 })
    expect(screen.queryByTestId('profile-role-pill')).toBeNull()
    expect(screen.queryByTestId('profile-role-host')).toBeNull()
    fireEvent.click(screen.getByTestId('my-profile-close'))
    for (const name of ['✦ Experiences', '฿ Kring Price', '💬 Chats', '👤 Me']) expect(screen.getByRole('button', { name })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))
    expect(screen.getByText(/signed in as/i)).toHaveTextContent('LINE')
  })

  it('switches account from the VIP & Wallet tab without losing the 20+ confirmations', () => {
    render(<App initialSession={DEMO_TRAVELER_SESSION} />)

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))
    fireEvent.click(screen.getByRole('button', { name: /switch account \/ role/i }))

    fireEvent.click(screen.getByRole('button', { name: /agency portal login/i }))

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))
    expect(screen.getByText(/signed in as/i)).toHaveTextContent('Agency')
    expect(screen.getByText(/signed in as/i)).toHaveTextContent('Agency Portal')
  })
})
