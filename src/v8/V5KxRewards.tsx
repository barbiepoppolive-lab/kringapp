/**
 * Rewards (LOCKED rules 15 Nov): this week's Rings + rank, the prize ladder, "My prizes" (one-tap Claim → Grab full value or
 * TrueMoney full value on live), the gold ticket with the code + Copy + Open, history with NEW / USED, the live claims line, and the week-close result.
 * Rings are a score, never money: prizes are baht. Every prize and every code is decided by the server (kr8_close_week / kr8_claim_prize).
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import './kx.css';
import { ago, BRAND_NAME, claimBrands, fmtN, tmPct, valueFor, type Brand } from './kxLogic';
import { ringsRules } from './rewardsConfig';
import { kxClaimPrize, kxMarkUsed, kxRecentClaims, type KxClaim, type KxClaimResult, type KxPrize, type KxRecent, type KxRewards, type KxWeekResult } from './v5Kx';
import { v5ErrCode, v5LogClient, v5SignInLine, v5UploadClaimPhoto } from './v5Live';
import { v5ErrText } from './v5Strings';
import { ClaimFace, TE } from './V5ClaimFace';
import { NeonCard, RingGlyph } from './V5KxCard';
import { baht, ownRow } from './V5KxRanking';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

/** TrueMoney vouchers can arrive as a redeem link instead of a code: the admin pastes the https link as the code. */
export const isLink = (code: string | null | undefined): boolean => /^https:\/\/[^\s]+$/i.test(code || '');
/** 22 Nov: one prize can be several TrueMoney cards, stored as "1000:PIN|500:PIN" (each card copied separately). */
export const isMulti = (code: string | null | undefined): boolean => /^\d+:[^|\s]+(\|\d+:[^|\s]+)+$/.test(code || '');
export const splitCodes = (code: string | null | undefined): { amt: number; pin: string }[] =>
  (code || '').split('|').map((x) => { const [a, ...r] = x.split(':'); return { amt: Number(a) || 0, pin: r.join(':') }; });
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
/** "Tue 25 Nov, 09:00" (Bangkok time) for when a checked weekly prize opens */
export function openTime(lang: 'th' | 'en', at: string): string {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(Date.parse(at));
}
/** "9 Nov" for the Monday a week started on. */
export function weekLabel(lang: string, week: string): string {
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${week}T00:00:00Z`));
}

/**
 * Rewards home: this week's Rings + rank and the next step, My prizes (one-tap Claim), the prize ladder, one live-claims line.
 * No task list, no invite card, no balance: Rings are a score.
 */
export function RewardsPage(props: { L: Tx; Lf: Txf; lang: string; data: KxRewards | null; fallbackWeek?: number | null;
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
        {/* 16 Nov fix: the label and the Ranking pill share one row (the pill never overlaps), the streak sits on its own line */}
        <div className="kx-wk-top">
          <span className="cap">{L('THIS WEEK')}</span>
          <button type="button" className="kx-rankchip" id="kxWeekRank" onClick={props.onRanking}>{data?.rank ? `#${data.rank}` : '#—'} <small>{L('Ranking')} ›</small></button>
        </div>
        <button type="button" className={`n${data ? '' : ' wait'}`} id="kxWeekMath" aria-label={L('See the math')} onClick={props.onMath}><span id="kxWeekN">{fmtN(data ? data.week ?? 0 : props.fallbackWeek ?? 0)}</span><RingGlyph white size={40} /></button>
        {data && data.streak >= 2 ? <i className="kx-stk" id="kxStreak">🔥 {Lf('{0} days in a row', String(data.streak))}</i> : null}
        <div className="v" id="kxWeekNext">{data ? own.l2 : ''}</div>
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
              {p.status === 'won' && p.opens_at && Date.parse(p.opens_at) > Date.now()
                ? <span className="kx-wait" data-opens-at={p.opens_at}><TE th={`ตรวจผลอยู่ · เปิดรับ ${openTime('th', p.opens_at)}`} en={`Checking results · opens ${openTime('en', p.opens_at)}`} /></span>
                : p.status === 'won'
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

/** Claim a prize: pick the app → one tap. Grab = full value, TrueMoney = truemoney_payout_pct of it (100% on live). 20 Nov founder: no percent or fee is ever shown, only "Voucher" and the amount you get;
 *  audit P2-6: the 25% is the loss on Kring's own top-up stock, not a TrueMoney fee, so the app no longer says "TrueMoney keeps 25%"). */
export function ClaimPage(props: { L: Tx; Lf: Txf; lang: string; data: KxRewards | null; prize: KxPrize | null; onBack: () => void; onDone: (r: KxClaimResult) => void; toast: (m: string) => void;
  /** 0111: the face check is needed ONLY to claim a prize. false = not verified yet → the claim asks for it first (undefined = unknown: the server decides) */
  verified?: boolean; verifyPending?: boolean; onVerify?: () => void;
  /** face-fixes 19 Nov: verified + this phone passed (or the team approved) → no second scan; FACE_NEEDED from the server → the scan */
  skipFace?: boolean;
  /** preview harness only */ startStep?: 'pick' | 'face' | 'line' | 'verify'; faceDemo?: Parameters<typeof ClaimFace>[0]['demo'] }) {
  const { L, Lf, data, prize } = props;
  const R = ringsRules(data?.rules);
  const pct = tmPct(R);
  const brands = claimBrands(R, prize?.kind);
  const [brand, setBrand] = useState<Brand>(brands[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 0066: 'face' = the 3-second face check before the claim; 'line' = LINE must be linked first (switch claim_needs_line)
  // 0111: 'verify' = not face-verified yet: the 3-second check is the required step before the claim (opened on top by the app)
  const [step, setStep] = useState<'pick' | 'face' | 'line' | 'verify'>(props.startStep || 'pick');
  const needsVerify = props.verified === false && !props.verifyPending && !!props.onVerify;
  // verified (or sent for the team's look) while the step was showing → back to the choice, ready to claim
  useEffect(() => { if (step === 'verify' && (props.verified === true || props.verifyPending) && !props.startStep) setStep('pick'); }, [step, props.verified, props.verifyPending, props.startStep]);
  const [waitUntil, setWaitUntil] = useState<string | null>(null);
  const amount = prize?.amount ?? 0;
  const opensAt = prize?.opens_at && Date.parse(prize.opens_at) > Date.now() ? prize.opens_at : waitUntil;
  const skipTried = useRef(false);   // face-fixes: the claim was sent once without the scan (a FACE_NEEDED answer then opens it)
  const send = async (face: Float32Array | null, photo?: Blob | null) => {
    if (busy || !prize) return;
    setBusy(true);
    setErr('');
    try {
      // 0092: no photo leaves the phone at a claim any more; the face code is enough
      const selfie = face && photo && !face ? await v5UploadClaimPhoto(photo) : null;
      props.onDone(await (face ? (selfie ? kxClaimPrize(prize.id, brand, face, selfie) : kxClaimPrize(prize.id, brand, face)) : kxClaimPrize(prize.id, brand)));
    } catch (e) {
      const c = v5ErrCode(e);
      // 19 Nov (#138 ×14 during the database outage): a network error must not use up the "verified, no scan" try
      if (c !== 'FACE_NEEDED') skipTried.current = false;
      setStep('pick');
      if (c === 'NEED_LINE') { setStep('line'); return; }
      if (c === 'FACE_NEEDED') { if (skipTried.current) v5LogClient('claim_face_skip', 'server_needs_face'); setStep('face'); return; }
      if (c === 'VERIFY_FIRST') { setStep('verify'); return; }   // 0111: the server asks for the face check first
      if (c === 'WEEK_REVIEW') { setWaitUntil('soon'); return; }
      // 19 Nov: the prize rules (approved place Reel, 24 h, face check waiting) say exactly what is missing
      if (c === 'NEED_REEL' || c === 'NEED_PLACE_REEL' || c === 'REEL_WAIT' || c === 'VERIFY_PENDING') { setErr(L(v5ErrText(c)[0])); return; }
      setErr(c === 'ONE_ACCOUNT' ? L('This phone already claimed for another account. One person, one account.')
        : c === 'NO_PRIZE' ? L('That prize isn’t here any more.')
        : c === 'OFFLINE' || c === 'NETWORK' ? L('Couldn’t reach Kring. Check your connection and try again.')
        : L('Something went wrong. Try again.'));
    } finally { setBusy(false); }
  };
  const go = () => {
    if (busy || !prize) return;
    if (data?.claim_needs_line && !data?.line_linked) { setStep('line'); return; }
    if (needsVerify) { setStep('verify'); props.onVerify?.(); return; }   // 0111: face check first, only here
    if (data?.claim_face_check !== true) { void send(null); return; }   // before 0066 the server doesn't ask for it
    // face-fixes 19 Nov: already verified (and passed on this phone / approved by the team) → no second scan
    if (props.skipFace && !skipTried.current) { skipTried.current = true; v5LogClient('claim_face_skip', 'verified'); void send(null); return; }
    setStep('face');
  };
  const linkLine = async () => {
    const r = await v5SignInLine(true);
    if (r !== 'redirect') props.toast(r === 'NETWORK' ? L('Couldn’t reach Kring. Check your connection and try again.') : 'LINE ยังไม่เปิดใช้ · LINE isn’t switched on yet');
  };
  if (step === 'face' && prize) {
    return (
      <div className="kx-page kx-cl" id="kxClaim" data-step="face">
        <div className="kx-hd2">
          <button type="button" className="kx-bk" aria-label={L('Back')} onClick={() => setStep('pick')}>‹</button>
          <h1 className="sm">{L('Claim')}</h1>
          <span style={{ width: 40 }} />
        </div>
        <ClaimFace demo={props.faceDemo} onCancel={() => setStep('pick')} onDone={(f, ph) => void send(f, ph)} />
      </div>
    );
  }
  return (
    <div className="kx-page kx-cl" id="kxClaim">
      <div className="kx-hd2">
        <button type="button" className="kx-bk" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        <h1 className="sm">{L('Claim')}</h1>
        <span style={{ width: 40 }} />
      </div>
      {/* rv4 (founder pick Claim C): a calm gold coin with the amount, "฿100 · TrueMoney", what the prize is for,
          three steps (Reel approved ✓ · Face check · Claim) and one pink button. Same claim logic underneath. */}
      {prize ? (
        <div className="kx-clp rv4-cl" id="kxClaimPrize">
          <div className="rv4-coin" aria-hidden="true"><b>{baht(valueFor(brand, amount, pct))}</b></div>
          <b className="rv4-clt" data-amount={amount}>{baht(valueFor(brand, amount, pct))} · {BRAND_NAME[brand]}</b>
          <small>{prizeTitle(L, Lf, props.lang, prize)}</small>
          <ol className="rv4-steps" aria-label={L('Claim')}>
            <li className="d"><i aria-hidden="true">✓</i><span>{L('Reel approved')}</span></li>
            <li className={props.verified === true || props.skipFace ? 'd' : ''}><i aria-hidden="true">{props.verified === true || props.skipFace ? '✓' : '2'}</i><span>{L('Face check')}</span></li>
            <li className="c"><i aria-hidden="true">3</i><span>{L('Claim')}</span></li>
          </ol>
        </div>
      ) : null}
      {step === 'line' ? (
        <div className="kx-step" id="kxClaimLine">
          <span className="ln" aria-hidden="true">LINE</span>
          <TE th="เชื่อม LINE เพื่อรับรางวัล" en="Link LINE to get your prize" />
          <TE th="ใช้ LINE ของคุณเอง หนึ่งคน หนึ่งบัญชี" en="Use your own LINE. One person, one account." />
          <button type="button" className="kx-btn line" id="kxClaimLinkLine" onClick={() => void linkLine()}><TE th="เชื่อม LINE" en="Link LINE" /></button>
        </div>
      ) : null}
      {step === 'verify' ? (
        <div className="kx-step kx-step-vfy" id="kxClaimVerify">
          <span className="vf" aria-hidden="true">✓</span>
          <b>{L('Verify your face to claim')}</b>
          <small>{L('5 seconds, once. It keeps every prize one person, one account.')}</small>
          <button type="button" className="kx-btn" id="kxClaimVerifyGo" onClick={() => props.onVerify?.()}>{L('Verify my face')}</button>
        </div>
      ) : null}
      {opensAt ? (
        <div className="kx-step" id="kxClaimWait">
          <TE th="กำลังตรวจผลประจำสัปดาห์" en="We’re checking this week’s results" />
          <TE th={`รางวัลของคุณปลอดภัย กดรับได้${opensAt === 'soon' ? 'ภายใน 24 ชั่วโมง' : ` ${openTime('th', opensAt)}`}`} en={`Your prize is safe. You can claim it ${opensAt === 'soon' ? 'within 24 hours' : openTime('en', opensAt)}`} />
        </div>
      ) : null}
      {brands.length > 1 ? <p className="kx-one" id="kxClaimOne">{L('Choose one. This prize can be claimed once.')}</p> : null}
      <div className="kx-pays" role="radiogroup" aria-label={L('Get it on')} hidden={brands.length < 2}>
        {brands.map((b, i) => (
          <Fragment key={b}>
            {i > 0 ? <div className="kx-or" aria-hidden="true">{L('OR')}</div> : null}
            <button type="button" role="radio" data-brand={b} className={`kx-py${brand === b ? ' on' : ''} b-${b}`} aria-checked={brand === b} aria-pressed={brand === b} onClick={() => { setBrand(b); setErr(''); }}>
              <span className="rd" aria-hidden="true" />
              <BrandLogo b={b} />
              <span className="n"><span data-value={valueFor(b, amount, pct)}>{BRAND_NAME[b]} {baht(valueFor(b, amount, pct))}</span>
                <small>{L('Voucher')}</small></span>
            </button>
          </Fragment>
        ))}
      </div>
      <div className="kx-cl-foot">
        {err ? <p className="kx-err center" role="alert" id="kxClaimErr">{err}</p> : null}
        <button type="button" className="kx-btn tall rv4-reveal" id="kxClaimGo" aria-label={Lf('Claim with {0} · {1}', BRAND_NAME[brand], baht(valueFor(brand, amount, pct)))}
          disabled={busy || !prize || !!opensAt || step === 'line' || step === 'verify'} onClick={go}>
          <b>{busy ? '…' : L('Reveal my code')}</b>
        </button>
        {err ? null : <p className="kx-inst">{brands.length > 1 ? null : `${L('This prize can be claimed once.')} · `}{L('Your code shows in My prizes as soon as it’s ready.')}</p>}
      </div>
    </div>
  );
}

/** Gold ticket + history (NEW / USED) with "Mark as used" on every code */
export function ClaimedPage(props: { L: Tx; Lf: Txf; lang: string; data: KxRewards | null; focus: string | null; fresh?: boolean; toast: (m: string) => void;
  onClose: () => void; onChanged: () => void; needsVerify?: boolean; onVerify?: () => void }) {
  const { L, Lf, data } = props;
  const [focus, setFocus] = useState<string | null>(props.focus);
  const [used, setUsed] = useState<Record<string, boolean>>({});
  const claims = data?.claims || [];
  const focused = claims.find((x) => x.id === focus);
  const c: KxClaim | undefined = focused && focused.code ? focused : focused ? undefined : claims.find((x) => x.status === 'assigned');
  const pending = claims.filter((x) => x.status === 'pending');
  const isUsed = (x: KxClaim) => (x.id in used ? used[x.id] : !!x.used_at);
  const rows = useMemo(() => claims.slice()// 24 Nov audit: this stopped at 30 with no "show older", so a long-standing member's early prizes vanished
    .sort((a, b) => Date.parse(b.assigned_at || b.created_at) - Date.parse(a.assigned_at || a.created_at)), [claims]);
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
          <div className={`kx-tix${isMulti(c.code) ? ' multi' : ''}`} id="kxTicket" data-brand={c.brand}>
            <div className="t1"><span className="gb" style={{ background: BRAND_BG[c.brand] }}>{BRAND_NAME[c.brand]}</span><small>{prizeTitle(L, Lf, props.lang, c, true).toLocaleUpperCase()}</small></div>
            <div className="amt">{baht(c.value ?? valueFor(c.brand, c.amount, tmPct(ringsRules(data?.rules))))}</div>
            <div className="perf" />
            {isMulti(c.code) ? (
              <div className="kx-multi" id="kxCode" data-multi="1">
                {splitCodes(c.code).map((x, i) => (
                  <div className="kx-mrow" key={i}><span className="a">{baht(x.amt)}</span><span className="code">{x.pin}</span>
                    <button type="button" className="cp" onClick={() => void copy(x.pin)}>{L('Copy')}</button></div>
                ))}
              </div>
            ) : <>{isLink(c.code) ? <div className="code link" id="kxCode" data-link="1">{L('Your redeem link')}<small>{linkHost(c.code)}</small></div> : <div className="code" id="kxCode">{c.code}</div>}
            <button type="button" className="cp" id="kxCopy" onClick={() => void copy(c.code || '')}>{isLink(c.code) ? L('Copy link') : L('Copy')}</button></>}
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
          {pending.length && props.needsVerify && props.onVerify ? (
            <div className="kx-verify-nudge" id="kxVerifyNudge">
              <p><TE th="ยืนยันใบหน้าเพื่อรับโค้ด ใช้เวลาไม่กี่วินาที" en="Verify your face to get your code. It takes a few seconds." /></p>
              <button type="button" className="kx-cta" onClick={props.onVerify}><TE th="ยืนยันใบหน้า" en="Verify my face" /></button>
            </div>
          ) : null}
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
