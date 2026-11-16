/**
 * Weekly prize banner (founder copy pack 16 Nov): a slim live ticker on the Feed and a race card on Me, both from the member's own week.
 * The Kring rings are the meter: the pink ring fills with the Rings you have towards your next step. Tap → Me → This week · Ranking.
 * ✕ hides both for the rest of the Bangkok day. Motion: spring-in, rolling digits when Rings change, a sheen on the prize,
 * a soft pulse on the countdown in the last 6 hours. All of it stops with "reduce motion".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './prize.css';
import type { KxRanking } from './v5Kx';
import { v5RewardStart } from './v5Live';
import {
  baht, fill, hidePrize, pickPrize, prizeHidden, PRIZE_COPY, raceClock, rankDelta, rememberRank, seenRankAtStart, weekIn,
  type PrizeLine, type PrizePick, type PrizeVals,
} from './prizeRace';

/** Rolling digits: each digit is a 0–9 strip that slides to its value, so a change reads as a tick, not a swap. */
export function Odo({ value, className }: { value: number; className?: string }) {
  const s = Math.max(0, Math.round(value)).toLocaleString('en-US');
  const chars = s.split('');
  return (
    <span className={`kpz-odo${className ? ` ${className}` : ''}`} data-value={value} aria-label={s} role="img">
      {chars.map((ch, i) => {
        const key = chars.length - i;   // keyed from the right, so 9 → 10 keeps the units column in place
        return /\d/.test(ch) ? (
          <span className="kpz-od" key={key} aria-hidden="true">
            <span className="kpz-ods" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
            </span>
            <span className="kpz-odw">{ch}</span>
          </span>
        ) : <span className="kpz-osep" key={`s${key}`} aria-hidden="true">{ch}</span>;
      })}
    </span>
  );
}

/** The two Kring rings as in the logo (blue + pink, interlocked, violet lens where they meet). The pink ring is the meter. */
export function RingsMeter({ progress, small }: { progress: number; small?: boolean }) {
  const C = 2 * Math.PI * 13;
  const p = Math.max(0.04, Math.min(1, progress));   // draws in from empty (CSS), then glides when the Rings change
  return (
    <svg className={`kpz-rings${small ? ' sm' : ''}`} viewBox="0 0 56 36" aria-hidden="true" focusable="false">
      <path className="kpz-lens" d="M28 7.75A13 13 0 0 0 28 28.25A13 13 0 0 0 28 7.75Z" />
      <circle className="kpz-rv" cx="20" cy="18" r="13" />
      <circle className="kpz-rt" cx="36" cy="18" r="13" />
      <circle className="kpz-rp" cx="36" cy="18" r="13" transform="rotate(-90 36 18)" strokeDasharray={C.toFixed(2)} strokeDashoffset={(C * (1 - p)).toFixed(2)} data-progress={p.toFixed(2)} />
      <path className="kpz-rv kpz-over" d="M30.65 25.46A13 13 0 0 1 24.45 30.22" />
    </svg>
  );
}

const Delta = ({ d }: { d: number | null }) => (d ? (
  <span className={`kpz-dl ${d > 0 ? 'up' : 'dn'}`} aria-label={d > 0 ? `Up ${d} since you last looked` : `Down ${-d} since you last looked`}>
    <svg viewBox="0 0 10 10" aria-hidden="true"><path d={d > 0 ? 'M5 2.2 8.6 7.6H1.4Z' : 'M5 7.8 8.6 2.4H1.4Z'} /></svg>{Math.abs(d)}
  </span>
) : null);

/**
 * Thai has no spaces between words; in the copy a space separates phrases. A line may only break between phrases, never inside one,
 * and a number stays with the word before it and a short word after it ("ท็อป 8 รับ", "อีก 4 ริง", "นับ 2 เท่า"), so a line never
 * ends on "อีก" or starts with "2 เท่า". When the word before a number sits at the end of a long phrase, only that word is taken
 * (Intl.Segmenter), and the long phrase may break just before it. "·" and "›" stay with the phrase before them.
 * Each unit: t = text, wbr = it was split off a longer phrase (no space before it, but the line may break there).
 */
