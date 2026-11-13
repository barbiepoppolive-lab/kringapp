import { useState } from 'react'
import { hostKey, listHas, normaliseHandle, safety, useSafety } from '../../lib/safetyStore'
import { triggerHaptic } from '../../lib/haptics'
import '../../styles/deep-motion.css'
import '../../styles/wallet.css'

/**
 * UX-P5 · Founder rule 2 — pre-block by phone / @LINE id + the ONE blocked list with Unblock (Atlas D11).
 * Pure localStorage via safetyStore; no ledger or auth side-effects.
 * `variant`: 'full' (default — both parts), 'preblock' (input + pre-blocked handles), 'list' (blocked people + pre-blocked).
 */
export default function BlockedListPanel({
  language = 'en',
  hostNames = {},
  variant = 'full',
}: {
  language?: string
  hostNames?: Record<string, string>
  variant?: 'full' | 'preblock' | 'list'
}) {
  const state = useSafety()
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const th = language === 'th'
  const showInput = variant !== 'list'
  const showList = variant !== 'preblock'

  const add = () => {
    const h = normaliseHandle(draft)
    if (!h) return
    triggerHaptic('select')
    safety.preBlock(h)
    setDraft('')
    setNote(th ? `บล็อกล่วงหน้า ${h} แล้ว — จะไม่เห็นคุณในแอป` : `${h} pre-blocked — they’ll never see you`)
  }

  return (
    <div className="wl-blocked dm-blocked" data-testid="privacy-blocked-panel">
      {showInput ? (
        <>
          <p className="wl-s">
            {th
              ? 'ใส่เบอร์หรือ @LINE id ของคนที่ไม่อยากให้เห็นคุณ (แฟนเก่า เพื่อนร่วมงาน)'
              : 'Add a phone number or @LINE id you never want to be seen by — an ex, a colleague.'}
          </p>
          <div className="wl-inrow">
            <input
              type="text"
              id="privacy-preblock-input"
              name="privacyPreblock"
              data-testid="privacy-preblock-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
              placeholder={th ? '08x-xxx-xxxx หรือ @line.id' : '+66 8x xxx xxxx or @line.id'}
              aria-label="Phone number or LINE id to pre-block"
              autoComplete="off"
              className="wl-input"
            />
            <button type="button" data-testid="privacy-preblock-add-btn" onClick={add} className="wl-mini-btn is-red m-press" disabled={!draft.trim()}>
              {th ? 'บล็อก' : 'Block'}
            </button>
          </div>
          {note && (
            <p className="wl-s m-fade" role="status" data-testid="privacy-preblock-note">
              {note}
            </p>
          )}
        </>
      ) : null}

      {showList ? (
      <ul
        className="wl-list"
        data-testid="privacy-blocked-list"
        aria-label="Blocked accounts"
      >
        {state.preBlocked.length === 0 && state.blockedHostIds.length === 0 && (
          <li className="wl-row wl-empty" data-testid="privacy-blocked-empty">
            <span className="wl-row-t">
              <small>{th ? 'ยังไม่มีใครถูกบล็อก' : 'No one is blocked yet.'}</small>
            </span>
          </li>
        )}
        {state.blockedHostIds.map((id) => (
          <li key={`host-${id}`} className="wl-row" data-testid={`privacy-blocked-${hostKey(id)}`}>
            <span className="wl-row-ic" aria-hidden="true">⛔</span>
            <span className="wl-row-t">
              <b>{hostNames[hostKey(id)] ?? hostNames[id] ?? id.replace(/^host-/i, '')}</b>
              <small>
                {th ? 'บล็อกแล้ว' : 'blocked'}
                {listHas(state.reportedHostIds, id) ? (th ? ' · รายงานแล้ว' : ' · reported') : ''}
              </small>
            </span>
            <button type="button" data-testid={`privacy-unblock-${hostKey(id)}`} onClick={() => safety.unblock(id)} className="wl-mini-btn m-press">
              {th ? 'ปลดบล็อก' : 'Unblock'}
            </button>
          </li>
        ))}
        {state.preBlocked.map((h) => (
          <li key={`pre-${h}`} className="wl-row" data-testid={`privacy-preblocked-${h.replace(/[^a-z0-9]+/gi, '-')}`}>
            <span className="wl-row-ic" aria-hidden="true">{h.startsWith('@') ? '💬' : '📱'}</span>
            <span className="wl-row-t">
              <b>{h}</b>
              <small>{th ? 'บล็อกล่วงหน้า' : 'pre-blocked'}</small>
            </span>
            <button
              type="button"
              data-testid={`privacy-unblock-${h.replace(/[^a-z0-9]+/gi, '-')}`}
              onClick={() => safety.unPreBlock(h)}
              className="wl-mini-btn m-press"
            >
              {th ? 'ปลดบล็อก' : 'Unblock'}
            </button>
          </li>
        ))}
      </ul>
      ) : null}
    </div>
  )
}
