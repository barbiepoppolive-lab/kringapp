/* "Why post on Kring": the 6 perks of posting (founder list, 13 Nov). Thai first, English under, like the first-Reel nudge.
   PerksCard: Me tab, under the member card. PerksStrip: compact row inside the first-Reel nudge. */
import './perks.css';
import { fmtBaht, weeklySeats, weeklyTotal } from './rewardsConfig';

const I = {
  seen: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  grow: <><path d="M4 17l5-5 4 3 7-8" /><path d="M15 7h5v5" /></>,
  badge: <><circle cx="12" cy="9" r="5.5" /><path d="M8.6 13.4L7.5 21l4.5-2.4 4.5 2.4-1.1-7.6" /></>,
  featured: <><path d="M17 3l3.5 3.5L17 10" /><path d="M3.5 11.5v-1a4 4 0 014-4h13" /><path d="M7 21l-3.5-3.5L7 14" /><path d="M20.5 12.5v1a4 4 0 01-4 4h-13" /></>,
  price: <><path d="M3.5 12.5V4h8.5l8.5 8.5-8 8z" /><circle cx="8" cy="8.5" r="1.4" /></>,
  prize: <><path d="M7 4h10v4.5a5 5 0 01-10 0z" /><path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4" /><path d="M12 13.5V17M8.5 20h7" /></>,
};

/** [key, Thai title, English title, Thai line, English line, short Thai, short English] */
export const PERKS: readonly (readonly [keyof typeof I, string, string, string, string, string, string])[] = [
  ['seen', 'ให้คนเห็น', 'Be seen', 'นักท่องเที่ยวและคนกรุงเทพฯ เห็นที่ของคุณบนฟีด', 'Travellers and locals see your Bangkok spots in the feed', 'คนเห็น', 'Be seen'],
  ['grow', 'ฟอลโลว์เพิ่ม', 'Grow your following', 'IG และ TikTok อยู่บนโปรไฟล์ แตะเดียวถึง', 'Your IG and TikTok are on your profile, one tap away', 'ฟอลโลว์เพิ่ม', 'Followers'],
  ['badge', 'ป้ายโลคอล + เลเวล', 'Kring Local badge', 'เลเวลขึ้นเมื่อคุณโพสต์', 'Levels that rise as you post', 'ป้ายโลคอล', 'Badge'],
  ['featured', 'ได้ขึ้นโชว์', 'Featured', 'รีลเด่นได้ลง IG กริ๊ง! และเว็บไซต์', 'The best Reels get reposted on Kring’s Instagram and the website', 'ได้ลง IG', 'Featured'],
  ['price', 'ราคาสมาชิก', 'Member prices', 'ที่คาเฟ่ ที่พัก และกิจกรรมพาร์ทเนอร์', 'At partner cafés, stays and activities', 'ราคาสมาชิก', 'Member price'],
  // 16 Nov audit P1-5: the "฿30 for every friend (+฿50)" line is gone. No referral payout exists, and the founder ruled against visibly paying for sign-ups.
  ['prize', 'รางวัลทุกสัปดาห์', 'Weekly prizes', `ท็อป ${weeklySeats()} แบ่งกัน ${fmtBaht(weeklyTotal())} ทุกสัปดาห์`, `Every week the Top ${weeklySeats()} share ${fmtBaht(weeklyTotal())}`, 'รางวัลรายสัปดาห์', 'Weekly prizes'],
];

const Ic = ({ k }: { k: keyof typeof I }) => <i className="pk-ic" aria-hidden="true"><svg viewBox="0 0 24 24">{I[k]}</svg></i>;

export function PerksCard() {
  return (
    <section className="pk-card" id="mePerks" aria-label="ทำไมต้องโพสต์บนกริ๊ง! · Why post on Kring">
      <h3 className="pk-h">ทำไมต้องโพสต์บนกริ๊ง!<small>Why post on Kring</small></h3>
      <ul className="pk-grid">
        {PERKS.map(([k, th, en, thl, enl]) => (
          <li key={k} data-perk={k}><Ic k={k} /><b>{th}<small>{en}</small></b><span className="ln">{thl}<small>{enl}</small></span></li>
        ))}
      </ul>
    </section>
  );
}

/** Thai phones: Thai + English under. Every other language: the English line only (audit P3-15). */
export function PerksStrip(props: { thai?: boolean } = {}) {
  const thai = props.thai !== false;
  return (
    <div className="pk-strip" id="rnPerks" aria-label={thai ? 'ทำไมต้องโพสต์บนกริ๊ง! · Why post on Kring' : 'Why post on Kring'}>
      {PERKS.map(([k, , , , , ths, ens]) => (
        <span key={k} data-perk={k}><Ic k={k} />{thai ? <><b>{ths}</b><small>{ens}</small></> : <b>{ens}</b>}</span>
      ))}
    </div>
  );
}
