/**
 * Rewards (LOCKED rules 15 Nov): this week's Rings + rank, the prize ladder, "My prizes" (one-tap Claim → Grab full value or
 * TrueMoney 75%), the gold ticket with the code + Copy + Open, history with NEW / USED, the live claims line, and the week-close result.
 * Rings are a score, never money: prizes are baht. Every prize and every code is decided by the server (kr8_close_week / kr8_claim_prize).
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import './kx.css';
import { ago, BRAND_NAME, claimBrands, fmtN, tmPct, valueFor, type Brand } from './kxLogic';
import { ringsRules } from './rewardsConfig';
import { kxClaimPrize, kxMarkUsed, kxRecentClaims, type KxClaim, type KxClaimResult, type KxPrize, type KxRecent, type KxRewards, type KxWeekResult } from './v5Kx';
import { v5ErrCode } from './v5Live';
import { NeonCard, RingGlyph } from './V5KxCard';
import { baht, ownRow } from './V5KxRanking';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

/** TrueMoney vouchers can arrive as a redeem link instead of a code: the admin pastes the https link as the code. */
export const isLink = (code: string | null | undefined): boolean => /^https:\/\/[^\s]+$/i.test(code || '');
const linkHost = (code: string | null | undefined) => { try { return new URL(code || '').host; } catch { return ''; } };
const BRAND_BG: Record<Brand, string> = { grab: '#00b14f', shopeepay: '#ee4d2d', truemoney: '#ff7a00' };
const BRAND_SITE: Record<Brand, string> = { grab: 'https://www.grab.com/th/', shopeepay: 'https://shopee.co.th/m/shopeepay', truemoney: 'https://www.truemoney.com/' };
export const BrandLogo = ({ b, size }: { b: Brand; size?: number }) => (
  <span className={`kx-brand b-${b}`} style={{ background: BRAND_BG[b], ...(size ? { width: size, height: size } : {}) }} aria-hidden="true">
    {b === 'grab' ? 'Grab' : b === 'shopeepay' ? <>Shopee<br />Pay</> : <>True<br />Money</>}
  </span>
);
const Av = ({ photo, name, size }: { photo: string | null; name: string; size: number }) => (
  <i className="kx-av" style={{ width: size, height: size, ...(photo ? { backgroundImage: `url('${photo}')` } : {}) }} aria-hidden="true">{photo ? '' : (name || '?').charAt(0).toUpperCase()}</i>
);
export function agoText(L: Tx, Lf: Txf, at: string): string {
  const a = ago(at);
  return a.u === 'now' ? L('just now') : Lf(a.u === 'm' ? '{0}m' : a.u === 'h' ? '{0}h' : '{0}d', String(a.n));
}
function dayText(L: Tx, lang: string, at: string): string {
  const d = Date.now() - Date.parse(at);
  if (d < 60_000 * 5) return L('Just now');
  const day = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
  if (day(Date.parse(at)) === day(Date.now())) return L('Today');
  if (day(Date.parse(at)) === day(Date.now() - 86400_000)) return L('Yesterday');
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(Date.parse(at));
}
const brandAmt = (_L: Tx, b: Brand, amount: number, value?: number | null) => `${BRAND_NAME[b]} ฿${fmtN(value ?? valueFor(b, amount))}`;

export function useRecentClaims(on: boolean) {
  const [rows, setRows] = useState<KxRecent[] | null>(null);
  useEffect(() => {
    if (!on) return;
    let dead = false;
    const load = () => kxRecentClaims(6).then((r) => { if (!dead) setRows(r || []); }).catch(() => { if (!dead) setRows((x) => x || []); });
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => { dead = true; window.clearInterval(id); };
  }, [on]);
  return rows;
}

function LiveRow(props: { L: Tx; Lf: Txf; r: KxRecent; chip?: boolean }) {
  const { L, Lf, r } = props;
  return (
    <div className={props.chip ? 'kx-livechip' : 'kx-fr'}>
      <Av photo={r.photo} name={r.first_name} size={30} />
      <span><b>{r.first_name}</b> {L('claimed')} <i className={`c-${r.brand}`}>{brandAmt(L, r.brand, r.amount, r.value)}</i></span>
      <em>{agoText(L, Lf, r.at)}</em>
    </div>
  );
}

