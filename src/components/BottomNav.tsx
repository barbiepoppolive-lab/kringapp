import { useState, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { triggerHaptic } from '../lib/haptics'
import { t as lex, type LexKey } from '../lib/lexicon'
import '../styles/shell.css'

/** Internal tab ids are unchanged (meet · pulse · chats · vip) so every event/router keeps working.
 *  Visible tabs (KRING VISUAL V2): Experiences · Kring Price · Chats · Me. */
export type TabId = 'meet' | 'pulse' | 'chats' | 'vip'

const TABS: { id: TabId; enLabel: string; icon: string; key: LexKey }[] = [
  { id: 'meet', enLabel: 'Experiences', icon: '✦', key: 'tab.experiences' },
  { id: 'pulse', enLabel: 'Kring Price', icon: '฿', key: 'tab.price' },
  { id: 'chats', enLabel: 'Chats', icon: '💬', key: 'tab.chats' },
  { id: 'vip', enLabel: 'Me', icon: '👤', key: 'tab.me' },
]

/* The approved dock icons (P2/P3 mockups): sparkle · ฿ · bubble · person. */
function TabIcon({ id }: { id: TabId }): ReactNode {
  switch (id) {
    case 'meet':
      return (
        <svg className="kd-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" fill="currentColor" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" />
        </svg>
      )
    case 'pulse':
      return (
        <svg className="kd-ico" viewBox="0 0 24 24" aria-hidden="true">
          <text x="12" y="18.5" textAnchor="middle" fontFamily="'Plus Jakarta Sans','Noto Sans Thai',sans-serif" fontWeight="800" fontSize="19" fill="currentColor">
            ฿
          </text>
        </svg>
      )
    case 'chats':
      return (
        <svg className="kd-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 014 14.5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg className="kd-ico" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.9" />
          <path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )
  }
}

interface BottomNavProps {
  active: TabId
  onChange: (id: TabId) => void
  /** Optional unread counts per tab; rendered as a gold `.ux-tab-badge` that scales in. */
  badges?: Partial<Record<TabId, number>>
}

export default function BottomNav({ active, onChange, badges }: BottomNavProps) {
  const { language } = useLanguage()
  // a short press-in on the icon the user just tapped (never on first paint, nothing moves at rest)
  const [tapped, setTapped] = useState<{ id: TabId; n: number } | null>(null)

  return (
    <nav className="ux-dock sh-dock kd liquid-glass-dock" data-liquid-glass="true" data-testid="bottom-nav-dock" aria-label="Tabs">
      <span className="ux-dock-fade" aria-hidden="true" />
      <ul className="ux-dock-list">
        {TABS.map((tab) => {
          const isActive = active === tab.id
          const badge = badges?.[tab.id] ?? 0
          // KRING T3 · one dock for everyone: Experiences · Kring Price · Chats · Me (the approved one-app mockup)
          const visibleLabel = lex(tab.key, language)
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                aria-label={`${tab.icon} ${tab.enLabel}`}
                data-testid={`tab-${tab.id}`}
                onClick={() => {
                  triggerHaptic('select')
                  setTapped((p) => ({ id: tab.id, n: (p?.n ?? 0) + 1 }))
                  onChange(tab.id)
                }}
                className={`ux-dock-tab${isActive ? ' is-sel' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span key={tapped?.id === tab.id ? `t-${tapped.n}` : 'still'} className={`ux-tab-ico-wrap${tapped?.id === tab.id ? ' kd-tap' : ''}`}>
                  <TabIcon id={tab.id} />
                  {badge > 0 && (
                    <span className="ux-tab-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>
                  )}
                </span>
                <span aria-hidden="true" className="whitespace-nowrap" lang={language === 'th' ? 'th' : undefined}>
                  {visibleLabel}
                </span>
                {isActive && <span className="kd-on" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
