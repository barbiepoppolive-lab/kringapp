import { useState, type CSSProperties } from 'react'
import { DEFAULT_PLATFORM_CONFIG, type PlatformConfig } from '../../lib/configDefaults'
import { formatBahtValue } from '../../lib/money'
import { triggerHaptic } from '../../lib/haptics'
import { copyText, handleFromName, island, useFirstName, useTr } from '../vip/walletKit'
import { agencyTierInfo } from '../vip/WalletPages'
import { KSheet, RollingBaht, TierRing } from './kringKit'

/**
 * K5 · B9 + R3 — the Agency dashboard (Earn · Manage · Data).
 *
 * PRIVACY RULE (round 3 · R3, locked): an agency only ever sees TOTALS — counts and baht per local and per week.
 * Never who, where, when, the price or the chat of a booking. There is no booking list, no drill-down into a booking
 * and no export. Commission is worked out on the server from completed experiences; this screen only shows it.
 *
 * Data: the tier comes from the real config + `activeHosts` (hub prop). Roster / weekly numbers are a labelled demo
 * set in demo sessions; a real agency with no locals sees empty states (TODO(Argon): `agency_totals_v1` RPC that
 * returns { perLocal: [{ id, name, completed, commissionThb, live }], perDay: number[7], rating, repeatPct, noShows }).
 */

interface RosterRow {
  id: string
  name: string
  focus: string
  completed: number
  commissionThb: number
  monthThb: number
  live: boolean
  tint: string
}

const DEMO_ROSTER: RosterRow[] = [
  { id: 'ploy', name: 'Ploy', focus: 'Street food', completed: 5, commissionThb: 282, monthThb: 9400, live: true, tint: 'q1' },
  { id: 'mint', name: 'Mint', focus: 'Temples & cafés', completed: 4, commissionThb: 183, monthThb: 6100, live: true, tint: 'q2' },
  { id: 'nok', name: 'Nok', focus: 'Muay Thai gym', completed: 3, commissionThb: 144, monthThb: 4800, live: true, tint: 'q3' },
  { id: 'ton', name: 'Ton', focus: 'Salon & spa', completed: 2, commissionThb: 87, monthThb: 2900, live: false, tint: 'q4' },
  { id: 'fah', name: 'Fah', focus: 'Flower market', completed: 0, commissionThb: 0, monthThb: 1800, live: false, tint: 'q5' },
  { id: 'beam', name: 'Beam', focus: 'Canal boats', completed: 0, commissionThb: 0, monthThb: 900, live: true, tint: 'q6' },
]
const DEMO_WEEK = [2, 3, 1, 2, 3, 2, 1]
const DEMO_STATS = { rating: 4.9, repeatPct: 31, noShows: 2, top: 'Food walk', topTh: 'เดินกิน', monthCommission: 3240, ready: 2100, bookingsMonth: 41 }

type Tab = 0 | 1 | 2

