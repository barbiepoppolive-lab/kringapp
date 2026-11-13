import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { VerifiedCheck } from '../ui/LivingIcons'
import { triggerHaptic } from '../../lib/haptics'
import { island, readApply, useTr, WPage, writeApply, type ApplyState } from './walletKit'
import '../../styles/deep-motion.css'
import '../../styles/wallet.css'

/**
 * UX-P5 · ONE account, three modes (✈️ Traveller · 👑 Host · 🤝 Agency) — Atlas D1 mode switch + D4 Become a host.
 * The switch sits under the metal card and flips it. A locked mode opens a 3-step checklist page that ends in a calm
 * "checking" state (no spinner, no modal). Flags live in localStorage (`chon_modes_v1`) and never touch the ledger
 * or the auth provider; only the auth provider can grant a mode.
 */
export type AccountMode = 'traveller' | 'host' | 'agency'
export const MODES_STORAGE_KEY = 'chon_modes_v1'

interface ModesState {
  /** modes granted by the auth provider (never written from a local submit) */
  unlocked: AccountMode[]
  /** modes submitted for review on this device — sandbox preview only, no payouts */
  pending: AccountMode[]
}

export function readModes(): ModesState {
  try {
    const raw = window.localStorage.getItem(MODES_STORAGE_KEY)
    if (!raw) return { unlocked: ['traveller'], pending: [] }
    const parsed = JSON.parse(raw) as Partial<ModesState>
    // Only `traveller` is ever trusted from storage: a locally edited `unlocked` list must not grant a mode.
    const pending = Array.isArray(parsed.pending) ? (parsed.pending as AccountMode[]).filter((m) => m === 'host' || m === 'agency') : []
    return { unlocked: ['traveller'], pending }
  } catch {
    return { unlocked: ['traveller'], pending: [] }
  }
}

/** K5: record a role checklist as submitted on this device (same write the row does). */
export function markModePending(m: Exclude<AccountMode, 'traveller'>) {
  const cur = readModes()
  writeModes({ unlocked: ['traveller'], pending: Array.from(new Set([...cur.pending, m])) })
}

