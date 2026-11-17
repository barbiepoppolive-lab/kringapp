/**
 * Weekly ranking (LOCKED rules 15 Nov; look A "Gold-ring podium" approved 17 Nov — no scope tabs).
 * Rings = likes ×1, saves ×3, share-link opens ×5, visitors' likes/saves ×2, your best Reel of the week (best_reels = 1 since 15 Nov) (Mon 00:00 – Sun 23:59 Bangkok).
 * Top 10 always: podium (mini N2 cards, ฿ on the pedestals), rows 4–8 with a ฿ tag, dashed PRIZE LINE, #9–10 with "12 to #8".
 * Empty paid ranks show "Open seat · ฿250". Pinned own row = the next step in Rings and what it pays. Tap any score → the math.
 * Every number comes from the server (kr8_weekly_ranking / kr8_score_breakdown); nothing is computed here.
 */
import React, { useEffect, useState } from 'react';
import './kx.css';
import { countdown, fmtN, mathLines, weekEnd } from './kxLogic';
import { kxBreakdown, kxRanking, kxRules, type KxBreakdown, type KxGap, type KxRanking, type KxRankRow } from './v5Kx';
import { RingGlyph } from './V5KxCard';
import { KX_L, V5_L } from './v5Strings';
import { signReelPaths } from './v5Reel';
import { RingToast, rulesVariant, WinEntry, WinSheet, winRules, YouBar, youState } from './V5KxRules';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

const Av = ({ photo, name, size }: { photo: string | null; name: string; size: number }) => (
  <i className="kx-av" style={{ width: size, height: size, ...(photo ? { backgroundImage: `url('${photo}')` } : {}) }} aria-hidden="true">{photo ? '' : (name || '?').charAt(0).toUpperCase()}</i>
);
export const baht = (n: number) => `฿${fmtN(n)}`;
export const ringsText = (L: Tx, Lf: Txf, n: number) => (n === 1 ? L('1 Ring') : Lf('{0} Rings', fmtN(n)));

/** The exact founder copy (EN) with a natural Thai version in KX_L. */
export const HOW_RINGS = 'Bangkok’s best Reels, chosen by the people who love the city. A like is 1 Ring. A save is 3. Each person who opens your Reel from Instagram or TikTok is 5. When a visitor to Bangkok likes or saves your Reel, it counts double, because you showed someone the real city. Only your best Reel of the week counts. Tap any score to see how it adds up.';

export function HowSheet(props: { L: Tx; onClose: () => void }) {
  const { L } = props;
  return (
    <div className="kx-shbg" onClick={props.onClose}>
      <div className="kx-sh" id="kxHow" role="dialog" aria-label={L('How Rings work')} onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        <h2>{L('How Rings work')}</h2>
        <p className="kx-how" id="kxHowText">{L(HOW_RINGS)}</p>
        <button type="button" className="kx-btn ghost" id="kxHowOk" onClick={props.onClose}>{L('Got it')}</button>
      </div>
    </div>
  );
}