/** "#4 this week" / "Founding Local #14" for a prize or a claim. */
export function prizeTitle(L: Tx, Lf: Txf, lang: string, p: { kind: 'weekly' | 'founding' | null; rank: number | null; founding_no: number | null; week: string | null }, short = false): string {
  if (p.kind === 'founding') return `${L('Founding Local')} #${String(p.founding_no ?? '').padStart(2, '0')}`;
  if (p.kind === 'weekly') return `${Lf('#{0} of the week', String(p.rank ?? ''))}${p.week && !short ? ` · ${weekLabel(lang, p.week)}` : ''}`;
  return L('KRING REWARD');
}
/** "9 Nov" for the Monday a week started on. */
export function weekLabel(lang: string, week: string): string {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${week}T00:00:00Z`));
}

/**
 * Rewards home: this week's Rings + rank and the next step, My prizes (one-tap Claim), the prize ladder, one live-claims line.
 * No task list, no invite card, no balance: Rings are a score.
 */
export function RewardsPage(props: { L: Tx; Lf: Txf; lang: string; data: KxRewards | null;
  onBack: () => void; onClaim: (p: KxPrize) => void; onCode: (claimId: string | null) => void; onHistory: () => void; onRanking: () => void; onMath: () => void }) {
  const { L, Lf, data } = props;
  const R = ringsRules(data?.rules);
  const live = useRecentClaims(true);
  const ladder = data?.ladder?.length ? data.ladder : Array.from({ length: 10 }, (_, i) => (R as unknown as Record<string, number>)[`prize_${i + 1}`] || 0);
  const paid = ladder.filter((x) => x > 0);
  const total = paid.reduce((s, n) => s + n, 0);
  const own = ownRow(L, Lf, data?.gap, null);
  const prizes = data?.prizes || [];
  const claimOf = (p: KxPrize) => (data?.claims || []).find((c) => c.id === p.claim_id);
  return (
    <div className="kx-page kx-rw" id="kxRewards">
      <div className="kx-hd2">
        <button type="button" className="kx-bk" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        <h1>{L('Rewards')}</h1>
        <button type="button" className="kx-soft" id="kxHistoryBtn" onClick={props.onHistory}>{L('History')}</button>
      </div>
      <div className="kx-bal wk" id="kxWeek">
        <RingGlyph white size={150} />
        <span className="cap">{L('THIS WEEK')}{data && data.streak >= 2 ? <i className="kx-stk" id="kxStreak">🔥 {Lf('{0} days in a row', String(data.streak))}</i> : null}</span>
        <button type="button" className="n" id="kxWeekMath" aria-label={L('See the math')} onClick={props.onMath}><span id="kxWeekN">{data ? fmtN(data.week) : '…'}</span><RingGlyph white size={40} /></button>
        <div className="v" id="kxWeekNext">{data ? own.l2 : ''}</div>
        <button type="button" className="kx-rankchip" id="kxWeekRank" onClick={props.onRanking}>{data?.rank ? `#${data.rank}` : '#—'} <small>{L('Ranking')} ›</small></button>
      </div>
      <div className="kx-sec"><h2>{L('My prizes')}</h2><span>{L('One tap to claim')}</span></div>
      <div className="kx-pzs" id="kxPrizes">
        {prizes.length === 0 ? <p className="kx-pz-none" id="kxNoPrizes">{L('No prizes yet. Finish the week in the top 8 and yours shows up here.')}</p> : prizes.map((p) => {
          const c = claimOf(p);
          return (
            <div className={`kx-pzc ${p.status}`} key={p.id} data-prize-id={p.id} data-status={p.status} data-kind={p.kind}>
              <span className="ic" aria-hidden="true">{p.kind === 'founding' ? '★' : '🏆'}</span>
              <span className="t">{prizeTitle(L, Lf, props.lang, p, true)}<small>{p.status === 'won' ? <b className="amt">{baht(p.amount)}</b> : c?.status === 'pending' ? L('Your code is on the way') : c ? brandAmt(L, c.brand, c.amount) : L('Claimed')}
                {p.kind === 'weekly' && p.week ? ` · ${weekLabel(props.lang, p.week)}` : ''}</small></span>
              {p.status === 'won'
                ? <button type="button" className="kx-claim" data-claim-prize={p.id} onClick={() => props.onClaim(p)}>{L('Claim')}</button>
                : <button type="button" className="kx-soft" data-view-code={p.claim_id || ''} onClick={() => props.onCode(p.claim_id)}>{c?.status === 'pending' ? L('SOON') : L('Code')}</button>}
            </div>
          );
        })}
      </div>
      <div className="kx-sec"><h2>{L('Weekly prizes')}</h2><span>{Lf('Top {0} share {1} every week', String(paid.length), baht(total))}</span></div>
      <div className="kx-ladder" id="kxLadder">
        {ladder.slice(0, 10).map((amt, i) => (
          <span key={i} className={`${amt > 0 ? '' : 'no'}${data?.rank === i + 1 ? ' me' : ''}`} data-rank={i + 1} data-amount={amt}><i>#{i + 1}</i><b>{amt > 0 ? baht(amt) : '–'}</b></span>
        ))}
      </div>
      <p className="kx-ladder-note" id="kxLadderNote">{(data?.floor ?? R.min_rings_for_paid_seat) > 0 ? Lf('A prize seat needs {0} Rings. #9 and #10 are on the board with no prize.', String(data?.floor ?? R.min_rings_for_paid_seat)) : L('#9 and #10 are on the board with no prize.')}</p>
      <div className="kx-liveline" id="kxLive">
        {live && live[0] ? <LiveRow L={L} Lf={Lf} r={live[0]} chip /> : <span className="kx-livechip empty"><span className="kx-dot" />{live === null ? '…' : L('No claims yet. Yours could be the first.')}</span>}
      </div>
    </div>
  );
}

