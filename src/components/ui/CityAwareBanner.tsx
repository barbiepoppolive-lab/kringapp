import { setCity } from '../../lib/experiences'
import { useAwayFromHome } from '../../lib/homeCity'
import { triggerHaptic } from '../../lib/haptics'
import { t as lex } from '../../lib/lexicon'
import '../../styles/shell.css'

/**
 * KRING T3 · "Everyone is a traveller somewhere". When the selected city is not your home city (home city from the
 * profile, lib/homeCity.ts) the top of Experiences says so, in your language:
 *   You're in Pattaya · locals here          คุณอยู่พัทยา · โลคอลที่นี่
 *   Home: Bangkok · See Bangkok instead       บ้านคุณ: กรุงเทพฯ · ดูกรุงเทพฯแทน
 * Nothing shows at home or when the home city is unknown. It is information, never a mode: the tabs, header and dock
 * stay the same. Testids: city-away-banner (data-here / data-home), city-away-home-btn.
 */
export default function CityAwareBanner({ language }: { language: string }) {
  const { away, here, home } = useAwayFromHome()
  if (!away || !home) return null
  const lang = language === 'th' ? 'th' : language === 'zh' ? 'zh' : 'en'
  const cityName = (c: string) => lex(`city.${c}`, lang)
  return (
    <section className="kca" data-testid="city-away-banner" data-here={here} data-home={home} aria-live="polite" lang={lang === 'th' ? 'th' : undefined}>
      <svg className="kca-pin" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      </svg>
      <span className="kca-body">
        <b className="kca-t">{lex('city.here', lang, { city: cityName(here) })}</b>
        <span className="kca-s">
          {lex('city.home', lang, { home: cityName(home) })} ·{' '}
          <button
            type="button"
            className="kca-btn"
            data-testid="city-away-home-btn"
            onClick={() => {
              triggerHaptic('select')
              setCity(home)
            }}
          >
            {lex('city.home.see', lang, { home: cityName(home) })}
          </button>
        </span>
      </span>
    </section>
  )
}
