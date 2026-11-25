/**
 * Share & win Rings (founder 22 Nov, layout C): kringapp.com/app/?open=share, and the small "Share & win Rings" line on the weekly
 * board, open ONE light-glass sheet: title "{N} Rings to a prize 🏆" (in a prize seat: "Hold your seat 🏆 #k"), my rank + when the
 * board closes, two big tiles (+10 Invite a friend → phone share sheet with my ?ref= link; +5 Share my Reel → the existing Reel share
 * link of my best Reel this week, or "Post a Reel first"), the icon row LINE · Facebook · IG Story · My Reel +5 · Copy, one ask line.
 * Invite rules unchanged (both get +10 once the friend passes the face check). One language at a time: Thai mode Thai, else English.
 */
import './shareWin.css';

export const shareWinText = (lang: string): string => (lang === 'th'
  ? 'มาเล่นกริ๊ง! ด้วยกัน 🙌 สมัครผ่านลิงก์นี้ ยืนยันหน้า ได้ +10 ริงทั้งคู่'
  : 'Join me on Kring! 🙌 Sign up with my link + face check and we both get +10 Rings');
export const facebookShareUrl = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

type Hook = { rank: number | null; prize: number; toLine: number | null; needs?: number | null } | null;
/** Title + sub-line from the board hook. closes = the board's real close time already formatted ("tonight 23:59" / "Sun 23:59"). */
export function shareWinHead(lang: string, h: Hook, rings: number, closes: string): { title: string; sub: string } {
  const th = lang === 'th';
  const sub = (r: string) => [r, closes ? (th ? `ปิดบอร์ด ${closes}` : `board closes ${closes}`) : ''].filter(Boolean).join(' · ');
  if (!h || !h.rank) return { title: th ? 'แชร์รับริง' : 'Share & win Rings', sub: sub('') };
  const you = th ? `คุณอยู่อันดับ ${h.rank}` : `You’re #${h.rank}`;
  const n = h.prize > 0 ? (h.needs ? Math.max(1, h.needs - rings) : 0) : (h.toLine || 0);
  if (n > 0) return { title: th ? `อีก ${n} ริงได้รางวัล 🏆` : `${n} ${n === 1 ? 'Ring' : 'Rings'} to a prize 🏆`, sub: sub(you) };
  if (h.prize > 0) return { title: th ? `รักษาอันดับไว้ 🏆 #${h.rank}` : `Hold your seat 🏆 #${h.rank}`, sub: sub(you) };
  return { title: th ? 'แชร์รับริง' : 'Share & win Rings', sub: sub(you) };
}
/** "tonight 23:59" when the board closes today (Bangkok), else the board's own "Sun 23:59". */
const EN_D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TH_D = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export function closesWhen(end: number, lang: string, now = Date.now()): string {
  const bkk = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
  const b = new Date(end - 60_000 + 7 * 3600_000);
  const hm = `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`;
  if (end > now && bkk(end - 60_000) === bkk(now)) return lang === 'th' ? `คืนนี้ ${hm}` : `tonight ${hm}`;
  return `${(lang === 'th' ? TH_D : EN_D)[b.getUTCDay()]} ${hm}`;
}

const LineIc = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s5.9-3.5 8-6C21.4 14.2 22 12.7 22 11c0-4.4-4.5-8-10-8Z" /></svg>);
const FbIc = () => (<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1Z" /></svg>);
const IgIc = () => (<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>);
const LinkIc = () => (<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>);
const ReelIc = () => (<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" /></svg>);

export function ShareWinSheet(props: { lang: string; title: string; sub: string; hasReel: boolean; onClose: () => void; onShare: () => void;
  onLine: () => void; onFacebook: () => void; onCopy: () => void; onReel: () => void; onPost: () => void; onReelDown?: () => void;
  /** 25 Nov open onboarding: one line telling the member their friends can join without the face check ('' = none) */
  openJoin?: string }) {
  const th = props.lang === 'th';
  const t = th
    ? { inv: 'ชวนเพื่อน', invS: '(ได้ทั้งคู่)', reel: 'แชร์รีลของฉัน', reelS: '(ต่อเพื่อนที่เปิดดู)', post: 'โพสต์รีลก่อน', story: 'IG Story', myReel: 'รีลฉัน +5', copy: 'คัดลอก', tip: '💡 แชร์ลงกลุ่ม Facebook (มหาลัย · ย่านบ้าน · กลุ่มที่ชอบ) ได้ผลที่สุด', ask: 'ขอให้เพื่อนช่วยแชร์ต่อด้วยนะ 🙏', close: 'ปิด', label: 'แชร์รับริง' }
    : { inv: 'Invite a friend', invS: '(you both get it)', reel: 'Share my Reel', reelS: '(per friend who opens)', post: 'Post a Reel first', story: 'IG Story', myReel: 'My Reel +5', copy: 'Copy', tip: '💡 Facebook groups work best (uni · your area · hobby groups)', ask: 'Ask friends to share it on 🙏', close: 'Close', label: 'Share & win Rings' };
  const reelTap = props.hasReel ? props.onReel : props.onPost;
  return (
    <div className="kx-shbg sw-bg" id="kxShareWinBg" onClick={props.onClose}>
      <div className="bx-sharesheet sw-sheet" id="kxShareWin" role="dialog" aria-modal="true" aria-label={t.label} lang={th ? 'th' : 'en'} onClick={(e) => e.stopPropagation()}>
        <span className="grab" />
        <button type="button" className="sw-x" id="kxShareWinClose" aria-label={t.close} onClick={props.onClose}>×</button>
        <h2 className="sw-t" id="kxShareWinTitle">{props.title}</h2>
        {props.sub ? <p className="sw-rank" id="kxShareWinRank">{props.sub}</p> : null}
        <div className="sw-two">
          <button type="button" className="sw-tile inv" id="kxShareWinGo" onClick={props.onShare}>
            <b>+10</b><span>{t.inv}</span><small>{t.invS}</small>
          </button>
          <button type="button" className="sw-tile reel" id="kxShareWinReelTile" data-has={props.hasReel ? '1' : '0'} onPointerDown={props.onReelDown} onClick={reelTap}>
            <b>+5</b><span>{props.hasReel ? t.reel : t.post}</span>{props.hasReel ? <small>{t.reelS}</small> : null}
          </button>
        </div>
        <div className="sw-row">
          <button type="button" className="sw-b line" id="kxShareWinLine" onClick={props.onLine}><span className="ic"><LineIc /></span><span className="tx">LINE</span></button>
          <button type="button" className="sw-b fb" id="kxShareWinFb" onClick={props.onFacebook}><span className="ic"><FbIc /></span><span className="tx">Facebook</span></button>
          <button type="button" className="sw-b ig" id="kxShareWinIg" onClick={props.onShare}><span className="ic"><IgIc /></span><span className="tx">{t.story}</span></button>
          <button type="button" className="sw-b" id="kxShareWinReel" onPointerDown={props.onReelDown} onClick={reelTap}><span className="ic"><ReelIc /></span><span className="tx">{t.myReel}</span></button>
          <button type="button" className="sw-b" id="kxShareWinCopy" onClick={props.onCopy}><span className="ic"><LinkIc /></span><span className="tx">{t.copy}</span></button>
        </div>
        {props.openJoin ? <p className="sw-open" id="kxShareWinOpen"><span aria-hidden="true">✨</span>{props.openJoin}</p> : null}
        <p className="sw-tip" id="kxShareWinTip">{t.tip}</p>
        <p className="sw-ask">{t.ask}</p>
      </div>
    </div>
  );
}
