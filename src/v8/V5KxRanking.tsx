/**
 * Feature 3 · Weekly ranking (approved variant 3A "Card podium" only, no area battle).
 * Rings earned this week (Mon 00:00 – Sun 23:59 Bangkok). Top 3 = mini N2 cards with a crown on #1, ranks 4+ list,
 * gold dashed "Top 10" line, my own row pinned at the bottom. Tabs: All Bangkok / My area / Friends (people I follow).
 */
import React, { useEffect, useRef, useState } from 'react';
import './kx.css';
import { countdown, fmtN, toTop10, weekEnd } from './kxLogic';
import { ringsRules, type RingsRules } from './rewardsConfig';
import { kxRanking, kxRules, type KxRanking, type KxRankRow, type KxScope } from './v5Kx';
import { RingGlyph } from './V5KxCard';
import { kxArea } from './v5Strings';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

const Move = ({ m }: { m: number | null | undefined }) =>
  m === null || m === undefined ? <span className="kx-mv nw">NEW</span> : m > 0 ? <span className="kx-mv up">▲{m}</span> : m < 0 ? <span className="kx-mv dn">▼{-m}</span> : <span className="kx-mv eq">–</span>;
const Av = ({ photo, name, size }: { photo: string | null; name: string; size: number }) => (
  <i className="kx-av" style={{ width: size, height: size, ...(photo ? { backgroundImage: `url('${photo}')` } : {}) }} aria-hidden="true">{photo ? '' : (name || '?').charAt(0).toUpperCase()}</i>
);

