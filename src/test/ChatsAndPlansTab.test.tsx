import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ChatsAndPlansTab, { maskPreLockContacts } from '../components/chat/ChatsAndPlansTab'

describe('ChatsAndPlansTab (T-016)', () => {
  it('masks raw phone numbers, LINE IDs, and handles before the Hangout Plan is locked', () => {
    const preLock = maskPreLockContacts(
      'Call me at 081-234-5678 or line id: alex_bkk99',
      false,
    )
    expect(preLock.wasMasked).toBe(true)
    expect(preLock.displayText).toContain('Contact hidden · chat here in Kring until you meet')
    expect(preLock.displayText).not.toContain('081-234-5678')

    const postLock = maskPreLockContacts(
      'Call me at 081-234-5678 or line id: alex_bkk99',
      true,
    )
    expect(postLock.wasMasked).toBe(false)
    expect(postLock.displayText).toContain('081-234-5678')
  })

  it('displays Reciprocal Free Chemistry Chat and resets unreplied counter when Host replies', () => {
    render(<ChatsAndPlansTab />)

    expect(screen.getByTestId('reciprocal-chemistry-banner')).toHaveTextContent(
      /messaging in Kring is free, both ways/i,
    )
    expect(screen.getByTestId('unreplied-streak-pill')).toHaveTextContent(
      /Un-replied streak: 1\/3 Free/i,
    )

    // Send a guest message -> streak becomes 2/3
    fireEvent.change(screen.getByTestId('chat-message-input'), {
      target: { value: 'u free around 8pm?' },
    })
    fireEvent.click(screen.getByTestId('send-chat-message-btn'))
    expect(screen.getByTestId('unreplied-streak-pill')).toHaveTextContent(
      /Un-replied streak: 2\/3 Free/i,
    )

    // Host replies -> streak resets to 0/3 Free
    fireEvent.click(screen.getByTestId('simulate-host-reply-btn'))
    expect(screen.getByTestId('unreplied-streak-pill')).toHaveTextContent(
      /Un-replied streak: 0\/3 Free/i,
    )
  })

  it('renders 1-Tap Voice Note Auto-Subtitles across EN, TH, and ZH', () => {
    render(<ChatsAndPlansTab />)

    const subtitles = screen.getByTestId('voice-note-subtitles')
    expect(subtitles).toHaveTextContent(/See you at the Siam Herbal Spa entrance at 2 PM/i)
    expect(subtitles).toHaveTextContent(/เจอกันที่หน้าสยามเฮอร์บัลสปา บ่ายสองนะคะ/i)
    expect(subtitles).toHaveTextContent(/下午2点在 Siam Herbal Spa 门口见/i)
  })

  it('unlocks Velvet Curtain Stage 2 (unmasks contacts, 1-Tap LINE Swap, E2EE Whisper Mode, and Zero-Friction Phone Clink)', () => {
    const onLockPlan = vi.fn()
    const onPhoneClinkRelease = vi.fn()

    render(
      <ChatsAndPlansTab
        onLockPlan={onLockPlan}
        onPhoneClinkRelease={onPhoneClinkRelease}
      />,
    )

    // Before lock: contact in msg-3 is masked
    expect(screen.getByTestId('chat-message-list')).toHaveTextContent(
      /Contact hidden · chat here in Kring until you meet/i,
    )

    // Lock tonight's plan
    fireEvent.click(screen.getByTestId('lock-tonight-plan-btn'))
    expect(onLockPlan).toHaveBeenCalledWith('Ploy', 50_000)

    // Contact masking turns OFF immediately
    expect(screen.getByTestId('chat-message-list')).toHaveTextContent(/081-234-5678/i)
    expect(screen.getByTestId('velvet-curtain-unlocked-card')).toBeInTheDocument()

    // Share Personal LINE / WhatsApp Card with 1 tap
    fireEvent.click(screen.getByTestId('share-personal-line-btn'))
    expect(screen.getByTestId('chat-message-list')).toHaveTextContent(
      /Contact card shared in Kring/i,
    )

    // Activate E2EE Whisper Mode via After-Plans Vibe Chip
    fireEvent.click(screen.getByText(
      '📍 I’m at the meeting point',
    ))
    expect(screen.getByTestId('toggle-whisper-mode-btn')).toHaveTextContent(
      /Private mode ON/i,
    )

    // Verify arrival with 0.5s Physical Phone Clink (<30cm BLE)
    fireEvent.click(screen.getByTestId('physical-phone-clink-btn'))
    expect(onPhoneClinkRelease).toHaveBeenCalledWith('Ploy', 35_000)
    expect(screen.getByTestId('arrival-verified-badge')).toHaveTextContent(
      /Verified at the venue with the กริ๊ง! bump/i,
    )
  })

  it('includes the 3-Track Short-Bubble Copilot (Buyer / Host / Agent) and Zero-Backfire Anti-Ditch Pivot', () => {
    render(<ChatsAndPlansTab />)

    const copilot = screen.getByTestId('short-bubble-copilot-card')
    expect(copilot).toHaveTextContent(/could we do saturday around 2 pm\?/i)
    expect(screen.getByTestId('zero-backfire-pivot-box')).toHaveTextContent(
      /this saturday slot was just booked by another guest/i,
    )

    fireEvent.click(screen.getByTestId('copilot-track-host'))
    expect(copilot).toHaveTextContent(/วันเสาร์บ่ายสองว่างค่ะ จองในแอปได้เลย/i)

    fireEvent.click(screen.getByTestId('copilot-track-agent'))
    expect(copilot).toHaveTextContent(/เอเจนซีเห็นแค่ยอดรวม/i)
  })

  it('plays the Poppo-style In-Chat Lucky Game with a custom text dialogue and posts a Golden Win Bubble in chat', () => {
    render(<ChatsAndPlansTab />)

    expect(screen.getByTestId('in-chat-lucky-dock')).toBeInTheDocument()
    const dialogueInput = screen.getByTestId('in-chat-lucky-dialogue-input')
    fireEvent.change(dialogueInput, {
      target: { value: 'If I hit 99x, first round at Tichuca is on me! 🥂' },
    })

    fireEvent.click(screen.getByTestId('in-chat-lucky-combo-9'))
    fireEvent.click(screen.getByTestId('in-chat-lucky-roll-btn'))

    const winBubble = screen.getByTestId('in-chat-lucky-win-bubble')
    expect(winBubble).toHaveTextContent(/If I hit 99x, first round at Tichuca is on me!/i)
    expect(winBubble).toHaveTextContent(/WIN · \+/i)
    expect(screen.getByTestId('in-chat-lucky-burst')).toHaveTextContent(/JACKPOT/i)
  })
})
