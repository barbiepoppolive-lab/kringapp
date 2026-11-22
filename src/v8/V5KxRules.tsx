/**
 * "How to win" rules (Poppo-style) — three looks for the founder to pick from (rules-ui, 17 Nov). Preview only:
 * shown when ?rules=A|B|C (or localStorage kr8_rules_ui) is set; without it the ranking page is unchanged.
 * Every number comes from kr8_rings_rules (live config) and kr8_weekly_ranking; nothing here is hard-coded.
 *   A · glass sheet with icon rows      B · gold rule scroll with a prize ladder      C · illustrated step cards 1-2-3
 * Also: the pinned "You" bar (next goal + cheapest way there + Share my Reel) and the "+3 Mint saved your Reel" toast.
 */
import React from 'react';
import './rules.css';
import { fmtN } from './kxLogic';
import { RingGlyph } from './V5KxCard';
import type { KxRanking } from './v5Kx';

export type RulesVariant = 'A' | 'B' | 'C';
export function rulesVariant(): RulesVariant | null {
  try {
    const q = new URLSearchParams(location.search).get('rules');
    const v = (q || localStorage.getItem('kr8_rules_ui') || '').toUpperCase();
    if (q) localStorage.setItem('kr8_rules_ui', v);
    if (v === 'OFF') return null;
    return v === 'A' || v === 'B' || v === 'C' ? v : 'C';   // founder picked C (17 Nov)
  } catch { return null; }
}

/** The live numbers the sheet shows (kr8_rings_rules + the ranking's prizes/floor). */
export interface WinRules { like: number; save: number; open: number; cap: number; mult: number; best: number; floor: number; prizes: number[] }
export function winRules(cfg: Record<string, number> | null, rk: KxRanking | null): WinRules | null {
  if (!cfg) return null;
  const paid = rk?.paid_ranks ?? 8;
  const prizes = rk?.prizes?.length ? rk.prizes.slice(0, paid) : Array.from({ length: paid }, (_, i) => Number(cfg[`prize_${i + 1}`]) || 0);
  return { like: cfg.like, save: cfg.save, open: cfg.open, cap: cfg.opens_day_cap, mult: cfg.traveller_mult, best: cfg.best_reels,
    floor: rk?.floor ?? cfg.min_rings_for_paid_seat, prizes: prizes.filter((p) => p > 0) };
}

const B = (n: number) => `฿${fmtN(n)}`;
/** One language at a time (founder rule, 18 Nov): Thai alone in Thai mode, English alone otherwise. Never Thai with an English sub-line. */
function Bi({ th, en, lang, cls }: { th: string; en: string; lang: string; cls?: string }) {
  return lang === 'th'
    ? <span className={`bi ${cls || ''}`}><span lang="th" className="th">{th}</span></span>
    : <span className={`bi ${cls || ''}`}><span lang="en">{en}</span></span>;
}
const pick = (lang: string, th: string, en: string) => (lang === 'th' ? th : en);

/* ───────────── entry strip under the title ───────────── */
export function WinEntry({ v, lang, total, seats, onOpen }: { v: RulesVariant; lang: string; total: number; seats: number; onOpen: () => void }) {
  return (
    <div className={`rw-entry v${v}`} id="kxWinEntry">
      <button type="button" className="rw-how" id="kxWinOpen" onClick={onOpen}>
        <i className="ic" aria-hidden="true">{v === 'B' ? '📜' : v === 'C' ? '🏆' : '?'}</i>
        <span>{pick(lang, 'วิธีชนะ', 'How to win')}</span>
        <b aria-hidden="true">›</b>
      </button>
      {total > 0 ? (
        <span className="rw-pot">
          <Bi lang={lang} th={`${seats} อันดับแรกแบ่ง ${B(total)}`} en={`Top ${seats} share ${B(total)}`} />
        </span>
      ) : null}
    </div>
  );
}

