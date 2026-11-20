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
    meetB: 'Everyone here has passed a 3-second face check. Do yours to see them and say hi.',
    meetGo: 'Verify my face',
    foot: 'Takes 3 seconds · Your selfie is deleted within 30 days',
    meA: 'Verify your face to join the',
    meB: 'weekly ranking & daily rewards',
    meGo: 'Verify',
    shT: 'Quick face check',
    shB: 'Kring is one real person, one account. A 3-second check unlocks People, Say hi, chat and weekly rewards.',
    shGo: 'Start · 3 seconds',
    shNo: 'Not now',
    shFoot: 'Your selfie is deleted within 30 days',
    // 0182 (20 Nov): friend-verify nudge. Owner: in My Reel stats + Activity (once a day). Liker: on this sheet.
    fvOwner: 'Your friend’s like counts fully once they do the 3-second face check.',
    fvLiker: 'Your likes count fully for your friends after a 3-second face check.',
  },
  th: {
    meetT: 'มาเจอผู้คนในกรุงเทพฯ',
    meetB: 'ทุกคนที่นี่ผ่านการสแกนหน้า 3 วินาทีแล้ว สแกนหน้าของคุณเพื่อดูโปรไฟล์และทักทายได้เลย',
    meetGo: 'สแกนหน้าของฉัน',
    foot: 'ใช้เวลา 3 วินาที · เซลฟี่ของคุณจะถูกลบภายใน 30 วัน',
    meA: 'สแกนหน้าเพื่อเข้าร่วม',
    meB: 'อันดับประจำสัปดาห์และรางวัลรายวัน',
    meGo: 'สแกนหน้า',
    shT: 'สแกนหน้าแป๊บเดียว',
    shB: 'กริ๊ง! คือหนึ่งคนจริง หนึ่งบัญชี สแกนหน้าแค่ 3 วินาที ก็ปลดล็อกหน้าผู้คน การทักทาย แชต และรางวัลประจำสัปดาห์',
    shGo: 'เริ่ม · 3 วินาที',
    shNo: 'ไว้ทีหลัง',
    shFoot: 'เซลฟี่ของคุณจะถูกลบภายใน 30 วัน',
    fvOwner: 'ไลก์ของเพื่อนจะนับเต็มเมื่อเพื่อนสแกนหน้า 3 วินาที',
    fvLiker: 'ไลก์ของคุณจะนับเต็มให้เพื่อน หลังสแกนหน้า 3 วินาที',
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

/** Me: one line in place of the weekly ranking / daily rewards. */
export function UnvMeLine(props: { lang: string; onVerify: () => void }) {
  const t = tx(props.lang);
  return (
    <div className="unv-me" id="unvMe">
      <span className="unv-lk"><LockIc /></span>
      <span className="unv-mt">{t.meA} <b>{t.meB}</b></span>
      <button type="button" className="unv-mgo" id="unvMeGo" onClick={props.onVerify}>{t.meGo}</button>
    </div>
  );
}

/** "Quick face check": opens from Say hi, chat and the People card; Start goes to the real 3-photo check. */
export function FaceIntroSheet(props: { lang: string; onStart: () => void; onClose: () => void }) {
  const t = tx(props.lang);
  return (
    <div className="unv-scrim" id="unvSheet" role="dialog" aria-modal="true" aria-label={t.shT} onClick={props.onClose}>
      <div className="unv-sheet" onClick={(e) => e.stopPropagation()}>
        <i className="unv-grab" aria-hidden="true" />
        <span className="unv-ic"><FaceIc /></span>
        <b>{t.shT}</b>
        <p>{t.shB}</p>
        <p className="unv-fv" id="unvLikesNote"><span aria-hidden="true">♥</span>{t.fvLiker}</p>
        <button type="button" className="unv-go" id="unvStart" onClick={props.onStart}><FaceIc />{t.shGo}</button>
        <button type="button" className="unv-no" id="unvNotNow" onClick={props.onClose}>{t.shNo}</button>
        <small><LockIc />{t.shFoot}</small>
      </div>
    </div>
  );
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
