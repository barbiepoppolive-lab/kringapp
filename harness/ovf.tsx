/** Overflow audit harness: renders the member screens with realistic data in any language (?v=view&lang=xx). */
import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import '../src/v8/go.css';
import '../src/v8/kx.css';
import '../src/v8/me.css';
import '../src/v8/ticket.css';
import '../src/v8/perks.css';
import { V5_L, KX_L } from '../src/v8/v5Strings';
import * as Go from '../src/v8/V5Go';
import * as Places from '../src/v8/V5KxPlaces';
import * as Me from '../src/v8/V5Me';
import * as A2 from '../src/v8/A2HS';
import * as Rw from '../src/v8/V5KxRewards';
import * as Rk from '../src/v8/V5KxRanking';
import { RINGS } from '../src/v8/rewardsConfig';
import { prizeLadder } from '../src/v8/kxLogic';
const q = new URLSearchParams(location.search);
const lang = q.get('lang') || 'th';
const L = (en: string) => ((V5_L[lang] && V5_L[lang][en]) || (KX_L[lang] && KX_L[lang][en]) || en).replace(/&amp;/g, '&');
const Lf = (en: string, a: string, b = '') => L(en).replace('{0}', a).replace('{1}', b);
const noop = () => {};
const view = q.get('v') || 'me';
const now = Date.now();
const iso = (m: number) => new Date(now - m * 60000).toISOString();
const p = { user_id: 'u1', first_name: 'Chayanuch Srisawat', photo: '/media/demo/faces/mint.jpg', langs: ['TH', 'EN'], bio: '', area: 'Phrom Phong', who: 'local', verified: false,
  ig_handle: 'otop.bangkok.longname', interests: [], member_no: 16, online: true, here: false, mine: true,
  level: { level: 'anchan', next: 'tea', pct: 40, need_points: 6 }, followers: 12800, following: 640, likes: 94000, gifts: 0, i_follow: false, follows_me: false, reels: [], posts: 3 };
const kx = { member_no: 16, ig_handle: 'otop.bangkok.longname', tiktok_handle: 'otop.bkk', lifetime: 120, level: 1, week: 1240, week_rank: 4, founding_no: null, founding_left: 49, founding_thb: 100, has_reel: true, prizes: 1 };
const prize = { id: 'pz1', kind: 'founding', week: null, rank: null, founding_no: 16, amount: 100, rings: null, status: 'won', claim_id: null, created_at: iso(30) };
const prize2 = { id: 'pz2', kind: 'weekly', week: '2026-11-09', rank: 4, founding_no: null, amount: 500, rings: 198, status: 'won', claim_id: null, created_at: iso(60) };
const rewards = { week: 1240, rank: 4, lifetime: 1500, level: 2, gap: null, ends_at: new Date(now + 86400000 * 3).toISOString(), member_no: 16, founding_no: 16, founding_left: 49, floor: 25,
  rules: { ...RINGS }, ladder: prizeLadder(), streak: 3, checked_in_today: true, prizes: [prize, prize2], claims: [] };
const rows = [
  { kind: 'like', actor_id: 'a', actor_name: 'Pichy Review 💗 Bangkok Food Lover', actor_photo: null, at: iso(43), n: 12, post_id: 'p1' },
  { kind: 'follow', actor_id: 'b', actor_name: 'Arjun Ramakrishnan', actor_photo: null, at: iso(120), n: 1, i_follow: false },
  { kind: 'approved', at: iso(300), n: 1, post_id: 'p1' },
  { kind: 'gift', at: iso(60 * 50), n: 1, rank: 3, prize: '฿600' },
];
let el: JSX.Element = <div />;
const goReels = <Go.GoMeReels L={L} Lf={Lf} mine={[]} saved={[]} tab="reels" onTab={noop} onOpenMine={noop} onOpenSaved={noop} onPost={noop} onBrowse={noop} {...({} as never)} />;
if (view === 'me') el = <Me.MeView L={L} Lf={Lf as never} p={p as never} rank={4} posters={{}} savedCount={3} savedImgs={[]} unread verifyState="none"
  onTop10={noop} onList={noop} onSettings={noop} onActivity={noop} onEdit={noop} onShare={noop} onCode={noop} onSaved={noop} onRewards={noop} onReel={noop} onPost={noop} onVerify={noop}
  kx={kx as never} weekRank={4} onRings={noop} onRanking={noop} rankLine={Lf('{0} to {1}', '12', '#3')} saved={{ count: 3, thumbs: [] }} reelsSlot={goReels} {...({} as never)} />;
