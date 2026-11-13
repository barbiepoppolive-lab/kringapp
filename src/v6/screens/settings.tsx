/* Edit profile + Settings (account basics). Data goes through core/account (live: Supabase 0011; preview: this phone).
   Settings: sign-in & security · notifications · privacy & data (download, blocked, delete) · safety contact ·
   host settings (PromptPay for the check-in QR, away) · display · help & legal. */
import { useEffect, useState, type ReactNode } from 'react'
import { update, resetStateOnSignOut, useS, type Diet, type Lang, type Notify } from '../core/store'
import { t, me, dietWord, legalUrl } from '../core/data'
import { register, go, toast } from '../core/router'
import { tick, buzz, chime } from '../core/sound'
import { I, Ic, Av, Sheet } from '../ui/kit'
import { configured, currentUser, signOut, previewOnly } from '../core/auth'
import { saveProfile, exportData, deleteAccount, listBlocked, unblock, isLive, type Blocked } from '../core/account'

const VERSION = '6.3.0'
const DIETS: Diet[] = ['nonveg', 'veg', 'halal', 'jain', 'nobeef', 'nopork']
const COUNTRIES = ['TH', 'IN', 'CN', 'KR', 'RU', 'MY', 'SG', 'ID', 'VN', 'JP', 'HK', 'TW', 'PH', 'AU', 'GB', 'US', 'CA', 'DE', 'FR', 'NL', 'IT', 'ES', 'SE', 'IL', 'AE', 'SA', 'BD', 'PK', 'LK', 'NP', 'KZ', 'UA', 'BR', 'NZ']
const SPOKEN = ['th', 'en', 'zh', 'ko', 'hi', 'ru', 'ms', 'ja', 'fr', 'de', 'es', 'ar']
const LEGAL = legalUrl

const regionName = (lang: Lang, code: string) => { try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code) || code } catch { return code } }
const langName = (lang: Lang, code: string) => { try { return new Intl.DisplayNames([lang], { type: 'language' }).of(code) || code } catch { return code } }

