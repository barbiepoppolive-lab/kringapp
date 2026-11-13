import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { useOptionalAuth } from '../../context/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import ShareChips from '../ui/ShareChips'
import { myShareLink } from '../../lib/identity'
import { showIsland } from '../ui/TopIsland'
import { flowLogo } from '../ui/KringMark'
import { t as lex } from '../../lib/lexicon'
import {
  CHECKIN_DAYS,
  CHECKIN_STREAK_THB,
  CHECKIN_STREAKS_PER_MONTH,
  LOCAL_TASKS,
  MONTH_MAX_THB,
  OPEN_REWARDS_EVENT,
  REWARD_RULES,
  checkIn,
  claimBanked,
  claimTask,
  useRewards,
  type RewardTask,
  type TaskView,
} from './rewardsModel'
import '../../styles/wallet.css'

/**
 * KRING VISUAL V2 · "Earn reward 555" (P3 Rewards = B, Promo entry = B). The header gift is the ONLY way in:
 * `openRewards()` / `kring:open-rewards`. No promo strips on screens. Starter Pack is NOT here (it moved into Top up).
 *
 * Mounted once by TopUpSheet (always mounted, portalled) — a module guard keeps a second mount silent.
 */
let mounted = 0

type Mini = { kind: 'task'; task: RewardTask<string>; local?: boolean } | { kind: 'sum' } | { kind: 'rules' } | { kind: 'invite' } | null

const fmt = (n: number) => `฿${n.toLocaleString('en-US')}`

export default function RewardsHost() {
  const [active, setActive] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    mounted++
    const first = mounted === 1
    setActive(first)
    return () => {
      mounted--
    }
  }, [])
  useEffect(() => {
    if (!active) return
    const on = () => setOpen(true)
    window.addEventListener(OPEN_REWARDS_EVENT, on)
    return () => {
      window.removeEventListener(OPEN_REWARDS_EVENT, on)
    }
  }, [active])
  if (!active || !open) return null
  return <RewardsSheet open={open} onClose={() => setOpen(false)} />
}

