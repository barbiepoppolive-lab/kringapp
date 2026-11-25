/**
 * 20 Nov (founder pick: variant A): what a member sees BEFORE passing the face check.
 * Reels stay open. People shows a blurred grid + one glass card; Say hi / chat open the "Quick face check" sheet;
 * Me swaps the weekly ranking / daily rewards for one Verify line. Team / admin (ghost) accounts never see this.
 * Copy rule: never "your photo isn't stored" — the selfie is deleted within 30 days (terms §8).
 * One language at a time: Thai when the app is in Thai, English otherwise.
 */
import './unv.css';

type Lng = 'th' | 'en';
const TX: Record<Lng, Record<string, string>> = {
  en: {
    meetT: 'Meet the people of Bangkok',
    meetB: 'Everyone here has passed a 30-second face check. Do yours to see them and say hi.',
    meetGo: 'Verify my face',
    foot: 'Takes 30 seconds · Your selfie is deleted within 30 days',
    meA: 'Verify your face to join the',
    meB: 'weekly ranking & daily rewards',
    meGo: 'Verify',
    shT: 'Quick face check',
    shB: 'Kring is one real person, one account. A 30-second check unlocks People, Say hi, chat and weekly rewards.',
    shGo: 'Start · 30 seconds',
    shNo: 'Not now',
    shFoot: 'Your selfie is deleted within 30 days',
    // 0182 (20 Nov): friend-verify nudge. Owner: in My Reel stats + Activity (once a day). Liker: on this sheet.
    fvOwner: 'Your friend’s like counts fully once they do the 30-second face check.',
    fvLiker: 'Your likes count fully for your friends after a 30-second face check.',
    // 25 Nov open onboarding: the face check moves to the moment they reach for something social (one prompt per reason)
    hiT: 'Want to say hi?',
    hiB: 'A 30-second face check first. Everyone on Kring has done it.',
    chatT: 'Want to chat?',
    postT: 'Ready to post your first Reel?',
    postB: 'A 30-second face check first, so everything in the feed is from a real person.',
    askT: 'Want to ask Bangkok?',
    askB: 'A 30-second face check first, then your question goes up.',
    ansT: 'Want to answer this?',
    ansB: 'A 30-second face check first, then your answer goes up.',
    taskT: 'Daily tasks pay Rings',
    taskB: 'A 30-second face check unlocks daily tasks, Rings and the weekly ranking.',
    peopleT: 'Want to see who’s here?',
    peopleB: 'A 30-second face check opens People, profiles and Say hi. Everyone you see has done it.',
    likesT: 'You can see them. They can’t see you yet.',
    likesB: 'You’ve watched {v} clips and liked {l}. 30 seconds of your face to join the room properly.',
    meH: 'Your profile is hidden',
    meS: 'Only you can see it. A 30-second face check puts you in People, chat and the weekly ranking.',
    openInv: 'Friends can now join with just a name and photo, no face check to start. You both get +10 when they do it.',
  },
  th: {
    meetT: 'มาเจอผู้คนในกรุงเทพฯ',
    meetB: 'ทุกคนที่นี่ผ่านการสแกนหน้า 30 วินาทีแล้ว สแกนหน้าของคุณเพื่อดูโปรไฟล์และทักทายได้เลย',
    meetGo: 'สแกนหน้าของฉัน',
    foot: 'ใช้เวลา 30 วินาที · เซลฟี่ของคุณจะถูกลบภายใน 30 วัน',
    meA: 'สแกนหน้าเพื่อเข้าร่วม',
    meB: 'อันดับประจำสัปดาห์และรางวัลรายวัน',
    meGo: 'สแกนหน้า',
    shT: 'สแกนหน้าแป๊บเดียว',
    shB: 'กริ๊ง! คือหนึ่งคนจริง หนึ่งบัญชี สแกนหน้าแค่ 30 วินาที ก็ปลดล็อกหน้าผู้คน การทักทาย แชต และรางวัลประจำสัปดาห์',
    shGo: 'เริ่ม · 30 วินาที',
    shNo: 'ไว้ทีหลัง',
    shFoot: 'เซลฟี่ของคุณจะถูกลบภายใน 30 วัน',
    fvOwner: 'ไลก์ของเพื่อนจะนับเต็มเมื่อเพื่อนสแกนหน้า 30 วินาที',
    fvLiker: 'ไลก์ของคุณจะนับเต็มให้เพื่อน หลังสแกนหน้า 30 วินาที',
    hiT: 'อยากทักคนนี้ใช่ไหม',
    hiB: 'สแกนหน้า 30 วินาทีก่อนนะ ทุกคนในกริ๊ง! ผ่านขั้นนี้มาแล้ว',
    chatT: 'อยากแชตใช่ไหม',
    postT: 'พร้อมโพสต์รีลแรกแล้วใช่ไหม',
    postB: 'สแกนหน้า 30 วินาทีก่อน ทุกอย่างในฟีดจะได้มาจากคนจริง',
    askT: 'อยากถามคนกรุงเทพฯ ใช่ไหม',
    askB: 'สแกนหน้า 30 วินาทีก่อน แล้วคำถามของคุณจะขึ้นเลย',
    ansT: 'อยากตอบคำถามนี้ใช่ไหม',
    ansB: 'สแกนหน้า 30 วินาทีก่อน แล้วคำตอบของคุณจะขึ้นเลย',
    taskT: 'ภารกิจรายวันได้ริง',
    taskB: 'สแกนหน้า 30 วินาที ปลดล็อกภารกิจรายวัน ริง และอันดับประจำสัปดาห์',
    peopleT: 'อยากรู้ไหมว่าใครอยู่ที่นี่',
    peopleB: 'สแกนหน้า 30 วินาที เปิดหน้าผู้คน โปรไฟล์ และการทักทาย ทุกคนที่คุณเห็นผ่านขั้นนี้มาแล้ว',
    likesT: 'คุณเห็นทุกคน แต่เขายังมองไม่เห็นคุณ',
    likesB: 'คุณดูมา {v} คลิป และกดใจไป {l} ครั้ง สแกนหน้า 30 วินาที เพื่อเข้าห้องจริง',
    meH: 'โปรไฟล์ของคุณยังซ่อนอยู่',
    meS: 'มีแค่คุณที่เห็น สแกนหน้า 30 วินาที แล้วคุณจะอยู่ในหน้าผู้คน แชต และอันดับประจำสัปดาห์',
    openInv: 'ตอนนี้เพื่อนสมัครได้ด้วยชื่อกับรูปเดียว ไม่ต้องสแกนหน้าก่อน ได้ +10 ทั้งคู่เมื่อเพื่อนสแกนหน้า',
  },
};
const tx = (lang: string) => TX[lang === 'th' ? 'th' : 'en'];

