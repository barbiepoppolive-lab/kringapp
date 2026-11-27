/**
 * Invite welcome (27 Nov 2026, founder "go as per your recommendation", variant 2 then 3).
 * A signed-out visitor who arrived on a member's invite link (?ref=k00114, ?ref=pich) sees, once per invite, a full invitation card:
 * the inviter's face and first name, one promise, one green "Accept the invitation with LINE" button and a soft "Watch Reels first".
 * After "Watch Reels first" (or ✕) a quiet bar with the same LINE button stays at the bottom while they browse. Nothing else changes.
 * Logged as kr8_log_client 'invite_welcome' (shown / bar / line / google / look). One language at a time.
 */
import { useEffect, useRef } from 'react';
import './inviteWelcome.css';
import { LineLogo } from './V5Sheets';
import { useJoinGo } from './JoinPrompt';
import { v5LogClient } from './v5Live';

export type Inviter = { name: string; photo: string | null };
type Tx = { k: (n: string) => string; h: string; s: string; ok: string; line: string; google: string; look: string; fine: string; bar: string; close: string; pill: (n: string) => string };
const TX: Record<string, Tx> = {
  en: { k: (n) => `An invitation from ${n}`, h: 'Come be friends on Kring!', s: 'The app for new friends in Bangkok. Watch Reels from real Bangkok people and say hi to people who like the same spots.',
    ok: 'Everyone is face-verified', line: 'Accept the invitation with LINE', google: 'Continue with Google', look: 'Watch Reels first', fine: 'Free · 18+ · takes 1 minute',
    bar: 'Join with LINE · free', close: 'Close', pill: (n) => `${n} invited you` },
  th: { k: (n) => `คำเชิญจาก ${n}`, h: 'มาเป็นเพื่อนกันในกริ๊ง!', s: 'แอปหาเพื่อนใหม่ในกรุงเทพฯ ดูรีลจากคนกรุงเทพฯ ตัวจริง แล้วทักทายคนที่ชอบที่เดียวกัน',
    ok: 'ทุกคนยืนยันใบหน้าแล้ว', line: 'รับคำเชิญด้วย LINE', google: 'ดำเนินการต่อด้วย Google', look: 'ดูรีลก่อน', fine: 'ฟรี · 18+ · ใช้เวลา 1 นาที',
    bar: 'เข้าร่วมด้วย LINE · ฟรี', close: 'ปิด', pill: (n) => `${n} ชวนคุณมา` },
  zh: { k: (n) => `来自 ${n} 的邀请`, h: '来 Kring 做朋友吧！', s: '在曼谷结识新朋友的应用。看真实曼谷人的短视频，和喜欢同样地方的人打招呼。',
    ok: '每位成员都已人脸验证', line: '用 LINE 接受邀请', google: '通过 Google 继续', look: '先看看短视频', fine: '免费 · 18+ · 只需 1 分钟',
    bar: '用 LINE 加入 · 免费', close: '关闭', pill: (n) => `${n} 邀请了你` },
  hi: { k: (n) => `${n} का न्योता`, h: 'Kring पर दोस्त बनिए!', s: 'बैंकॉक में नए दोस्तों का ऐप। असली बैंकॉक वालों की Reels देखिए और उन्हीं जगहों को पसंद करने वालों को हाय कहिए।',
    ok: 'हर सदस्य का चेहरा सत्यापित है', line: 'LINE से न्योता स्वीकार करें', google: 'Google से जारी रखें', look: 'पहले Reels देखें', fine: 'मुफ़्त · 18+ · 1 मिनट',
    bar: 'LINE से जुड़ें · मुफ़्त', close: 'बंद करें', pill: (n) => `${n} ने आपको बुलाया` },
  ja: { k: (n) => `${n} からの招待`, h: 'Kring で友だちになろう！', s: 'バンコクで新しい友だちをつくるアプリ。地元の人のリールを見て、同じ場所が好きな人にあいさつしよう。',
    ok: '全員が顔認証済み', line: 'LINE で招待を受ける', google: 'Google で続ける', look: '先にリールを見る', fine: '無料 · 18+ · 1分で完了',
    bar: 'LINE で参加 · 無料', close: '閉じる', pill: (n) => `${n} から招待されました` },
  ko: { k: (n) => `${n}님의 초대`, h: 'Kring에서 친구가 되어요!', s: '방콕에서 새 친구를 만나는 앱. 진짜 방콕 사람들의 릴스를 보고, 같은 곳을 좋아하는 사람에게 인사해 보세요.',
    ok: '모든 멤버가 얼굴 인증을 마쳤어요', line: 'LINE으로 초대 수락하기', google: 'Google로 계속하기', look: '릴스 먼저 보기', fine: '무료 · 18+ · 1분이면 끝',
    bar: 'LINE으로 가입 · 무료', close: '닫기', pill: (n) => `${n}님이 초대했어요` },
};
export const inviteTx = (lang: string): Tx => TX[lang] || TX.en;
/** "Pichy Review💗" → "Pichy": first word, no emoji, at most 18 characters. */
export function inviterShort(name: string): string {
  const t = String(name || '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').trim().split(/\s+/)[0] || '';
  return [...t].slice(0, 18).join('');
}
const SEEN = (code: string) => `kr8_iw_seen:${code}`;
export function inviteSeen(code: string): boolean { try { return localStorage.getItem(SEEN(code)) === '1'; } catch { return false; } }
export function markInviteSeen(code: string): void { try { localStorage.setItem(SEEN(code), '1'); } catch { /* ignore */ } }
/** Arrived on an invite link this visit: ?ref= in the address at boot (read once, before the app tidies the address). */
export function cameFromInvite(search = typeof location === 'undefined' ? '' : location.search): string {
  try { const r = (new URLSearchParams(search).get('ref') || '').trim().toLowerCase(); return /^(k[0-9]{5,7}|[a-z]{2,12}[0-9]{0,4})$/.test(r) ? r : ''; } catch { return ''; }
}

