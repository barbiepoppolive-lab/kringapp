import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { bahtLabel } from '../pulse/floorPrices'
import { KRING_PRICE_ITEMS, PRICES_CHECKED, longDate, shortDate, type KringCity } from './priceData'

/**
 * K4 · B8 — the "?" sheet: what "Kring price" means, in one sheet. Never a two-tier "Thai price": the street price is
 * the quote visitors usually get; the Kring price is the fair all-in price, the same for every passport, re-checked
 * every week. The stamp's city follows the switch. Sources: every tourist price with who published it and when.
 */
export default function KringPriceHelp({ open, onClose, city, lang }: { open: boolean; onClose: () => void; city: KringCity; lang: string }) {
  const th = lang === 'th'
  const cityName = city === 'pattaya' ? (th ? 'พัทยา' : 'PATTAYA') : th ? 'กรุงเทพฯ' : 'BANGKOK'
  const items = KRING_PRICE_ITEMS.filter((i) => i.cities.includes(city))
  return (
    <Sheet
      open={open}
      onClose={onClose}
      testId="kp-help-sheet"
      title={th ? 'ราคากริ๊ง คืออะไร' : 'What’s the Kring price?'}
      detents={['92%']}
      initialDetent="92%"
      footer={
        <button type="button" className="kp-btn kp-btn-gold kp-btn-block" data-testid="kp-help-got-it" onClick={() => (triggerHaptic('tap'), onClose())}>
          {th ? 'เข้าใจแล้ว' : 'Got it'}
        </button>
      }
    >
      <div className="kp-help">
        <p className={th ? 'kp-help-th' : 'sr-only'} lang="th">ราคากริ๊ง คือราคาปกติแบบรวมทุกอย่าง ราคาเดียวกันทุกคน ไม่ว่าจะมาจากไหน</p>
        <div className="kp-help-boxes">
          <div className="kp-help-box is-tourist">
            <b>{th ? 'ราคาทั่วไป' : 'Street price'}</b>
            <span>{th ? 'ราคาแรกที่มักได้ยิน: ข้างถนน เคาน์เตอร์โรงแรม แผงทัวร์' : 'The first quote you usually get: on the street, at a hotel desk or a tour stand.'}</span>
          </div>
          <div className="kp-help-box is-kring">
            <b>{th ? 'ราคากริ๊ง' : 'Kring price'}</b>
            <span>{th ? 'ราคายุติธรรมรวมทุกอย่าง ที่โลคอลตัวจริงและสปาที่มีใบอนุญาตตกลง ราคาเดียวกันทุกพาสปอร์ต' : 'The fair all-in price our verified locals and licensed spas agree to. Same for every passport.'}</span>
          </div>
        </div>
        <ol className="kp-help-steps">
          <li style={{ ['--i' as string]: 0 }}>
            <b>{th ? 'เราเก็บราคาจริงทุกสัปดาห์' : 'We collect real quotes'}</b> {th ? 'ในกรุงเทพฯ และพัทยา' : 'every week in Bangkok and Pattaya.'}
          </li>
          <li style={{ ['--i' as string]: 1 }}>
            <b>{th ? 'โลคอลตั้งราคาแบบรวมหมด' : 'Locals set a fair, all-in price:'}</b> {th ? 'ทางด่วน ตั๋ว เวลารอ' : 'tolls, tickets, waiting time.'}
          </li>
          <li style={{ ['--i' as string]: 2 }}>
            <b>{th ? 'ยังต่อรองในแชตได้' : 'You can still offer or counter'}</b> {th ? 'ดีลของคุณเอง' : 'in chat. It’s your deal.'}
          </li>
        </ol>
        <span className="kp-stamp" data-testid="kp-help-stamp">
          ✓ {th ? 'เช็คเมื่อ' : 'CHECKED'} {shortDate(PRICES_CHECKED, lang).toUpperCase()} · {cityName}
        </span>
        <details className="kp-sources">
          <summary>{th ? 'ที่มาของราคาทั่วไป' : 'Where the street prices come from'}</summary>
          <ul>
            {items.filter((i) => i.touristSolid !== false).map((i) => (
              <li key={i.id}>
                <b>
                  {th ? i.title.th : i.title.en} · {bahtLabel(i.touristThb)}
                </b>
                <span>{i.touristSource.note}</span>
                <a href={i.touristSource.url} target="_blank" rel="noreferrer">
                  {i.touristSource.name} ↗
                </a>
                <small>
                  {th ? 'ข้อมูลของแหล่ง' : 'source dated'} {longDate(i.touristSource.published, lang)} · {th ? 'เราเช็คเมื่อ' : 'we checked'} {longDate(i.touristSource.checked, lang)}
                </small>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Sheet>
  )
}