export function RankingPage(props: { L: Tx; Lf: Txf; lang: string; myArea: string | null; myPhoto: string | null; myName: string; onBack: () => void; onPerson: (id: string) => void; onEarn: () => void }) {
  const { L, Lf } = props;
  const [scope, setScope] = useState<KxScope>('all');
  const [data, setData] = useState<KxRanking | null>(null);
  const [err, setErr] = useState(false);
  const [clock, setClock] = useState(countdown());
  const [R, setR] = useState<RingsRules>(ringsRules());
  useEffect(() => { kxRules().then((x) => setR(ringsRules(x))).catch(() => undefined); }, []);
  const prize = (rank: number) => (rank === 1 ? R.weekly_1 : rank === 2 ? R.weekly_2 : rank === 3 ? R.weekly_3 : rank <= 10 ? R.weekly_4_10 : 0);
  useEffect(() => {
    let dead = false;
    setData(null); setErr(false);
    kxRanking(scope).then((d) => { if (!dead) setData(d); }).catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; };
  }, [scope]);
  useEffect(() => { const id = window.setInterval(() => setClock(countdown(Date.now(), weekEnd())), 30000); return () => window.clearInterval(id); }, []);
  const rows = data?.rows || [];
  const pod: (KxRankRow | undefined)[] = [rows[1], rows[0], rows[2]];
  const rest = rows.filter((r) => r.rank > 3);
  const me = data?.me || null;
  const need = toTop10(me?.rings ?? 0, me?.rank ?? null, data?.tenth ?? null);
  const area = data?.area || props.myArea;
  // the pinned "You" row shows only while my own row in the list is off screen
  const listMe = useRef<HTMLButtonElement | null>(null);
  const [meInView, setMeInView] = useState(false);
  useEffect(() => {
    const el = listMe.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setMeInView(false); return; }
    const io = new IntersectionObserver(([e]) => setMeInView(e.isIntersecting && e.intersectionRatio > 0.6), { threshold: [0, 0.6, 1], rootMargin: '0px 0px -150px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [data]);
  return (
    <div className="kx-page kx-rk" id="kxRanking">
      <div className="kx-hd2">
        <button type="button" className="kx-bk" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        <h1>{L('Ranking')}</h1>
        <span className="kx-cd" id="kxCountdown">{Lf('Ends {0}', clock)}</span>
      </div>
      <div className="kx-tabs" role="tablist">
        {(['all', 'area', 'friends'] as KxScope[]).map((k) => (
          <button type="button" role="tab" key={k} id={`kxRank-${k}`} aria-selected={scope === k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>
            {k === 'all' ? L('All Bangkok') : k === 'area' ? (area && area !== 'Bangkok' ? Lf('My area · {0}', kxArea(props.lang, area, L)) : L('My area')) : L('Friends')}
          </button>
        ))}
      </div>
      {data === null && !err ? <p className="kx-empty pad">…</p> : err ? <p className="kx-empty pad">{L('Couldn’t reach Kring. Check your connection and try again.')}</p> : (
        <>
          <div className="kx-pod">
            {pod.map((r, i) => {
              const rank = [2, 1, 3][i];
              return (
                <div key={rank} className={`kx-podcol r${rank}`}>
                  {rank === 1 ? <span className="kx-crown" aria-hidden="true">👑</span> : null}
                  {r ? (
                    <button type="button" className={`kx-mc${rank === 1 ? ' one' : ''}`} data-rank={rank} style={r.photo ? { backgroundImage: `url('${r.photo}')` } : undefined} onClick={() => props.onPerson(r.user_id)}>
                      {!r.photo ? <span className="kx-mc-i">{r.first_name.charAt(0).toUpperCase()}</span> : null}
                      <span className="rk">{rank}</span><span className="nm">{r.is_me ? L('You') : r.first_name}</span><span className="r">{fmtN(r.rings)}</span>
                    </button>
                  ) : <span className={`kx-mc empty${rank === 1 ? ' one' : ''}`}><span className="rk">{rank}</span><span className="q">?</span></span>}
                  <div className={`kx-ped${rank === 1 ? ' one' : ''}`}><b>+{fmtN(prize(rank))} <RingGlyph /></b></div>
                </div>
              );
            })}
          </div>
          <div className="kx-lad"><span>#4–10 <b>+{fmtN(R.weekly_4_10)}</b> <RingGlyph /></span><span>{L('Resets Sun 23:59')}</span></div>
          <div className="kx-list" id="kxRankList">
            {rows.length === 0 ? (
              <p className="kx-empty">{scope === 'friends' ? L('Nobody you follow has Rings this week yet.') : L('No Rings yet this week. Post a Reel at a place and take #1.')}</p>
            ) : null}
            {rest.map((r) => (
              <React.Fragment key={r.user_id}>
                <button type="button" ref={r.is_me ? listMe : undefined} className={`kx-row${r.is_me ? ' mer' : ''}`} data-rank={r.rank} onClick={() => props.onPerson(r.user_id)}>
                  <span className="n">{r.rank}</span><Av photo={r.photo} name={r.first_name} size={38} />
                  <span className="t">{r.is_me ? L('You') : r.first_name}<small>{r.is_me ? (need ? Lf('{0} to top 10', fmtN(need)) : L('In the top 10')) : kxArea(props.lang, r.area, L)}</small></span>
                  <span className="p">{fmtN(r.rings)}</span><Move m={r.move} />
                </button>
                {r.rank === 10 && rows.length > 10 ? <div className="kx-div"><span>{Lf('Top 10 · +{0}', fmtN(R.weekly_4_10))} <RingGlyph /> {L('each')}</span></div> : null}
              </React.Fragment>
            ))}
            {rows.length > 3 && rows.length <= 10 ? <div className="kx-div"><span>{Lf('Top 10 · +{0}', fmtN(R.weekly_4_10))} <RingGlyph /> {L('each')}</span></div> : null}
          </div>
          <div className="kx-fade" />
          <button type="button" className={`kx-me${meInView ? ' hide' : ''}`} id="kxMeRow" onClick={props.onEarn} aria-hidden={meInView}>
            <span className="n">{me ? me.rank : '–'}</span><Av photo={props.myPhoto} name={props.myName} size={42} />
            <span className="t">{L('You')}<small>{me && me.rank <= 10 ? L('In the top 10') : me ? Lf('{0} to top 10', fmtN(need)) : Lf('Post a Reel at a place: +{0}', fmtN(R.reel_place))}</small></span>
            <span className="p">{fmtN(me?.rings ?? 0)}</span>{me ? <Move m={me.move} /> : <span className="kx-mv eq" />}
          </button>
        </>
      )}
    </div>
  );
}