/* ───────────── the sheet ───────────── */
interface SheetProps { v: RulesVariant; lang: string; r: WinRules; onClose: () => void; /** Board V2: light glass sheet */ glass?: boolean; /** board-1: extra lines (seats left) moved here from the header */ extra?: React.ReactNode }

function earnRows(r: WinRules) {
  return [
    { k: 'like', ic: '❤️', pts: `+${r.like}`, th: 'มีคนกดไลก์รีลของคุณ', en: 'Someone likes your Reel' },
    { k: 'save', ic: '🔖', pts: `+${r.save}`, th: 'มีคนกดเซฟรีลของคุณ', en: 'Someone saves your Reel' },
    { k: 'open', ic: '🔗', pts: `+${r.open}`, th: `คนเปิดลิงก์ที่คุณแชร์ · สูงสุด ${r.cap}/วัน`, en: `Someone opens your share link · max ${r.cap}/day` },
    { k: 'trav', ic: '✈️', pts: `×${r.mult}`, th: `นักท่องเที่ยว (ยืนยันแล้ว) ไลก์/เซฟ = ${r.mult} เท่า`, en: `Verified traveller’s like or save ×${r.mult}` },
  ];
}
function fineRows(r: WinRules) {
  return [
    { k: 'floor', ic: '🎯', th: `ต้องมีอย่างน้อย ${r.floor} ริง ถึงจะมีสิทธิ์รับรางวัล`, en: `${r.floor} Rings to be eligible for a prize` },
    { k: 'best', ic: '⭐', th: r.best <= 1 ? 'นับเฉพาะรีลที่ดีที่สุดของคุณ 1 รีล' : `นับ ${r.best} รีลที่ดีที่สุดของคุณ`, en: r.best <= 1 ? 'Only your best Reel counts' : `Your best ${r.best} Reels count` },
    { k: 'end', ic: '⏰', th: 'ปิดรอบทุกวันอาทิตย์ 23:59 น. (เวลากรุงเทพฯ)', en: 'Week ends Sunday 23:59, Bangkok time' },
    { k: 'pay', ic: '💸', th: 'รับรางวัลเป็นโค้ด TrueMoney ในแอป', en: 'Paid as TrueMoney codes in the app' },
  ];
}