function Top({ title, back = 'me' }: { title: string; back?: string }) {
  return <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label="Back"><Ic p={I.back} /></button><b className="grow" style={{ fontSize: 18, textAlign: 'center' }}>{title}</b><span style={{ width: 40 }} /></div>
}
function Field({ id, label, value, onChange, ph, mode, max = 80 }: { id: string; label: string; value: string; onChange: (v: string) => void; ph?: string; mode?: 'tel' | 'email' | 'numeric' | 'text'; max?: number }) {
  return (
    <div className="col" style={{ gap: 6 }}><label className="eyebrow" id={id + '-l'} htmlFor={id}>{label}</label>
      <span className="inp glass" style={{ height: 50, flex: "none" }}><input id={id} aria-labelledby={id + '-l'} value={value} placeholder={ph} maxLength={max} inputMode={mode} autoComplete={mode === 'tel' ? 'tel' : undefined} onChange={(e) => onChange(e.target.value)} /></span>
    </div>
  )
}
function Toggle({ id, label, sub, on, onFlip }: { id: string; label: string; sub?: string; on: boolean; onFlip: () => void }) {
  return (
    <button className="mrow" id={id} role="switch" aria-checked={on} onClick={() => { onFlip(); tick(0.6, 0.05) }}>
      <span className="col grow" style={{ gap: 2, textAlign: 'start' }}><span style={{ fontWeight: 700 }}>{label}</span>{sub && <span className="small">{sub}</span>}</span>
      <span className="sw" aria-hidden="true"><input type="checkbox" tabIndex={-1} checked={on} readOnly /><i /></span>
    </button>
  )
}
function Card({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return <section className="glass card col" id={id} style={{ gap: 10 }}><b style={{ fontSize: 16 }}>{title}</b>{children}</section>
}
const fail = (e: unknown) => { toast(t('authErr')); buzz([10, 30, 10]); console.warn('kring settings', e) }

/* ---------- edit profile ---------- */
function Profile() {
  const s = useS()
  const host = s.prof.isHost
  const [name, setName] = useState(s.prof.name || me().name)
  const [country, setCountry] = useState(s.prof.country)
  const [langs, setLangs] = useState<string[]>(s.prof.languages.length ? s.prof.languages : [s.lang])
  const [bio, setBio] = useState(s.prof.bio)
  const [gender, setGender] = useState<'f' | 'm' | 'x' | null>(s.gender)
  const [diet, setDiet] = useState<Diet[]>(s.diet)
  const [busy, setBusy] = useState(false)
  const flipLang = (l: string) => setLangs((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l].slice(0, 8)))
  const flipDiet = (d: Diet) => setDiet((x) => {
    if (x.includes(d)) return x.filter((y) => y !== d)
    let n = [...x, d]
    if (d === 'veg') n = n.filter((y) => y !== 'nonveg')
    if (d === 'nonveg') n = n.filter((y) => y !== 'veg')
    return n
  })
  const onSave = async () => {
    if (!name.trim()) { toast(t('authErr')); return }
    setBusy(true)
    try { await saveProfile({ name, country, languages: langs, bio, gender, diet }); chime(); toast(t('savedOk')); go('me', 'l') } catch (e) { fail(e) }
    setBusy(false)
  }
  return (
    <>
      <Top title={t('editProfile')} />
      <div className="scroll"><div className="pad col rise" style={{ gap: 16, paddingBottom: 130 }}>
        <div className="row" style={{ gap: 14 }}><Av ch={Array.from(name.trim() || '?')[0]} s={64} />
          <div className="col"><b style={{ fontSize: 19 }}>{name || '—'}</b>
            {host && <span className={s.prof.idVerified ? 'badge' : 'small'} id="verState">{s.prof.idVerified ? <><Ic p={I.check} s={12} sw={3} />{t('verifiedId')}</> : t('notVerified')}</span>}</div></div>
        <Field id="pfName" label={t('pName')} value={name} onChange={setName} max={40} />
        <div className="col" style={{ gap: 6 }}><span className="eyebrow">{t('pCountry')}</span>
          <label className="inp glass" style={{ height: 50, flex: "none" }}><select id="pfCountry" value={country} onChange={(e) => setCountry(e.target.value)}
            style={{ flex: 1, background: 'none', border: 0, color: '#fff', font: 'inherit', outline: 'none' }}>
            <option value="" style={{ background: '#0A0C1F' }}>—</option>
            {COUNTRIES.map((c) => <option key={c} value={c} style={{ background: '#0A0C1F' }}>{regionName(s.lang, c)}</option>)}
          </select></label></div>
        <div className="col" style={{ gap: 8 }}><span className="eyebrow">{t('pLangs')}</span>
          <div className="chips" id="pfLangs">{SPOKEN.map((l) => <button key={l} className={`chip ${langs.includes(l) ? 'on' : ''}`} aria-pressed={langs.includes(l)} onClick={() => flipLang(l)}>{langName(s.lang, l)}</button>)}</div></div>
        <div className="col" style={{ gap: 8 }}><span className="eyebrow">{t('iam')}</span>
          <div className="chips" id="pfGender">{([['f', 'woman'], ['m', 'man'], [null, 'skip']] as const).map(([v, k]) => <button key={k} className={`chip ${gender === v ? 'on' : ''}`} aria-pressed={gender === v} onClick={() => setGender(v)}>{t(k)}</button>)}</div>
          <span className="small">{t('iamWhy')}</span></div>
        <div className="col" style={{ gap: 8 }}><span className="eyebrow">{t('dietQ')}</span>
          <div className="chips" id="pfDiet">{DIETS.map((d) => <button key={d} className={`chip ${diet.includes(d) ? 'on' : ''}`} aria-pressed={diet.includes(d)} onClick={() => flipDiet(d)}>{dietWord(d)}</button>)}</div></div>
        {host && <div className="col" style={{ gap: 6 }}><span className="eyebrow">{t('pBio')}</span>
          <textarea id="pfBio" className="glass" value={bio} maxLength={400} rows={4} onChange={(e) => setBio(e.target.value)}
            style={{ borderRadius: 16, padding: '12px 16px', color: '#fff', font: 'inherit', resize: 'vertical', border: '1px solid rgba(255,255,255,.12)' }} />
          <span className="small">{t('pBioHint')}</span></div>}
        {previewOnly() && <span className="small" id="pfPreview">{t('demoNote')}</span>}
      </div></div>
      <div className="footer"><button className="btn gold" id="pfSave" disabled={busy} onClick={onSave}>{busy ? <span className="spin" /> : t('saveBtn')}</button></div>
    </>
  )
}