/** Claim a prize: pick the app → one tap. Grab = full value, TrueMoney = 75% ("TrueMoney keeps 25%"). */
export function ClaimPage(props: { L: Tx; Lf: Txf; lang: string; data: KxRewards | null; prize: KxPrize | null; onBack: () => void; onDone: (r: KxClaimResult) => void; toast: (m: string) => void }) {
  const { L, Lf, data, prize } = props;
  const R = ringsRules(data?.rules);
  const pct = tmPct(R);
  const brands = claimBrands(R, prize?.kind);
  const [brand, setBrand] = useState<Brand>(brands[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amount = prize?.amount ?? 0;
  const go = async () => {
    if (busy || !prize) return;
    setBusy(true);
    setErr('');
    try {
      props.onDone(await kxClaimPrize(prize.id, brand));
    } catch (e) {
      const c = v5ErrCode(e);
      setErr(c === 'ONE_ACCOUNT' ? L('This phone already claimed for another account. One person, one account.')
        : c === 'NO_PRIZE' ? L('That prize isn’t here any more.')
        : c === 'OFFLINE' || c === 'NETWORK' ? L('Couldn’t reach Kring. Check your connection and try again.')
        : L('Something went wrong. Try again.'));
    } finally { setBusy(false); }
  };
  return (
    <div className="kx-page kx-cl" id="kxClaim">
      <div className="kx-hd2">
        <button type="button" className="kx-bk" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        <h1 className="sm">{L('Claim')}</h1>
        <span style={{ width: 40 }} />
      </div>
      {prize ? (
        <div className="kx-clp" id="kxClaimPrize">
          <small>{prizeTitle(L, Lf, props.lang, prize)}</small>
          <b data-amount={amount}>{baht(amount)}</b>
        </div>
      ) : null}
      <p className="kx-one" id="kxClaimOne">{L('Choose one. This prize can be claimed once.')}</p>
      <div className="kx-pays" role="radiogroup" aria-label={L('Get it on')}>
        {brands.map((b, i) => (
          <Fragment key={b}>
            {i > 0 ? <div className="kx-or" aria-hidden="true">{L('OR')}</div> : null}
            <button type="button" role="radio" data-brand={b} className={`kx-py${brand === b ? ' on' : ''} b-${b}`} aria-checked={brand === b} aria-pressed={brand === b} onClick={() => { setBrand(b); setErr(''); }}>
              <span className="rd" aria-hidden="true" />
              <BrandLogo b={b} />
              <span className="n"><span data-value={valueFor(b, amount, pct)}>{BRAND_NAME[b]} {baht(valueFor(b, amount, pct))}</span>
                <small>{b === 'truemoney' && pct < 100 ? Lf('{0}% · TrueMoney keeps {1}%', String(pct), String(100 - pct)) : L('Full value')}</small></span>
            </button>
          </Fragment>
        ))}
      </div>
      <div className="kx-cl-foot">
        {err ? <p className="kx-err center" role="alert" id="kxClaimErr">{err}</p> : <p className="kx-inst">{L('Your code arrives')} <b>{L('instantly')}</b></p>}
        <button type="button" className="kx-btn tall" id="kxClaimGo" disabled={busy || !prize} onClick={() => void go()}>
          <b>{busy ? '…' : Lf('Claim with {0} · {1}', BRAND_NAME[brand], baht(valueFor(brand, amount, pct)))}</b>
        </button>
      </div>
    </div>
  );
}

/** Gold ticket + history (NEW / USED) with "Mark as used" on every code */
export function ClaimedPage(props: { L: Tx; Lf: Txf; lang: string; data: KxRewards | null; focus: string | null; fresh?: boolean; toast: (m: string) => void;
  onClose: () => void; onChanged: () => void }) {
  const { L, Lf, data } = props;
  const [focus, setFocus] = useState<string | null>(props.focus);
  const [used, setUsed] = useState<Record<string, boolean>>({});
  const claims = data?.claims || [];
  const focused = claims.find((x) => x.id === focus);
  const c: KxClaim | undefined = focused && focused.code ? focused : focused ? undefined : claims.find((x) => x.status === 'assigned');
  const pending = claims.filter((x) => x.status === 'pending');
  const isUsed = (x: KxClaim) => (x.id in used ? used[x.id] : !!x.used_at);
  const rows = useMemo(() => claims.slice().sort((a, b) => Date.parse(b.assigned_at || b.created_at) - Date.parse(a.assigned_at || a.created_at)).slice(0, 30), [claims]);
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); props.toast(isLink(code) ? L('Link copied') : L('Code copied')); } catch { props.toast(code); }
  };
  const mark = async (x: KxClaim, on: boolean) => {
    setUsed((u) => ({ ...u, [x.id]: on }));
    try { await kxMarkUsed(x.id, on); props.onChanged(); } catch { setUsed((u) => ({ ...u, [x.id]: !on })); props.toast(L('Something went wrong. Try again.')); }
  };
  return (
    <div className="kx-page kx-cdp" id="kxClaimed">
      {c ? <><div className="kx-glow" /><div className="kx-burst gold" /></> : null}
      <button type="button" className="kx-x right" aria-label={L('Close')} onClick={props.onClose}>✕</button>
      {c && c.code ? (
        <>
          <div className="kx-cd-h">{props.fresh ? L('Claimed!') : L('Your code')}</div>
          <div className="kx-tix" id="kxTicket" data-brand={c.brand}>
            <div className="t1"><span className="gb" style={{ background: BRAND_BG[c.brand] }}>{BRAND_NAME[c.brand]}</span><small>{prizeTitle(L, Lf, props.lang, c, true).toLocaleUpperCase()}</small></div>
            <div className="amt">{baht(c.value ?? valueFor(c.brand, c.amount, tmPct(ringsRules(data?.rules))))}</div>
            <div className="perf" />
            {isLink(c.code) ? <div className="code link" id="kxCode" data-link="1">{L('Your redeem link')}<small>{linkHost(c.code)}</small></div> : <div className="code" id="kxCode">{c.code}</div>}
            <button type="button" className="cp" id="kxCopy" onClick={() => void copy(c.code || '')}>{isLink(c.code) ? L('Copy link') : L('Copy')}</button>
          </div>
          <a className="kx-og" id="kxOpenApp" style={{ background: BRAND_BG[c.brand] }} href={isLink(c.code) ? c.code! : c.activation_url || BRAND_SITE[c.brand]} target="_blank" rel="noopener noreferrer"
            data-redeem={isLink(c.code) || c.activation_url ? '1' : undefined}>
            {c.brand === 'truemoney' && (isLink(c.code) || c.activation_url) ? L('Redeem into TrueMoney') : Lf('Open {0}', BRAND_NAME[c.brand])}
          </a>
        </>
      ) : (
        <div className="kx-cd-none">
          <div className="kx-cd-h">{pending.length ? L('Your code is on the way') : L('History')}</div>
          {pending.length ? <p className="kx-restock" id="kxRestock">{L('Your prize is safe. We’ll let you know here the moment your code is ready.')}</p> : null}
        </div>
      )}
      <div className="kx-hs"><h2>{L('History')}</h2></div>
      <div className="kx-hist" id="kxHistory">
        {rows.length === 0 ? <p className="kx-empty">{L('Nothing yet. Your prize codes show up here.')}</p> : rows.map((x) => {
          const u = isUsed(x);
          return (
            <div key={x.id} className={`kx-r${u ? ' dim' : ''}${x.id === c?.id ? ' sel' : ''}`} data-claim={x.id} data-status={x.status}>
              <button type="button" className="kx-r-main" onClick={() => x.code && setFocus(x.id)}>
                <BrandLogo b={x.brand} size={42} />
                <span className="n" data-chosen={x.brand}>{Lf('Claimed with {0} · {1}', BRAND_NAME[x.brand], baht(x.value ?? valueFor(x.brand, x.amount, tmPct(ringsRules(data?.rules)))))}<small>{prizeTitle(L, Lf, props.lang, x)} · {x.status === 'pending' ? L('Your code is on the way') : dayText(L, props.lang, x.assigned_at || x.created_at)}</small></span>
              </button>
              {x.status === 'pending' ? <span className="kx-tg wait">{L('SOON')}</span> : (
                <label className="kx-used" title={L('Mark as used')}>
                  <span className={`kx-tg ${u ? 'used' : 'new'}`}>{u ? L('USED') : L('NEW')}</span>
                  <input type="checkbox" checked={u} aria-label={L('Mark as used')} data-mark={x.id} onChange={(e) => void mark(x, e.target.checked)} />
                  <i className="kx-sw" />
                </label>
              )}
            </div>
          );
        })}
      </div>
      {rows.some((x) => x.status === 'assigned') ? <p className="kx-mark-hint">{L('Used a code? Switch it to USED so you know which ones are left.')}</p> : null}
    </div>
  );
}