const FaceIc = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="10.5" r="2.6" /><path d="M7.8 17c.9-1.9 2.4-2.8 4.2-2.8s3.3.9 4.2 2.8" /></svg>
);
export const LockIc = (p: { className?: string }) => (
  <svg className={p.className} viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.4" /><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" /></svg>
);

/** People for a member who hasn't passed the face check: blurred grid + glass card. */
export function UnvPeopleWall(props: { lang: string; stills: string[]; onVerify: () => void }) {
  const t = tx(props.lang);
  const tiles = props.stills.length ? props.stills : [];
  return (
    <div className="unv-wall" id="unvPeople">
      <div className="unv-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => <i key={i} style={tiles.length ? { backgroundImage: `url('${tiles[i % tiles.length]}')` } : undefined} />)}
      </div>
      <div className="unv-card" role="group" aria-label={t.meetT}>
        <span className="unv-ic"><FaceIc /></span>
        <b>{t.meetT}</b>
        <p>{t.meetB}</p>
        <button type="button" className="unv-go" id="unvPeopleGo" onClick={props.onVerify}><FaceIc />{t.meetGo}</button>
        <small>{t.foot}</small>
      </div>
    </div>
  );
}

/** Me: one line in place of the weekly ranking / daily rewards.
 *  25 Nov open onboarding (trigger 3): the member's own profile shows as hidden, with the prompt attached. */
export function UnvMeLine(props: { lang: string; onVerify: () => void }) {
  const t = tx(props.lang);
  return (
    <div className="unv-me" id="unvMe" data-state="hidden">
      <span className="unv-lk"><LockIc /></span>
      <span className="unv-mt"><b className="unv-mh">{t.meH}</b><small className="unv-ms">{t.meS}</small></span>
      <button type="button" className="unv-mgo" id="unvMeGo" onClick={props.onVerify}>{t.meGo}</button>
    </div>
  );
}