function writeModes(next: ModesState) {
  try {
    window.localStorage.setItem(MODES_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export interface AccountModesRowProps {
  active: AccountMode
  /** host/agency already granted by the auth provider (LINE host login / agency invite) */
  grantedByAuth?: AccountMode[]
  language?: string
  onChange: (mode: AccountMode) => void
}

const AGENCY_CODE_RE = /^[A-Z]{3}-[A-Z0-9]{4}$/

export { APPLY_KEY, APPLY_DEFAULTS, readApply, writeApply, type ApplyState } from './walletKit'

/* ---------------- D4 · activation checklist page ---------------- */
/** K5: exported so the Wallet's role sheet fallback can open the same checklist for a locked role. */
export function ActivationPage({
  mode,
  onBack,
  onSubmitted,
  onPreview,
  alreadyPending,
}: {
  mode: Exclude<AccountMode, 'traveller'>
  onBack: () => void
  onSubmitted: () => void
  onPreview: () => void
  alreadyPending: boolean
}) {
  const isHost = mode === 'host'
  const tr = useTr()
  const [apply, setApply] = useState<ApplyState>(() => readApply())
  const patch = (p: Partial<ApplyState>) => setApply(writeApply(p))
  const selfie = apply.selfie || alreadyPending
  const ppDone = apply.ppDone || alreadyPending
  const story = apply.story || alreadyPending
  const wall = apply.wall || alreadyPending
  const [pp, setPp] = useState('')
  const [code, setCode] = useState(apply.code)
  const [submitted, setSubmitted] = useState(alreadyPending)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // the story is posted from Meet; TopUpSheet's always-on recorder ticks it (see walletKit/TopUpSheet). Pick it up live.
  useEffect(() => {
    const on = () => setApply(readApply())
    window.addEventListener('chon:mode-apply', on)
    window.addEventListener('chon:story-posted', on)
    return () => {
      window.removeEventListener('chon:mode-apply', on)
      window.removeEventListener('chon:story-posted', on)
    }
  }, [])

  const codeOk = AGENCY_CODE_RE.test(code.trim().toUpperCase()) || alreadyPending
  const doneFlags = isHost ? [selfie, ppDone, story] : [codeOk, wall, ppDone]
  const done = doneFlags.filter(Boolean).length
  const all = done === 3
  const pct = Math.round((done / 3) * 100)
  /** Marco: ONE gold button per page — only the next step's action is gold, the rest stay quiet. */
  const nextIdx = doneFlags.findIndex((f) => !f)
  const btn = (i: number) => `wl-mini-btn${i === nextIdx ? ' is-gold' : ''} m-press`

  useEffect(() => {
    if (all && !submitted) {
      setSubmitted(true)
      triggerHaptic('success')
      onSubmitted()
    }
  }, [all, submitted, onSubmitted])

  const masked = apply.ppLast4 ? `•••-•••-${apply.ppLast4}` : ''

  const stepRow = (n: number, ok: boolean, title: string, sub: string, action?: ReactNode, waiting = false) => (
    <li className="wl-step" key={n}>
      <i className={ok ? (waiting ? 'is-wait' : 'is-ok') : ''} aria-hidden="true">
        {ok && !waiting ? <VerifiedCheck size={22} draw="always" label="" /> : n}
      </i>
      <span className="wl-row-t">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      {action ??
        (ok ? <span className={`wl-tag${waiting ? ' is-gold' : ' is-green'}`}>{waiting ? tr('checking', 'กำลังตรวจ') : tr('done', 'เสร็จ')}</span> : null)}
    </li>
  )

  return (
    <WPage open onBack={onBack} title={isHost ? tr('Become a Local', 'มาเป็นโลคอล') : tr('Agency mode', 'โหมดเอเจนซี่')} guide="host" testId="account-mode-activation-sheet">
      <div className="wl-stack">
        <div className="wl-act-head">
          <span className="wl-ring" style={{ '--p': `${pct}%` } as CSSProperties} aria-label={tr(`${done} of 3 done`, `เสร็จ ${done} จาก 3`)} role="img">
            <b>{done}/3</b>
          </span>
          <div>
            <p className="wl-big">
              {all
                ? isHost
                  ? tr('Almost a Local', 'อีกนิดเดียวก็เป็นโลคอล')
                  : tr('Almost there', 'อีกนิดเดียว')
                : isHost
                  ? tr('Three things, about 5 minutes', '3 ขั้น ใช้เวลาราว 5 นาที')
                  : tr('Three things for your team', '3 ขั้นสำหรับทีมของคุณ')}
            </p>
            <p className="wl-s">{tr('Same account, one ID check. Your traveller wallet keeps working.', 'บัญชีเดิม ยืนยันตัวตนครั้งเดียว กระเป๋าผู้จองยังใช้ได้ตามปกติ')}</p>
          </div>
        </div>

        <ol className="wl-list wl-steps-list">
          {isHost ? (
            <>
              {stepRow(
                1,
                selfie,
                tr('Face selfie', 'เซลฟี่ยืนยันหน้า'),
                selfie ? tr('Sent to match with your photos', 'ส่งไปเทียบกับรูปโปรไฟล์แล้ว') : tr('Matched to your photos — 20+ only', 'เทียบกับรูปโปรไฟล์ · อายุ 20+ เท่านั้น'),
                selfie ? undefined : (
                  <>
                    <button type="button" className={btn(0)} data-testid="account-mode-step-0" onClick={() => fileRef.current?.click()}>
                      {tr('Start', 'เริ่ม')}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          patch({ selfie: true })
                          island(tr('Selfie sent for matching', 'ส่งเซลฟี่ไปตรวจแล้ว'), 'green', '✓')
                        }
                      }}
                    />
                  </>
                ),
              )}
              {stepRow(
                2,
                ppDone,
                tr('PromptPay number', 'เบอร์พร้อมเพย์'),
                ppDone ? masked || tr('saved', 'บันทึกแล้ว') : tr('Where your earnings land', 'รายได้จะโอนเข้าที่นี่'),
                ppDone ? undefined : (
                  <button
                    type="button"
                    className={btn(1)}
                    data-testid="account-mode-step-1"
                    disabled={pp.replace(/\D/g, '').length < 9}
                    onClick={() => patch({ ppDone: true, ppLast4: pp.replace(/\D/g, '').slice(-4) })}
                  >
                    {tr('Save', 'บันทึก')}
                  </button>
                ),
              )}
              {!ppDone ? (
                <li className="wl-step-input">
                  <input
                    className="wl-input"
                    inputMode="tel"
                    value={pp}
                    onChange={(e) => setPp(e.target.value)}
                    placeholder="08x-xxx-xxxx"
                    aria-label="PromptPay number"
                    autoComplete="off"
                  />
                </li>
              ) : null}
              {stepRow(
                3,
                story,
                tr('First story', 'สตอรี่แรก'),
                story
                  ? tr('Posted — we’re checking it', 'โพสต์แล้ว รอตรวจแป๊บนึง')
                  : apply.storyAsked
                    ? tr('Post it from the camera, then come back', 'โพสต์จากกล้องแล้วกลับมาที่นี่')
                    : tr('A 10-second hello in your own voice', 'ทักทายสั้นๆ 10 วิ ด้วยเสียงคุณเอง'),
                story ? undefined : (
                  <button
                    type="button"
                    className={btn(2)}
                    data-testid="account-mode-step-2"
                    onClick={() => {
                      // the step ticks only when the story is really posted (`chon:story-posted`), and the
                      // checklist reopens with its progress when they come back to Wallet
                      patch({ storyAsked: true, resume: 'host' })
                      window.dispatchEvent(new CustomEvent('chon:open-story-camera'))
                    }}
                  >
                    {tr('Record', 'อัดเลย')}
                  </button>
                ),
                submitted,
              )}
            </>
          ) : (
            <>
              {stepRow(
                1,
                codeOk,
                tr('Agency invite code', 'รหัสเชิญจากเอเจนซี่'),
                codeOk ? code.trim().toUpperCase() || tr('saved', 'บันทึกแล้ว') : tr('From the agency that invited you, e.g. BKK-7Q2F', 'จากเอเจนซี่ที่ชวนคุณ เช่น BKK-7Q2F'),
              )}
              {!codeOk ? (
                <li className="wl-step-input">
                  <input
                    className="wl-input"
                    data-testid="agency-invite-code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase()
                      setCode(v)
                      if (AGENCY_CODE_RE.test(v)) patch({ code: v })
                    }}
                    placeholder={tr('Invite code, e.g. BKK-7Q2F', 'รหัสเชิญ เช่น BKK-7Q2F')}
                    aria-label="Agency invite code"
                    autoComplete="off"
                  />
                </li>
              ) : null}
              {stepRow(
                2,
                wall,
                tr('Privacy wall', 'กำแพงความเป็นส่วนตัว'),
                tr('You see totals only — never your Locals’ bookings or chats', 'คุณเห็นแค่ยอดรวม ไม่เห็นการจองหรือแชทของโลคอล'),
                wall ? undefined : (
                  <button type="button" className={btn(1)} data-testid="account-mode-step-1" onClick={() => patch({ wall: true })}>
                    {tr('I agree', 'ยอมรับ')}
                  </button>
                ),
              )}
              {stepRow(
                3,
                ppDone,
                tr('Company PromptPay', 'พร้อมเพย์บริษัท'),
                ppDone ? masked || tr('saved', 'บันทึกแล้ว') : tr('Where your monthly bonus lands', 'โบนัสรายเดือนโอนเข้าที่นี่'),
                ppDone ? undefined : (
                  <button
                    type="button"
                    className={btn(2)}
                    data-testid="account-mode-step-2"
                    disabled={pp.replace(/\D/g, '').length < 9}
                    onClick={() => patch({ ppDone: true, ppLast4: pp.replace(/\D/g, '').slice(-4) })}
                  >
                    {tr('Save', 'บันทึก')}
                  </button>
                ),
                submitted,
              )}
              {!ppDone ? (
                <li className="wl-step-input">
                  <input
                    className="wl-input"
                    inputMode="tel"
                    value={pp}
                    onChange={(e) => setPp(e.target.value)}
                    placeholder={tr('PromptPay ID or phone', 'เลขหรือเบอร์พร้อมเพย์')}
                    aria-label="Company PromptPay"
                    autoComplete="off"
                  />
                </li>
              ) : null}
            </>
          )}
        </ol>

        {submitted ? (
          <div className="wl-box is-gold" role="status" data-testid="account-mode-pending">
            <b className="wl-strong">{tr('While we check', 'ระหว่างรอตรวจ')}</b>
            <p className="wl-s">
              {isHost
                ? tr(
                    'We’re checking your selfie and story — usually under 24 h. We’ll ping you in the top island the moment you’re live.',
                    'เรากำลังตรวจเซลฟี่กับสตอรี่ ปกติไม่เกิน 24 ชม. พอใช้งานได้จะเด้งบอกด้านบนทันที',
                  )
                : tr('We’re checking your agency — usually under 24 h. Switch back to Traveller any time.', 'เรากำลังตรวจเอเจนซี่ ปกติไม่เกิน 24 ชม. สลับกลับเป็นนักเดินทางได้ตลอด')}
            </p>
            <button type="button" className="ux-btn ux-btn-quiet wl-cta m-press" data-testid="account-mode-preview-btn" onClick={onPreview}>
              {isHost ? tr('Preview Local mode (no payouts yet)', 'ลองดูโหมดโลคอล (ยังถอนเงินไม่ได้)') : tr('Preview Agency mode (no payouts yet)', 'ลองดูโหมดเอเจนซี่ (ยังถอนเงินไม่ได้)')}
            </button>
          </div>
        ) : null}

        <p className="wl-foot">
          {isHost ? tr('Paid after every Kring! — you see your amount on each booking', 'ได้เงินหลังกริ๊ง!ทุกครั้ง · ดูยอดของคุณในแต่ละการจอง') : tr('Paid by Kring — never taken from your Locals’ earnings', 'Kring จ่ายให้ ไม่หักจากรายได้ของโลคอล')}
        </p>
      </div>
    </WPage>
  )
}