function Face(p: { inviter: Inviter; cls: string }) {
  return p.inviter.photo
    ? <img className={p.cls} src={p.inviter.photo} alt="" />
    : <span className={`${p.cls} iw-ph`} aria-hidden="true">{[...p.inviter.name][0] || '•'}</span>;
}

export function InviteWelcome(p: { lang: string; inviter: Inviter; faces: string[]; onLook: () => void; onFallback: () => void }) {
  const tx = inviteTx(p.lang);
  const name = inviterShort(p.inviter.name);
  const { busy, go, lineOn, goog } = useJoinGo('invite_welcome', 'card', p.onFallback);
  const logged = useRef(false);
  useEffect(() => { if (!logged.current) { logged.current = true; v5LogClient('invite_welcome', 'shown', 'card'); } }, []);
  const look = () => { v5LogClient('invite_welcome', 'look', 'card'); p.onLook(); };
  return (
    <div className="iw" id="inviteWelcome" role="dialog" aria-modal="true" aria-labelledby="iwH" lang={p.lang}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="iw-card">
        <Face inviter={p.inviter} cls="iw-face" />
        <p className="iw-k">{tx.k(name)}</p>
        <h2 className="iw-h" id="iwH">{tx.h}</h2>
        <p className="iw-s">{tx.s}</p>
        {p.faces.length >= 3 ? (
          <div className="iw-ok"><i>{p.faces.slice(0, 3).map((f, i) => <img key={i} src={f} alt="" />)}</i>{tx.ok}</div>
        ) : <div className="iw-ok">{tx.ok}</div>}
        {lineOn ? (
          <button type="button" className="iw-line" id="iwLine" disabled={busy} onClick={() => void go('line')}>
            <span className="iw-lg" aria-hidden="true"><LineLogo /></span>{tx.line}
          </button>
        ) : (
          <button type="button" className="iw-line iw-plain" id="iwMore" disabled={busy} onClick={p.onFallback}>{tx.line}</button>
        )}
        {goog && <button type="button" className="iw-g" id="iwGoogle" disabled={busy} onClick={() => void go('google')}>{tx.google}</button>}
        <button type="button" className="iw-look" id="iwLook" onClick={look}>{tx.look}</button>
        <p className="iw-fine">{tx.fine}</p>
      </div>
    </div>
  );
}

/** The quiet bar after "Watch Reels first": the inviter's face + one LINE button, at the bottom, while browsing. */
export function InviteBar(p: { lang: string; inviter: Inviter; onFallback: () => void }) {
  const tx = inviteTx(p.lang);
  const name = inviterShort(p.inviter.name);
  const { busy, go, lineOn } = useJoinGo('invite_welcome', 'bar', p.onFallback);
  const logged = useRef(false);
  useEffect(() => { if (!logged.current) { logged.current = true; v5LogClient('invite_welcome', 'bar', 'shown'); } }, []);
  return (
    <div className="iwb" id="inviteBar" lang={p.lang} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="iw-line" id="iwbLine" disabled={busy} onClick={() => (lineOn ? void go('line') : p.onFallback())}>
        <Face inviter={p.inviter} cls="iwb-face" />{tx.bar}
      </button>
      <p className="iwb-s">{tx.pill(name)} · {tx.ok}</p>
    </div>
  );
}
