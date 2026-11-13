/* Sign up / sign in: asked only when the traveller wants to book (router GATED), or from "I already have an account".
   Name, then one way in: a login button, phone (any country code, typed by the person) or email code.
   Preview mode (no Supabase keys): the code fills itself and nothing leaves the phone.
   Live mode: real sign-in through core/auth and the profile row through core/account.
   Continuing needs a name and the 20+ confirmation, which the server records with the terms version. */
import { useEffect, useRef, useState } from 'react'
import { S, update, useS, type Diet } from '../core/store'
import { t, me, dietWord, legalUrl } from '../core/data'
import { register, go, toast, takeAfterSignup, hasAccount } from '../core/router'
import { browseDiet } from './explore'
import { bell, buzz, tick } from '../core/sound'
import { I, Ic, Choice } from '../ui/kit'
import { configured, currentUser, onAuth, OAUTH, sendCode, verifyCode, signInWith } from '../core/auth'
import { acceptTerms, loadProfile, saveProfile, isLive } from '../core/account'

/* Prototype S.gSet: "skip" (gender null) shows as chosen only once the traveller tapped it this session. */
let gSet = false
const PHONE_IC = '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>'
const MAIL_IC = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'
const CODE = '482915'
const DIETS: Diet[] = ['nonveg', 'veg', 'halal', 'jain', 'nobeef', 'nopork']
const LEGAL = legalUrl
/** Country codes: Thailand first, then the countries Kring's languages come from, then common visitor countries. */
const CC: [string, string][] = [['+66', 'TH'], ['+44', 'UK'], ['+1', 'US/CA'], ['+86', 'CN'], ['+82', 'KR'], ['+91', 'IN'], ['+7', 'RU/KZ'], ['+60', 'MY'],
  ['+65', 'SG'], ['+62', 'ID'], ['+81', 'JP'], ['+61', 'AU'], ['+64', 'NZ'], ['+49', 'DE'], ['+33', 'FR'], ['+31', 'NL'], ['+46', 'SE'], ['+971', 'AE'],
  ['+852', 'HK'], ['+886', 'TW'], ['+84', 'VN'], ['+63', 'PH'], ['+95', 'MM'], ['+855', 'KH'], ['+856', 'LA'], ['+880', 'BD'], ['+92', 'PK'], ['+380', 'UA']]
const inp = { height: 50, flex: 'none' as const }
/** Home country (profile) -> the CC label used above. */
const CC_OF: Record<string, string> = { GB: 'UK', US: 'US/CA', CA: 'US/CA', RU: 'RU/KZ', KZ: 'RU/KZ' }
/** Default country code: the home country when known, else the app language (English -> Thailand, where Kring runs). */
function defaultCc(): string {
  const hc = (S.prof.country || '').toUpperCase()
  const byHome = hc && CC.find(([, n]) => n === (CC_OF[hc] || hc))
  if (byHome) return byHome[0]
  if (S.lang === 'en') return '+66'
  return CC.some((c) => c[0] === me().cc) ? me().cc : '+66'
}
/** National number digits without the trunk 0 ("0812345678" -> "812345678"). */
const nat = (to: string): string => to.replace(/[^\d]/g, '').replace(/^0+/, '')
/** "+66 81 234 5678": the number as it will be used, grouped for reading. */
function fmtPhone(cc: string, digits: string): string {
  const d = digits
  if (!d) return cc
  let g: string
  if (cc === '+66' && d.length === 9) g = `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`
  else if (cc === '+66' && d.length === 8) g = `${d.slice(0, 1)} ${d.slice(1, 4)} ${d.slice(4)}`
  else { const parts: string[] = []; let r = d; while (r.length > 4) { parts.push(r.slice(0, 3)); r = r.slice(3) } parts.push(r); g = parts.join(' ') }
  return cc + ' ' + g
}