export function WinSheet({ v, lang, r, onClose, glass, extra }: SheetProps) {
  const total = r.prizes.reduce((a, b) => a + b, 0);
  const title = <h2 className="rw-h"><Bi lang={lang} th="วิธีชนะ" en="How to win" /></h2>;
  const sub = <p className="rw-sub"><Bi lang={lang} th={`ทุกสัปดาห์ ${r.prizes.length} อันดับแรกแบ่งกัน ${B(total)}`} en={`Every week the top ${r.prizes.length} share ${B(total)}`} /></p>;
  const ok = <>{extra}<button type="button" className="rw-ok" id="kxWinOk" onClick={onClose}>{pick(lang, 'เข้าใจแล้ว', 'Got it')}</button></>;
  let body: React.ReactNode;
  if (v === 'A') {
    body = (
      <>
        <div className="rw-hero"><i className="rw-orb"><RingGlyph size={26} /></i>{title}{sub}</div>
        <p className="rw-lab"><Bi lang={lang} th="เก็บริงยังไง" en="How you earn Rings" /></p>
        <div className="rw-rows">
          {earnRows(r).map((x) => (
            <div className="rw-row" key={x.k} data-rule={x.k}><i className="ic">{x.ic}</i><Bi lang={lang} th={x.th} en={x.en} /><b className="pts">{x.pts}</b></div>
          ))}
        </div>
        <p className="rw-lab"><Bi lang={lang} th="รางวัลประจำสัปดาห์" en="This week’s prizes" /></p>
        <div className="rw-grid">
          {r.prizes.map((p, i) => <div key={i} className={`rw-pz r${i + 1}`}><span>#{i + 1}</span><b>{B(p)}</b></div>)}
        </div>
        <div className="rw-fine">
          {fineRows(r).map((x) => <div className="rw-frow" key={x.k} data-rule={x.k}><i>{x.ic}</i><Bi lang={lang} th={x.th} en={x.en} /></div>)}
        </div>
        {ok}
      </>
    );
  } else if (v === 'B') {
    const max = Math.max(...r.prizes);
    body = (
      <>
        <div className="rw-scroll-top"><span className="rw-rod" />{title}{sub}<span className="rw-rod b" /></div>
        <div className="rw-ladder">
          {r.prizes.slice(0, 3).map((p, i) => (
            <div key={i} className={`rw-step r${i + 1}`}>
              <span className="rk">{i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}</span>
              <span className="bar"><i style={{ width: `${Math.max(14, Math.round((p / max) * 100))}%` }} /></span>
              <b>{B(p)}</b>
            </div>
          ))}
          <div className="rw-rest">{r.prizes.slice(3).map((p, i) => <span key={i}><small>#{i + 4}</small>{B(p)}</span>)}</div>
        </div>
        <ol className="rw-scroll">
          {earnRows(r).map((x) => (
            <li key={x.k} data-rule={x.k}><b className="pts">{x.pts}</b><Bi lang={lang} th={x.th} en={x.en} /></li>
          ))}
          {fineRows(r).map((x) => <li key={x.k} className="fine" data-rule={x.k}><i>{x.ic}</i><Bi lang={lang} th={x.th} en={x.en} /></li>)}
        </ol>
        {ok}
      </>
    );
  } else {
    const steps = [
      // rules v2 (30 Nov): Daily Card · streak + reactions · friends · top 8
      { n: 1, art: '📸', th: 'ทำภารกิจรายวัน', en: 'Do your Daily Card',
        chips: [{ th: '📸 รูป +3', en: '📸 Photo +3' }, { th: '🎬 รีล +5', en: '🎬 Reel +5' }, { th: '💬 ถาม BKK +3', en: '💬 Ask BKK +3' },
          { th: '▶️ ดู 3 อัน +1', en: '▶️ Watch 3 +1' }] },
      { n: 2, art: <RingGlyph />, th: 'ต่อเนื่องทุกวัน + มีคนทักรีลคุณ', en: 'Keep your streak, get reactions',
        chips: [{ th: '🔥 3 วัน +5', en: '🔥 3 days +5' }, { th: '🔥 5 วัน +10', en: '🔥 5 days +10' }, { th: '🔥 7 วัน +20', en: '🔥 7 days +20' },
          { th: '👋 +1 ต่อคน', en: '👋 +1 per person' }, { th: `✈️ ×${r.mult}`, en: `✈️ ×${r.mult}` }] },
      { n: 3, art: '👯', th: 'ชวนเพื่อนมาเล่น', en: 'Bring friends',
        chips: [{ th: 'เพื่อนสมัคร +5', en: 'Friend joins +5' }, { th: 'เล่นครบ 3 วัน +10', en: 'Active 3 days +10' }, { th: 'สูงสุด 60/สัปดาห์', en: 'max 60/week' }] },
      { n: 4, art: '🏆', th: `ติด ${r.prizes.length} อันดับแรก รับรางวัลทุกสัปดาห์`, en: `Make the top ${r.prizes.length}, win every week`,
        chips: [{ th: `อันดับ 1 ${B(r.prizes[0])}`, en: `#1 ${B(r.prizes[0])}` }, { th: `ขั้นต่ำ ${r.floor} ริง`, en: `${r.floor} Rings to qualify` }] },
    ];
    body = (
      <>
        {title}{sub}
        <div className="rw-steps">
          {steps.map((s) => (
            <div key={s.n} className={`rw-card s${s.n}`} data-step={s.n}>
              <span className="num">{s.n}</span>
              <i className="art" aria-hidden="true">{s.art}</i>
              <div className="tx">
                <Bi lang={lang} th={s.th} en={s.en} cls="ttl" />
                <div className="chips">{s.chips.map((c, i) => <span key={i} className="chip">{pick(lang, c.th, c.en)}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="rw-legend"><Bi lang={lang} th={'👋 คนคอมเมนต์หรือโบกมือ (สูงสุด 30/สัปดาห์) · ✈️ นักท่องเที่ยว'} en={'👋 each member who comments or waves (max 30/week) · ✈️ verified traveller'} /></p>
        <div className="rw-ladc">{r.prizes.map((p, i) => <span key={i} className={`r${i + 1}`}><small>#{i + 1}</small>{B(p)}</span>)}</div>
        <div className="rw-fine">
          {fineRows(r).filter((x) => x.k !== 'floor' && x.k !== 'best').map((x) => <div className="rw-frow" key={x.k} data-rule={x.k}><i>{x.ic}</i><Bi lang={lang} th={x.th} en={x.en} /></div>)}
        </div>
        {ok}
      </>
    );
  }
  return (
    <div className="kx-shbg rw-bg" onClick={onClose}>
      <div className={`rw-sheet v${v}${lang === 'th' ? ' lth' : ''}${glass ? ' glass' : ''}`} id="kxWin" role="dialog" aria-label={pick(lang, 'วิธีชนะ', 'How to win')} onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        {body}
      </div>
    </div>
  );
}

/* ───────────── the pinned You bar ───────────── */
export interface YouState { key: 'none' | 'below' | 'qual' | 'top'; rank: number | null; rings: number; need: number; target: number | null; prizeNow: number; behind: number | null }
/** Reads the server's gap (kr8_weekly_ranking): below the floor, in a paid seat, or #1. */
export function youState(rk: KxRanking | null): YouState {
  const g = rk?.gap;
  if (!g || !g.rank || g.rings <= 0) return { key: 'none', rank: null, rings: g?.rings || 0, need: 0, target: null, prizeNow: 0, behind: null };
  if (g.state === 'top') return { key: 'top', rank: 1, rings: g.rings, need: 0, target: null, prizeNow: g.prize_now, behind: g.behind?.diff ?? null };
  if (g.rings < g.floor) return { key: 'below', rank: g.rank, rings: g.rings, need: g.floor - g.rings, target: null, prizeNow: 0, behind: null };
  return { key: 'qual', rank: g.rank, rings: g.rings, need: g.target?.need ?? 0, target: g.target?.rank ?? null, prizeNow: g.prize_now, behind: g.behind?.diff ?? null };
}

export function YouBar(props: { v: RulesVariant; lang: string; r: WinRules; s: YouState; photo: string | null; name: string; onShare: () => void; onPost: () => void }) {
  const { v, lang, r, s } = props;
  const rt = (n: number) => fmtN(n);
  let goalTh = '', goalEn = '', wayTh = '', wayEn = '', pct = 0;
  if (s.key === 'none') { goalTh = 'โพสต์รีล 1 รีลเพื่อติดบอร์ด'; goalEn = 'One Reel puts you on the board'; wayTh = `เซฟละ +${r.save}`; wayEn = `each save = +${r.save}`; }
  else if (s.key === 'below') {
    goalTh = `อีก ${rt(s.need)} ริง ถึงจะมีสิทธิ์รับรางวัล`; goalEn = `${rt(s.need)} more Rings to qualify`;
    const saves = Math.ceil(s.need / r.save), opens = Math.ceil(s.need / r.open);
    wayTh = `เซฟละ +${r.save} · อีก ${saves} เซฟ หรือ ${opens} คนเปิดลิงก์`; wayEn = `each save = +${r.save} · ${saves} saves or ${opens} link opens`;
    pct = Math.min(100, Math.round((s.rings / r.floor) * 100));
  } else if (s.key === 'qual') {
    goalTh = s.target ? `อีก ${rt(s.need)} ริง ขึ้นอันดับ ${s.target}` : `ได้ ${B(s.prizeNow)} ตอนนี้`;
    goalEn = s.target ? `${rt(s.need)} Rings to take #${s.target}` : `${B(s.prizeNow)} now`;
    const saves = Math.ceil(s.need / r.save);
    wayTh = `เซฟละ +${r.save} · อีก ${saves} เซฟก็แซงได้`; wayEn = `each save = +${r.save} · ${saves} saves to pass`;
    pct = s.need > 0 ? Math.max(8, Math.min(96, Math.round((s.rings / (s.rings + s.need)) * 100))) : 100;
  } else {
    goalTh = s.behind != null ? `อันดับ 2 ตามหลังคุณ ${rt(s.behind)} ริง` : 'คุณอยู่อันดับ 1'; goalEn = s.behind != null ? `#2 is ${rt(s.behind)} Rings behind you` : 'You’re #1';
    wayTh = `แชร์ต่อ · คนเปิดลิงก์ละ +${r.open}`; wayEn = `keep sharing · each link open = +${r.open}`; pct = 100;
  }
  const rankLabel = s.key === 'none'
    ? <Bi lang={lang} th="ยังไม่ติดบอร์ด" en="Not on the board yet" cls="rk0" />
    : <span className="rkn">#{s.rank}<span className="rg">{fmtN(s.rings)} <RingGlyph /></span></span>;
  const prizeTag = s.key === 'qual' || s.key === 'top' ? <span className="rw-now">{B(s.prizeNow)}</span>
    : s.key === 'below' ? <span className="rw-now off" lang={lang}>{pick(lang, 'ยังไม่มีสิทธิ์', 'not yet eligible')}</span> : null;
  const share = s.key === 'none'
    ? <button type="button" className="rw-share" id="kxYouShare" onClick={props.onPost}>{pick(lang, 'โพสต์รีล', 'Post a Reel')}</button>
    : <button type="button" className="rw-share" id="kxYouShare" onClick={props.onShare}><i aria-hidden="true">↗</i>{pick(lang, 'แชร์รีล', 'Share my Reel')}</button>;
  return (
    <div className={`rw-you v${v} s-${s.key}${lang === 'th' ? ' lth' : ''}`} id="kxYouBar" data-state={s.key} style={{ ['--rw-pc' as string]: `${pct}%` }}>
      <span className="rw-ava">
        <i className="kx-av" style={props.photo ? { backgroundImage: `url('${props.photo}')` } : undefined}>{props.photo ? '' : (props.name || '?').charAt(0).toUpperCase()}</i>
        {s.key === 'top' ? <span className="crown" aria-hidden="true">👑</span> : null}
      </span>
      <span className="rw-mid">
        <span className="rw-l1">{rankLabel}{prizeTag}</span>
        <span className="rw-goal"><Bi lang={lang} th={goalTh} en={goalEn} /></span>
        {v !== 'A' && s.key !== 'none' ? <span className="rw-track"><i /></span> : null}
        <span className="rw-way">{pick(lang, wayTh, wayEn)}</span>
      </span>
      {share}
    </div>
  );
}

/* ───────────── "+3 Mint saved your Reel" toast (visual) ───────────── */
export function RingToast({ v, lang, pts, who, act }: { v: RulesVariant; lang: string; pts: number; who: string; act: 'save' | 'like' | 'open' }) {
  const th = act === 'save' ? `${who} เซฟรีลของคุณ` : act === 'like' ? `${who} ไลก์รีลของคุณ` : `มีคนเปิดลิงก์รีลของคุณ`;
  const en = act === 'save' ? `${who} saved your Reel` : act === 'like' ? `${who} liked your Reel` : 'Someone opened your Reel link';
  return (
    <div className={`rw-toast v${v}`} id="kxRingToast" role="status">
      <b className="pts">+{pts} <RingGlyph /></b>
      <Bi lang={lang} th={th} en={en} />
    </div>
  );
}