/** Tap any score → the Reel(s) that count, with every line of the sum (mock m3). One Reel since 15 Nov. */
export function MathSheet(props: { L: Tx; Lf: Txf; lang: string; user: string; onClose: () => void; onShare?: (reel: string | null) => void; onHow: () => void }) {
  const { L, Lf } = props;
  const [d, setD] = useState<KxBreakdown | null | undefined>(undefined);
  const [posters, setPosters] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    setD(undefined);
    kxBreakdown(props.user).then((r) => {
      if (dead) return;
      setD(r);
      const paths = (r?.reels || []).map((x) => x.poster_path || '').filter(Boolean);
      if (paths.length) signReelPaths(paths).then((m) => { if (!dead) setPosters(m); }).catch(() => undefined);
    }).catch(() => { if (!dead) setD(null); });
    return () => { dead = true; };
  }, [props.user]);
  const label: Record<string, string> = { lLocal: 'Local likes', lTrav: 'Visitor likes', sLocal: 'Local saves', sTrav: 'Visitor saves', opens: 'Link opens from Instagram / TikTok' };
  const R = d ? { like: d.weights.like, save: d.weights.save, open: d.weights.open, traveller_mult: d.weights.mult } : null;
  return (
    <div className="kx-shbg" onClick={props.onClose}>
      <div className="kx-sh kx-math" id="kxMath" role="dialog" onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        {d === undefined ? <p className="kx-empty">…</p> : d === null || !R ? <p className="kx-empty">{L('Couldn’t reach Kring. Check your connection and try again.')}</p> : (
          <>
            <div className="kx-math-h">
              <h2 id="kxMathTitle">{d.is_me ? Lf('Your {0}', ringsText(L, Lf, d.rings)) : Lf('{0} · {1}', d.first_name, ringsText(L, Lf, d.rings))}</h2>
              <span>{d.weights.best <= 1 ? L('your best Reel this week') : Lf('best {0} Reels this week', String(d.weights.best))}</span>
            </div>
            {d.reels.length === 0 ? <p className="kx-empty" id="kxMathEmpty">{d.is_me ? L('No Rings yet this week. Post a Reel at a place, then share it.') : L('No Rings yet this week.')}</p> : null}
            {d.reels.map((r, i) => {
              const place = props.lang === 'th' && r.place_th ? r.place_th : r.place;
              const lines = mathLines({ lLocal: r.l_local, lTrav: r.l_trav, sLocal: r.s_local, sTrav: r.s_trav, opens: r.opens }, R);
              return (
                <div className="kx-mr" key={r.post_id} data-math-reel={r.post_id}>
                  <div className="kx-mr-h">
                    <i className="th" style={r.poster_path && posters[r.poster_path] ? { backgroundImage: `url('${posters[r.poster_path]}')` } : undefined} />
                    <span className="t">{place ? Lf('Reel at {0}', place) : Lf('Reel {0}', String(i + 1))}
                      <small>{new Intl.DateTimeFormat(props.lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(Date.parse(r.posted_at))}</small></span>
                    <b data-reel-score={r.score}>{fmtN(r.score)}</b>
                  </div>
                  {lines.map((x) => (
                    <div className={`kx-ml${x.n ? '' : ' z'}`} key={x.key} data-line={x.key}>
                      <span>{L(label[x.key])}</span><em>{fmtN(x.n)} × {x.each}</em><b>{fmtN(x.total)}</b>
                    </div>
                  ))}
                  {r.opens > 0 && r.opens % d.weights.cap === 0 ? <p className="kx-mnote">{Lf('Link opens: at most {0} count per day', String(d.weights.cap))}</p> : null}
                </div>
              );
            })}
            {d.reels.length ? (
              <div className="kx-mtot" id="kxMathTotal"><span>{d.reels.map((r) => fmtN(r.score)).join(' + ')}</span><b>{fmtN(d.rings)} <RingGlyph /></b></div>
            ) : null}
            {d.more > 0 ? <p className="kx-mnote">{d.more === 1 ? L('1 more Reel this week, not counted (only your best Reel counts)') : Lf('{0} more Reels this week, not counted (only your best Reel counts)', String(d.more))}</p> : null}
            <p className="kx-mfoot">{L('Same math for everyone. Tap any score on the board to see it.')}<br />{L('Same score? The Reel posted first is ahead.')}</p>
            {d.is_me && props.onShare ? (
              <button type="button" className="kx-btn" id="kxMathShare" onClick={() => props.onShare?.(d.reels[0]?.post_id || null)}>
                {d.reels.length ? Lf('Share a Reel · each open +{0}', String(d.weights.open)) : L('Post a Reel')} {d.reels.length ? <RingGlyph white /> : null}
              </button>
            ) : null}
            <button type="button" className="kx-linkbtn" id="kxMathHow" onClick={props.onHow}>{L('How Rings work')}</button>
          </>
        )}
      </div>
    </div>
  );
}