/** Week close (mock m7): shown once, the first time the member opens the app after Monday 00:00. Winner → one-tap Claim. */
export function ResultPage(props: { L: Tx; Lf: Txf; lang: string; r: KxWeekResult; photo: string | null; name: string; level: number; no: number | null;
  onClaim: (prizeId: string) => void; onShare: (reel: string | null) => void; onPost: () => void; onClose: () => void }) {
  const { L, Lf, r } = props;
  const won = !!r.prize && r.prize.status === 'won';
  const paidAlready = !!r.prize && r.prize.status === 'claimed';
  return (
    <div className={`kx-page kx-res${r.prize ? ' gold' : ''}`} id="kxResult" data-rank={r.rank}>
      {r.prize ? <div className="kx-burst gold" /> : null}
      <button type="button" className="kx-x right" id="kxResultClose" aria-label={L('Close')} onClick={props.onClose}>✕</button>
      <p className="kx-res-cap">{Lf('WEEK OF {0} · FINAL', weekLabel(props.lang, r.week).toLocaleUpperCase())}</p>
      <h1 className="kx-res-h">{Lf('You finished #{0}', String(r.rank))}</h1>
      <div className="kx-res-card">
        <NeonCard L={L} photo={props.photo} name={props.name} level={props.level} no={props.no} ig={null} tt={null} size="me"
          sub={`${fmtN(r.rings)} ${L('Rings')}`} />
      </div>
      {r.prize ? (
        <>
          <div className="kx-res-amt" id="kxResultAmt" data-amount={r.prize.amount}>{baht(r.prize.amount)}</div>
          <p className="kx-res-st">{won ? L('Yours now. Pick where to get it.') : L('Claimed')}</p>
          <div className="kx-res-acts">
            {won ? <button type="button" className="kx-btn gold" id="kxResultClaim" onClick={() => props.onClaim(r.prize!.id)}>{Lf('Claim {0}', baht(r.prize.amount))}</button> : null}
            <button type="button" className="kx-btn ghost" id="kxResultShare" onClick={() => props.onShare(r.reel)}>{L('Share my Reel · each open +5')} <RingGlyph /></button>
          </div>
        </>
      ) : (
        <>
          <p className="kx-res-st near">{r.line_need && r.line_prize ? Lf('{0} Rings from {1}', fmtN(r.line_need), baht(r.line_prize)) : ''}</p>
          <div className="kx-res-acts">
            <button type="button" className="kx-btn" id="kxResultPost" onClick={props.onPost}>{L('Post this week’s Reel')}</button>
          </div>
        </>
      )}
      <p className="kx-res-foot">{L('New week has started · everyone is back at 0')}{paidAlready ? '' : ''}</p>
    </div>
  );
}
