/* Check-in & pay the host (guest side).
   1. Before check-in: the meeting place, time and the safety rule. "We've met" opens the check-in (#bump), with a
      6-digit code fallback. Nothing about payment happens here.
   2. After check-in: "Pay {host} ฿X here" by the host's own PromptPay / K-Shop QR or cash. The guest never marks the
      host as paid; only the host confirms receipt, on the host's own phone (host screens).
   The activity type and price come from the booking, never from a switch on this screen. Kring never holds this money. */
import { S, useS } from '../core/store'
import { t, baht } from '../core/data'
import { register, go } from '../core/router'
import { tick } from '../core/sound'
import { dayOf, boughtVoucher, activityEnded } from '../core/dayof'
import { I, Ic } from '../ui/kit'

function CheckinScreen() {
  const s = useS()
  const d = dayOf()
  const { host, meet: place, time, end, maps, pending, payHost, ref, b, addr, addrTh, meetTh, hint } = d
  const ended = activityEnded(b, d.a)
  // personal Thai PromptPay QRs: say plainly that foreign payment apps usually can't pay them (not needed in Thai)
  const foreignPay = s.lang !== 'th' && payHost > 0
  const checkedIn = !!s.met || b?.ticket_status === 'used'
  const v = boughtVoucher(b)
  const venueName = v?.venue ? (s.lang === 'th' ? v.venue.nameTh : v.venue.nameEn) : ''
  const venueArea = v?.venue?.district || ''
  const mapUrl = v?.venue ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${v.venue.nameEn}, ${v.venue.district}, Bangkok`) : ''

  const startCheckin = (code: boolean) => {
    S.code = code
    tick(0.7, 0.06)
    go('bump', 'f')
  }

  return (
    <>
      <div className="topb">
        <button className="ib" data-go="onway" data-how="l" aria-label="Back">
          <Ic p={I.back} />
        </button>
        <div className="grow" />
        {/* SOS first, so a long ref (or large text) can never push it off screen */}
        <button className="ib num" id="ck-sos-top" style={{ color: 'var(--street)', fontSize: 11 }} data-go="safety" aria-label="SOS">SOS</button>
      </div>

      <div className="scroll pad col" style={{ gap: 14, paddingBottom: 90 }}>
        <div>
          <span className="eyebrow">{t('ckTitle')}</span>
          <h1 className="h1" id="ck-heading">
            {t('ckSub', { host, place })}
          </h1>
          <p className="small num" style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ic p={I.clock} s={14} /><span>{time}–{end}</span>
            <a id="ck-maps" href={maps} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--anchan2)', display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 8 }}><Ic p={I.pin} s={14} />{t('mpMaps')}</a>
          </p>
          {addr && <p className="small" id="ck-addr" style={{ marginTop: 4, lineHeight: 1.45 }}>{addr}</p>}
          {hint && <p className="small" id="ck-hint" style={{ marginTop: 2, lineHeight: 1.45, color: 'var(--gold2)' }}>{hint}</p>}
          {(meetTh || addrTh) && <p className="small" id="ck-driver" style={{ marginTop: 2, lineHeight: 1.45 }}><span style={{ color: 'var(--ink2)' }}>{t('owDriver')}:</span> <span lang="th">{[meetTh, addrTh].filter(Boolean).join(' · ')}</span></p>}
          <span className="chip goldc num" id="ck-ref" style={{ height: 30, fontSize: 12, marginTop: 8, maxWidth: '100%' }}>
            {t('ckRefLabel')}: {ref}
          </span>
        </div>

        {!checkedIn && (
          <div className="glass card col" id="ck-bump-box" style={{ gap: 12, padding: 18 }}>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <Ic p={I.shield} s={18} />
              <span className="small" id="ck-pay-rule" style={{ lineHeight: 1.5 }}>{t('ckPayRule', { host })}</span>
            </div>
            {foreignPay && <span className="small" id="ck-pay-foreign-pre" style={{ lineHeight: 1.5, color: 'var(--gold2)' }}>{t('payHostForeign', { host })}</span>}
            {pending ? (
              <span className="small" id="ck-pending" style={{ lineHeight: 1.5, color: 'var(--anchan2)' }}>{t('owPendingNote', { host })}</span>
            ) : (
              <>
                <button className="btn gold" id="ck-bump-btn" onClick={() => startCheckin(false)}>
                  {t('ckTapBump')}
                </button>
                <button className="btn ghost" id="ck-code-fallback" onClick={() => startCheckin(true)}>
                  {t('ckCodeFallback')}
                </button>
              </>
            )}
          </div>
        )}

        {checkedIn && (
          <>
            <div className="chip goldc" id="ck-checked-in" style={{ alignSelf: "flex-start", height: 32 }}>
              {t('ckInDone', { host })}
            </div>
            <div className="glass card col" id="ck-pay-box" style={{ gap: 10, padding: 18 }}>
              {payHost > 0 ? (
                <>
                  <b style={{ fontSize: 21 }} id="ck-pay-amount">{t('ckPayHere', { host, amt: baht(payHost) })}</b>
                  <span className="small" style={{ lineHeight: 1.5 }}>{t('ckPayHow', { host })}</span>
                  {foreignPay && <span className="small" id="ck-pay-foreign" style={{ lineHeight: 1.5, color: 'var(--gold2)' }}>{t('payHostForeign', { host })}</span>}
                  <span className="small" id="ck-pay-wait" style={{ lineHeight: 1.5, color: 'var(--ink2)' }}>{t('ckPayWait', { host })}</span>
                </>
              ) : (
                <b style={{ fontSize: 17 }} id="ck-pay-none">{t('ckPayNone', { host })}</b>
              )}
              <span className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Ic p={I.shield} s={14} />{t('s2')}
              </span>
            </div>

            {v && (
              <div
                className="glass card col"
                id="ck-voucher-box"
                style={{ gap: 4, padding: 14, border: '1px solid rgba(255, 208, 103, 0.45)', background: 'rgba(255, 178, 30, 0.1)' }}
              >
                <span className="small" style={{ color: 'var(--gold2)', fontWeight: 700 }}>{t('ckVoucherYours')}</span>
                <b className="num" id="ck-voucher-code" style={{ fontSize: 18, letterSpacing: '.08em' }}>{v.code.replace(/^KRV-/i, '')}</b>
                {v.venue && <span className="small">{t('ckVoucherShow', { venue: venueName, area: venueArea })}</span>}
                {mapUrl && (
                  <a className="small" id="ck-voucher-map" href={mapUrl} target="_blank" rel="noopener" style={{ color: 'var(--anchan2)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Ic p={I.pin} s={14} />{t('ckMapLink')}
                  </a>
                )}
              </div>
            )}

            {ended ? (
              <button className="btn gold" id="ck-done-rate" data-go="rate" data-how="f">
                {t('ckContinueRate')}
              </button>
            ) : (
              <>
                <span className="small" id="ck-rate-later" style={{ lineHeight: 1.5, textAlign: 'center' }}>{t('rateLater', { host, end })}</span>
                <button className="btn ghost" id="ck-to-trips" data-go="trips" data-how="f">{t('t_trips')}</button>
              </>
            )}
          </>
        )}

        {/* always reachable in the page itself (large text, small screens): Safety & SOS */}
        <button className="btn ghost" id="ck-sos" data-go="safety" data-how="f" style={{ flex: 'none', color: 'var(--street)', borderColor: 'rgba(255,90,90,.45)' }}>
          <Ic p={I.shield} s={18} />{t('ckSafetySos')}
        </button>
      </div>
    </>
  )
}

register({ id: 'checkin', flow: 't', title: 'Check-in', C: CheckinScreen })