export interface Unit { t: string; wbr: boolean }
const IS_NUM = /^(\{n\}|\{rank\}|\{top\}|\{paid\}|\{floor\}|฿?\d[\d,]*)/;
const letters = (s: string) => s.replace(/\s*[·›]\s*/g, '').length;
type Seg = new (l: string, o: { granularity: 'word' }) => { segment(s: string): Iterable<{ segment: string; isWordLike?: boolean }> };
function lastWord(s: string): string {
  try {
    const S = (Intl as unknown as { Segmenter?: Seg }).Segmenter;
    if (!S) return s;   // older phones: the whole phrase stays together
    const words = [...new S('th', { granularity: 'word' }).segment(s)].filter((x) => x.isWordLike).map((x) => x.segment);
    return words.length ? words[words.length - 1] : s;
  } catch { return s; }
}
export function phrases(tpl: string): Unit[] {
  const u: Unit[] = [];
  for (const w of tpl.split(' ').filter(Boolean)) {
    if ((w === '·' || w === '›') && u.length) u[u.length - 1].t += ` ${w}`;
    else u.push({ t: w, wbr: false });
  }
  for (let i = 0; i < u.length; i++) {
    if (!IS_NUM.test(u[i].t)) continue;
    // a short word after the number joins it
    if (i + 1 < u.length && !IS_NUM.test(u[i + 1].t) && letters(u[i + 1].t) <= 5 && !/[A-Za-z]/.test(u[i + 1].t)) { u[i].t += ` ${u[i + 1].t}`; u.splice(i + 1, 1); }
    if (i === 0) continue;
    const prev = u[i - 1];
    if (/[·›]$/.test(prev.t)) continue;
    if (letters(prev.t) <= 8) { prev.t += ` ${u[i].t}`; u.splice(i, 1); i--; continue; }
    const w = lastWord(prev.t);
    if (w && w.length < prev.t.length && prev.t.endsWith(w)) { prev.t = prev.t.slice(0, -w.length); u[i] = { t: `${w} ${u[i].t}`, wbr: true }; }
  }
  return u;
}
const TOKEN = /(\{n\}|\{rank\}|\{top\})/;
function Live({ t, v }: { t: string; v: PrizeVals }) {
  return (
    <>
      {t.split(TOKEN).map((x, i) => x === '{n}' ? <Odo key={i} value={v.n} />
        : x === '{rank}' ? <Odo key={i} value={v.rank} />
        : x === '{top}' ? <b key={i} className="kpz-baht">{baht(v.top)}</b>
        : x ? <React.Fragment key={i}>{fill(x, v)}</React.Fragment> : null)}
    </>
  );
}
/** One line of copy with the live parts rendered: {n} and {rank} roll, {top} gets the prize sheen. */
function Line({ tpl, v, lang }: { tpl: string; v: PrizeVals; lang: 'th' | 'en' }) {
  const t = lang === 'en' && v.n === 1 ? tpl.replace('{n} Rings', '{n} Ring') : tpl;
  if (lang === 'en') return <Live t={t.replace(/ ([·›])/g, ' $1')} v={v} />;
  return (
    <>
      {phrases(t).map((p, i) => (
        <React.Fragment key={i}>
          {i ? (p.wbr ? <wbr /> : ' ') : null}
          <span className="kpz-ph"><Live t={p.t} v={v} /></span>
        </React.Fragment>
      ))}
    </>
  );
}
const plain = (l: PrizeLine, v: PrizeVals) => `${fill(l.th, v)} · ${fill(l.en, v)}`;

function useNow(fast: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, fast ? 1000 : 15000);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [fast]);
  return now;
}
function useRewardsOpen(now: number) {
  const [start, setStart] = useState<number | null>(null);
  useEffect(() => { let dead = false; void v5RewardStart().then((t) => { if (!dead) setStart(t); }); return () => { dead = true; }; }, []);
  return start !== null && now >= start;
}

export interface PrizeBannerProps {
  variant: 'ticker' | 'card';
  uid: string;
  week: KxRanking | null;
  onOpen: () => void;
  /** a hide on one surface hides the other at once */
  hideTick?: number;
  onHide?: () => void;
  /** T-301 (T301-008): the app language. Thai keeps Thai with English under it; any other language shows English only
   *  (an English screen never leads with Thai). */
  lang?: string;
}