export interface OwnRow { n: string; l1: React.ReactNode; l2: string; btn: 'math' | 'share' | 'post' | null; key: string }
/** The pinned row: what I have, then the next step and what it pays (six states, mock m2). */
export function ownRow(L: Tx, Lf: Txf, gap: KxGap | null | undefined, mine: KxRanking['mine'] | undefined | null): OwnRow {
  const rt = (n: number) => ringsText(L, Lf, n);
  const you = (g: KxGap) => <>{L('You')} · {fmtN(g.rings)} <RingGlyph /></>;
  const toRank = (t: NonNullable<KxGap['target']>) => `${Lf('{0} to #{1}', rt(t.need), String(t.rank))}${t.prize > 0 ? ` · ${baht(t.prize)}` : ''}`;
  if (!gap) return { n: '–', l1: L('Not on the board yet'), l2: L('One Reel at a place puts you on it'), btn: 'post', key: 'none' };
  const g = gap, t = g.target;
  if (g.state === 'top') return { n: '1', l1: you(g), l2: `${Lf('{0} now', baht(g.prize_now))}${g.behind ? ` · ${Lf('#{0} is {1} behind you', String(g.behind.rank), fmtN(g.behind.diff))}` : ''}`, btn: 'math', key: 'top' };
  if (g.state === 'paid' && t) {
    const guard = (g.rank || 0) >= 6 && g.behind;
    return { n: String(g.rank), l1: you(g), l2: `${Lf('{0} now', baht(g.prize_now))} · ${guard && g.behind ? Lf('#{0} is {1} behind you', String(g.behind.rank), fmtN(g.behind.diff)) : toRank(t)}`, btn: 'math', key: 'paid' };
  }
  if (g.state === 'floor' && t) return { n: String(g.rank), l1: you(g), l2: Lf('{0} to take {1}', rt(t.need), baht(t.prize)), btn: 'math', key: 'floor' };
  if (g.state === 'board' && t) return { n: String(g.rank), l1: you(g), l2: toRank(t), btn: 'math', key: 'board' };
  if (g.state === 'far' && t) {
    return { n: String(g.rank), l1: you(g), l2: `${g.above ? `${Lf('{0} to pass {1}', rt(g.above.need), g.above.name)} · ` : ''}${Lf('{0} to top 10', fmtN(g.top10_need ?? t.need))}`, btn: 'share', key: 'far' };
  }
  // no Rings yet this week
  if (mine && mine.live > 0 && t) return { n: '–', l1: you(g), l2: t.open ? `${Lf('Seat #{0} is open', String(t.rank))} · ${baht(t.prize)} · ${Lf('reach {0}', rt(g.floor))}` : toRank(t), btn: 'share', key: 'zero' };
  if (mine && mine.pending > 0) return { n: '–', l1: <>{L('You')} · {L('in review')}</>, l2: L('Usually under 2 hours'), btn: null, key: 'review' };
  if (t && t.open && t.prize > 0) return { n: '–', l1: <>{Lf('Seat #{0} is open', String(t.rank))} · {baht(t.prize)}</>, l2: `${L('Post a Reel')} · ${Lf('reach {0}', rt(Math.max(1, g.floor)))}`, btn: 'post', key: 'open' };
  return { n: '–', l1: L('Not on the board yet'), l2: L('One Reel at a place puts you on it'), btn: 'post', key: 'none' };
}

/** Thai copy of a key (same tables the app's L() reads), so the pinned row can show Thai first and English under in any UI language. */
const thL: Tx = (en) => (V5_L.th && V5_L.th[en]) || (KX_L.th && KX_L.th[en]) || en;
const thLf: Txf = (en, a, b = '') => thL(en).replace('{0}', a).replace('{1}', b);
const enL: Tx = (en) => en;
const enLf: Txf = (en, a, b = '') => en.replace('{0}', a).replace('{1}', b);
/** Last 6 h of the week (Sun 18:00 → 24:00 Bangkok): the countdown chip pulses pink. */
export const isLastHours = (now = Date.now(), end = weekEnd(now)) => end - now > 0 && end - now <= 6 * 3600_000;