/** mode 'in' = "I already have an account": only the ways in; the rest of the form shows only if no account exists yet. */
function Signup({ mode: screenMode = 'up' }: { mode?: 'up' | 'in' }) {
  const s = useS()
  const lg = me().login
  const live = configured()
  const [spin, setSpin] = useState<string | null>(null) // provider being connected
  const [via, setVia] = useState<string | null>(null) // preview: connected with
  const [mode, setMode] = useState<null | 'phone' | 'email'>(null) // which code route is open
  const [cc, setCc] = useState(defaultCc)
  const [to, setTo] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(s.prof.name || '')
  const [nameErr, setNameErr] = useState(false)
  const [age, setAge] = useState(!!s.prof.termsAt)
  const [ageErr, setAgeErr] = useState(false)
  const [, force] = useState(0)
  const tm = useRef<ReturnType<typeof setTimeout>[]>([])
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => tm.current.forEach(clearTimeout), [])
  useEffect(() => onAuth(() => force((n) => n + 1)), [])
  // back from Google/Apple: load or create the profile
  useEffect(() => { if (live && currentUser()) loadProfile().then(() => { if (!name && S.prof.name) setName(S.prof.name) }).catch(() => toast(t('authErr'), 'err')) }, [live]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (codeSent) codeRef.current?.focus() }, [codeSent])
  // focus the phone / email field as soon as that route opens (screen readers stay in place)
  useEffect(() => { if (mode) requestAnimationFrame(() => toRef.current?.focus()) }, [mode])
  // halal / veg picked in Explore filters while browsing become the food preferences here (once, if none were chosen)
  useEffect(() => { const d = browseDiet(); if (!S.diet.length && d.length) update((st) => { st.diet = [...d] }) }, [])

  const user = live ? currentUser() : null
  const signed = live ? !!user : s.signedIn
  // Apple / Google / LINE…: the name comes from the provider when it gives one; otherwise the name is optional (add it later in Me)
  const provSigned = live ? !!(user && user.provider && user.provider !== 'email' && user.provider !== 'phone') : !!(via && lg.some(([n]) => n === via))
  useEffect(() => { if (user?.name && !name) setName(user.name.slice(0, 40)) }, [user?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  // sign-in: an existing account (terms accepted before) goes straight back to where the person was
  const signInMode = screenMode === 'in'
  useEffect(() => {
    if (!signInMode || !signed || !hasAccount()) return
    const next = takeAfterSignup()
    go(next ? next.id : 'experiences', next ? next.how : 'f')
  }, [signInMode, signed, s.prof.termsAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const showForm = !signInMode || (signed && !hasAccount())
  const fullPhone = () => cc + nat(to)
  const contact = () => (mode === 'email' ? to.trim() : fmtPhone(cc, nat(to)))
  /** typed "+66 81…" in the number box: take the country code from it */
  const onPhone = (raw: string) => {
    const v = raw.replace(/[^\d\s+-]/g, '').slice(0, 20)
    if (v.startsWith('+')) {
      const d = v.replace(/\D/g, '')
      const hit = [...CC].sort((x, y) => y[0].length - x[0].length).find(([c]) => d.startsWith(c.slice(1)))
      if (hit) { setCc(hit[0]); setTo(d.slice(hit[0].length - 1)); return }
    }
    setTo(v.replace(/\+/g, ''))
  }

  /* ---------- login buttons ---------- */
  const onProv = (n: string) => {
    if (live) {
      if (!OAUTH[n]) { toast(t('notAvail', { p: n }), 'info'); return }
      setSpin(n); tick(0.6, 0.08); signInWith(n); return
    }
    if (spin || signed) return
    setSpin(n); tick(0.6, 0.08)
    tm.current.push(setTimeout(() => { setSpin(null); setVia(n); bell(0.2, 1760); buzz(10); update((st) => { st.signedIn = true }) }, 900))
  }
  const openMode = (m: 'phone' | 'email') => { setMode(m); setCodeSent(false); setTo(''); setCode('') }

  /* ---------- phone / email code ---------- */
  const onSend = async () => {
    const good = mode === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim()) : /^\+\d{8,15}$/.test(fullPhone())
    if (!good) { toast(t(mode === 'email' ? 'emailBad' : 'phoneBad'), 'err'); buzz([10, 30, 10]); return }
    if (!live) {
      // preview: the code "arrives" and fills itself
      setCodeSent(true)
      for (let i = 0; i < 6; i++) tm.current.push(setTimeout(() => { setCode(CODE.slice(0, i + 1)); tick(0.3 + i * 0.08, 0.08) }, 500 + i * 110))
      tm.current.push(setTimeout(() => { setVia(contact()); setMode(null); buzz(10); bell(0.2, 1760); update((st) => { st.signedIn = true }) }, 1300))
      return
    }
    setBusy(true)
    try { await sendCode(mode === 'email' ? { email: to.trim() } : { phone: fullPhone() }); setCodeSent(true) } catch { toast(t('authErr'), 'err') }
    setBusy(false)
  }
  const onVerify = async () => {
    if (!/^\d{6}$/.test(code)) { toast(t('signCodeBad'), 'err'); return }
    if (!live) return
    setBusy(true)
    try {
      await verifyCode(mode === 'email' ? { email: to.trim() } : { phone: fullPhone() }, code)
      await loadProfile()
      bell(0.2, 1760); buzz(10); setMode(null)
    } catch { toast(t('authErr'), 'err'); buzz([10, 30, 10]) }
    setBusy(false)
  }

  /* ---------- choices ---------- */
  const onGender = (v: string) => {
    gSet = true
    update((st) => { st.gender = v === 'x' ? null : (v as 'f' | 'm') })
    force((n) => n + 1)
  }
  const onDiet = (d: Diet) => {
    update((st) => {
      if (st.diet.includes(d)) st.diet = st.diet.filter((x) => x !== d)
      else {
        st.diet = [...st.diet, d]
        if (d === 'veg') st.diet = st.diet.filter((x) => x !== 'nonveg')
        if (d === 'nonveg') st.diet = st.diet.filter((x) => x !== 'veg')
      }
    })
    tick(0.6, 0.05)
  }
  const gVal: string | null = s.gender || (gSet ? 'x' : null)

  // preview: the code is filling itself in / a 1-tap sign-in is spinning: Continue waits instead of showing an error
  const checking = !signed && (!!spin || (!live && codeSent && mode !== null))
  const onContinue = async () => {
    if (checking) return
    const nm = name.trim()
    if (!nm && !provSigned) { setNameErr(true); toast(t('nameNeed'), 'err'); buzz([10, 30, 10]); nameRef.current?.focus(); return }
    // the age check is named as the age check (never "choose a sign-up method")
    if (!age) { setAgeErr(true); toast(t('ageNeed'), 'err'); buzz([10, 30, 10]); document.getElementById('ageOk')?.focus(); return }
    if (!signed) {
      // typed a phone / email but never sent the code: say so
      toast(mode && !codeSent && to.trim() ? t('sendFirst', { b: t('sendCode') }) : mode && codeSent ? t('sendFirst', { b: t('verify') }) : t('signUpFirst'), 'err'); buzz([10, 30, 10]); return
    }
    setBusy(true)
    try {
      await acceptTerms(true)
      update((st) => { st.prof = { ...st.prof, name: nm.slice(0, 40) } })
      if (isLive()) await saveProfile({ ...(nm ? { name: nm } : {}), gender: s.gender, diet: s.diet, lang: s.lang })
      const next = takeAfterSignup()
      go(next ? next.id : 'experiences', next ? next.how : 'f')
    } catch { toast(t('authErr'), 'err') }
    setBusy(false)
  }

  const viaName = user ? (user.provider && user.provider !== 'email' && user.provider !== 'phone' ? user.provider : (user.email || user.phone || '')) : via
  const back = ((f) => (f && !['signup', 'signin', 'lang'].includes(f) ? f : 'welcome'))(S.from[signInMode ? 'signin' : 'signup'])
  const fromBooking = back === 'detail' || back === 'book'
  return (
    <>
      <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label={t('backW')}><Ic p={I.back} /></button><div className="grow" /></div>
      <div className="scroll"><div className="pad rise" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 150 }}>
        <h1 className="h1">{signInMode && !showForm ? t('signInT') : hasAccount() ? t('yourDetails') : t('createAcc')}</h1>
        {signInMode && !signed && <p className="lead" style={{ margin: 0 }}>{t('signInSub')}</p>}
        {signInMode && signed && !hasAccount() && <p className="lead" style={{ margin: 0 }} role="status">{t('noAcctYet')}</p>}
        {!signInMode && fromBooking && !hasAccount() && <p className="lead" style={{ margin: 0 }}>{t('signWhy')}</p>}
        {/* name: shown on the profile and to the host */}
        {showForm && <div className="col" style={{ gap: 6 }}>
          <label className="eyebrow" htmlFor="nameIn">{t('nameQ')}</label>
          <span className="inp glass" style={{ ...inp, ...(nameErr && !name.trim() ? { borderColor: 'var(--gold)' } : null) }}>
            <input id="nameIn" ref={nameRef} value={name} maxLength={40} autoComplete="given-name" placeholder={t('namePh')} aria-invalid={nameErr && !name.trim()} aria-describedby="nameWhy"
              onChange={(e) => { setName(e.target.value); setNameErr(false) }} />
          </span>
          <span className="small" id="nameWhy">{provSigned && !name.trim() ? t('nameOpt', { me: t('t_me') }) : t('nameWhy')}</span>
        </div>}
        {/* one way in: hidden once signed in */}
        {!signed && !mode && (
          <div className="col" id="provs" style={{ gap: 10 }}>
            {lg.map(([n, bg, fg], i) => (
              <button key={n} type="button" className={`prov ${i === 0 ? 'main' : ''}`} data-prov={n} style={{ background: bg, color: fg }} onClick={() => onProv(n)}>
                {spin === n ? <span className="spin" /> : t('contWith', { p: n })}
              </button>
            ))}
            <div className="orl">{t('or')}</div>
            <button type="button" className="btn ghost" id="usePh" onClick={() => openMode('phone')}><Ic p={PHONE_IC} s={18} />{t('usePhone')}</button>
            <button type="button" className="btn ghost" id="useMail" onClick={() => openMode('email')}><Ic p={MAIL_IC} s={18} />{t('useEmail')}</button>
          </div>
        )}
        {!signed && mode && (
          <div className="col" id="codebox" style={{ gap: 10 }} role="group" aria-label={t(mode === 'email' ? 'useEmail' : 'usePhone')}>
            {mode === 'phone' ? (
              <>
                <span className="small">{t('phoneSafety')}</span>
                <div className="row" style={{ gap: 8 }}>
                  <span className="inp glass" style={{ ...inp, width: 118, padding: 0 }}>
                    <select id="authCc" aria-label={t('ccLbl')} value={cc} disabled={codeSent} onChange={(e) => setCc(e.target.value)}
                      style={{ width: '100%', height: '100%', background: 'transparent', color: '#fff', border: 0, font: 'inherit', fontSize: 15, padding: '0 10px' }}>
                      {CC.map(([c, n]) => <option key={c} value={c} style={{ color: '#000' }}>{c} {n}</option>)}
                    </select>
                  </span>
                  <span className="inp glass grow" style={inp}>
                    <input id="authTo" ref={toRef} type="tel" value={to} disabled={codeSent} inputMode="tel" autoComplete="tel-national" aria-label={t('phoneLbl')}
                      placeholder={cc === '+66' ? '081 234 5678' : t('phoneLbl')} onChange={(e) => onPhone(e.target.value)} />
                  </span>
                </div>
                {nat(to).length >= 6 && <span className="small num" id="phoneFull" role="status">{t('phoneWillUse', { n: fmtPhone(cc, nat(to)) })}</span>}
              </>
            ) : (
              <span className="inp glass" style={inp}>
                <input id="authTo" ref={toRef} type="email" value={to} disabled={codeSent} inputMode="email" autoComplete="email" aria-label={t('emailPh')}
                  placeholder={t('emailPh')} onChange={(e) => setTo(e.target.value)} />
              </span>
            )}
            {codeSent && <span className="inp glass" style={inp}>
              <input id="authCode" ref={codeRef} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label={t('codePh')} placeholder={t('codePh')}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </span>}
            {codeSent && <span className="small" role="status">{t('codeSentTo', { to: contact() })}{!live ? ' ' + t('codeSent') : ''}</span>}
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={() => { setMode(null); setCodeSent(false) }}>{t('cancelW')}</button>
              <button type="button" className="btn gold" style={{ flex: 2 }} id="authGo" disabled={busy || (codeSent && !live)} onClick={codeSent ? onVerify : onSend}>{busy ? <span className="spin" /> : t(codeSent ? 'verify' : 'sendCode')}</button>
            </div>
          </div>
        )}
        {signed && <div className="conn" id="liveConn"><span className="ok"><Ic p={I.check} s={22} sw={3} /></span><b className="grow">{t('connectedW')}</b><span className="small">{viaName}</span></div>}
        {showForm && <>
        <div className="col" style={{ gap: 10 }}><span className="eyebrow" id="gLbl">{t('iam')}</span>
          <Choice id="gch" label={t('iam')} value={gVal} onChange={onGender}
            options={[{ v: 'f', label: t('woman') }, { v: 'm', label: t('man') }, { v: 'x', label: t('skip') }]} />
          <span className="small">{t('iamWhy')}</span></div>
        <div className="col" style={{ gap: 10 }}><span className="eyebrow" id="dLbl">{t('dietQ')}</span>
          <div className="chips" id="dch" role="group" aria-labelledby="dLbl">{DIETS.map((d) => <button key={d} type="button" className={`chip ${s.diet.includes(d) ? 'on' : ''}`} data-d={d} aria-pressed={s.diet.includes(d)} onClick={() => onDiet(d)}>{dietWord(d)}</button>)}</div>
          <span className="small">{t('dietWhy')}</span></div>
        {/* terms + 20+ */}
        <div className="col" style={{ gap: 8 }}>
          <button type="button" className={`mrow ${ageErr && !age ? 'bad' : ''}`} id="ageOk" role="checkbox" aria-checked={age}
            style={ageErr && !age ? { borderColor: 'var(--gold)' } : undefined}
            onClick={() => { setAge(!age); setAgeErr(false); tick(0.6, 0.05) }}>
            <span className="sw" aria-hidden="true"><input type="checkbox" tabIndex={-1} checked={age} readOnly /><i /></span>
            <span className="grow" style={{ fontWeight: 700 }}>{t('ageOk')}</span>
          </button>
          <span className="small" id="age-holder">{t('ageHolder')}</span>
          <span className="small" id="agree">{t('agreeLine')} <a href={LEGAL('terms')} target="_blank" rel="noopener" style={{ color: 'var(--anchan2, #7381FF)' }}>{t('lTerms')}</a> · <a href={LEGAL('privacy')} target="_blank" rel="noopener" style={{ color: 'var(--anchan2, #7381FF)' }}>{t('lPrivacy')}</a></span>
        </div>
        </>}
        {signInMode && !signed && <button type="button" className="btn ghost" id="newHere" data-go="signup" data-how="r">{t('newHere')}</button>}
      </div></div>
      {showForm && <div className="footer"><button type="button" className="btn gold" id="signCont" disabled={busy || checking} aria-busy={checking || undefined} onClick={onContinue}>{checking ? <><span className="spin" aria-hidden="true" />{t('signChecking')}</> : t('cont')}</button></div>}
    </>
  )
}

const SignIn = () => <Signup mode="in" />
register({ id: 'signup', flow: 't', title: 'Create your account', C: Signup }, { id: 'signin', flow: 't', title: 'Sign in', C: SignIn })
