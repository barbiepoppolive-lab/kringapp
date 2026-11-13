/* Saved (area E): the activities the person tapped the heart on. Me → Saved opens it. */
import { useEffect } from 'react'
import { S, update, useS } from '../core/store'
import { t, ACTS, aTitle, hostName, baht, ph } from '../core/data'
import { loadLiveActivities } from '../core/liveActivities'
import { register, go } from '../core/router'
import { isBlockedAct } from '../core/hosts'
import { I, Ic, Tabs } from '../ui/kit'
import { HostAv, genderWord } from './hostProfile'
import { hostInfo } from '../core/hosts'
import { areaName, timeRange } from './explore'

function Saved() {
  const s = useS()
  useEffect(() => { void loadLiveActivities() }, [])
  const list = ACTS.filter((a) => s.saved[a.id] && !isBlockedAct(a))
  const open = (id: string) => { S.act = id; update((x) => { x.from.detail = 'saved' }); go('detail', 'r') }
  return (
    <>
      <div className="topb"><button className="ib" data-go="me" data-how="l" aria-label={t('backW')}><Ic p={I.back} /></button><h1 className="h2 grow">{t('saved')}</h1></div>
      <div className="scroll"><div className="pad col rise" style={{ gap: 12, paddingTop: 8, paddingBottom: 120 }}>
        {list.length === 0 && (
          <div className="empty col" role="status" style={{ gap: 12, alignItems: 'center', textAlign: 'center' }}>
            <span style={{ color: 'var(--gold2)' }}><Ic p={I.heart} s={34} /></span>
            <span>{t('savedEmpty')}</span>
            <button type="button" className="btn gold" style={{ width: 'auto', padding: '0 24px' }} data-go="experiences" data-how="f">{t('savedBrowse')}</button>
          </div>
        )}
        {list.map((a) => (
          <div key={a.id} className="glass card row" style={{ gap: 12, padding: 10, alignItems: 'center' }}>
            <button type="button" className="row grow" style={{ gap: 12, background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', minWidth: 0 }} onClick={() => open(a.id)}>
              <img src={ph(a.img)} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', flex: 'none' }} />
              <span className="col" style={{ gap: 3, minWidth: 0 }}>
                <b style={{ fontSize: 15, lineHeight: 1.25 }}>{aTitle(a)}</b>
                <span className="small">{areaName(a)} · {timeRange(a)}</span>
                <span className="row small" style={{ gap: 6 }}><HostAv a={a} s={22} />{hostName(a)} · {genderWord(hostInfo(a))}</span>
                <span className="small" style={{ color: 'var(--gold2)', fontWeight: 700 }}>{a.isVolunteer || a.price === 0 ? t('volFree') : baht(a.price)}</span>
              </span>
            </button>
            <button type="button" className="ib" data-heart={a.id} aria-pressed="true" aria-label={t('unsaveAct', { a: aTitle(a) })} style={{ color: 'var(--gold2)', flex: 'none' }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2} aria-hidden="true" dangerouslySetInnerHTML={{ __html: I.heart }} />
            </button>
          </div>
        ))}
      </div></div>
      <Tabs active="me" />
    </>
  )
}

register({ id: 'saved', flow: 't', title: 'Saved', C: Saved })
