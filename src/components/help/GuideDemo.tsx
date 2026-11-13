import type { CSSProperties, ReactNode } from 'react'
import { hostPlaceholderUri } from '../../lib/imageFallback'
import type { GuideDemoSpec } from '../../lib/guideContent'
import '../../styles/deep-motion.css'

/**
 * NEXT95 · G3 · "Guides that show, not tell". A 3-second CSS mock of the real screen above each guide page:
 * a finger comes in, taps the real control, and the key state changes (Clink → ฿300 held; floor → ours; +30 min →
 * accepted…). Plays three times then rests on the final state. Reduced motion → the final state, no finger.
 * Pure CSS (transform / opacity only), no timers, no glow loops. Every string comes from guideContent (EN / ไทย,
 * traveller / host), so the demo speaks the reader's language and role.
 */

/** A fingertip (not a grey disc — Marco R5): warm champagne pad with a nail, its tip on the tap point. */
function Finger({ hold = false }: { hold?: boolean }) {
  return (
    <span className={`gd-finger${hold ? ' is-hold' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 28 40" className="gd-finger-svg">
        <rect x="5" y="1.5" width="18" height="38" rx="9" className="gd-finger-pad" />
        <path d="M9.2 9.5c0-2.9 2.1-4.6 4.8-4.6s4.8 1.7 4.8 4.6v2.2c0 1-.8 1.8-1.8 1.8h-6c-1 0-1.8-.8-1.8-1.8z" className="gd-finger-nail" />
      </svg>
    </span>
  )
}

/** the tapped control: wrapper carries the press + ripple + finger */
function Tap({ children, className = '', hold = false }: { children: ReactNode; className?: string; hold?: boolean }) {
  return (
    <span className={`gd-tap ${className}`.trim()}>
      <span className="gd-press">{children}</span>
      <span className="gd-ripple" aria-hidden="true" />
      <Finger hold={hold} />
    </span>
  )
}

function Portrait({ name, className = '', anon = false }: { name: string; className?: string; anon?: boolean }) {
  // ROUND5 · Ploy B7: a bad-behaviour example is a nameless person — never a real guest's face or name
  if (anon) {
    return (
      <span className={`gd-por is-anon ${className}`.trim()} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="9" r="3.6" />
          <path d="M5.5 19.5c.9-3.4 3.4-5.2 6.5-5.2s5.6 1.8 6.5 5.2" />
        </svg>
      </span>
    )
  }
  return <span className={`gd-por ${className}`.trim()} style={{ backgroundImage: `url("${hostPlaceholderUri(name)}")` } as CSSProperties} aria-hidden="true" />
}

function Lock() {
  return (
    <svg viewBox="0 0 24 24" className="gd-ic" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  )
}
function Check() {
  return (
    <svg viewBox="0 0 24 24" className="gd-ic" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

const first = (s: string | undefined) => (s ?? '').split(/[ ,·]/)[0] || 'Mint'

export default function GuideDemo({ demo }: { demo: GuideDemoSpec }) {
  const c = demo.chips ?? []
  let body: ReactNode = null

  switch (demo.kind) {
    case 'lock':
      body = (
        <div className="gd-wide">
          <Portrait name={first(demo.title)} className="is-wide" />
          <span className="gd-scrim" />
          <div className="gd-wide-m">
            <span className="gd-mono">{demo.sub}</span>
            <b className="gd-name">{demo.title}</b>
            <span className="gd-swap">
              <span className="gd-pre">
                <Tap>
                  <span className="gd-btn is-gold">{demo.tap}</span>
                </Tap>
              </span>
              <span className="gd-post gd-held">
                <Lock />
                <b>{demo.to}</b>
                <small>{demo.done}</small>
              </span>
            </span>
          </div>
        </div>
      )
      break

    case 'card':
      body = (
        <div className="gd-cards">
          <Tap className="gd-mini-wrap">
            <span className="gd-mini">
              <Portrait name={first(demo.title)} />
              <span className="gd-scrim" />
              <span className="gd-mini-tag">{c[0]}</span>
              <b>{first(demo.title)}</b>
            </span>
          </Tap>
          <span className="gd-mini is-dim">
            <Portrait name={c[2] ?? 'Ploy'} />
            <span className="gd-scrim" />
            <span className="gd-mini-tag">{c[1]}</span>
            <b>{c[2] ?? 'Ploy'}</b>
          </span>
          <span className="gd-post gd-panel">
            <b>{demo.title}</b>
            <small>{demo.sub}</small>
            <span className="gd-row">
              <span className="gd-pill">{demo.to}</span>
              <span className="gd-dim">{demo.done}</span>
            </span>
          </span>
        </div>
      )
      break

    case 'price':
      body = (
        <div className="gd-ticket">
          <span className="gd-ticket-ic" aria-hidden="true">{c[2] ?? '📶'}</span>
          <span className="gd-ticket-t">
            <b>{demo.title}</b>
            <small>{demo.sub}</small>
            <Tap className="gd-prices-tap">
              <span className="gd-prices">
                <span className="gd-floor">
                  <em>{c[0]}</em>
                  <s>{demo.from}</s>
                </span>
                <span className="gd-ours gd-post-inline">
                  <em>{c[1]}</em>
                  <b>{demo.to}</b>
                </span>
              </span>
            </Tap>
          </span>
          <span className="gd-post gd-save">{demo.done}</span>
        </div>
      )
      break

    case 'extend':
      body = (
        <div className="gd-plan">
          <div className="gd-planbar">
            <Portrait name={first(demo.title)} className="is-av" />
            <span className="gd-plan-t">
              <b>{demo.title}</b>
              <span className="gd-swap is-3">
                <small className="gd-a3">{demo.from}</small>
                <small className="gd-b3">{demo.wait}</small>
                <small className="gd-c3 is-green">{demo.to}</small>
              </span>
            </span>
          </div>
          <span className="gd-swap is-3">
            <span className="gd-a3 gd-row">
              {c.slice(0, 2).map((chip, i) =>
                i === Math.max(0, demo.tap ? c.indexOf(demo.tap) : 0) ? (
                  <Tap key={chip}>
                    <span className="gd-chip is-on">{chip}</span>
                  </Tap>
                ) : (
                  <span key={chip} className="gd-chip">
                    {chip}
                  </span>
                ),
              )}
            </span>
            <span className="gd-b3 gd-waiting">
              <i />
              <i />
              <i />
              <small>{demo.sub}</small>
            </span>
            <span className="gd-c3 gd-ok">
              <Check />
              {demo.done}
            </span>
          </span>
        </div>
      )
      break

    case 'accept':
      body = (
        <div className="gd-req">
          <div className="gd-req-h">
            <Portrait name={first(demo.title)} className="is-av" />
            <span className="gd-plan-t">
              <b>{demo.title}</b>
              <small>{demo.sub}</small>
            </span>
            <b className="gd-amt">{demo.from}</b>
          </div>
          <span className="gd-swap">
            <span className="gd-pre gd-row">
              <Tap className="is-grow">
                <span className="gd-btn is-gold is-block">{demo.tap}</span>
              </Tap>
              <span className="gd-btn is-quiet">{demo.alt}</span>
            </span>
            <span className="gd-post gd-ok">
              <Check />
              <span>
                {demo.done} <b>{demo.to}</b>
              </span>
            </span>
          </span>
        </div>
      )
      break

    case 'claim':
      body = (
        <div className="gd-task">
          <span className="gd-task-ic" aria-hidden="true">{c[0] ?? '📺'}</span>
          <span className="gd-plan-t">
            <b>{demo.title}</b>
            <small>{demo.sub}</small>
          </span>
          <span className="gd-swap">
            <span className="gd-pre">
              <Tap>
                <span className="gd-btn gd-claim">{demo.tap}</span>
              </Tap>
            </span>
            <span className="gd-post gd-pill is-gold">{demo.done}</span>
          </span>
          <span className="gd-bal">
            <span className="gd-swap">
              <span className="gd-pre">{demo.from}</span>
              <b className="gd-post">{demo.to}</b>
            </span>
          </span>
        </div>
      )
      break

    case 'translate':
      body = (
        <div className="gd-chat">
          <span className="gd-bubble is-them">{c[2]}</span>
          <Tap className="gd-bubble-tap">
            <span className="gd-bubble is-me">
              <span className="gd-swap">
                <span className="gd-pre">
                  <em className="gd-lang">{c[0]}</em> {demo.from}
                </span>
                <span className="gd-post">
                  <em className="gd-lang">{c[1]}</em> {demo.to}
                </span>
              </span>
            </span>
          </Tap>
          <small className="gd-post gd-dim gd-under">{demo.done}</small>
        </div>
      )
      break

    case 'gift':
      body = (
        <div className="gd-gifts">
          <span className="gd-float" aria-hidden="true">
            {(c[0] ?? '🌹').split(' ')[0]}
          </span>
          <div className="gd-tray">
            {c.slice(0, 4).map((g, i) => {
              const [emo, ...rest] = g.split(' ')
              const tile = (
                <span className="gd-gift">
                  <span className="gd-gift-e">{emo}</span>
                  <small>{rest.join(' ')}</small>
                </span>
              )
              return i === 0 ? <Tap key={g}>{tile}</Tap> : <span key={g}>{tile}</span>
            })}
          </div>
          <small className="gd-post gd-under">{demo.done}</small>
        </div>
      )
      break

    case 'sos':
      body = (
        <div className="gd-sos">
          <Tap hold className="gd-sos-tap">
            <span className="gd-sos-btn">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="28" className="gd-sos-track" />
                <circle cx="32" cy="32" r="28" className="gd-sos-fill" />
              </svg>
              <b>{demo.tap}</b>
            </span>
          </Tap>
          <span className="gd-swap gd-sos-t">
            <span className="gd-pre">
              <b>{demo.title}</b>
              <small>{demo.sub}</small>
            </span>
            <span className="gd-post">
              <b className="is-red">{demo.done}</b>
              <small>{demo.to}</small>
            </span>
          </span>
        </div>
      )
      break

    case 'topup':
    case 'cashout':
    case 'modes': {
      const gold = demo.kind === 'cashout'
      body = (
        <div className="gd-wallet">
          <span className={`gd-metal${gold ? ' is-gold' : ''}${demo.kind === 'modes' ? ' is-flip' : ''}`}>
            <span className="gd-metal-k">{demo.title}</span>
            <span className="gd-swap">
              <b className="gd-pre">{demo.from}</b>
              <b className="gd-post">{demo.to}</b>
            </span>
            <span className="gd-glint" aria-hidden="true" />
          </span>
          {demo.kind === 'cashout' ? (
            <span className="gd-swap">
              <span className="gd-pre">
                <Tap className="is-grow">
                  <span className="gd-btn is-gold is-block">{demo.tap}</span>
                </Tap>
              </span>
              <span className="gd-post gd-ok">
                <Check />
                {demo.done}
              </span>
            </span>
          ) : (
            <span className={`gd-row gd-seg${demo.kind === 'modes' ? ' is-modes' : ''}`}>
              {c.map((a, i) =>
                i === 1 ? (
                  <Tap key={a} className="is-grow">
                    <span className="gd-chip is-target">{a}</span>
                  </Tap>
                ) : (
                  <span key={a} className={`gd-chip${i === 0 ? ' is-was' : ''}`}>
                    {a}
                  </span>
                ),
              )}
            </span>
          )}
          {demo.kind !== 'cashout' && demo.done ? <small className="gd-post gd-under">{demo.done}</small> : null}
        </div>
      )
      break
    }

    case 'share':
      body = (
        <div className="gd-req">
          <div className="gd-req-h">
            <Portrait name={first(demo.title)} className="is-av" anon={demo.anon} />
            <span className="gd-plan-t">
              <b>{demo.title}</b>
              <small>{demo.sub}</small>
            </span>
          </div>
          <span className="gd-swap">
            <span className="gd-pre">
              <Tap className="is-grow">
                <span className="gd-btn is-gold is-block">{demo.tap}</span>
              </Tap>
            </span>
            <span className="gd-post gd-ok">
              <Check />
              {demo.done}
            </span>
          </span>
        </div>
      )
      break

    case 'qr':
      body = (
        <div className="gd-ticket is-qr">
          <span className="gd-ticket-t">
            <b>{demo.title}</b>
            <small>{demo.sub}</small>
            <span className="gd-swap">
              <span className="gd-pre">
                <Tap>
                  <span className="gd-btn is-gold">{demo.tap}</span>
                </Tap>
              </span>
              <span className="gd-post gd-row">
                <s className="gd-dim">{demo.from}</s>
                <b className="gd-gold">{demo.to}</b>
              </span>
            </span>
          </span>
          <span className="gd-post gd-qr" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          {demo.done ? <small className="gd-post gd-under">{demo.done}</small> : null}
        </div>
      )
      break

    case 'pack':
      body = (
        <div className="gd-pack">
          <span className="gd-pass">
            <span className="gd-mono">{demo.title}</span>
            <b>{demo.from}</b>
            <small>{demo.sub}</small>
          </span>
          <span className="gd-pack-r">
            <span className="gd-pack-rows">
              {c.map((r, i) => (
                <small key={r} style={{ animationDelay: `${i * 90}ms` }}>
                  <Check /> {r}
                </small>
              ))}
            </span>
            <span className="gd-swap">
              <span className="gd-pre">
                <Tap className="is-grow">
                  <span className="gd-btn is-gold is-block">{demo.tap}</span>
                </Tap>
              </span>
              <span className="gd-post gd-ok is-small">{demo.done}</span>
            </span>
          </span>
        </div>
      )
      break

    case 'online':
      body = (
        <div className="gd-req">
          <div className="gd-req-h">
            <span className="gd-plan-t">
              <b>{demo.title}</b>
              <small>{demo.sub}</small>
            </span>
            <Tap>
              <span className="gd-toggle" />
            </Tap>
          </div>
          <span className="gd-post gd-toast">
            <Portrait name={first(demo.done)} className="is-av" />
            <span className="gd-plan-t">
              <b>{demo.done}</b>
              <small>{demo.to}</small>
            </span>
          </span>
        </div>
      )
      break

    case 'driver':
      body = (
        <div className="gd-driver">
          <span className="gd-swap">
            <span className="gd-pre gd-col">
              <b>{demo.title}</b>
              <small>{demo.sub}</small>
              <Tap>
                <span className="gd-btn is-gold">{demo.tap}</span>
              </Tap>
            </span>
            <span className="gd-post gd-thai" lang="th">
              <b>{demo.to}</b>
              <small>{demo.done}</small>
            </span>
          </span>
        </div>
      )
      break
  }

  return (
    <div className={`gd is-${demo.kind}`} aria-hidden="true" data-testid="guide-demo" data-demo={demo.kind}>
      {body}
    </div>
  )
}