export default function AgencyDashboard({
  activeHosts,
  isDemoMode,
  config = DEFAULT_PLATFORM_CONFIG,
  onOpenCashOut,
}: {
  activeHosts: number
  isDemoMode: boolean
  config?: PlatformConfig
  onOpenCashOut?: () => void
}) {
  const tr = useTr()
  const name = useFirstName('team')
  const [tab, setTab] = useState<Tab>(0)
  const [who, setWho] = useState<RosterRow | null>(null)
  const roster = isDemoMode ? DEMO_ROSTER : []
  const locals = isDemoMode ? Math.max(activeHosts, DEMO_ROSTER.length) : activeHosts
  const partnerCfg = config.kring_partners
  const typicalPerBookingThb = partnerCfg?.typical_payout_per_booking_thb ?? 29
  const activationThb = partnerCfg?.activation_thb ?? 150
  const activationBookings = partnerCfg?.activation_bookings ?? 3
  const hostMonths = partnerCfg?.months ?? 6
  const minRating = partnerCfg?.quality_min_rating ?? 4.6
  const { next } = agencyTierInfo(locals, config)
  const tierName = tr('Kring Partner', 'พาร์ทเนอร์กริ๊ง')
  const pct = next ? Math.round((locals / Math.max(1, next.min)) * 100) : 100
  const week = isDemoMode ? DEMO_WEEK : [0, 0, 0, 0, 0, 0, 0]
  const weekCount = week.reduce((a, b) => a + b, 0)
  const weekCommission = roster.reduce((a, r) => a + r.commissionThb, 0)
  const maxDay = Math.max(1, ...week)
  const link = `kringapp.com/a/${handleFromName(name)}`
  const tabs = [tr('Earn', 'รายได้'), tr('Manage', 'จัดการ'), tr('Data', 'ข้อมูล')]

  const invite = async () => {
    triggerHaptic('tap')
    const ok = await copyText(`https://${link}`)
    island(ok ? tr('Invite link copied', 'คัดลอกลิงก์ชวนแล้ว') : link, 'green', ok ? '✓' : undefined)
  }

  const lock = (
    <div className="kw-lock" data-testid="agency-privacy-lock">
      <span aria-hidden="true">🔒</span>
      <div>
        <b>{tr('Bookings are private between guest and local', 'การจองเป็นความลับระหว่างแขกกับโลคอล')}</b>
        <small>{tr('You see totals only, never who, where, when, the price or the chat. Hosts can leave any time free.', 'คุณเห็นแค่ยอดรวม ไม่เห็นว่าใคร ที่ไหน เมื่อไหร่ ราคา หรือแชท โลคอลออกจากพาร์ทเนอร์ได้ฟรีตลอดเวลา')}</small>
      </div>
    </div>
  )

  return (
    <div className="kw-agency" data-testid="wallet-agency-dashboard">
      <div className="kw-seg" role="tablist" aria-label={tr('Kring Partners', 'พาร์ทเนอร์กริ๊ง')} style={{ '--i': tab } as CSSProperties}>
        <i className="kw-seg-ind" aria-hidden="true" />
        {tabs.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === i}
            data-testid={`agency-tab-${['earn', 'manage', 'data'][i]}`}
            onClick={() => {
              if (tab === i) return
              triggerHaptic('select')
              setTab(i as Tab)
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="kw-panels" key={tab}>
        {tab === 0 ? (
          <div className="kw-pn" role="tabpanel" data-testid="agency-panel-earn">
            <div className="kw-tierc">
              <TierRing pct={pct} top={`≈฿${typicalPerBookingThb}`} bottom="PARTNER" />
              <div className="kw-grow">
                <b className="kw-h">{tr(`${tierName} · ≈฿${typicalPerBookingThb} per booking (${hostMonths} mo)`, `${tierName} · ≈฿${typicalPerBookingThb} ต่อการจอง (${hostMonths} เดือน)`)}</b>
                <p className="kw-sub">
                  {tr(
                    `Paid from Kring’s fee for each host’s first ${hostMonths} months — never from her earnings.`,
                    `จ่ายจากค่าธรรมเนียมของ Kring ในช่วง ${hostMonths} เดือนแรกของแต่ละโลคอล — ไม่หักจากรายได้ของเธอ`,
                  )}
                </p>
              </div>
            </div>
            <div className="kw-kp">
              <div>
                <span className="kw-k">{tr('Partner pay · this month', 'รายได้พาร์ทเนอร์ · เดือนนี้')}</span>
                <b className="kw-mg">
                  <RollingBaht value={isDemoMode ? DEMO_STATS.monthCommission : 0} />
                </b>
              </div>
              <div>
                <span className="kw-k">{tr('Ready', 'พร้อมถอน')}</span>
                <b>{formatBahtValue(isDemoMode ? DEMO_STATS.ready : 0)}</b>
              </div>
              <div>
                <span className="kw-k">{tr('Bookings', 'การจอง')}</span>
                <b>{isDemoMode ? DEMO_STATS.bookingsMonth : 0}</b>
              </div>
              <div>
                <span className="kw-k">{tr('Locals', 'โลคอล')}</span>
                <b>{locals}</b>
              </div>
            </div>
            <button
              type="button"
              className="kw-btn is-mg kw-wide m-press"
              data-testid="agency-withdraw-btn"
              onClick={() => {
                triggerHaptic('select')
                if (onOpenCashOut) onOpenCashOut()
              }}
            >
              {tr(`Withdraw ${formatBahtValue(isDemoMode ? DEMO_STATS.ready : 0)} to PromptPay`, `ถอน ${formatBahtValue(isDemoMode ? DEMO_STATS.ready : 0)} เข้าพร้อมเพย์`)}
            </button>
            <p className="kw-rule">
              {tr(
                `≈฿${typicalPerBookingThb}/booking (${hostMonths} mo) + ฿${activationThb} after ${activationBookings} bookings · rating ≥ ${minRating.toFixed(1)} · businesses & groups only.`,
                `≈฿${typicalPerBookingThb}/การจอง (${hostMonths} เดือน) + โบนัส ฿${activationThb} เมื่อครบ ${activationBookings} ทริป · คะแนน ≥ ${minRating.toFixed(1)} · เฉพาะธุรกิจและกลุ่มที่จดทะเบียน`,
              )}
            </p>
            <div className="kw-copy">
              <span>{link}</span>
              <button type="button" className="kw-mini m-press" onClick={() => void invite()} data-testid="agency-copy-link">
                {tr('Copy', 'คัดลอก')}
              </button>
            </div>
            {isDemoMode ? <p className="kw-fine">{tr('Demo Kring Partner · example totals', 'พาร์ทเนอร์ตัวอย่าง · ยอดจำลอง')}</p> : null}
          </div>
        ) : null}

        {tab === 1 ? (
          <div className="kw-pn" role="tabpanel" data-testid="agency-panel-manage">
            {lock}
            <p className="kw-k kw-sec">{tr(`Your Locals · this week · totals only`, `โลคอลของคุณ · สัปดาห์นี้ · ยอดรวมเท่านั้น`)}</p>
            {roster.length === 0 ? (
              <p className="kw-empty">{tr('No Locals yet. Send your invite link to the first one.', 'ยังไม่มีโลคอล ส่งลิงก์ชวนคนแรกได้เลย')}</p>
            ) : (
              <div className="kw-ros">
                {roster.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    className="kw-ros-r m-press"
                    style={{ '--i': i } as CSSProperties}
                    data-testid={`agency-local-${r.id}`}
                    onClick={() => {
                      triggerHaptic('tap')
                      setWho(r)
                    }}
                  >
                    <i className={`kw-av is-${r.tint}`} aria-hidden="true" />
                    <span className="kw-grow">
                      <b>
                        {r.name} <span className="kw-vf" aria-label="verified">✓</span>
                      </b>
                      <small>
                        {r.focus} · {tr(`${r.completed} completed`, `สำเร็จ ${r.completed} ครั้ง`)}
                      </small>
                    </span>
                    <i className={`kw-dot${r.live ? ' is-live' : ''}`} aria-label={r.live ? tr('Live', 'ออนไลน์อยู่') : tr('Paused', 'พักไว้ก่อน')} />
                    <em className="kw-mg">{formatBahtValue(r.commissionThb)}</em>
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="kw-btn is-ghost kw-wide m-press" onClick={() => void invite()} data-testid="agency-invite-local">
              ＋ {tr('Invite a Local', 'ชวนโลคอล')}
            </button>
          </div>
        ) : null}

        {tab === 2 ? (
          <div className="kw-pn" role="tabpanel" data-testid="agency-panel-data">
            <div className="kw-agh">
              <span className="kw-k">{tr(`${locals} Locals · this week`, `${locals} โลคอล · สัปดาห์นี้`)}</span>
              <p>
                {tr('Your Locals completed ', 'โลคอลของคุณพาเที่ยวสำเร็จ ')}
                <b>{weekCount}</b>
                {tr(' experiences this week · ', ' ครั้งสัปดาห์นี้ · ')}
                <b className="kw-mg">{formatBahtValue(weekCommission)}</b>
                {tr(' commission', ' ค่าคอม')}
              </p>
              <div className="kw-bars" aria-label={tr('Completed experiences per day', 'จำนวนที่สำเร็จต่อวัน')} role="img">
                {week.map((n, i) => (
                  <i key={i} style={{ '--h': `${Math.max(6, Math.round((n / maxDay) * 100))}%`, '--i': i } as CSSProperties} />
                ))}
              </div>
              <div className="kw-bdays" aria-hidden="true">
                {(tr('M T W T F S S', 'จ อ พ พฤ ศ ส อา') as string).split(' ').map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
            </div>
            <div className="kw-kp">
              <div>
                <span className="kw-k">{tr('Avg rating', 'คะแนนเฉลี่ย')}</span>
                <b>{isDemoMode ? DEMO_STATS.rating.toFixed(1) : '–'}</b>
              </div>
              <div>
                <span className="kw-k">{tr('Repeat guests', 'แขกกลับมาซ้ำ')}</span>
                <b>{isDemoMode ? `${DEMO_STATS.repeatPct}%` : '–'}</b>
              </div>
              <div>
                <span className="kw-k">{tr('No-shows', 'ไม่มาตามนัด')}</span>
                <b>{isDemoMode ? DEMO_STATS.noShows : 0}</b>
              </div>
              <div>
                <span className="kw-k">{tr('Top experience', 'ยอดนิยม')}</span>
                <b className="kw-small">{isDemoMode ? tr(DEMO_STATS.top, DEMO_STATS.topTh) : '–'}</b>
              </div>
            </div>
            {lock}
          </div>
        ) : null}
      </div>

      <KSheet open={Boolean(who)} onClose={() => setWho(null)} label={who ? `${who.name} · totals` : undefined} testId="agency-local-sheet">
        {who ? (
          <>
            <div className="kw-row">
              <i className={`kw-av is-${who.tint}`} aria-hidden="true" />
              <div className="kw-grow">
                <b className="kw-h">{tr(`${who.name} · this week`, `${who.name} · สัปดาห์นี้`)}</b>
                <p className="kw-sub">{tr('Totals only', 'ยอดรวมเท่านั้น')}</p>
              </div>
            </div>
            <div className="kw-kp is-2">
              <div>
                <span className="kw-k">{tr('Completed', 'สำเร็จ')}</span>
                <b>{who.completed}</b>
              </div>
              <div>
                <span className="kw-k">{tr('Commission', 'ค่าคอม')}</span>
                <b className="kw-mg">{formatBahtValue(who.commissionThb)}</b>
              </div>
            </div>
            <div className="kw-lock">
              <span aria-hidden="true">🔒</span>
              <div>
                <b>{tr(`${who.name}’s bookings are private`, `การจองของ ${who.name} เป็นความลับ`)}</b>
                <small>
                  {tr(
                    `The guest, venue, time, price and chat are visible only to ${who.name} and her guest. There’s no booking list, no detail view and no export.`,
                    `แขก สถานที่ เวลา ราคา และแชท เห็นได้แค่ ${who.name} กับแขกเท่านั้น ไม่มีรายการจอง ไม่มีรายละเอียด และส่งออกไม่ได้`,
                  )}
                </small>
              </div>
            </div>
            <button type="button" className="kw-btn is-mg kw-wide m-press" onClick={() => setWho(null)}>
              {tr('Done', 'เสร็จ')}
            </button>
          </>
        ) : null}
      </KSheet>
    </div>
  )
}
