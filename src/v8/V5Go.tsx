/**
 * Go-live build (15 Nov 2026): the screens the founder approved in the tappable prototype.
 *  · GoReelPlayer   full-screen Reel player, swipe up for the next one, "View profile" when opened from the ranking
 *  · GoProfilePage  member profile like Instagram / TikTok: card, counts, 3-column grid
 *  · GoMeReels      Me: "Reels" and "Saved" tabs over the same grid
 *  · GoCompose      ONE compose screen after the clip is picked: caption + hashtags, Add place, Tag people, Post
 *  · GoCoach        one-time coach marks (kept on the account, see goCoach.ts)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReelCamera, type CamAccess } from './V5Camera';
import { rememberSound, soundHintWanted, soundWanted, SOUND_PREF_EVENT } from './reelSound';
import './go.css';
import { fmtN, isNotYetNote, reviewNoteText } from './kxLogic';
import { kxTagCandidates, type KxCardExtras, type KxGridReel, type KxMemberReels, type KxSavedReel, type KxTagPerson } from './v5Kx';
import { signReelPaths, type ReelInfo } from './v5Reel';
import { WindowVideo } from './V5Trim';
import { INTEREST, RingsChip, RingsSheet, RvCheck, type RingsChipData } from './V5Me';
import { rvArea, rvLangs } from './rvLabels';
import { rvHeroIn } from './rvMotion';
import { RingGlyph, SocialPills } from './V5KxCard';
import { GenderChip } from './V5Gender';
import { AskText } from './askTr';
import { ProfileBadges } from './badges';
import { FriendVerifyNote, fvMarkShown, fvShownToday } from './V5Unverified';
import type { V5Profile } from './v5Live';
import type { PickedPlace } from './V5KxPlaces';
import { postAgo } from './postTime';
import { poOpen, r10Tx, usePoMap } from './ret10';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

// ───────────── small pieces ─────────────
const IcBack = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>;
const IcClose = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;
const IcHeart = ({ on }: { on?: boolean }) => <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.600-7.500 10.200-7.500 10.200z" /></svg>;
const IcBook = ({ on }: { on?: boolean }) => <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6.5 4h11v16.5L12 16.6l-5.500 3.900z" /></svg>;
const IcShare = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>;
const IcPin = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a6.500 6.500 0 0 0-6.500 6.500c0 4.800 6.500 12.500 6.500 12.500s6.500-7.700 6.500-12.500A6.500 6.500 0 0 0 12 2.500zm0 9a2.500 2.500 0 1 1 0-5 2.500 2.500 0 0 1 0 5z" /></svg>;
const IcArrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const IcGrid = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></svg>;
const IcPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
const IcPeople = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c.5-3.300 3-5 6-5s5.500 1.700 6 5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M17.5 14.5c2 .3 3.300 1.700 3.600 4" /></svg>;

/** "#tags" in a caption, coloured pink / cyan in turn. Returns React nodes (never raw HTML). */
/** S (15 Nov): Reel caption, 2 lines then "…more" (เพิ่มเติม); tap opens it in place. Hashtags muted (they sit in the 2 lines). */
export function ReelCaption(props: { text: string; L: Tx }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 2);
  }, [props.text, open]);
  if (!props.text) return null;
  return (
    <div className={`cap reel-cap${open ? ' open' : ''}`} data-act="caption">
      <div ref={ref} className="reel-cap-t">{hlTags(props.text)}</div>
      {long && !open ? <button type="button" className="reel-more" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>…{props.L('more')}</button> : null}
    </div>
  );
}

