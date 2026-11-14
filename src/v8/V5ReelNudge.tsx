/* After a new member saves their card: a small "card saved" moment, then a soft nudge to post a first Reel.
   Shown once per member (stored on the phone), never blocks: tap outside, ✕ or "Later" closes it.
   Merit ranking only: early Reels can make the weekly Top 5 when the app opens on 1 Dec. */
import './reelNudge.css';
import { PerksStrip } from './V5Perks';

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

export function ReelNudgeSheet(props: { poster: string; video?: string; onPost: () => void; onLater: () => void; rulesHref?: string; backdrop?: boolean }) {
  return (
    <>
      {props.backdrop && <div className="sheet-backdrop rn-backdrop" onClick={props.onLater} />}
      <div className="v8-sheet rn-sheet" id="sh-reelnudge" role="dialog" aria-label="โพสต์รีลแรกไว้ก่อนเลย · Post your first Reel now">
        <div className="grab" />
        <button type="button" className="xbtn rn-x" aria-label="ไว้ทีหลัง · Later" onClick={props.onLater}>✕</button>
        <div className="rn-saved"><span className="rn-tick" aria-hidden="true">✓</span><span>บันทึกบัตรแล้ว<small>Your card is saved</small></span></div>
        <div className="rn-clip" style={{ backgroundImage: `url('${props.poster}')` }}>
          {props.video && <video src={props.video} poster={props.poster} muted autoPlay loop playsInline aria-hidden="true" />}
          <span className="rn-tag">บางปู · Bang Pu</span>
        </div>
        <h3 className="rn-title">โพสต์รีลแรกไว้ก่อนเลย<small>Post your first Reel now</small></h3>
        <p className="rn-copy">
          พอแอปเปิด 1 ธ.ค. รีลที่โพสต์ไว้ก่อนมีสิทธิ์ติดท็อป 5 · รางวัลรวมสูงสุด ฿4,000 ทุกสัปดาห์
          <small>When the app opens on 1 Dec, early Reels can make the Top 5 · up to ฿4,000 in rewards every week</small>
        </p>
        <PerksStrip />
        <button type="button" className="primary-cta rn-post" id="rnPost" onClick={props.onPost}>โพสต์รีล · Post a Reel</button>
        <div className="rn-foot">
          <button type="button" className="rn-later" id="rnLater" onClick={props.onLater}>ไว้ทีหลัง · Later</button>
          <a className="rn-rules" href={props.rulesHref || '/rules/'} target="_blank" rel="noopener">กติกา · Rules</a>
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
