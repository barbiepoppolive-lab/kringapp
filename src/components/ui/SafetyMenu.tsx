import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listHas, safety, useSafety } from '../../lib/safetyStore'
import { showIsland } from '../fx/island'
import '../../styles/meet-motion.css'
import { activeBookingWith, grantSafetyAccess } from '../../lib/planStore'

/**
 * UX-P5 · Founder rule 2 — visible `⋯` safety menu (Mute / Report / Block).
 * Used in the chat room header and the ClinkGiftSheet header. Writes to the shared safety store
 * so the host card (Meet) and the thread (Inbox) disappear instantly after a Block.
 */
export interface SafetyMenuProps {
  hostId: string
  hostName: string
  testIdPrefix: string
  language?: string
  /** called after a block so the parent can close the sheet / leave the room */
  onBlocked?: () => void
  onReported?: () => void
  onMuted?: (muted: boolean) => void
  /** render the list in a body portal (needed inside overflow-hidden cards) */
  portal?: boolean
}

export default function SafetyMenu({ hostId, hostName, testIdPrefix, language = 'en', onBlocked, onReported, onMuted, portal = false }: SafetyMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const state = useSafety()
  const muted = listHas(state.mutedHostIds, hostId)
  const reported = listHas(state.reportedHostIds, hostId)
  const th = language === 'th'

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (ref.current && !ref.current.contains(t) && !(listRef.current && listRef.current.contains(t)) && !(sheetRef.current && sheetRef.current.contains(t))) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    document.addEventListener('keydown', onKey)
    const onScroll = () => { if (portal && !sheetRef.current) setOpen(false) }
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, portal])

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minHeight: 44,
    padding: '0 14px',
    fontSize: 14,
    fontWeight: 600,
    textAlign: 'left',
    background: 'transparent',
    border: 0,
    color: 'var(--text-1)',
  }

  return (
    <div ref={ref} className="relative shrink-0" data-testid={`${testIdPrefix}-safety-menu`}>
      <button
        type="button"
        data-testid={`${testIdPrefix}-safety-menu-btn`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={th ? 'ความปลอดภัย: ปิดเสียง รายงาน บล็อก' : 'Safety: mute, report, block'}
        onClick={(e) => {
          e.stopPropagation()
          if (portal) {
            // Atlas B7: the menu always stays inside the viewport (opens leftwards / upwards when it must)
            const r = e.currentTarget.getBoundingClientRect()
            const vw = window.innerWidth
            const vh = window.innerHeight
            const width = Math.min(232, vw - 16)
            const left = Math.max(8, Math.min(r.right - width, vw - width - 8))
            const menuH = 156
            const top = r.bottom + 6 + menuH > vh - 8 ? Math.max(8, r.top - 6 - menuH) : r.bottom + 6
            setAnchor({ top, left, width })
          }
          setOpen((v) => !v)
          setConfirmBlock(false)
        }}
        className="ux-btn ux-btn-quiet ux-btn-sm m-press"
        style={{ width: 36, minWidth: 36, height: 36, minHeight: 36, padding: 0, fontSize: 20, lineHeight: 1 }}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open && !confirmBlock && renderList(
        <div
          ref={listRef}
          role="menu"
          data-testid={`${testIdPrefix}-safety-menu-list`}
          className="m-fade"
          style={{
            position: portal ? 'fixed' : 'absolute',
            left: portal ? anchor?.left ?? 8 : undefined,
            right: portal ? undefined : 0,
            top: portal ? anchor?.top ?? 60 : 'calc(100% + 6px)',
            zIndex: portal ? 80 : 60,
            width: portal ? anchor?.width ?? 232 : undefined,
            minWidth: portal ? undefined : 'min(232px, calc(100vw - 16px))',
            padding: 4,
            borderRadius: 16,
            background: 'var(--surface-3)',
            boxShadow: 'inset 0 1px 0 var(--rim), var(--shadow-modal)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            data-testid={`${testIdPrefix}-mute-btn`}
            style={itemStyle}
            onClick={(e) => {
              e.stopPropagation()
              const next = safety.toggleMute(hostId)
              onMuted?.(listHas(next.mutedHostIds, hostId))
              setOpen(false)
            }}
          >
            <span aria-hidden="true">{muted ? '🔔' : '🔕'}</span>
            {muted ? (th ? 'เปิดเสียงแจ้งเตือน' : 'Unmute notifications') : th ? 'ปิดเสียงแจ้งเตือน' : 'Mute notifications'}
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid={`${testIdPrefix}-report-btn`}
            style={itemStyle}
            onClick={(e) => {
              e.stopPropagation()
              safety.report(hostId)
              // KRING (private bookings): a report opens this person's live booking — and only it — to the safety team
              const live = activeBookingWith(hostId) ?? activeBookingWith(hostName)
              if (live) grantSafetyAccess(live.id, 'report')
              onReported?.()
              // one report form: the Safety Center (D) picks it up
              window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: { section: 'report', hostId, hostName } }))
              setTimeout(() => setOpen(false), 900)
            }}
          >
            <span aria-hidden="true">{reported ? '✅' : '🚩'}</span>
            {reported ? (th ? 'ส่งรายงานแล้ว · ตรวจสอบใน 24 ชม.' : 'Reported · 24 h safety review') : th ? `รายงาน ${hostName}` : `Report ${hostName}`}
          </button>

          {!confirmBlock ? (
            <button
              type="button"
              role="menuitem"
              data-testid={`${testIdPrefix}-block-btn`}
              style={{ ...itemStyle, color: 'var(--danger-text)' }}
              onClick={(e) => {
                e.stopPropagation()
                setConfirmBlock(true)
              }}
            >
              <span aria-hidden="true">⛔</span>
              {th ? `บล็อก ${hostName}` : `Block ${hostName}`}
            </button>
          ) : (
            <span className="sr-only">⛔ {hostName}</span>
          )}
        </div>,
      )}

      {/* Atlas B7 · block asks once more in a bottom sheet (portal, so it never clips inside a card) */}
      {open && confirmBlock && renderSheet(
        <div ref={sheetRef} className="sm-scrim" onClick={(e) => { e.stopPropagation(); setConfirmBlock(false) }}>
          <div
            className="sm-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-label={th ? `บล็อก ${hostName}?` : `Block ${hostName}?`}
            data-testid={`${testIdPrefix}-block-confirm`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="sm-handle" aria-hidden="true" />
            <span className="sm-av" aria-hidden="true">{hostName.slice(0, 1)}</span>
            <h4>{th ? `บล็อก ${hostName}?` : `Block ${hostName}?`}</h4>
            <p>
              {th
                ? 'เธอจะไม่เห็นคุณหรือสตอรี่ของคุณ และแชทจะปิด ปลดบล็อกได้ทุกเมื่อในความเป็นส่วนตัว'
                : "They won't see you or your stories, and your chat closes. Unblock any time in Privacy."}
            </p>
            <span className="sr-only">Hides their card, chat and profile both ways. Undo anytime in Privacy → Blocked.</span>
            <button
              type="button"
              data-testid={`${testIdPrefix}-block-confirm-btn`}
              className="ux-btn ux-btn-danger m-press sm-block"
              onClick={(e) => {
                e.stopPropagation()
                safety.block(hostId)
                setOpen(false)
                setConfirmBlock(false)
                showIsland(th ? `บล็อก ${hostName} แล้ว · ปลดได้ในความเป็นส่วนตัว` : `${hostName} blocked · undo in Privacy`, 'neutral', '⛔', 5000)
                onBlocked?.()
              }}
            >
              {th ? 'บล็อก' : 'Block'}
            </button>
            <button
              type="button"
              className="ux-btn ux-btn-quiet m-press sm-cancel"
              onClick={(e) => {
                e.stopPropagation()
                setConfirmBlock(false)
              }}
            >
              {th ? 'ยกเลิก' : 'Cancel'}
            </button>
          </div>
        </div>,
      )}
    </div>
  )

  function renderSheet(node: React.ReactElement) {
    if (typeof document !== 'undefined') return createPortal(node, document.body)
    return node
  }

  function renderList(node: React.ReactElement) {
    if (portal && typeof document !== 'undefined') return createPortal(node, document.body)
    return node
  }
}
