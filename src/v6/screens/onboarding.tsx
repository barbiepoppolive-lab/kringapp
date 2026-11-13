/* Welcome + Language. (Sign-in lives in signup.tsx.) Ported from the prototype. */
import { useEffect, useMemo, useRef } from 'react'
import { S, useS, type Lang } from '../core/store'
import { t, L, LANGS, rand, RM } from '../core/data'
import { register, hasAccount } from '../core/router'
import { I, Ic } from '../ui/kit'

/* First visit: follow the phone's language (welcome copy, sign-up, Explore). A saved choice always wins. */
const BCP: Record<Lang, string> = { en: 'en', zh: 'zh-Hans', ko: 'ko', hi: 'hi', ru: 'ru', ms: 'ms', th: 'th' }
export function deviceLang(): Lang | null {
  try {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || []
    for (const raw of list) {
      const p = String(raw || '').toLowerCase().split(/[-_]/)[0]
      const k = (p === 'id' ? 'ms' : p) as Lang
      if ((LANGS as string[]).includes(k)) return k
    }
  } catch { /* ignore */ }
  return null
}
try {
  let saved = false
  try { saved = !!JSON.parse(localStorage.getItem('kring-v6') || '{}').lang } catch { /* private mode */ }
  const d = deviceLang()
  if (!saved && d) S.lang = d
} catch { /* ignore */ }
/** Device language first, then Thai, then the rest (Thai is never last or hidden under the button). */
const langOrder = (): Lang[] => {
  const d = deviceLang()
  const first: Lang[] = d && d !== 'th' ? [d, 'th'] : ['th']
  return [...first, ...LANGS.filter((k) => !first.includes(k))]
}

function Welcome() {
  useS()
  const greet = useRef<HTMLDivElement>(null)
  const lanterns = useMemo(() => Array.from({ length: 12 }, () => ({ left: rand(4, 94).toFixed(0) + '%', dur: rand(9, 16).toFixed(1) + 's', delay: '-' + rand(0, 14).toFixed(1) + 's', sc: rand(0.6, 1.3).toFixed(2) })), [])
  useEffect(() => {
    if (RM) return
    const w = ['สวัสดี', 'Hello', '你好', '안녕하세요', 'नमस्ते', 'Привет', 'Salam']
    let i = 0
    const iv = setInterval(() => {
      const g = greet.current; if (!g) return
      g.classList.add('out')
      setTimeout(() => { i = (i + 1) % w.length; g.textContent = w[i]; g.classList.remove('out') }, 350)
    }, 1500)
    return () => clearInterval(iv)
  }, [])
  return (
    <div className="wel">
      {lanterns.map((l, i) => <span key={i} className="lan" style={{ left: l.left, animationDuration: l.dur, animationDelay: l.delay, transform: `scale(${l.sc})` }} />)}
      <div className="welC">
        <svg className="wrings" viewBox="0 0 220 130" role="img" aria-label="Kring rings meeting"><g className="ra"><circle cx="80" cy="65" r="44" /></g><g className="rb"><circle cx="140" cy="65" r="44" /></g><path className="lensv" d="M110 32.8A44 44 0 0 1 110 97.2A44 44 0 0 1 110 32.8Z" /></svg>
        <div className="wword">กริ๊ง!</div><div className="greet" ref={greet}>สวัสดี</div>
      </div>
      <div className="welB rise">
        <h1 className="h1" style={{ textAlign: 'center' }}>{t('tagline')}</h1><p className="lead" style={{ textAlign: 'center' }}>{t('tagsub')}</p>
        <button className="btn gold" data-go="lang" data-ching="1">{t('start')}</button>
        {/* "I already have an account" opens sign-in (not the create-account form) */}
        <button className="btn ghost" data-go={hasAccount() ? 'experiences' : 'signin'} data-how={hasAccount() ? 'f' : 'r'}>{t('haveAcc')}</button>
      </div>
    </div>
  )
}

const langBack = (): string => { const f = S.from.lang; return f && !['welcome', 'signup', 'signin', 'lang'].includes(f) ? f : 'welcome' }
function Language() {
  const s = useS()
  const back = langBack()
  return (
    <>
      <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label={t('backW')}><Ic p={I.back} /></button><div className="grow" /></div>
      <div className="scroll"><div className="pad rise" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 160 }}>
        <h1 className="h1">{t('langTitle')}</h1><p className="lead">{t('langSub')}</p>
        <div className="langs" role="radiogroup" aria-label={t('langTitle')}>{langOrder().map((k: Lang) => (
          <button key={k} type="button" className={`lrow ${k === s.lang ? 'on' : ''}`} data-setlang={k} role="radio" aria-checked={k === s.lang} lang={BCP[k]}>
            <span className="lhello">{L[k].hello}</span><span className="lnat">{L[k].native}</span><span className="lchk"><Ic p={I.check} s={14} sw={3} /></span>
          </button>))}</div>
      </div></div>
      {/* First run: straight to browsing (sign-up is asked at "Request to book"). From the language pill: back where you were. */}
      <div className="footer"><button className="btn gold" data-go={back === 'welcome' ? 'experiences' : back} data-how={back === 'welcome' ? 'f' : 'l'}>{t('cont')}</button></div>
    </>
  )
}

register(
  { id: 'welcome', flow: 't', title: 'Welcome', C: Welcome },
  { id: 'lang', flow: 't', title: 'Language', C: Language },
)