export function RewardsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language } = useLanguage()
  const th = language === 'th'
  const L = (s: { en: string; th: string }) => (th ? s.th : s.en)
  const auth = useOptionalAuth()
  const isLocal = auth?.session?.role === 'host'
  const { facts, u, tasks, ci } = useRewards()
  const [pane, setPane] = useState<'t' | 'l'>('t')
  const [showDone, setShowDone] = useState(false)
  const [mini, setMini] = useState<Mini>(null)
  const [pop, setPop] = useState<string | null>(null)
  const unlocked = facts.bumps > 0
  const earned = u.earnedThb
  const pct = Math.min(1, earned / MONTH_MAX_THB)

  const act = tasks.filter((t) => t.state !== 'done')
  const done = tasks.filter((t) => t.state === 'done')

  const flash = (id: string) => {
    setPop(id)
    window.setTimeout(() => setPop((p) => (p === id ? null : p)), 700)
  }

  const go = (v: TaskView) => {
    triggerHaptic('select')
    if (v.state === 'claim') {
      const r = claimTask(v.task.id, facts)
      if (r.ok) {
        triggerHaptic('success')
        flash(v.task.id)
        flowLogo()
        showIsland({ text: th ? `+${fmt(r.thb)} โปร · ใช้กับของขวัญและของเสริม` : `+${fmt(r.thb)} promo · for gifts & extras`, tone: 'gold', icon: '฿', ms: 2600, key: 'reward' })
      } else if (r.reason === 'rejected') showIsland({ text: th ? 'ยังรับไม่ได้ ลองใหม่อีกครั้ง' : 'Couldn’t add it — try again', tone: 'neutral', ms: 2600 })
      return
    }
    if (v.state === 'locked') {
      setMini({ kind: 'rules' })
      return
    }
    // Go → the place where the task really happens
    if (v.task.id === 'inv') setMini({ kind: 'invite' })
    else if (v.task.id === 'share') {
      onClose()
      window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'pulse' } }))
    } else if (v.task.id === 'rev' || v.task.id === 'first') {
      onClose()
      window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: v.task.id === 'rev' ? 'chats' : 'meet' } }))
    } else if (v.task.id === 'pin') {
      onClose()
      window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('kring:exp-view', { detail: { view: 'locals' } })), 120)
    }
  }

  const tick = (i: number) => {
    if (i !== ci.ticked || !ci.canTick) return
    const r = checkIn(facts)
    if (!r.ok) return
    triggerHaptic('success')
    flash(`ci-${i}`)
    if (!r.banked) flowLogo()
    showIsland({
      text: r.banked
        ? th
          ? `เก็บไว้ ${fmt(r.thb)} · ได้หลังกริ๊ง!ครั้งแรก`
          : `${fmt(r.thb)} saved · pays after your first Kring!`
        : th
          ? `+${fmt(r.thb)} โปร · เช็กอินแล้ว`
          : `+${fmt(r.thb)} promo · checked in`,
      tone: r.banked ? 'neutral' : 'gold',
      icon: '฿',
      ms: 2600,
      key: 'reward',
    })
  }

  const btnLabel = (v: TaskView) =>
    v.state === 'claim' ? (th ? 'รับ' : 'Claim') : v.state === 'done' ? (th ? 'เสร็จ' : 'Done') : v.state === 'locked' ? (th ? 'รอกริ๊ง!' : 'After Kring!') : th ? 'ไป' : 'Go'

  const row = (v: TaskView, i: number) => {
    const t = v.task
    const bar = v.m > 1
    return (
      <div key={t.id} className={`rw5-row kf-press${pop === t.id ? ' is-pop' : ''}`} data-st={v.state} data-testid={`reward-task-${t.id}`} style={{ '--i': i } as CSSProperties}>
        <button type="button" className="rw5-main" aria-label={`${L(t.ta)}: ${th ? 'ทำยังไง ได้เมื่อไหร่' : 'how and when it pays'}`} onClick={() => setMini({ kind: 'task', task: t })}>
          <span className={`rw5-em is-${t.group}`} aria-hidden="true">{t.emoji}</span>
          <span className="rw5-tx">
            <b>{L(t.t)}</b>
            <span className="rw5-pr">
              {bar ? (
                <span className="rw5-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${Math.min(1, v.n / v.m)})` }} />
                </span>
              ) : null}
              <span className="rw5-pn">
                {v.n}/{v.m}
              </span>
            </span>
          </span>
        </button>
        <span className="rw5-amt">{fmt(t.amtThb)}</span>
        <button
          type="button"
          className={`rw5-go is-${v.state}`}
          data-testid={`reward-go-${t.id}`}
          aria-disabled={v.state === 'done'}
          aria-label={`${btnLabel(v)}: ${L(t.ta)}, ${fmt(t.amtThb)}`}
          onClick={() => (v.state === 'done' ? undefined : go(v))}
        >
          {btnLabel(v)}
        </button>
      </div>
    )
  }

  const miniBody = (() => {
    if (!mini) return null
    if (mini.kind === 'task') {
      const t = mini.task
      const unit = t.cap > 1 ? (th ? ` · สูงสุด ${t.cap}× ต่อเดือน` : ` · up to ${t.cap}× a month`) : ''
      return (
        <>
          <p className="rw5-mk">
            {t.group === 'growth' ? (th ? 'ชวนคนใหม่' : 'Brings new people') : th ? 'เที่ยวมากขึ้น' : 'More trips'} · {mini.local ? (th ? 'โลคอล · เร็วๆ นี้' : 'Local · coming soon') : th ? 'ผู้จอง' : 'Traveller'}
          </p>
          <h4 className="rw5-mt">{L(t.ta)}</h4>
          <div className="rw5-mrows">
            <div><span>{th ? 'ทำยังไง' : 'How'}</span><p>{L(t.how)}</p></div>
            <div><span>{th ? 'ได้เมื่อไหร่' : 'When it pays'}</span><p>{L(t.paid)}</p></div>
            <div><span>{th ? 'ทำไมกริ๊งจ่าย' : 'Why Kring pays'}</span><p>{L(t.why)}</p></div>
            <div>
              <span>{th ? 'รางวัล' : 'Reward'}</span>
              <p>
                <b className="rw5-nm">{fmt(t.amtThb)}</b>{' '}
                {mini.local ? (th ? 'เงินสด รวมในยอดโอน' : 'cash with your payout') : th ? 'โปร · ใช้กับของขวัญและของเสริม จองไม่ได้' : 'promo · gifts & extras, not bookings'}
                {unit}
              </p>
            </div>
          </div>
        </>
      )
    }
    if (mini.kind === 'sum') {
      const rows: Array<[string, string, number]> = [
        ...tasksSum(th),
        [th ? 'เช็กอินรายวัน' : 'Daily check-in', `${CHECKIN_STREAKS_PER_MONTH} × ${fmt(CHECKIN_STREAK_THB)}`, CHECKIN_STREAK_THB * CHECKIN_STREAKS_PER_MONTH],
      ]
      return (
        <>
          <p className="rw5-mk">{th ? 'เดือนแรกของคุณ' : 'Your first month'}</p>
          <h4 className="rw5-mt">{th ? `฿555 มาจากไหน` : 'How ฿555 adds up'}</h4>
          <div className="rw5-sum" data-testid="reward-sum">
            {rows.map(([a, b, c]) => (
              <div key={a}>
                <span>{a}</span>
                <small>{b}</small>
                <b>{fmt(c)}</b>
              </div>
            ))}
            <div className="is-tot">
              <span>{th ? 'รวม' : 'Total'}</span>
              <b>{fmt(MONTH_MAX_THB)}</b>
            </div>
          </div>
          <p className="rw5-fine">
            {th
              ? '“ทริปแรก” และ “เซฟโลคอล 3 คน” ได้ครั้งเดียว เดือนถัดไปตัวเลขจะคิดจากภารกิจที่ยังเปิดอยู่'
              : '“First experience” and “Save 3 locals” pay once, so from month two the total counts only the tasks still open.'}
          </p>
        </>
      )
    }
    if (mini.kind === 'invite') {
      return (
        <>
          <p className="rw5-mk">{th ? 'ชวนคนใหม่ · ผู้จอง' : 'Brings new people · Traveller'}</p>
          <h4 className="rw5-mt">{th ? 'ชวนเพื่อน · ได้คนละ ฿100' : 'Invite a friend · you both get ฿100'}</h4>
          <p className="rw5-fine" style={{ marginTop: 0 }}>
            {th ? 'ได้เมื่อทริปแรกของเพื่อนจบด้วยกริ๊ง! เท่านั้น' : 'Pays only when your friend’s first experience ends with the Kring! bump.'}
          </p>
          <ShareChips
            text={th ? 'มาเที่ยวกับโลคอลตัวจริงบนกริ๊ง ราคาแฟร์' : 'Explore with real locals on Kring · fair prices, paid only when you meet'}
            url={myShareLink()}
            lang={language}
            testIdPrefix="reward-invite-share"
          />
        </>
      )
    }
    return (
      <>
        <p className="rw5-mk">{th ? 'กติกา' : 'Rules'}</p>
        <h4 className="rw5-mt">{th ? 'โปรทำงานยังไง' : 'How promo works'}</h4>
        <div className="rw5-rules" data-testid="reward-rules">
          {REWARD_RULES.map((r) => (
            <div key={r.icon}>
              <span aria-hidden="true">{r.icon}</span>
              {th ? r.th : r.en}
            </div>
          ))}
        </div>
      </>
    )
  })()

  const sheet = (
    <Sheet
      open={open}
      onClose={onClose}
      testId="rewards-sheet"
      ariaLabel={th ? 'รับรางวัล 555' : 'Earn reward 555'}
      initialDetent="92%"
      detents={['92%']}
      className="rw5-sheet kf-sheet"
    >
      <div className="rw5">
        <div className="rw5-hd">
          <span className="rw5-gm" aria-hidden="true">
            🎁
            <span className="kf-spec" aria-hidden="true" />
          </span>
          <div>
            <span className="rw5-k">{th ? 'รางวัล' : 'Rewards'}</span>
            <h3 data-testid="rewards-title">{lex('rewards.title', language)}</h3>
          </div>
          <button type="button" className="rw5-x is-hd" aria-label="Close" data-testid="rewards-sheet-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
          </button>
        </div>

        {isLocal ? (
          <div className="rw5-tabs" role="group" aria-label={th ? 'รางวัลสำหรับ' : 'Rewards for'}>
            <button type="button" aria-pressed={pane === 't'} onClick={() => setPane('t')}>{th ? 'ผู้จอง' : 'Traveller'}</button>
            <button type="button" aria-pressed={pane === 'l'} data-testid="rewards-tab-local" onClick={() => setPane('l')}>{th ? 'โลคอล' : 'Local'}</button>
          </div>
        ) : null}

        <button type="button" className="rw5-tot kf-press" data-testid="rewards-total" onClick={() => setMini({ kind: 'sum' })} aria-label={th ? '฿555 มาจากไหน' : 'How ฿555 adds up'}>
          <span className="rw5-l1">
            <span>
              {th ? 'สูงสุด ' : 'Up to '}
              <b>{fmt(MONTH_MAX_THB)}</b>
              {th ? ' เดือนนี้' : ' this month'}
            </span>
            <span className="rw5-e" data-testid="rewards-earned">{th ? `ได้แล้ว ${fmt(earned)}` : `${fmt(earned)} earned`}</span>
          </span>
          <span className="rw5-bar is-w" aria-hidden="true">
            <i style={{ transform: `scaleX(${pct})` }} />
          </span>
          <span className="rw5-lg">
            <i className="is-growth" />
            {th ? 'ชวนคนใหม่' : 'Brings new people'}
            <i className="is-activity" />
            {th ? 'เที่ยวมากขึ้น' : 'More trips'}
            <em>{th ? 'คิดยังไง ›' : 'How it adds up ›'}</em>
          </span>
        </button>

        {pane === 't' ? (
          <>
            {!unlocked ? (
              <p className="rw5-lock" data-testid="rewards-locked">
                <span aria-hidden="true">🛡️</span>
                {th ? 'รางวัลจ่ายหลังกริ๊ง!จริงครั้งแรก · ระหว่างนี้ความคืบหน้าเก็บไว้ให้' : 'Rewards pay after your first real Kring! · progress is kept until then'}
              </p>
            ) : null}
            <div className="rw5-slab">
              <span>{th ? 'เช็กอินรายวัน' : 'Daily check-in'}</span>
              <small>{th ? `7 วัน = ${fmt(CHECKIN_STREAK_THB)}` : `7 days = ${fmt(CHECKIN_STREAK_THB)}`}</small>
            </div>
            <div className="rw5-ci" data-testid="rewards-checkin">
              {CHECKIN_DAYS.map((a, i) => {
                const got = i < ci.ticked
                const today = ci.canTick && i === ci.ticked
                return (
                  <button
                    key={i}
                    type="button"
                    className={`rw5-cd${got ? ' is-got' : ''}${today ? ' is-today' : ''}${pop === `ci-${i}` ? ' is-pop' : ''}`}
                    aria-disabled={!today}
                    data-testid={today ? 'rewards-checkin-today' : undefined}
                    aria-label={`${th ? 'วันที่' : 'Day'} ${i + 1}, ${fmt(a)}${got ? (th ? ' รับแล้ว' : ' done') : today ? (th ? ' กดรับวันนี้' : ' ready today') : ''}`}
                    onClick={() => tick(i)}
                  >
                    <span className="rw5-di" aria-hidden="true">{got ? '✓' : i === 6 ? '🎁' : '฿'}</span>
                    <b>{fmt(a)}</b>
                    <small>{today ? (th ? 'รับ' : 'Claim') : `${th ? 'วัน' : 'Day'} ${i + 1}`}</small>
                  </button>
                )
              })}
            </div>
            {ci.bankThb > 0 ? (
              unlocked ? (
                <button
                  type="button"
                  className="rw5-bank kf-press"
                  data-testid="rewards-bank-claim"
                  onClick={() => {
                    const r = claimBanked(facts)
                    if (r.ok) {
                      triggerHaptic('success')
                      showIsland({ text: th ? `+${fmt(r.thb)} โปร` : `+${fmt(r.thb)} promo`, tone: 'gold', icon: '฿', ms: 2400, key: 'reward' })
                    }
                  }}
                >
                  {th ? `เช็กอินสะสม ${fmt(ci.bankThb)} · รับเลย` : `${fmt(ci.bankThb)} from check-ins · Claim`}
                </button>
              ) : (
                <p className="rw5-fine" data-testid="rewards-bank">
                  {th ? `สะสมไว้ ${fmt(ci.bankThb)} · ได้หลังกริ๊ง!ครั้งแรก` : `${fmt(ci.bankThb)} saved from check-ins · pays after your first Kring!`}
                </p>
              )
            ) : null}

            <div className="rw5-list kf-stagger" data-testid="rewards-task-list">{act.map(row)}</div>
            {done.length ? (
              <>
                <button type="button" className="rw5-done" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
                  {th ? `เสร็จแล้ว (${done.length})` : `Done (${done.length})`}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {showDone ? <div className="rw5-list">{done.map(row)}</div> : null}
              </>
            ) : null}
          </>
        ) : (
          <div className="rw5-local" data-testid="rewards-local-soon">
            <p className="rw5-lock">
              <span aria-hidden="true">🏮</span>
              {th ? 'ภารกิจโฮสต์ & การันตีทริปแรก ฿500 (จ่ายสดรวมในยอดโอนพร้อมเพย์)' : 'Local Host Quests & ฿500 First-Booking Guarantee (paid cash to PromptPay)'}
            </p>
            <div className="mb-2.5 p-2.5 rounded-2xl c-surface-1 border c-line text-xs space-y-1.5" data-testid="rewards-local-v3-quests">
              <div className="flex justify-between font-extrabold">
                <span>{th ? '🛡️ การันตี ฿500 ทริปแรก (7 วันแรก)' : '🛡️ ฿500 First-Booking Guarantee (First 7d)'}</span>
                <span className="text-emerald-500">ACTIVE</span>
              </div>
              <div className="flex justify-between font-extrabold">
                <span>{th ? '🏆 โบนัสรายสัปดาห์ +฿300 (ครบ 5 ทริป 4.8★+)' : '🏆 +฿300 Weekly Quest (5 trips @ 4.8★+)'}</span>
                <span className="text-amber-500">+฿300</span>
              </div>
              <div className="flex justify-between font-extrabold">
                <span>{th ? '⭐ ระดับโฮสต์: 80% → 83% (10 ทริป) → 85% (30 ทริป)' : '⭐ Host Share: 80% → 83% (10+) → 85% (30+)'}</span>
                <span className="text-indigo-400">80%–85%</span>
              </div>
            </div>
            <div className="rw5-list">
              {LOCAL_TASKS.map((t) => (
                <div key={t.id} className="rw5-row" data-st="soon">
                  <button type="button" className="rw5-main" onClick={() => setMini({ kind: 'task', task: t, local: true })} aria-label={L(t.ta)}>
                    <span className={`rw5-em is-${t.group}`} aria-hidden="true">{t.emoji}</span>
                    <span className="rw5-tx">
                      <b>{L(t.t)}</b>
                      <span className="rw5-pn">{th ? 'เงินสดพร้อมเพย์' : 'PromptPay cash'}</span>
                    </span>
                  </button>
                  <span className="rw5-amt">{fmt(t.amtThb)}</span>
                  <span className="rw5-go is-soon">{th ? 'พร้อมรับ' : 'Active'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="rw5-rl" data-testid="rewards-rules" onClick={() => setMini({ kind: 'rules' })}>
          <span>{th ? 'โปรใช้กับของขวัญและของเสริม จองไม่ได้ · 30 วัน' : 'Promo pays for gifts & extras, not bookings · 30 days'}</span>
          <b>{th ? 'กติกา ›' : 'Rules ›'}</b>
        </button>
      </div>
    </Sheet>
  )

  return (
    <>
      {sheet}
      {mini ? <MiniSheet onClose={() => setMini(null)}>{miniBody}</MiniSheet> : null}
    </>
  )
}

function tasksSum(th: boolean): Array<[string, string, number]> {
  return [
    [th ? 'ชวนเพื่อน' : 'Invite a friend', '2 × ฿100', 200],
    [th ? 'ทริปแรก' : 'First experience', '1 × ฿100', 100],
    [th ? 'รีวิวทริป' : 'Review a trip', '3 × ฿25', 75],
    [th ? 'แชร์ราคาหรือกริ๊ง!' : 'Share a price or bump', '4 × ฿20', 80],
    [th ? 'เซฟโลคอล 3 คน' : 'Save 3 locals', '1 × ฿20', 20],
  ]
}

/** A small second-layer sheet (why/how, the sum, rules) above the rewards sheet. */
function MiniSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="rw5-scrim" onClick={onClose} data-scrollable-overlay="true">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Details" className="rw5-mini kf-sheet is-open" data-testid="rewards-mini" onClick={(e) => e.stopPropagation()}>
        <span className="rw5-grab" aria-hidden="true" />
        <button type="button" className="rw5-x" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