export default function AccountModesRow({ active, grantedByAuth = [], language = 'en', onChange }: AccountModesRowProps) {
  const [modes, setModes] = useState<ModesState>(() => readModes())
  const [activating, setActivating] = useState<Exclude<AccountMode, 'traveller'> | null>(null)
  const th = language === 'th'
  const zh = language === 'zh'

  useEffect(() => {
    if (grantedByAuth.length === 0) return
    setModes((prev) => {
      const merged = Array.from(new Set([...prev.unlocked, ...grantedByAuth]))
      if (merged.length === prev.unlocked.length) return prev
      return { ...prev, unlocked: merged }
    })
  }, [grantedByAuth])

  const isUnlocked = (m: AccountMode) => modes.unlocked.includes(m) || grantedByAuth.includes(m)
  const isPending = (m: AccountMode) => !isUnlocked(m) && modes.pending.includes(m)

  // Ploy B5: coming back from the story camera reopens the checklist exactly where it was
  useEffect(() => {
    const a = readApply()
    if (a.resume && !(modes.unlocked.includes(a.resume) || grantedByAuth.includes(a.resume))) {
      setActivating(a.resume)
      writeApply({ resume: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (m: AccountMode) => {
    triggerHaptic('select')
    if (m === 'traveller' || isUnlocked(m)) {
      onChange(m)
      return
    }
    setActivating(m)
  }

  const labels: Record<AccountMode, string> = {
    traveller: th ? 'ผู้จอง' : zh ? '旅行者' : 'Traveller',
    host: th ? 'โลคอล' : zh ? '本地向导' : 'Local',
    agency: th ? 'เอเจนซี่' : zh ? '经纪' : 'Agency',
  }
  // ROUND5 · Ploy: a host who is not part of an agency never sees an "Agency +" sales chip on her own wallet
  const hostOnly = isUnlocked('host') && !isUnlocked('agency') && !isPending('agency') && active !== 'agency'
  const order: AccountMode[] = hostOnly ? ['traveller', 'host'] : ['traveller', 'host', 'agency']
  const idx = Math.max(0, order.indexOf(active))

  return (
    <>
      <div className="wl-modes" role="group" aria-label="Account mode" data-testid="account-modes-row" data-count={order.length} style={{ '--i': idx, '--n': order.length } as CSSProperties}>
        <span className="wl-modes-pill" aria-hidden="true" />
        {order.map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`account-mode-${m}-btn`}
            aria-pressed={active === m}
            onClick={() => pick(m)}
          >
            <span aria-hidden="true">{m === 'traveller' ? '🧳' : m === 'host' ? '🌿' : '🏢'}</span> {labels[m]}
            {!isUnlocked(m) ? (
              <em className="wl-modes-tag" aria-hidden="true">
                {isPending(m) ? '⏳' : '+'}
              </em>
            ) : null}
            {!isUnlocked(m) && <span className="sr-only">{isPending(m) ? '(pending review)' : '(activate)'}</span>}
          </button>
        ))}
      </div>

      {activating ? (
        <ActivationPage
          mode={activating}
          alreadyPending={isPending(activating)}
          onBack={() => setActivating(null)}
          onSubmitted={() => {
            const next = { ...modes, pending: Array.from(new Set([...modes.pending, activating])) }
            writeModes({ unlocked: ['traveller'], pending: next.pending })
            setModes(next)
          }}
          onPreview={() => {
            const m = activating
            setActivating(null)
            onChange(m)
          }}
        />
      ) : null}
    </>
  )
}