/* ---------- settings ---------- */
function Settings() {
  const s = useS()
  const host = s.prof.isHost
  const live = isLive()
  const user = configured() ? currentUser() : null
  const [em, setEm] = useState({ name: s.prof.emName, phone: s.prof.emPhone })
  const [pp, setPp] = useState(s.prof.promptpay)
  const [blocked, setBlocked] = useState<Blocked[]>(s.blocked)
  const [del, setDel] = useState(false)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { listBlocked().then(setBlocked).catch(() => undefined) }, [])

  const setNotify = (k: keyof Notify) => saveProfile({ notify: { ...s.prof.notify, [k]: !s.prof.notify[k] } }).catch(fail)
  const onSignOut = async (everywhere = false) => {
    await signOut(everywhere)
    resetStateOnSignOut()
    toast(t('signedOut')); go('welcome', 'b', true)
  }
  const onExport = async () => { try { const f = await exportData(); toast(f) } catch (e) { fail(e) } }
  const onDelete = async () => {
    if (word.trim().toUpperCase() !== 'DELETE') return
    setBusy(true)
    try { await deleteAccount(); setDel(false); toast(t('delDone')); go('welcome', 'b', true) } catch (e) { fail(e) }
    setBusy(false)
  }
  const saveEm = () => saveProfile({ emName: em.name, emPhone: em.phone }).then(() => toast(t('savedOk'))).catch(fail)
  const savePp = () => {
    const d = pp.replace(/\D/g, '')
    if (d && !(d.length === 10 && d.startsWith('0')) && d.length !== 13) { toast(t('authErr')); return }   // Thai mobile (0xxxxxxxxx) or ID (13 digits)
    saveProfile({ promptpay: d }).then(() => toast(t('savedOk'))).catch(fail)
  }

  return (
    <>
      <Top title={t('settings')} />
      <div className="scroll"><div className="pad col rise" style={{ gap: 14, paddingBottom: 120 }}>
        <Card id="stDisplay" title={t('sDisplay')}>
          <span className="eyebrow">{t('textSize')}</span>
          <div className="chips" id="tsz" role="group" aria-label={t('textSize')}>{([['m', 'A', 'tsM', '100%'], ['l', 'A+', 'tsL', '150%'], ['xl', 'A++', 'tsXL', '200%']] as const).map(([k, l, al, pc]) => (
            <button key={k} className={`chip ${s.ts === k ? 'on' : ''}`} aria-pressed={s.ts === k} aria-label={t(al) + ' · ' + pc} onClick={() => { update((st) => { st.ts = k }); tick(0.6, 0.06) }}>{l}<span className="num" style={{ fontSize: 11, opacity: 0.75 }}>{pc}</span></button>
          ))}</div>
          <button className="mrow" data-go="lang" data-how="b"><Ic p={I.globe} s={20} /><span className="grow">{me().native}</span><Ic p={I.chev} s={16} /></button>
        </Card>

        <Card id="stAccount" title={t('sAccount')}>
          {user ? <>
            <span className="small">{t('sSignedVia', { via: user.provider || (user.email ? 'email' : 'phone') })}</span>
            {user.email && <div className="mrow"><Ic p={I.lock} s={18} /><span className="grow">{t('sEmail')}</span><span className="small">{user.email}</span></div>}
            {user.phone && <div className="mrow"><Ic p={I.lock} s={18} /><span className="grow">{t('sPhone')}</span><span className="small">+{user.phone}</span></div>}
            <span className="small">{t('sChangeHint')}</span>
          </> : previewOnly() ? <span className="small" id="stPreview">{t('demoNote')}</span> : null}
          <button className="btn ghost" id="stSignOut" onClick={() => onSignOut(false)}>{t('signOut')}</button>
          {live && <button className="btn ghost" id="stSignOutAll" onClick={() => onSignOut(true)}>{t('sSignOutAll')}</button>}
        </Card>

        <Card id="stNotif" title={t('sNotif')}>
          <Toggle id="nBookings" label={t('nBookings')} on={s.prof.notify.bookings} onFlip={() => setNotify('bookings')} />
          <Toggle id="nChat" label={t('nChat')} on={s.prof.notify.chat} onFlip={() => setNotify('chat')} />
          <Toggle id="nRem" label={t('nRem')} on={s.prof.notify.reminders} onFlip={() => setNotify('reminders')} />
          <Toggle id="nDeals" label={t('nDeals')} sub={t('nDealsSub')} on={s.prof.notify.deals} onFlip={() => setNotify('deals')} />
        </Card>

        <Card id="stSafety" title={t('sSafety')}>
          <span className="small">{t('emSub')}</span>
          <Field id="emName" label={t('emName')} value={em.name} onChange={(v) => setEm({ ...em, name: v })} />
          <Field id="emPhone" label={t('emPhone')} value={em.phone} mode="tel" max={20} onChange={(v) => setEm({ ...em, phone: v })} ph="+66 81 234 5678" />
          <button className="btn ghost" id="emSave" onClick={saveEm}>{t('saveBtn')}</button>
        </Card>

        {host && <Card id="stHost" title={t('sHost')}>
          <Field id="ppNum" label={t('hPP')} value={pp} mode="numeric" max={17} onChange={setPp} ph="08x xxx xxxx" />
          <span className="small">{t('hPPSub')}</span>
          <button className="btn ghost" id="ppSave" onClick={savePp}>{t('saveBtn')}</button>
          <Toggle id="hAway" label={t('hAway')} on={s.away} onFlip={() => saveProfile({ away: !s.away }).catch(fail)} />
        </Card>}

        <Card id="stPrivacy" title={t('sPrivacy')}>
          <button className="mrow" id="pExport" onClick={onExport}><Ic p={I.ticket} s={18} /><span className="col grow" style={{ textAlign: 'start' }}><span style={{ fontWeight: 700 }}>{t('pExport')}</span><span className="small">{t('pExportSub')}</span></span><Ic p={I.chev} s={16} /></button>
          <span className="eyebrow" style={{ marginTop: 4 }}>{t('pBlocked')}</span>
          {blocked.length === 0 ? <span className="small" id="noBlocked">{t('pNoBlocked')}</span> : blocked.map((b) => (
            <div key={b.id} className="mrow"><Av ch={Array.from(b.name)[0] || '?'} s={30} /><span className="grow">{b.name}</span>
              <button className="chip" onClick={() => unblock(b.id).then(() => setBlocked((x) => x.filter((y) => y.id !== b.id))).catch(fail)}>{t('unblock')}</button></div>
          ))}
          <button className="btn ghost" id="delOpen" style={{ color: 'var(--street)' }} onClick={() => { setWord(''); setDel(true) }}>
            {t('delAcc')}
          </button>
          <span className="small" id="delGraceNote">{t('delGrace')}</span>
        </Card>

        <Card id="stHelp" title={t('sHelp')}>
          <a className="mrow" id="helpMail" href="mailto:ops@kringapp.com?subject=Kring%20help" style={{ textDecoration: 'none', color: 'inherit' }}><Ic p={I.shield} s={18} /><span className="col grow"><span style={{ fontWeight: 700 }}>{t('helpContact')}</span><span className="small">{t('helpContactSub')}</span></span><Ic p={I.chev} s={16} /></a>
          {([['terms', 'lTerms'], ['privacy', 'lPrivacy'], ['refund', 'lRefund'], ['safety', 'lSafety']] as const).map(([p, k]) => (
            <a key={p} className="mrow" href={LEGAL(p)} target="_blank" rel="noopener" style={{ textDecoration: 'none', color: 'inherit' }}><span className="grow">{t(k)}</span><Ic p={I.chev} s={16} /></a>
          ))}
          <span className="small" style={{ textAlign: 'center' }} id="ver">{t('version', { v: VERSION })}</span>
        </Card>
      </div></div>

      <Sheet open={del} onClose={() => setDel(false)}>
        <b style={{ fontSize: 19 }}>{t('delTitle')}</b>
        <span className="small" style={{ lineHeight: 1.5 }}>{t('delBody')}</span>
        <span className="small" id="delRefund" style={{ lineHeight: 1.5 }}>{t('refundShort')}</span>
        <b className="small" id="delGraceBanner" style={{ lineHeight: 1.5 }}>{t('delGrace')}</b>
        <label className="inp glass" style={{ height: 50, flex: "none" }}><input id="delWord" value={word} placeholder={t('delType')} autoCapitalize="characters" onChange={(e) => setWord(e.target.value)} /></label>
        <button className="btn gold" id="delGo" disabled={busy || word.trim().toUpperCase() !== 'DELETE'}
          style={{ background: word.trim().toUpperCase() === 'DELETE' ? 'var(--street)' : undefined, color: '#fff' }} onClick={onDelete}>{busy ? <span className="spin" /> : t('delBtn')}</button>
        <button className="btn ghost" onClick={() => setDel(false)}>{t('cancelW')}</button>
      </Sheet>
    </>
  )
}

register(
  { id: 'profile', flow: 't', title: 'Edit profile', C: Profile },
  { id: 'settings', flow: 't', title: 'Settings', C: Settings },
)