/** 25 Nov open onboarding: what the member just reached for. The prompt names it. */
export type UnvWhy = 'people' | 'hi' | 'chat' | 'post' | 'ask' | 'answer' | 'task' | 'likes' | 'me';
export const UNV_WHYS: readonly UnvWhy[] = ['people', 'hi', 'chat', 'post', 'ask', 'answer', 'task', 'likes', 'me'];
export const unvWhy = (v: unknown): UnvWhy => (typeof v === 'string' && (UNV_WHYS as readonly string[]).includes(v) ? v as UnvWhy : 'people');
/** Title + body for one reason, in the app's language only. stats: the likes prompt's real numbers. */
export function unvCopy(lang: string, why: UnvWhy, stats?: { views: number; likes: number } | null): { title: string; body: string } {
  const t = tx(lang);
  switch (why) {
    case 'hi': return { title: t.hiT, body: t.hiB };
    case 'chat': return { title: t.chatT, body: t.hiB };
    case 'post': return { title: t.postT, body: t.postB };
    case 'ask': return { title: t.askT, body: t.askB };
    case 'answer': return { title: t.ansT, body: t.ansB };
    case 'task': return { title: t.taskT, body: t.taskB };
    case 'likes': {
      const l = Math.max(0, Math.round(stats?.likes ?? 0));
      const v = Math.max(l, Math.round(stats?.views ?? 0));
      return { title: t.likesT, body: t.likesB.replace('{v}', String(v)).replace('{l}', String(l)) };
    }
    case 'me': return { title: t.meH, body: t.meS };
    default: return { title: t.peopleT, body: t.peopleB };
  }
}

/** "Quick face check": opens when an unchecked member reaches for something social; Start goes to the real face check. */
export function FaceIntroSheet(props: { lang: string; why?: UnvWhy; stats?: { views: number; likes: number } | null; onStart: () => void; onClose: () => void }) {
  const t = tx(props.lang);
  const why = props.why || 'people';
  const c = unvCopy(props.lang, why, props.stats);
  return (
    <div className="unv-scrim" id="unvSheet" data-why={why} role="dialog" aria-modal="true" aria-label={c.title} onClick={props.onClose}>
      <div className="unv-sheet" onClick={(e) => e.stopPropagation()}>
        <i className="unv-grab" aria-hidden="true" />
        <span className="unv-ic"><FaceIc /></span>
        <b id="unvTitle">{c.title}</b>
        <p id="unvBody">{c.body}</p>
        {why === 'likes' || why === 'people' ? <p className="unv-fv" id="unvLikesNote"><span aria-hidden="true">♥</span>{t.fvLiker}</p> : null}
        <button type="button" className="unv-go" id="unvStart" onClick={props.onStart}><FaceIc />{t.shGo}</button>
        <button type="button" className="unv-no" id="unvNotNow" onClick={props.onClose}>{t.shNo}</button>
        <small><LockIc />{t.shFoot}</small>
      </div>
    </div>
  );
}

/** 25 Nov open onboarding: the invite nudge for members (friends can join without the face check; the +10 still needs it). */
export const openInviteLine = (lang: string): string => tx(lang).openInv;

/** Trigger 2 bookkeeping (per member, this phone): likes made before the face check, and when the likes prompt last showed.
 *  It shows at most 3 times, at least 3 days apart. The server's kr8_my_unv_stats gives the real numbers and the threshold. */
const LP_KEY = (uid: string) => 'kr8_unv_lp_' + uid;
type LpState = { n: number; at: number; times: number };
export function unvLikeTick(uid: string, now = Date.now()): { due: boolean; n: number } {
  let st: LpState = { n: 0, at: 0, times: 0 };
  try { const raw = localStorage.getItem(LP_KEY(uid)); if (raw) st = { ...st, ...JSON.parse(raw) }; } catch { /* private mode */ }
  st.n = (Number(st.n) || 0) + 1;
  try { localStorage.setItem(LP_KEY(uid), JSON.stringify(st)); } catch { /* private mode */ }
  const due = st.n >= 5 && (Number(st.times) || 0) < 3 && now - (Number(st.at) || 0) > 3 * 864e5;
  return { due, n: st.n };
}
export function unvLikeShown(uid: string, now = Date.now()): void {
  try {
    const raw = localStorage.getItem(LP_KEY(uid));
    const st: LpState = { n: 0, at: 0, times: 0, ...(raw ? JSON.parse(raw) : {}) };
    localStorage.setItem(LP_KEY(uid), JSON.stringify({ ...st, at: now, times: (Number(st.times) || 0) + 1 }));
  } catch { /* private mode */ }
}

/** 0182: the friend-verify line, in the app's language only. Shown at most once per Bangkok day (shared by Activity and My Reel stats). */
export const fvText = (lang: string, who: 'owner' | 'liker' = 'owner') => (who === 'owner' ? tx(lang).fvOwner : tx(lang).fvLiker);
const FV_KEY = 'kr8_fv_day';
const bkkToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export function fvShownToday(): boolean { try { return localStorage.getItem(FV_KEY) === bkkToday(); } catch { return false; } }
export function fvMarkShown(): void { try { localStorage.setItem(FV_KEY, bkkToday()); } catch { /* private mode */ } }
export function FriendVerifyNote(props: { lang: string }) {
  return <p className="go-stats-note unv-fvo" id="fvOwnerNote" data-one={props.lang === 'th' ? 'th' : 'en'}><span aria-hidden="true">♥</span>{fvText(props.lang)}</p>;
}
