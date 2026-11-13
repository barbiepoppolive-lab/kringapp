/* 7-Day Pass entry card (area E) for Me and Deals. The Pass is bought on Book & pay (area A) with the next booking:
   the card explains it and opens Explore with the Pass already chosen for that booking (core/passIntent). */
import { useS } from '../core/store'
import { t, baht, fx, myPass, dayFmt } from '../core/data'
import { KR6_PRODUCTS } from '../core/ticketsAndRails'
import { go, toast } from '../core/router'
import { wantPass } from '../core/passIntent'
import { tick } from '../core/sound'
import { I, Ic } from '../ui/kit'

export function PassCard({ id, style }: { id: string; style?: React.CSSProperties }) {
  useS()
  const pass = myPass()
  const price = KR6_PRODUCTS.pass_7day.priceThb
  if (pass.active && pass.until) {
    return (
      <button type="button" className="mrow" id={id} data-go="trips" data-how="r" style={style}>
        <Ic p={I.ticket} s={20} />
        <span className="col grow" style={{ gap: 1 }}><b>{t('passName')}</b><span className="small">{t('passActive', { n: pass.daysLeft })} · {t('passUntil', { d: dayFmt(pass.until, { weekday: 'short', day: 'numeric', month: 'short' }) })}</span></span>
        <Ic p={I.chev} s={16} />
      </button>
    )
  }
  const pick = () => { wantPass(); tick(0.7, 0.06); go('experiences', 'f'); toast(t('passPickAct'), 'info') }
  return (
    <div className="glass card col" id={id} style={{ gap: 8, ...style }}>
      <span className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--gold2)', display: 'grid' }}><Ic p={I.ticket} s={20} /></span>
        <b className="grow" style={{ fontSize: 16 }}>{t('passName')}</b>
        <span className="col" style={{ alignItems: 'flex-end', gap: 0 }}><b className="num" style={{ color: 'var(--gold2)', fontSize: 18 }}>{baht(price)}</b>{fx(price) && <span className="small num">≈ {fx(price)}</span>}</span>
      </span>
      <span className="small">{t('passWhat')}</span>
      <button type="button" className="btn gold" id={id + '-go'} style={{ height: 46 }} onClick={pick}>{t('passCardGo')}</button>
    </div>
  )
}