export function hlTags(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let n = 0; let last = 0;
  const re = /#[^\s#<&]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={m.index} className={`go-h${n++ % 2}`}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export const hashtagsOf = (text: string): string[] => (text.match(/#[^\s#<&]+/g) || []).map((t) => t.toLowerCase());
/** Adds a quick hashtag at the end of the caption once (never over the limit). */
export function addTag(caption: string, tag: string, max = 150): string {
  if (hashtagsOf(caption).includes(tag.toLowerCase())) return caption;
  const next = `${caption}${caption && !/\s$/.test(caption) ? ' ' : ''}${tag} `;
  return next.length > max ? caption : next;
}
export const GO_TAGS = ['#กรุงเทพ', '#bangkok', '#เที่ยวกรุงเทพ', '#kringlocal', '#bkkvibes'] as const;
export const CAPTION_MAX = 150;

export function usePosters(paths: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    let dead = false;
    const need = paths.filter((p) => p && !map[p]);
    if (!need.length) return;
    signReelPaths(need).then((m) => { if (!dead) setMap((prev) => ({ ...prev, ...m })); }).catch(() => undefined);
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

// ───────────── full-screen Reel player ─────────────
/** 17 Nov "My Reel stats": opens/rings are null when this Reel is not among this week's counted Reels. */
export interface GoReelStats { views: number | null; likes: number; saves: number; opens: number | null; rings: number | null; travellers: number;
  /** 0182: likes from members without a face check (board v2) → the friend-verify line, once a day */ unv?: number }
const IcBars = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6" /></svg>;
export interface GoReel {
  id: string; video_path: string; poster_path: string; body?: string | null; status?: string; note?: string | null;
  place?: { id: string; name_en: string; name_th: string | null } | null;
  likes?: number; saves?: number; liked?: boolean; saved?: boolean; rings?: number | null;
  author?: { id: string; name: string; photo: string | null; handle?: string | null } | null;
  people?: KxTagPerson[]; mine?: boolean;
}
export const gridToGo = (r: KxGridReel, author: GoReel['author'], mine: boolean): GoReel => ({
  id: r.id, video_path: r.video_path, poster_path: r.poster_path, body: r.body, status: r.status, note: r.note ?? null, place: r.place, likes: r.likes, saves: r.saves,
  liked: r.liked, saved: r.saved, rings: r.status === 'approved' ? r.rings : null, author, mine,
});
export const savedToGo = (r: KxSavedReel): GoReel => ({
  id: r.id, video_path: r.video_path, poster_path: r.poster_path, likes: r.likes, saved: true, author: { id: '', name: r.name, photo: null },
});

function GoVideo(props: { src?: string; poster?: string; active: boolean; label: string; hint?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  // 17 Nov: sound is remembered (reelSound.ts); the first Reel says "Tap for sound" until the member taps once
  const [muted, setMuted] = useState(() => !soundWanted());
  const [hint, setHint] = useState(soundHintWanted);
  useEffect(() => {
    // 20 Nov: sound turned on (first tap anywhere) → the Reel playing now unmutes too
    const off = () => {
      setHint(soundHintWanted());
      const v = ref.current;
      if (v && !v.paused && v.muted === soundWanted()) { v.muted = !soundWanted(); setMuted(v.muted); }
    };
    window.addEventListener(SOUND_PREF_EVENT, off);
    return () => window.removeEventListener(SOUND_PREF_EVENT, off);
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const play = () => { try { return Promise.resolve(v.play()); } catch (e) { return Promise.reject(e); } };
    if (props.active && props.src) {
      v.muted = !soundWanted(); setMuted(v.muted);
      play().catch(() => { v.muted = true; setMuted(true); play().catch(() => undefined); });
    } else { try { v.pause(); } catch { /* not started */ } }
  }, [props.active, props.src]);
  return (
    <div className="go-vid" style={props.poster ? { backgroundImage: `url('${props.poster}')` } : undefined}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; const v = ref.current; if (v) { v.muted = !v.muted; setMuted(v.muted); rememberSound(!v.muted); } }}>
      {props.poster ? <img className="go-vposter" src={props.poster} alt="" /> : null}
      {props.src ? <video ref={ref} src={props.active ? props.src : undefined} poster={props.poster} muted loop playsInline preload="metadata" aria-label={props.label} /> : null}
      {props.active && props.src ? <span className={`go-snd${muted && hint && props.hint ? ' has-hint' : ''}`} aria-hidden="true">{muted && hint && props.hint ? <b>{props.hint}</b> : muted ? '🔇' : '🔊'}</span> : null}
    </div>
  );
}

export function GoReelPlayer(props: {
  L: Tx; Lf: Txf; lang: string; reels: GoReel[]; start?: number; title?: string;
  /** shown when the player was opened from the ranking: one tap to that member's profile */
  viewProfile?: { id: string; name: string; photo: string | null } | null;
  onClose: () => void; onProfile: (user: string) => void; onPlace?: (place: string) => void; onMath?: (user: string) => void;
  onLike: (id: string) => Promise<{ liked: boolean; likes: number } | null>; onSave: (id: string) => Promise<boolean | null>; onShare: (id: string) => void;
  /** invite-1: finger down on Share → fetch the share link early, so the tap opens the share sheet at once */
  onShareDown?: (id: string) => void;
  onActive?: (reel: GoReel, el: HTMLElement) => void;
  /** 17 Nov: owner only, "My Reel stats" for one Reel (this week's numbers from the ranking math) */
  onStats?: (id: string) => Promise<GoReelStats | null>;
  /** 20 Nov: own "Not yet" Reel → "Post a new one" */
  onPostNew?: () => void;
}) {
  const { L } = props;
  const [stats, setStats] = useState<{ id: string; s: GoReelStats | null; busy: boolean } | null>(null);
  // 0182: the friend-verify line shows at most once per Bangkok day (shared with Activity), decided when the numbers arrive
  const [fvShow, setFvShow] = useState(false);
  useEffect(() => {
    if (stats && !stats.busy && (stats.s?.unv || 0) > 0 && !fvShownToday()) { fvMarkShown(); setFvShow(true); }
    if (!stats) setFvShow(false);
  }, [stats]);
  const openStats = (r: GoReel) => {
    if (!props.onStats) return;
    setStats({ id: r.id, s: null, busy: true });
    props.onStats(r.id).then((s) => setStats((x) => (x && x.id === r.id ? { id: r.id, s, busy: false } : x))).catch(() => setStats((x) => (x && x.id === r.id ? { id: r.id, s: null, busy: false } : x)));
  };
  const box = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(Math.min(props.start || 0, Math.max(0, props.reels.length - 1)));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [over, setOver] = useState<Record<string, Partial<GoReel>>>({});
  const [pop, setPop] = useState('');
  const reels = props.reels;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = idx * el.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let dead = false;
    const near = reels.slice(Math.max(0, idx - 1), idx + 2);
    const need = [...near.flatMap((r) => [r.video_path, r.poster_path]), ...reels.map((r) => r.poster_path)].filter((p) => p && !urls[p]);
    if (need.length) signReelPaths(need).then((m) => { if (!dead) setUrls((u) => ({ ...u, ...m })); }).catch(() => undefined);
    const cur = reels[idx];
    const node = box.current?.children[idx] as HTMLElement | undefined;
    if (cur && node) props.onActive?.(cur, node);
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, reels.length]);
  const onScroll = () => {
    const el = box.current;
    if (!el || !el.clientHeight) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== idx && i >= 0 && i < reels.length) setIdx(i);
  };
  const like = async (r: GoReel) => {
    const cur = { ...r, ...over[r.id] };
    setPop(`l${r.id}`);
    setOver((o) => ({ ...o, [r.id]: { ...o[r.id], liked: !cur.liked, likes: Math.max(0, (cur.likes || 0) + (cur.liked ? -1 : 1)) } }));
    const res = await props.onLike(r.id);
    setOver((o) => ({ ...o, [r.id]: { ...o[r.id], liked: res ? res.liked : cur.liked, likes: res ? res.likes : cur.likes } }));
  };
  const save = async (r: GoReel) => {
    const cur = { ...r, ...over[r.id] };
    setPop(`s${r.id}`);
    setOver((o) => ({ ...o, [r.id]: { ...o[r.id], saved: !cur.saved, saves: Math.max(0, (cur.saves || 0) + (cur.saved ? -1 : 1)) } }));
    const res = await props.onSave(r.id);
    if (res === null) setOver((o) => ({ ...o, [r.id]: { ...o[r.id], saved: cur.saved, saves: cur.saves } }));
    else if (res !== !cur.saved) setOver((o) => ({ ...o, [r.id]: { ...o[r.id], saved: res, saves: Math.max(0, (cur.saves || 0) + (res ? 1 : 0) - (cur.saved ? 1 : 0)) } }));
  };
  const vp = props.viewProfile;
  return (
    <div className="go-player" id="goPlayer" role="dialog" aria-label={L('Reels')}>
      <div className="go-feed" ref={box} onScroll={onScroll}>
        {reels.map((r0, i) => {
          const r = { ...r0, ...over[r0.id] };
          const a = r.author;
          const pending = r.status === 'pending' || r.status === 'hidden';
          return (
            <section className="go-reel" key={r.id} data-reel-id={r.id} data-active={i === idx ? '1' : undefined}>
              <GoVideo src={Math.abs(i - idx) <= 1 ? urls[r.video_path] : undefined} poster={urls[r.poster_path]} active={i === idx} label={a?.name || 'Reel'} hint={L('Tap for sound 🔊')} />
              <div className="go-grad" />
              <div className="go-rail">
                <button type="button" className={`go-rb like${r.liked ? ' act' : ''}${pop === `l${r.id}` ? ' pop' : ''}`} data-go="like" aria-label={L('Like')} aria-pressed={!!r.liked} disabled={pending} onClick={() => void like(r)}>
                  <span className="go-rbi"><IcHeart on={r.liked} /></span><b>{fmtN(r.likes || 0)}</b></button>
                <button type="button" className={`go-rb save${r.saved ? ' act' : ''}${pop === `s${r.id}` ? ' pop' : ''}`} data-go="save" aria-label={L('Save')} aria-pressed={!!r.saved} disabled={pending} onClick={() => void save(r)}>
                  <span className="go-rbi"><IcBook on={r.saved} /></span><b>{r.saves !== undefined ? fmtN(r.saves) : L('Save')}</b></button>
                <button type="button" className="go-rb shr" data-go="share" aria-label={L('Share')} disabled={pending} onPointerDown={() => props.onShareDown?.(r.id)} onClick={() => props.onShare(r.id)}>
                  <span className="go-rbi"><IcShare /></span><b>{L('Share')}</b></button>
                {r.mine && r.status === 'approved' && props.onStats ? (
                  <button type="button" className="go-rb sts" data-go="stats" aria-label={L('My Reel stats')} onClick={() => openStats(r)}>
                    <span className="go-rbi"><IcBars /></span><b>{L('Stats')}</b></button>
                ) : null}
              </div>
              <div className="go-meta">
                <div className="go-who">
                  {a ? (
                    <button type="button" className="go-whob" data-go="author" disabled={!a.id} onClick={() => a.id && props.onProfile(a.id)}>
                      <span className="go-av" style={a.photo ? { backgroundImage: `url('${a.photo}')` } : undefined}>{a.photo ? null : (a.name || '?').charAt(0)}</span>
                      <span className="go-nm"><b>{a.name}</b>{(r as { created_at?: string }).created_at ? <small className="go-pt" data-post-time="1">{postAgo((r as { created_at?: string }).created_at)}</small> : null}</span>
                    </button>
                  ) : null}
                  {r.status === 'hidden' && isNotYetNote(r.note) ? <span className="go-score rv ny" data-go="notyet">{L('Not yet')}</span>
                    : r.status === 'hidden' ? <span className="go-score rv hid" data-go="hidden">{[L('Hidden'), reviewNoteText(r.note, props.lang)].filter(Boolean).join(' · ')}</span>
                    : pending ? <span className="go-score rv">{L('in review')}</span>
                    : r.rings !== null && r.rings !== undefined && a?.id ? (
                      <button type="button" className="go-score" data-go="score" aria-label={L('See the math')} onClick={() => props.onMath?.(a.id)}><RingGlyph /><b>{fmtN(r.rings)}</b></button>
                    ) : null}
                </div>
                {r.status === 'hidden' && isNotYetNote(r.note) ? (
                  <div className="go-notyet" data-go="notyet-box">
                    <p>{reviewNoteText(r.note, props.lang)}</p>
                    {props.onPostNew ? <button type="button" className="go-ny-post" id="goNotYetPost" onClick={props.onPostNew}><IcPlus />{L('Post a new one')}</button> : null}
                  </div>
                ) : null}
                {r.place ? (
                  <button type="button" className="go-place" data-go="place" onClick={() => props.onPlace?.(r.place!.id)}><IcPin /><span>{props.lang === 'th' && r.place.name_th ? r.place.name_th : r.place.name_en}</span></button>
                ) : null}
                {r.body ? <ReelCaption text={r.body} L={L} /> : null}
                {r.people && r.people.length ? (
                  <p className="go-with" data-go="with">{L('with')}{r.people.map((p) => <button type="button" key={p.user_id} onClick={() => props.onProfile(p.user_id)}>@{p.first_name}</button>)}</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {stats ? (() => {
        const r = reels.find((x) => x.id === stats.id);
        const cur = r ? { ...r, ...over[r.id] } : null;
        const st = stats.s;
        // T301-003: "1 Like", not "1 Likes"
        const one = (n: number | null, a: string, b: string) => L(n === 1 ? a : b);
        const views = st ? st.views : null, likes = st ? st.likes : cur?.likes || 0, saves = st ? st.saves : cur?.saves || 0;
        const opens = st ? st.opens : null, rings = st && st.rings !== null ? st.rings : cur?.rings || 0;
        const rows: [string, string][] = [
          [one(views, 'View', 'Views'), views !== null ? fmtN(views) : '–'],
          [one(likes, 'Like', 'Likes'), fmtN(likes)],
          [one(saves, 'Save', 'Saves'), fmtN(saves)],
          [one(opens, 'Outside open', 'Outside opens'), opens !== null ? fmtN(opens) : '–'],
          [one(rings, 'Ring', 'Rings'), fmtN(rings)],
        ];
        return (
          <div className="go-stats-wrap" role="dialog" aria-label={L('My Reel stats')} onClick={(e) => { if (e.target === e.currentTarget) setStats(null); }}>
            <div className="go-stats" id="goReelStats">
              <div className="go-stats-hd"><b>{L('My Reel stats')}</b><button type="button" className="go-stats-x" aria-label={L('Close')} onClick={() => setStats(null)}>✕</button></div>
              <div className="go-stats-grid" aria-busy={stats.busy}>
                {rows.map(([k, v]) => <div className="go-stat" key={k}><b>{stats.busy ? '…' : v}</b><span>{k}</span></div>)}
              </div>
              {st && st.travellers > 0 ? <p className="go-stats-note">{props.Lf('{0} of these from travellers (count double)', String(st.travellers))}</p> : null}
              {st && st.opens === null ? <p className="go-stats-note">{L('Outside opens show for your best Reels this week.')}</p> : null}
              {fvShow ? <FriendVerifyNote lang={props.lang} /> : null}
              {/* 21 Nov (founder): one soft line + Share (the Reel's own /r/<short> link) — opens from outside apps count */}
              {cur ? (
                <div className="go-stats-push" id="goStatsPush">
                  <span>{L('Friends who open this push you up 🚀')}</span>
                  <button type="button" className="go-stats-share" id="goStatsShare" onPointerDown={() => props.onShareDown?.(stats.id)} onClick={() => props.onShare(stats.id)}>
                    {L('Share')}<span aria-hidden="true">↗</span></button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })() : null}
      <div className="go-vtop">
        <button type="button" className="go-bk" id="goPlayerBack" aria-label={L('Back')} onClick={props.onClose}><IcBack /></button>
        {vp ? (
          <button type="button" className="go-vp" id="goViewProfile" onClick={() => props.onProfile(vp.id)}>
            <span className="go-av s" style={vp.photo ? { backgroundImage: `url('${vp.photo}')` } : undefined} />{L('View profile')}<IcArrow />
          </button>
        ) : props.title ? <span className="go-score">{props.title}</span> : null}
      </div>
    </div>
  );
}

// ───────────── grid ─────────────
function Tile(props: { L: Tx; poster?: string; rings?: number | null; week?: boolean; pending?: boolean; likes?: number; i: number; onOpen: () => void; id: string;
  /** own hidden Reel (audit P2-3): "Hidden · reason" */ hidden?: string | null; /** 20 Nov: "Not yet" (tips, not a strike) */ notYet?: boolean;
  /** Retention 10: own approved Reel kept to the profile (not the main feed) */ po?: string | null }) {
  return (
    <button type="button" className="go-gt" data-go-tile={props.id} style={{ animationDelay: `${Math.min(props.i, 12) * 35}ms` }} onClick={props.onOpen}>
      {props.poster ? <img src={props.poster} alt="" loading="lazy" /> : null}
      {props.po ? <span className="go-gw rv po" data-po="1">{props.po}</span>
        : props.notYet ? <span className="go-gw rv ny" data-notyet="1">{props.L('Not yet')}</span>
        : props.hidden != null ? <span className="go-gw rv hid" data-hidden="1">{[props.L('Hidden'), props.hidden].filter(Boolean).join(' · ')}</span>
        : props.pending ? <span className="go-gw rv">{props.L('in review')}</span> : props.week ? <span className="go-gw">{props.L('This week')}</span> : null}
      {props.pending || props.hidden != null ? null : props.rings !== null && props.rings !== undefined ? <span className="go-gs"><RingGlyph /> {fmtN(props.rings)}</span>
        : props.likes ? <span className="go-gs">♥ {fmtN(props.likes)}</span> : null}
    </button>
  );
}
const RV4_FILL = ['thonglor', 'siam-square', 'charoen-krung', 'one-bangkok', 'bacc'].map((n) => `${import.meta.env.BASE_URL}media/places/${n}.jpg`);
export function GoGrid(props: { L: Tx; reels: KxGridReel[]; onOpen: (i: number) => void; add?: { label: string; onAdd: () => void };
  /** rv4 Me A: the "+" tile first, and quiet Bangkok photos fill the first two rows (decoration only, not Reels) */ me?: boolean; lang?: string }) {
  const posters = usePosters(props.reels.map((r) => r.poster_path));
  const po = usePoMap(!!props.me);   // Retention 10: "On your profile" tiles (own grid only)
  const poTx = props.me ? r10Tx(props.lang || 'en').poTag : '';
  const addT = props.add ? <button type="button" className="go-gt add" id="goGridAdd" aria-label={props.add.label} onClick={props.add.onAdd}><span><IcPlus /><em>{props.add.label}</em></span></button> : null;
  const fill = props.me ? RV4_FILL.slice(0, Math.max(0, 5 - props.reels.length)) : [];
  return (
    <div className="go-grid" id="goGrid">
      {props.me ? addT : null}
      {props.reels.map((r, i) => (
        <Tile key={r.id} L={props.L} id={r.id} i={i} poster={posters[r.poster_path]} rings={r.rings} week={r.this_week} pending={r.status === 'pending'} hidden={r.status === 'hidden' ? reviewNoteText(r.note) : null} notYet={r.status === 'hidden' && isNotYetNote(r.note)}
          po={props.me && r.id in po && r.status === 'approved' ? poTx : null} onOpen={() => (props.me && r.id in po && r.status === 'approved' ? poOpen(r.id) : props.onOpen(i))} />
      ))}
      {props.me ? fill.map((f) => <span key={f} className="go-gt rv4-fill" aria-hidden="true" style={{ backgroundImage: `url('${f}')` }} />) : addT}
    </div>
  );
}

/** Me: tabs "Reels" and "Saved" */
export function GoMeReels(props: {
  L: Tx; Lf: Txf; mine: KxGridReel[] | null; saved: KxSavedReel[] | null; tab: 'reels' | 'saved'; onTab: (t: 'reels' | 'saved') => void;
  onOpenMine: (i: number) => void; onOpenSaved: (i: number) => void; onPost: () => void; onBrowse: () => void; lang?: string;
}) {
  const { L } = props;
  const savedPosters = usePosters(props.tab === 'saved' ? (props.saved || []).map((r) => r.poster_path) : []);
  const nSaved = props.saved?.length || 0;
  return (
    <div className="go-me" id="goMeReels">
      <div className="go-seg" role="tablist">
        <button type="button" role="tab" id="goTabReels" aria-selected={props.tab === 'reels'} className={props.tab === 'reels' ? 'on' : ''} onClick={() => props.onTab('reels')}><IcGrid />{L('Reels')}</button>
        <button type="button" role="tab" id="goTabSaved" aria-selected={props.tab === 'saved'} className={props.tab === 'saved' ? 'on' : ''} onClick={() => props.onTab('saved')}>
          <IcBook />{L('Saved')}{nSaved ? ` · ${nSaved}` : ''}</button>
      </div>
      {props.tab === 'reels' ? (
        props.mine === null ? <p className="go-empty">…</p> : (
          <GoGrid L={L} reels={props.mine} me lang={props.lang} onOpen={props.onOpenMine} add={{ label: props.mine.length ? L('New Reel') : L('Post your first Reel'), onAdd: props.onPost }} />
        )
      ) : props.saved === null ? <p className="go-empty">…</p> : nSaved ? (
        <div className="go-grid" id="goSavedGrid">
          {(props.saved || []).map((r, i) => <Tile key={r.id} L={L} id={r.id} i={i} poster={savedPosters[r.poster_path]} likes={r.likes} onOpen={() => props.onOpenSaved(i)} />)}
        </div>
      ) : (
        <div className="go-empty" id="goSavedEmpty"><IcBook /><p>{L('Nothing saved yet. Tap Save on a Reel and it stays here.')}</p>
          <button type="button" className="go-pill gh" onClick={props.onBrowse}>{L('See Reels')}</button></div>
      )}
    </div>
  );
}

// ───────────── member profile ─────────────
/** rv4 Profile B: the head of a member's profile. Round photo (thin gold ring) + the stats row beside it, then name ✓,
 *  area · languages, short bio and up to 3 interest tags with a gold hairline. Real data only: no bio / no interests → no line. */
function ProfileHead(props: { L: Tx; lang: string; p: V5Profile; stats: React.ReactNode; extra?: React.ReactNode; note?: React.ReactNode }) {
  const { L, p } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { rvHeroIn(ref.current); }, []);
  const where = p.who === 'traveller' ? [L('Traveller'), rvArea(L(p.area))].filter(Boolean).join(' · ') : rvArea(L(p.area === 'Bangkok' ? 'Bangkok' : p.area));
  const langs = rvLangs(p.langs || [], 3);
  const tags = (p.interests || []).filter((k) => INTEREST[k]).slice(0, 3);
  return (
    <section className="rv4-phd" id="profileIdentity" aria-label={p.first_name}>
      <div className="rv4-ptop">
        <div className="rv4-pav" ref={ref} style={p.photo ? { backgroundImage: `url('${p.photo}')` } : undefined}>
          {p.photo ? null : <span aria-hidden="true">{(p.first_name || '?').trim().charAt(0).toUpperCase()}</span>}
        </div>
        {props.stats}
      </div>
      {props.note}
      <h2 className="rv4-pnm">{p.first_name}{p.verified ? <RvCheck L={L} /> : null}</h2>
      {/* m211: last week's board place + Founding Local, small pills under the name */}
      <ProfileBadges lang={props.lang} badges={p.badges} lastWeek={p.last_week} streak={p.streak} id="profileBadges" />
      {/* 0183: the bio sits right under the name, in the reader's language ("Translated · See original") */}
      {p.bio ? <div className="rv4-biow" id="profileBio"><AskText L={L} kind="b" id={p.user_id} text={p.bio} skip={p.mine} as="p" className="rv4-pbio" toggle /></div> : null}
      <p className="rv4-psub">{[where, langs].filter(Boolean).join(' · ')}</p>
      {tags.length ? <div className="rv4-ptags">{tags.map((k) => <span key={k}>{L(INTEREST[k][1])}</span>)}</div> : null}
      {props.extra}
    </section>
  );
}

export function GoProfilePage(props: {
  L: Tx; Lf: Txf; lang: string; p: V5Profile; kx: KxCardExtras | null | undefined; reels: KxMemberReels | null; busy: boolean;
  onBack: () => void; onFollow: () => void; onHi: () => void; onReport: () => void; onBlock: () => void; onShare: () => void;
  onList: (k: 'followers' | 'following') => void; onOpen: (i: number) => void; onMath: () => void; gender?: string | null;
  /** founder 18 Nov: my own profile's ⋯ menu has "Show my QR" (the QR card was lost from the Me tab) */
  onQr?: () => void;
  /** 0184: the admin (View as member) still opens private lists */
  adminSees?: boolean;
  /** 25 Nov (mock F): the read-only Rings chip; its sheet links to the weekly leaderboard */
  onRanking?: () => void; top?: number;
  /** Retention 10: the opening question card + bestie streak line under the buttons */
  slot?: React.ReactNode;
}) {
  const { L, p } = props;
  const [menu, setMenu] = useState(false);
  const [chipOpen, setChipOpen] = useState(false);
  const closeChip = useCallback(() => setChipOpen(false), []);
  // another member: Rings and this week's rank only (kr8_card_extras gives those for anyone); their tasks and history are private
  const chip: RingsChipData | null = props.kx && !p.mine ? { rings: props.kx.lifetime ?? 0, rank: props.kx.week_rank ?? null, tasks: null, gap: null,
    top: props.top || 0, claim: 0, prizes: 0, week: props.kx.week ?? 0 } : null;
  // 0184: "Only me" lists: the counts stay, a tap shows a small glass note instead of the list (the server refuses it too)
  const locked = !!p.lists_private && !p.mine && !props.adminSees;
  const [privNote, setPrivNote] = useState(false);
  useEffect(() => { if (!privNote) return undefined; const t = setTimeout(() => setPrivNote(false), 3200); return () => clearTimeout(t); }, [privNote]);
  const openList = (k: 'followers' | 'following') => (locked ? setPrivNote(true) : props.onList(k));
  const list = props.reels?.reels || [];
  const handle = props.kx?.ig_handle || p.ig_handle;
  return (
    <div className="go-page go-prof" id="profileView" data-user={p.user_id}>
      <div className="go-hdr">
        <button type="button" className="go-bk" id="profileBack" aria-label={L('Back')} onClick={props.onBack}><IcBack /></button>
        <h1>{p.first_name}</h1>
        <button type="button" className="go-bk" id="profileMore" aria-label={L('More')} onClick={() => setMenu((m) => !m)}>⋯</button>
      </div>
      {menu && (
        <div className="kme-menu go-menu" role="menu">
          <button type="button" role="menuitem" id="profileShare" onClick={() => { setMenu(false); props.onShare(); }}>{L('Share profile')}</button>
          {p.mine && props.onQr ? <button type="button" role="menuitem" id="profileQr" onClick={() => { setMenu(false); props.onQr?.(); }}>{L('Show my QR')}</button> : null}
          {!p.mine && <button type="button" role="menuitem" id="profileReport" onClick={() => { setMenu(false); props.onReport(); }}>{L('Report')}</button>}
          {!p.mine && <button type="button" role="menuitem" className="bad" id="profileBlock" onClick={() => { setMenu(false); props.onBlock(); }}>{L('Block')}</button>}
        </div>
      )}
      {chip ? <div className="mc-pchip"><RingsChip L={L} Lf={props.Lf} d={chip} mine={false} onOpen={() => setChipOpen(true)} /></div> : null}
      {chip && chipOpen ? <RingsSheet L={L} Lf={props.Lf} d={chip} mine={false} onClose={closeChip} onRanking={props.onRanking} /> : null}
      {/* rv4 (founder pick Profile B, 20 Nov): round photo with a thin gold ring + stats beside it · name ✓ · area · languages · bio ·
          gold interest tags · Say hi (primary) + Follow · Reels grid edge to edge */}
      <ProfileHead L={L} lang={props.lang} p={p} stats={
        <div className="rv4-pst" id="profileStats">
          <div><b>{fmtN(list.length || p.reels.length)}</b><span>{L('Reels')}</span></div>
          <button type="button" data-locked={locked ? '1' : undefined} onClick={() => openList('followers')}><b id="profileFollowers">{fmtN(p.followers)}</b><span>{L('Followers')}</span></button>
          <button type="button" data-locked={locked ? '1' : undefined} onClick={() => openList('following')}><b id="profileFollowing">{fmtN(p.following)}</b><span>{L('Following')}</span></button>
        </div>
      } note={privNote ? <p className="rv4-lpriv" id="profileListPrivate" role="status"><span aria-hidden="true">🔒</span>{L('This member keeps their list private')}</p> : null} extra={(props.gender || handle || props.kx?.tiktok_handle) ? (
          <div className="rv-idx">
            {props.gender ? <span className="go-pg" id="profileGender"><GenderChip L={L} gender={props.gender} /></span> : null}
            {handle || props.kx?.tiktok_handle ? <SocialPills ig={handle} tt={props.kx?.tiktok_handle ?? null} compact /> : null}
          </div>
        ) : null} />
      {!p.mine ? (
        <div className="go-pbtns rv-acts rv4-acts">
          <button type="button" className="rv-hi" id="profileHi" onClick={props.onHi}>
            <span className="rv-hi-rings" aria-hidden="true"><i /><i /></span>{L('Say hi')}</button>
          <button type="button" className={`rv-fol${p.i_follow ? ' on' : ''}`} id="profileFollow" disabled={props.busy} onClick={props.onFollow}>
            {p.i_follow ? `${L('Following')} ✓` : p.follows_me ? L('Follow back') : L('Follow')}</button>
        </div>
      ) : null}
      {props.slot || null}
      <button type="button" className="rv-wk rv4-wk" id="profileScore" aria-label={L('See the math')} onClick={props.onMath}>
        <RingGlyph /><b>{fmtN(props.kx?.week ?? 0)}</b><span>{L('Rings this week')}</span><i aria-hidden="true">›</i></button>
      {props.reels === null ? <p className="go-empty">…</p> : list.length ? <GoGrid L={L} reels={list} onOpen={props.onOpen} /> : <p className="go-empty" id="profileNoReels">{L('No Reels yet')}</p>}
    </div>
  );
}

// ───────────── compose ─────────────
export function PeoplePicker(props: { L: Tx; picked: KxTagPerson[]; onDone: (list: KxTagPerson[]) => void; onClose: () => void; load?: (q: string) => Promise<KxTagPerson[]> }) {
  const { L } = props;
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<KxTagPerson[] | null>(null);
  const [picked, setPicked] = useState<KxTagPerson[]>(props.picked);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      (props.load || kxTagCandidates)(q.trim()).then((r) => { if (n === seq.current) setRows(r || []); }).catch(() => { if (n === seq.current) setRows([]); });
    }, q ? 240 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const flip = (p: KxTagPerson) => setPicked((cur) => (cur.some((x) => x.user_id === p.user_id) ? cur.filter((x) => x.user_id !== p.user_id) : cur.length >= 5 ? cur : [...cur, p]));
  const all = useMemo(() => [...picked.filter((p) => !(rows || []).some((r) => r.user_id === p.user_id)), ...(rows || [])], [rows, picked]);
  return (
    <div className="go-shbg" onClick={props.onClose}>
      <div className="go-sheet" id="goPeople" role="dialog" aria-label={L('Tag people')} onClick={(e) => e.stopPropagation()}>
        <h2>{L('Tag people')}</h2>
        <input className="go-inp" id="goPeopleSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Search a name')} aria-label={L('Search a name')} autoComplete="off" />
        <div className="go-plist">
          {rows === null ? <p className="go-empty">…</p> : all.length === 0 ? <p className="go-empty">{L('No one by that name yet')}</p> : all.map((p) => {
            const on = picked.some((x) => x.user_id === p.user_id);
            return (
              <button type="button" key={p.user_id} className={`go-prow${on ? ' on' : ''}`} data-person={p.first_name} aria-pressed={on} onClick={() => flip(p)}>
                <span className="go-av m" style={p.photo ? { backgroundImage: `url('${p.photo}')` } : undefined} />
                <span className="t"><b>{p.first_name}</b><small>{p.who === 'traveller' ? L('Traveller') : 'Kring Local'}{p.ig_handle ? ` · @${p.ig_handle}` : ''}</small></span>
                <span className="go-rd" />
              </button>
            );
          })}
        </div>
        <button type="button" className="go-btn" id="goPeopleDone" onClick={() => props.onDone(picked)}>{L('Done')}</button>
      </div>
    </div>
  );
}

export function GoCompose(props: {
  L: Tx; Lf: Txf; lang: string; reel: ReelInfo | null; stage: string; progress: number; problem: string;
  caption: string; onCaption: (s: string) => void; places: PickedPlace[]; onAddPlace: () => void; onRemovePlace: (id: string) => void;
  people: KxTagPerson[]; onPeople: (list: KxTagPerson[]) => void; onPick: (f: File | undefined) => void; onPost: () => void; onClose: () => void;
  loadPeople?: (q: string) => Promise<KxTagPerson[]>;
  /** tests only: what the browser says about the camera */
  camAccess?: () => Promise<CamAccess>;
}) {
  const { L, reel } = props;
  const [picker, setPicker] = useState(false);
  const [need, setNeed] = useState(false);
  const hl = useRef<HTMLDivElement>(null);
  const busy = ['preparing', 'uploading', 'saving'].includes(props.stage);
  const place = props.places[0];
  const placeLabel = props.places.map((p) => (props.lang === 'th' && p.name_th ? p.name_th : p.name_en)).join(' · ');
  useEffect(() => { if (place) setNeed(false); }, [place]);
  const post = () => {
    if (busy) return;
    if (!place) { setNeed(false); requestAnimationFrame(() => setNeed(true)); return; }
    props.onPost();
  };
  const file = (
    <input type="file" accept="video/*" aria-label={L('Pick a clip')} id="reelFile" style={{ display: 'none' }} disabled={busy}
      onChange={(e) => { props.onPick(e.target.files?.[0]); e.target.value = ''; }} />
  );
  if (!reel) {
    // 20 Nov (founder, camera-first): Post opens straight into the in-app camera (full screen, record, flip, gallery bottom-left).
    // No camera permission yet / no camera: one compact glass screen inside the same view ("Allow camera to film" + "Pick from gallery").
    const gallery = (cls: string, label: React.ReactNode, id: string) => (
      <label className={cls} id={id} aria-label={L('Pick from gallery')}>{label}{file}</label>
    );
    return (
      <div className="go-page go-compose" id="goCompose" data-step="pick">
        <ReelCamera L={L} problem={props.problem} gallery={gallery} access={props.camAccess} onClose={props.onClose} onDone={(f) => props.onPick(f)} />
      </div>
    );
  }
  return (
    <div className="go-page go-compose" id="goCompose" data-step="compose">
      <div className="go-hdr"><button type="button" className="go-bk" id="goComposeClose" aria-label={L('Close')} onClick={props.onClose} disabled={busy}><IcClose /></button><h1>{L('New Reel')}</h1><span className="go-steps"><i className="on" /><i className="on" /></span></div>
      <div className="go-cmp">
        <label className="go-clip" id="addReelPicker" aria-label={L('Change clip')}>
          <WindowVideo src={reel.url} win={reel.trim} />
          <span>{(reel.durationMs / 1000).toFixed(0)} s</span>{file}
        </label>
        <div className="go-capw">
          <div className="go-caph" ref={hl} aria-hidden="true">{hlTags(props.caption)}{'​'}</div>
          <textarea id="goCaption" maxLength={CAPTION_MAX} value={props.caption} placeholder={L('Write a caption… add #hashtags')} aria-label={L('Write a caption… add #hashtags')}
            onChange={(e) => props.onCaption(e.target.value)} onScroll={(e) => { if (hl.current) hl.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop; }} disabled={busy} />
        </div>
      </div>
      <div className="go-hrow" id="goTags"><span># {L('Hashtags')}</span>
        {GO_TAGS.map((h) => <button type="button" key={h} data-tag={h} disabled={busy} onClick={() => props.onCaption(addTag(props.caption, h))}>{h}</button>)}
      </div>
      <button type="button" className={`go-crow${need ? ' need' : ''}`} id="goPlaceRow" disabled={busy} onClick={props.onAddPlace}>
        <IcPin /><span className="ct"><b>{L('Add place')}</b><small id="goPlaceHint">{need ? L('Add a place first. It puts your Reel on the ranking.') : L('Needed for your Reel to count in the ranking')}</small></span>
        {place ? <span className="go-cchip" id="goPlaceChip">{placeLabel}</span> : <span className="go-cgo">›</span>}
      </button>
      <button type="button" className="go-crow" id="goPeopleRow" disabled={busy} onClick={() => setPicker(true)}>
        <IcPeople /><span className="ct"><b>{L('Tag people')}</b><small>{props.people.length ? props.people.map((m) => `@${m.first_name}`).join(' ') : L('Friends who are in this Reel')}</small></span>
        {props.people.length ? <span className="go-cavs">{props.people.slice(0, 4).map((m) => <i key={m.user_id} style={m.photo ? { backgroundImage: `url('${m.photo}')` } : undefined} />)}</span> : <span className="go-cgo">›</span>}
      </button>
      {props.problem ? <div className="go-problem" id="reelProblem" role="alert">{props.problem}</div> : null}
      {busy ? (
        <div className="go-progress" id="reelProgress"><span>{props.stage === 'preparing' ? L('Preparing your Reel') : props.stage === 'uploading' ? L('Uploading') : L('Saving')} · {Math.round(props.progress * 100)}%</span><i style={{ width: `${Math.round(props.progress * 100)}%` }} /></div>
      ) : null}
      {busy ? <p className="go-keep" id="reelKeepOpen">{L('Keep this screen open until done')}{props.lang === 'th' ? <small>Keep this screen open until done</small> : null}</p> : null}
      <div className="go-foot"><button type="button" className="go-btn" id="shareNowBtn" disabled={busy} onClick={post}>{props.stage === 'failed' ? L('Retry') : L('Post')}</button></div>
      {picker ? <PeoplePicker L={L} picked={props.people} load={props.loadPeople} onClose={() => setPicker(false)} onDone={(l) => { props.onPeople(l); setPicker(false); }} /> : null}
    </div>
  );
}

// ───────────── coach mark ─────────────
export interface CoachSpot { key: string; rect: { x: number; y: number; w: number; h: number }; text: string }
/** Spotlight on one control + a white bubble with "Got it". Tap anywhere to close. Never blocks: the first tap closes it. */
export function GoCoach(props: { L: Tx; spot: CoachSpot; onDone: () => void }) {
  const { rect: r } = props.spot;
  const W = typeof window === 'undefined' ? 390 : Math.min(window.innerWidth, 480);
  const H = typeof window === 'undefined' ? 844 : window.innerHeight;
  const pad = 7;
  const round = r.w / Math.max(1, r.h) < 1.6;
  const d = Math.max(r.w, r.h) + pad * 2;
  const hx = round ? r.x + r.w / 2 - d / 2 : r.x - pad, hy = round ? r.y + r.h / 2 - d / 2 : r.y - pad;
  const hw = round ? d : r.w + pad * 2, hh = round ? d : r.h + pad * 2;
  const bx = Math.min(Math.max(12, hx + hw / 2 - 116), W - 244);
  const below = hy < 190;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') props.onDone(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="go-coach" id="goCoach" data-coach={props.spot.key} role="dialog" aria-live="polite" onClick={props.onDone}>
      <div className="go-hole" style={{ left: hx, top: hy, width: hw, height: hh, borderRadius: round ? '50%' : 22 }} />
      <div className="go-bub" style={below ? { left: bx, top: hy + hh + 14 } : { left: bx, bottom: H - hy + 14 }}>
        {props.spot.text}<button type="button" id="goCoachOk">{props.L('Got it')}</button>
      </div>
    </div>
  );
}
