import { triggerHaptic } from '../../lib/haptics'
import { togglePin, usePins } from '../../lib/pins'
import { LOCAL_PROFILES } from '../../lib/experiences'
import { resolveUnifiedHost } from '../../data/hostsRegistry'
import HostPhoto from '../ui/HostPhoto'
import { useLanguage } from '../../i18n/LanguageContext'
import { useTr, WPage } from './walletKit'
import { IcHeart } from './meIcons'

/** KRING VISUAL V2 · Me › Saved — the locals you hearted on Locals (pins = safety store `savedHostIds`). */
export default function SavedPage({ open, onBack }: { open: boolean; onBack: () => void }) {
  const tr = useTr()
  const { language } = useLanguage()
  const th = language === 'th'
  const pins = usePins()
  const rows = pins.map((id) => {
    const p = LOCAL_PROFILES[id]
    const reg = resolveUnifiedHost(id)
    const name = p?.name ?? (reg.id === id ? reg.name : id.replace(/^host-/, ''))
    return { id, name, area: p ? (th ? p.areaTh : p.areaEn) : reg.id === id ? reg.district : '', photo: reg.id === id ? reg.avatarUrl : undefined }
  })
  return (
    <WPage open={open} onBack={onBack} title={tr('Saved', 'ที่เซฟไว้')} testId="wallet-saved-page">
      {rows.length === 0 ? (
        <div className="me5-empty" data-testid="wallet-saved-empty">
          <span className="me5-ict" aria-hidden="true">
            <IcHeart />
          </span>
          <b>{tr('No saved locals yet', 'ยังไม่มีโลคอลที่เซฟไว้')}</b>
          <small>{tr('Tap the heart on Locals and they show up here.', 'แตะหัวใจในหน้าโลคอล แล้วจะขึ้นที่นี่')}</small>
          <button
            type="button"
            className="kw-btn is-ghost kf-press"
            onClick={() => {
              onBack()
              window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('kring:exp-view', { detail: { view: 'locals' } })), 120)
            }}
          >
            {tr('See Locals', 'ดูโลคอล')}
          </button>
        </div>
      ) : (
        <ul className="me5-saved kf-stagger" data-testid="wallet-saved-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="me5-sv kf-press"
                onClick={() => {
                  triggerHaptic('select')
                  onBack()
                  window.dispatchEvent(new CustomEvent('chon:open-host-profile', { detail: { hostId: r.id, hostName: r.name } }))
                }}
              >
                <HostPhoto src={r.photo} name={r.name} className="me5-svp" imgClassName="me5-svi" />
                <span className="me5-svt">
                  <b>{r.name}</b>
                  {r.area ? <small>{r.area}</small> : null}
                </span>
              </button>
              <button
                type="button"
                className="me5-svh is-on"
                aria-label={tr(`Remove ${r.name} from Saved`, `เอา ${r.name} ออกจากที่เซฟ`)}
                onClick={() => togglePin(r.id, r.name, language)}
              >
                <IcHeart />
              </button>
            </li>
          ))}
        </ul>
      )}
    </WPage>
  )
}