if (view === 'me-new') el = <Me.MeView L={L} Lf={Lf as never} p={{ ...p, verified: false } as never} rank={null} posters={{}} savedCount={0} savedImgs={[]} unread={false} verifyState="pending"
  onTop10={noop} onList={noop} onSettings={noop} onActivity={noop} onEdit={noop} onShare={noop} onCode={noop} onSaved={noop} onRewards={noop} onReel={noop} onPost={noop} onVerify={noop}
  kx={{ ...kx, week: 0, week_rank: null, has_reel: false, ig_handle: null, tiktok_handle: null, prizes: 0 } as never} weekRank={null} onRings={noop} onRanking={noop} saved={{ count: 0, thumbs: [] }} {...({} as never)} />;
if (view === 'rewards') el = <Rw.RewardsPage L={L} Lf={Lf} lang={lang} data={rewards as never} onBack={noop} onClaim={noop} onCode={noop} onHistory={noop} onRanking={noop} onMath={noop} />;
if (view === 'claim') el = <Rw.ClaimPage L={L} Lf={Lf} lang={lang} data={rewards as never} prize={prize as never} onBack={noop} onDone={noop} toast={noop} />;
if (view === 'ranking') el = <Rk.RankingPage L={L} Lf={Lf} lang={lang} myArea="Phrom Phong" myPhoto={null} myName="Chayanuch" myId="u1" onBack={noop} onPerson={noop} onPost={noop} onShare={noop} />;
if (view === 'how') el = <Rk.HowSheet L={L} onClose={noop} />;
if (view === 'pick') el = <Go.GoCompose L={L} Lf={Lf} lang={lang} reel={null} stage="idle" progress={0} problem={L('Clip is over 60 s · trim it and try again')} caption="" onCaption={noop}
  places={[]} onAddPlace={noop} onRemovePlace={noop} people={[]} onPeople={noop} onPick={noop} onPost={noop} onClose={noop} {...({} as never)} />;
if (view === 'compose') el = <Go.GoCompose L={L} Lf={Lf} lang={lang} reel={{ file: new File([], 'x.mp4'), url: '', durationMs: 45000, width: 720, height: 1280 } as never} stage="uploading" progress={0.4} problem=""
  caption="มิตรภาพ ไม่มีวันลืมเลือน #มิตรภาพ #เพื่อน #กูกินจุ #bangkok" onCaption={noop}
  places={[{ id: 'a', name_en: 'Vanilla Moon Café and Rooftop Bar', name_th: 'วานิลลา มูน คาเฟ่', area: 'Sathon', kr_area: 'Sathorn', photo_url: null }] as never} onAddPlace={noop} onRemovePlace={noop}
  people={[]} onPeople={noop} onPick={noop} onPost={noop} onClose={noop} {...({} as never)} />;
if (view === 'place') el = <Places.PlaceSearchPage L={L} Lf={Lf as never} lang={lang} picked={[]} onDone={noop} onBack={noop} toast={noop} />;
if (view === 'activity') el = <Me.ActivitySheet L={L} Lf={Lf as never} rows={rows as never} posters={{}} onClose={noop} onFollowBack={async () => {}} onPerson={noop} onReel={noop} seenAt={iso(100)} onMarkRead={noop} />;
if (view.startsWith('a2hs')) el = <A2.A2HSBanner L={L} force={(view.split('-').slice(1).join('-') || 'android') as never} />;
createRoot(document.getElementById('root')!).render(
  <div className="v8-app-root" style={{ position: 'relative', overflow: 'hidden', height: '100vh' }}>
    <section className="v8-screen active" id={view.startsWith('me') ? 's-me' : 's-x'} style={{ bottom: 0, overflowY: 'auto' }}>{el}</section>
  </div>);
