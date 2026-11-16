/* After a new member saves their card: a small "card saved" moment, then a soft nudge to post a first Reel.
   Shown once per member (stored on the phone), never blocks: tap outside, ✕ or "Later" closes it.
   Merit ranking only. The prize line reads the live rules (kr8_rings_rules): "Top 8 share ฿4,400 · a prize seat needs 25 Rings"
   (audit P1-3, 16 Nov: was a hard-coded "Top 5 · up to ฿4,000 … when the app opens on 1 Dec").
   Thai phones see Thai with English under; every other language sees one language (audit P3-15). */
import { useEffect, useState } from 'react';
import './reelNudge.css';
import { PerksStrip } from './V5Perks';
import { fmtBaht, ringsRules, weeklySeats, weeklyTotal, type RingsRules } from './rewardsConfig';
import { kxRules } from './v5Kx';

/** "Every week the Top 8 share ฿4,400 · a prize seat needs 25 Rings" in Thai and English, from the rules. */
export function prizeLine(r: RingsRules): { th: string; en: string } {
  const n = String(weeklySeats(r)), tot = fmtBaht(weeklyTotal(r)), floor = r.min_rings_for_paid_seat;
  return {
    th: `ทุกสัปดาห์ ท็อป ${n} แบ่งกัน ${tot}` + (floor > 0 ? ` · ต้องมี ${floor} ริงขึ้นไปถึงจะได้รางวัล` : ''),
    en: `Every week the Top ${n} share ${tot}` + (floor > 0 ? ` · a prize seat needs ${floor} Rings` : ''),
  };
}

const SEEN = 'kr8_reel_nudge_seen:';
const LATER = 'kr8_reel_nudge_later:';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

/** True only the first time for this member (and only if they have no Reel yet). */
export function shouldShowReelNudge(uid: string, hasReel: boolean): boolean {
  if (!uid || hasReel) return false;
  return get(SEEN + uid) !== '1';
}
export function markReelNudgeSeen(uid: string): void { if (uid) set(SEEN + uid, '1'); }
export function setReelNudgeLater(uid: string, on: boolean): void { if (uid) set(LATER + uid, on ? '1' : null); }
/** The Me-tab reminder chip shows after "Later" until the member has a Reel. */
export function showFirstReelChip(uid: string, hasReel: boolean): boolean {
  if (!uid) return false;
  if (hasReel) { setReelNudgeLater(uid, false); return false; }
  return get(LATER + uid) === '1';
}

type Tx = (en: string) => string;
export function ReelNudgeSheet(props: { poster: string; video?: string; onPost: () => void; onLater: () => void; rulesHref?: string; backdrop?: boolean;
  /** App language; 'th' (default) = Thai with English under. */ lang?: string; L?: Tx; rules?: Record<string, number> | null }) {
  const [server, setServer] = useState<Record<string, number> | null>(props.rules ?? null);
  useEffect(() => {
    if (props.rules) return;
    let dead = false;
    kxRules().then((r) => { if (!dead && r && typeof r === 'object') setServer(r); }).catch(() => { /* defaults stay */ });
    return () => { dead = true; };
  }, [props.rules]);
  const thai = !props.lang || props.lang === 'th';
  const L: Tx = props.L || ((en) => en);
  /** Thai phones: Thai + English under. Others: one line in their language (English key through L). */
  const bi = (th: string, en: string, small = true) => (thai ? <>{th}{small ? <small>{en}</small> : ` · ${en}`}</> : <>{L(en)}</>);
  const R = ringsRules(server);
  const line = prizeLine(R);
  const lineL = L('Every week the Top {0} share {1}').replace('{0}', String(weeklySeats(R))).replace('{1}', fmtBaht(weeklyTotal(R)))
    + (R.min_rings_for_paid_seat > 0 ? ` · ${L('a prize seat needs {0} Rings').replace('{0}', String(R.min_rings_for_paid_seat))}` : '');
  return (
    <>
      {props.backdrop && <div className="sheet-backdrop rn-backdrop" onClick={props.onLater} />}
      <div className="v8-sheet rn-sheet" id="sh-reelnudge" role="dialog" aria-label={thai ? 'โพสต์รีลแรกไว้ก่อนเลย · Post your first Reel now' : L('Post your first Reel now')}>
        <div className="grab" />
        <button type="button" className="xbtn rn-x" aria-label={thai ? 'ไว้ทีหลัง · Later' : L('Later')} onClick={props.onLater}>✕</button>
        <div className="rn-saved"><span className="rn-tick" aria-hidden="true">✓</span><span>{bi('บันทึกบัตรแล้ว', 'Your card is saved')}</span></div>
        <div className="rn-clip" style={{ backgroundImage: `url('${props.poster}')` }}>
          {props.video && <video src={props.video} poster={props.poster} muted autoPlay loop playsInline aria-hidden="true" />}
          <span className="rn-tag">{thai ? 'บางปู · Bang Pu' : 'Bang Pu'}</span>
        </div>
        <h3 className="rn-title">{bi('โพสต์รีลแรกไว้ก่อนเลย', 'Post your first Reel now')}</h3>
        <p className="rn-copy" id="rnPrize">{thai ? <>{line.th}<small>{line.en}</small></> : lineL}</p>
        <PerksStrip thai={thai} />
        <button type="button" className="primary-cta rn-post" id="rnPost" onClick={props.onPost}>{bi('โพสต์รีล', 'Post a Reel', false)}</button>
        <div className="rn-foot">
          <button type="button" className="rn-later" id="rnLater" onClick={props.onLater}>{bi('ไว้ทีหลัง', 'Later', false)}</button>
          <a className="rn-rules" href={props.rulesHref || '/rules/'} target="_blank" rel="noopener">{bi('กติกา', 'Rules', false)}</a>
        </div>
      </div>
    </>
  );
}

export function FirstReelChip(props: { onPost: () => void }) {
  return (
    <button type="button" className="rn-chip" id="meFirstReelChip" onClick={props.onPost}>
      <span className="rn-dot" aria-hidden="true" />โพสต์รีลแรก · Post your first Reel <span aria-hidden="true">›</span>
    </button>
  );
}