export function PrizeBanner(props: PrizeBannerProps) {
  const { variant, uid, week } = props;
  const w = useMemo(() => (week ? weekIn(week) : null), [week]);
  const [fast, setFast] = useState(false);
  const now = useNow(fast);
  const open = useRewardsOpen(now);
  const pick: PrizePick | null = useMemo(() => pickPrize(w, now), [w, now]);
  const clock = useMemo(() => (w ? raceClock(now, w.endsAt) : null), [w, now]);
  useEffect(() => { setFast(!!clock?.last); }, [clock?.last]);
  const [hidden, setHidden] = useState(() => prizeHidden(uid, Date.now()));
  useEffect(() => { setHidden(prizeHidden(uid, now)); }, [uid, now, props.hideTick]);
  const [leaving, setLeaving] = useState(false);
  // rank change since the member last looked (this week); the rank they see now is remembered for next time
  const base = useMemo(() => seenRankAtStart(uid), [uid]);
  const delta = w ? rankDelta(base, w.weekStart, w.rank) : null;
  useEffect(() => { if (w && pick) rememberRank(uid, w.weekStart, w.rank); }, [uid, w, pick]);
  const leaveT = useRef<number>();
  useEffect(() => () => window.clearTimeout(leaveT.current), []);

  if (!pick || !clock || !open || hidden) return null;
  const copy = PRIZE_COPY[pick.kind];
  const v = pick.vals;
  const label = `${plain(copy.head, v)}. ${clock.th} · ${clock.en}`;
  const hide = () => {
    hidePrize(uid, Date.now());
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setHidden(true); props.onHide?.(); return; }
    setLeaving(true);
    leaveT.current = window.setTimeout(() => { setHidden(true); props.onHide?.(); }, 240);
  };
  const x = (
    <button type="button" className="kpz-x" aria-label="ซ่อนวันนี้ · Hide for today" onClick={hide}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg>
    </button>
  );

  if (variant === 'ticker') {
    // last 6 hours: the countdown joins the ticker (C / C25 only, with their shortest line so nothing is cut)
    const chip = clock.last && !!copy.tight;
    const line = chip && copy.tight ? copy.tight : copy.short;
    return (
      <div className={`kpz kpz-tick${leaving ? ' out' : ''}${clock.last ? ' last' : ''}`} id="kpzTicker" data-one={props.lang && props.lang !== 'th' ? 'en' : undefined} data-kind={pick.kind} role="group" aria-label="Kring weekly ranking">
        <button type="button" className="kpz-hit" onClick={props.onOpen} aria-label={label}>
          <RingsMeter progress={pick.progress} small />
          <span className="kpz-tx" key={pick.kind}>
            <span className="kpz-th"><Line tpl={line.th} v={v} lang="th" /></span>
            <span className="kpz-en"><Line tpl={line.en} v={v} lang="en" /></span>
          </span>
          {chip ? <span className="kpz-tcd" aria-hidden="true"><i className="kpz-dot" />{clock.en.replace('Ends ', '')}</span> : null}
        </button>
        {x}
        <i className="kpz-wk" aria-hidden="true"><i style={{ transform: `scaleX(${clock.frac})` }} /></i>
      </div>
    );
  }

  return (
    <div className={`kpz kpz-card${leaving ? ' out' : ''}${clock.last ? ' last' : ''}`} id="kpzCard" data-one={props.lang && props.lang !== 'th' ? 'en' : undefined} data-kind={pick.kind} role="group" aria-label="Kring weekly ranking">
      <button type="button" className="kpz-hit" onClick={props.onOpen} aria-label={label}>
        <span className="kpz-em">
          <RingsMeter progress={pick.progress} />
          {pick.rank ? <span className="kpz-rk" data-rank={pick.rank}><span className="h">#</span><Odo value={pick.rank} /><Delta d={delta} /></span> : null}
        </span>
        <span className="kpz-body" key={pick.kind}>
          <span className="kpz-h kpz-th"><Line tpl={copy.head.th} v={v} lang="th" /></span>
          <span className="kpz-h kpz-en"><Line tpl={copy.head.en} v={v} lang="en" /></span>
          <span className="kpz-s kpz-th"><Line tpl={copy.sub.th} v={v} lang="th" /></span>
          <span className="kpz-s kpz-en"><Line tpl={copy.sub.en} v={v} lang="en" /></span>
          <span className="kpz-foot">
            <span className="kpz-cd" data-last={clock.last ? '1' : '0'}>
              <i className="kpz-dot" aria-hidden="true" />
              <span className="kpz-cdt"><span className="kpz-th">{clock.th}</span><span className="kpz-en">{clock.en}</span></span>
            </span>
            {pick.stake ? (
              <span className="kpz-stake" data-prize={pick.stake.prize}>
                <b className="kpz-baht">{baht(pick.stake.prize)}</b>
                <span className="kpz-stk"><span className="kpz-th">รางวัลที่ {pick.stake.rank}</span><span className="kpz-en">#{pick.stake.rank} prize</span></span>
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {x}
    </div>
  );
}