/**
 * Look A · Gold-ring podium (founder-approved 17 Nov, Weekly_Ranking_3_looks.png left phone).
 * Top: title + Thai + one live countdown chip (no scope tabs: the board is always All Bangkok).
 * Podium: round photos (#1 gold ring + crown + glow, #2 blue, #3 orange), numbered badge, name, Rings, glowing glass base with the prize.
 * Ranks 4–8 glass cards with the prize in gold, "needs 25" under the floor; 9–10 the same cards without a prize.
 * Prizes, floor and paid ranks all come from kr8_weekly_ranking. No ▲/▼: the server keeps no daily snapshot to compare with.
 */
export function RankingPage(props: { L: Tx; Lf: Txf; lang: string; myArea: string | null; myPhoto: string | null; myName: string; myId: string | null;
  onBack: () => void; onPerson: (id: string) => void; onPost: () => void; onShare: (reel: string) => void;
  /** 0066: not face-verified yet → a small nudge under my photo (everyone still shows on the board) */
  needsVerify?: boolean; onVerify?: () => void }) {
  const { L, Lf } = props;
  const [data, setData] = useState<KxRanking | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [math, setMath] = useState<string | null>(null);
  const [how, setHow] = useState(false);
  // rules-ui preview (?rules=A|B|C): "How to win" sheet + You bar + Ring toast; off = the page as it is live
  const [rv] = useState(rulesVariant);
  const [cfg, setCfg] = useState<Record<string, number> | null>(null);
  const [win, setWin] = useState(() => { try { return !!rv && new URLSearchParams(location.search).get('win') === '1'; } catch { return false; } });
  const [toast] = useState(() => { try { return !!rv && new URLSearchParams(location.search).get('toast') === '1'; } catch { return false; } });
  const [bestReel, setBestReel] = useState<string | null>(null);
  useEffect(() => {
    if (!rv) return;
    let dead = false;
    Promise.resolve(kxRules()).then((c) => { if (!dead) setCfg(c); }).catch(() => undefined);
    if (props.myId) Promise.resolve(kxBreakdown(props.myId)).then((b) => { if (!dead) setBestReel(b?.reels?.[0]?.post_id || null); }).catch(() => undefined);
    return () => { dead = true; };
  }, [rv, props.myId]);
  useEffect(() => {
    let dead = false;
    kxRanking('all').then((d) => { if (!dead) setData(d); }).catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; };
  }, []);
  const end = data?.ends_at ? Date.parse(data.ends_at) || weekEnd(now) : weekEnd(now);
  const hot = isLastHours(now, end);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), hot ? 1000 : 15000); return () => window.clearInterval(id); }, [hot]);
  const rows = data?.rows || [];
  const paid = data?.paid_ranks ?? 8;
  const prizes = data?.prizes || [];
  const at = (rank: number) => rows.find((r) => r.rank === rank);
  const own = ownRow(L, Lf, data?.gap, data?.mine);
  const ownTh = ownRow(thL, thLf, data?.gap, data?.mine).l2;
  const ownEn = ownRow(enL, enLf, data?.gap, data?.mine).l2;
  const wr = rv ? winRules(cfg, data) : null;
  const floorNote = !!data && data.floor > 0 && (data.open_seats > 0 || rows.some((r) => r.needs));
  // below the prize floor: soft grey card + one small line, on every rank (founder pick A, 17 Nov)
  const elig = (r: KxRankRow) => (r.needs ? <em className="rka-elig">{Lf('{0} more Rings to be eligible', fmtN(Math.max(1, r.needs - r.rings)))}</em> : null);
  // plain render functions (not components): the 1 s countdown re-render must not remount rows and replay their entrance
  const Score = ({ r, cls }: { r: KxRankRow; cls: string }) => (
    <button type="button" className={cls} data-score={r.rings} aria-label={L('See the math')} onClick={(e) => { e.stopPropagation(); setMath(r.user_id); }}>
      {fmtN(r.rings)} <RingGlyph />{elig(r)}
    </button>
  );
  const Row = ({ r }: { r: KxRankRow }) => (
    <div className={`kx-row rka-row${r.is_me ? ' mer' : ''}${r.needs ? ' low' : ''}`} data-rank={r.rank}>
      <button type="button" className="who" onClick={() => props.onPerson(r.user_id)}>
        <span className="n">{r.rank}</span><Av photo={r.photo} name={r.first_name} size={38} />
        <span className="t">{r.is_me ? L('You') : r.first_name}{r.is_new && !r.is_me ? <i className="nw">{L('NEW')}</i> : null}</span>
      </button>
      {Score({ r, cls: 'kx-sc rka-sc' })}
      {r.prize > 0 && r.all_rank <= paid
        ? <span className={`kx-pz${r.paid ? '' : ' off'}`} data-prize={r.prize}>{baht(r.prize)}</span>
        : <span className="kx-tl">{r.to_line ? Lf('{0} to #{1}', fmtN(r.to_line), String(paid)) : ''}</span>}
    </div>
  );
  const Seat = ({ rank }: { rank: number }) => (
    <button type="button" className="kx-row rka-row seat" data-rank={rank} data-seat="open" onClick={props.onPost}>
      <span className="n">{rank}</span><i className="kx-plus" aria-hidden="true">+</i>
      <span className="t">{L('Open seat')}</span>
      <span className="kx-pz">{baht(prizes[rank - 1] || 0)}</span>
    </button>
  );
  return (
    <div className={`kx-page kx-rk rka${rv ? ' rwv' : ''}`} id="kxRanking">
      <div className="rka-top">
        <button type="button" className="kx-bk rka-bk" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        {/* T-301 round 2 (T301-009/020): one language on the page, "5 วัน" not "5d" in Thai */}
        <div className="rka-tt"><h1>{L('Weekly Ranking')}</h1></div>
        <span className={`rka-cd${hot ? ' hot' : ''}`} id="kxCountdown" data-hot={hot ? '1' : '0'}><i aria-hidden="true" />{Lf('Ends {0}', props.lang === 'th' ? countdown(now, end).replace(/^(\d+)d /, '$1 วัน ') : countdown(now, end))}</span>
      </div>
      {rv && wr ? <WinEntry v={rv} lang={props.lang} total={wr.prizes.reduce((a, b) => a + b, 0)} seats={wr.prizes.length} onOpen={() => setWin(true)} /> : null}
      {data === null && !err ? <p className="kx-empty pad">…</p> : err ? <p className="kx-empty pad">{L('Couldn’t reach Kring. Check your connection and try again.')}</p> : (
        <>
          <div className="rka-pod" id="kxPodium">
            {[2, 1, 3].map((rank) => {
              const r = at(rank);
              const pz = prizes[rank - 1] || 0;
              return (
                <div key={rank} className={`rka-pc p${rank}${r ? '' : ' open'}${r?.is_me ? ' me' : ''}${r?.needs ? ' low' : ''}`}>
                  <div className="rka-ph">
                    {rank === 1 ? <span className="rka-crown" aria-hidden="true">👑</span> : null}
                    {r ? (
                      <button type="button" className="rka-img" data-rank={rank} aria-label={r.first_name} onClick={() => props.onPerson(r.user_id)}
                        style={r.photo ? { backgroundImage: `url('${r.photo}')` } : undefined}>{r.photo ? '' : (r.first_name || '?').charAt(0).toUpperCase()}</button>
                    ) : (
                      <button type="button" className="rka-img empty" data-seat="open" aria-label={L('Open seat')} onClick={props.onPost}>+</button>
                    )}
                    <span className="rka-bd">{rank}</span>
                  </div>
                  <span className="rka-nm">{r ? (r.is_me ? L('You') : r.first_name) : L('Open seat')}</span>
                  {r ? Score({ r, cls: 'rka-r' }) : <span className="rka-r none">&nbsp;</span>}
                  <div className="rka-base">
                    {pz > 0 ? <b className={r && !r.paid ? 'off' : ''} data-prize={pz}>{baht(pz)}</b> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {data && !data.payout_on ? <p className="kx-rk-note" id="kxPayoutNote">{Lf('Prizes start when {0} Locals are on the board this week', String(data.min_posters))}</p> : null}
          <div className="kx-list rka-list" id="kxRankList">
            {Array.from({ length: Math.max(0, paid - 3) }, (_, i) => i + 4).map((rank) => { const r = at(rank); return <React.Fragment key={rank}>{r ? Row({ r }) : Seat({ rank })}</React.Fragment>; })}
            {rows.some((r) => r.rank > paid) || floorNote
              ? <div className="kx-div" id="kxPrizeLine"><span>{floorNote ? Lf('PRIZE LINE · {0} RINGS TO TAKE A SEAT', String(data?.floor ?? 0)) : L('PRIZE LINE')}</span></div> : null}
            {rows.filter((r) => r.rank > paid).map((r) => <React.Fragment key={r.user_id}>{Row({ r })}</React.Fragment>)}
          </div>
          <div className="kx-fade rka-fade" />
 {rv && wr && props.myId ? (
            <>
              {toast ? <RingToast v={rv} lang={props.lang} pts={wr.save} who="Mint" act="save" /> : null}
              <YouBar v={rv} lang={props.lang} r={wr} s={youState(data)} photo={props.myPhoto} name={props.myName}
                onShare={() => { if (bestReel) props.onShare(bestReel); else setMath(props.myId); }} onPost={props.onPost} />
            </>
          ) : props.myId ? (
            <div className="kx-me rka-me" id="kxMeRow" data-state={own.key}>
              <span className="n">{own.n}</span>
              <span className="rka-meph">
                <Av photo={props.myPhoto} name={props.myName} size={42} />
                {props.needsVerify && props.onVerify ? (
                  <button type="button" className="rka-vfy" id="kxVerifyNudge" onClick={props.onVerify}
                    aria-label={props.lang === 'th' ? 'ยืนยันใบหน้าสั้น ๆ เพื่อให้รีลของคุณติดบอร์ดอันดับ' : 'Quick face check to keep your Reel on the ranking board'}
                    title={props.lang === 'th' ? 'ยืนยันใบหน้าสั้น ๆ เพื่อให้รีลของคุณติดบอร์ดอันดับ' : 'Quick face check to keep your Reel on the ranking board'}>
                    {props.lang === 'th' ? <span lang="th">ยืนยันหน้า</span> : <small lang="en">verify</small>}
                  </button>
                ) : null}
              </span>
              <span className="t"><span className="l1">{own.l1}</span>
                {props.lang === 'th' ? <small className="th" lang="th" id="kxMeNextTh">{ownTh}</small>
                  : <small id="kxMeNext" lang={props.lang === 'en' ? 'en' : props.lang}>{props.lang === 'en' ? ownEn : own.l2}</small>}</span>
              {own.btn === 'math' ? <button type="button" className="kx-go" id="kxMeBtn" onClick={() => setMath(props.myId)}>{L('See my math')}</button>
                : own.btn === 'share' ? <button type="button" className="kx-go" id="kxMeBtn" onClick={() => setMath(props.myId)}>{L('Share')}</button>
                : own.btn === 'post' ? <button type="button" className="kx-go" id="kxMeBtn" onClick={props.onPost}>{L('Post')}</button> : null}
            </div>
          ) : null}
        </>
      )}
      {math ? <MathSheet L={L} Lf={Lf} lang={props.lang} user={math} onClose={() => setMath(null)} onHow={() => { setMath(null); setHow(true); }}
        onShare={(reel) => { setMath(null); if (reel) props.onShare(reel); else props.onPost(); }} /> : null}
      {how ? <HowSheet L={L} onClose={() => setHow(false)} /> : null}
      {rv && wr && win ? <WinSheet v={rv} lang={props.lang} r={wr} onClose={() => setWin(false)} /> : null}
    </div>
  );
}
