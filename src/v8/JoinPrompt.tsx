/**
 * Join prompt for visitors from a shared Reel (25 Nov 2026, test build). A signed-out visitor who opened a shared Reel link
 * (?reel= / ?post=) gets one compact sheet after ~3 s of watching, or on their first like / follow / swipe: one-tap
 * "Continue with LINE" (primary) and Google. The Reel keeps playing behind it (no backdrop, nothing blocked), ✕ closes it,
 * at most once per visit. One language at a time. Shown / tapped / closed are logged as kr8_log_client 'join_prompt' (m217).
 */
import { useEffect, useRef, useState } from 'react';
import './joinPrompt.css';
import { LineLogo } from './V5Sheets';
import { inAppBrowser } from './A2HS';
import { liffUrl } from './lineEnv';
import { v5LineOn, v5LogClient, v5SignInGoogle, v5SignInLine, v5StoredRef } from './v5Live';

type Tx = { h: string; s: string; line: string; google: string; close: string; more: string };
const TX: Record<string, Tx> = {
  en: { h: 'Make new friends in Bangkok', s: 'Join free to like, follow and see more people and places.', line: 'Continue with LINE', google: 'Continue with Google', close: 'Close', more: 'Other ways to join' },
  th: { h: 'หาเพื่อนใหม่ในกรุงเทพฯ', s: 'สมัครฟรี กดไลก์ ติดตาม และเจอคนกับที่เที่ยวใหม่ๆ อีกเพียบ', line: 'เข้าสู่ระบบด้วย LINE', google: 'ดำเนินการต่อด้วย Google', close: 'ปิด', more: 'สมัครด้วยวิธีอื่น' },
  zh: { h: '在曼谷结识新朋友', s: '免费加入，点赞、关注，发现更多有趣的人和地方。', line: '使用 LINE 继续', google: '通过 Google 继续', close: '关闭', more: '其他加入方式' },
  hi: { h: 'बैंकॉक में नए दोस्त बनाइए', s: 'मुफ़्त जुड़ें — लाइक करें, फ़ॉलो करें और नए लोग व जगहें देखें।', line: 'LINE से जारी रखें', google: 'Google से जारी रखें', close: 'बंद करें', more: 'जुड़ने के दूसरे तरीके' },
  ja: { h: 'バンコクで新しい友だちをつくろう', s: '無料で参加して、いいね・フォローで、もっと多くの人と場所に出会おう。', line: 'LINE で続ける', google: 'Google で続ける', close: '閉じる', more: 'ほかの方法で参加' },
  ko: { h: '방콕에서 새 친구를 만나보세요', s: '무료로 가입하고 좋아요·팔로우로 더 많은 사람과 장소를 만나보세요.', line: 'LINE으로 계속하기', google: 'Google로 계속하기', close: '닫기', more: '다른 방법으로 가입' },
};
export const joinTx = (lang: string): Tx => TX[lang] || TX.en;

const SEEN = 'kr8_jp_shown';   // sessionStorage: at most once per visit
const CAME = 'kr8_jp_came';    // sessionStorage: set when a LINE / Google tap leaves the page (logged as signed_in on return)
export function joinPromptSeen(): boolean { try { return sessionStorage.getItem(SEEN) === '1'; } catch { return false; } }
export function markJoinPromptSeen(): void { try { sessionStorage.setItem(SEEN, '1'); } catch { /* private mode: once per page load */ } }
/** The visitor arrived on a shared Reel (?reel= or ?post=); read once at boot. */
export function cameFromSharedReel(search = typeof location === 'undefined' ? '' : location.search): boolean {
  try { const q = new URLSearchParams(search); return !!(q.get('reel') || q.get('post')); } catch { return false; }
}
/** After a LINE / Google tap from this sheet, the member comes back signed in: one 'signed_in' line for the funnel. */
export function joinPromptCameBack(): void {
  try { const w = sessionStorage.getItem(CAME); if (!w) return; sessionStorage.removeItem(CAME); v5LogClient('join_prompt', 'signed_in', w); } catch { /* ignore */ }
}

const googleHere = () => import.meta.env.VITE_GOOGLE_ON === '1' && !inAppBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent);

export function JoinPrompt(p: { lang: string; why: string; onClose: () => void; onFallback: () => void }) {
  const tx = joinTx(p.lang);
  const [busy, setBusy] = useState(false);
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    v5LogClient('join_prompt', 'shown', p.why);
  }, [p.why]);
  const liffJoin = import.meta.env.VITE_LIFF_ID && inAppBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent) !== 'line' ? liffUrl(v5StoredRef()) : '';
  const go = async (kind: 'line' | 'google') => {
    if (busy) return;
    setBusy(true);
    v5LogClient('join_prompt', kind, p.why);
    try { sessionStorage.setItem(CAME, kind); } catch { /* ignore */ }
    try {
      if (kind === 'line' && liffJoin) { window.location.assign(liffJoin); return; }
      const r = kind === 'line' ? await v5SignInLine() : await v5SignInGoogle();
      if (r !== 'redirect') { try { sessionStorage.removeItem(CAME); } catch { /* ignore */ } p.onFallback(); }
    } catch { p.onFallback(); } finally { setBusy(false); }
  };
  const close = () => { v5LogClient('join_prompt', 'close', p.why); p.onClose(); };
  const lineOn = v5LineOn();
  const goog = googleHere();
  return (
    <div className="jp" id="joinPrompt" role="dialog" aria-modal="false" aria-labelledby="jpH" lang={p.lang}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="jp-x" aria-label={tx.close} onClick={close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <h2 className="jp-h" id="jpH">{tx.h}</h2>
      <p className="jp-s">{tx.s}</p>
      <div className="jp-row">
        {lineOn && (
          <button type="button" className="jp-line" id="jpLine" disabled={busy} onClick={() => void go('line')}>
            <span className="jp-lg" aria-hidden="true"><LineLogo /></span>
            <span className="jp-lt">{tx.line}</span>
          </button>
        )}
        {goog && (
          <button type="button" className={`jp-goog${lineOn ? '' : ' wide'}`} id="jpGoogle" disabled={busy} aria-label={tx.google} onClick={() => void go('google')}>
            <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
            {!lineOn && <span>{tx.google}</span>}
          </button>
        )}
        {!lineOn && !goog && (
          <button type="button" className="jp-line jp-plain" id="jpMore" onClick={p.onFallback}><span className="jp-lt">{tx.h}</span></button>
        )}
      </div>
      {lineOn && !goog && (
        <button type="button" className="jp-more" id="jpMore2" disabled={busy} onClick={() => { v5LogClient('join_prompt', 'more', p.why); p.onFallback(); }}>{tx.more}</button>
      )}
    </div>
  );
}
