/**
 * Retention push, Feed part (25 Nov 2026). Newcomers post once and hear nothing back, so:
 *
 * 1. "New in Bangkok 👋" (TH "มาใหม่ในกรุงเทพฯ 👋"): a slim story-style row over the top of the first Reel. For 24 h after a
 *    member's FIRST approved Reel (and first Ask BKK answer) they sit here, so regulars see them and like / reply.
 *    Data: kr8_feed_new_faces (m212): no ghosts, no Kring Team, nothing hidden / unapproved / feed-off / reported / blocked.
 *    The row is not rendered at all when empty.
 * 2. Ask BKK vote cards between Reels (after every 4th): one Ask BKK question, its top 3 answers; one tap = the ordinary ▲
 *    upvote on that answer (kr8_feed_vote → kr8_ask_vote, unchanged; no Rings). Then a truthful result line: from 10 other
 *    voters a percentage, below that the count in words. Questions the member already answered or voted on are skipped.
 */
import { useEffect, useRef, useState } from 'react';
import { usePosters } from './V5Go';
import { AskText } from './askTr';
import { hasThai, mostlyEnglish } from './askThai';
import { initialAvatar } from './v8Data';
import './feedRet.css';

type LFn = (en: string) => string;
const lib = () => import('./v5Live');
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = await (await lib()).v5Client();
  const r = await c.rpc(fn, args);
  if (r.error) throw r.error;
  return r.data as T;
}

// ───────────────────────────── 1. New in Bangkok ─────────────────────────────
export interface NewFace {
  k: 'reel' | 'ans'; id: string; author_id: string; name: string; body: string | null; at: string; mine: boolean; verified: boolean;
  poster_path?: string; video_path?: string; likes?: number; liked?: boolean; saved?: boolean;
  post_id?: string; photo?: string | null;
}
export const NEW_FACES_HOURS = 24;
export const feedNewFaces = (hours = NEW_FACES_HOURS) =>
  rpc<{ hours: number; items: NewFace[] }>('kr8_feed_new_faces', { p_hours: hours }).then((r) => (r?.items || []).filter((x) => x && x.id));

const SEEN_KEY = 'kr8_newfaces_seen';
function readSeen(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; }
}
function markSeen(id: string) {
  try {
    const s = readSeen();
    s[id] = Date.now();
    const cut = Date.now() - 3 * 86400_000;   // keep the list short: only the last 3 days
    Object.keys(s).forEach((k) => { if (s[k] < cut) delete s[k]; });
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch { /* private mode: the ring just stays bright */ }
}

export function NewFacesRow(p: { L: LFn; items: NewFace[]; away?: boolean; onReel: (i: number) => void; onAnswer: (f: NewFace) => void }) {
  const [seen, setSeen] = useState<Record<string, number>>(readSeen);
  const posters = usePosters(p.items.filter((x) => x.k === 'reel' && x.poster_path).map((x) => x.poster_path as string));
  if (!p.items.length) return null;
  // unseen first; inside each group the newest first (the server order)
  const order = p.items.map((f, i) => ({ f, i })).sort((a, b) => Number(!!seen[a.f.id]) - Number(!!seen[b.f.id]) || a.i - b.i);
  const reelIds = p.items.filter((x) => x.k === 'reel').map((x) => x.id);
  return (
    <div className={`nf${p.away ? ' away' : ''}`} id="newFaces" aria-hidden={p.away || undefined} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="nf-h">{p.L('New in Bangkok 👋')}</div>
      <div className="nf-row" role="list">
        {order.map(({ f }) => {
          const img = f.k === 'reel' ? posters[f.poster_path || ''] : f.photo || initialAvatar(f.name);
          const isSeen = !!seen[f.id];
          return (
            <button type="button" role="listitem" key={f.id} className={`nf-t${isSeen ? ' seen' : ''}${f.k === 'ans' ? ' ans' : ''}`}
              data-nf={f.k} data-id={f.id}
              aria-label={`${f.name} · ${f.k === 'reel' ? p.L('First Reel') : p.L('First answer')}`}
              onClick={() => {
                markSeen(f.id); setSeen(readSeen());
                if (f.k === 'reel') p.onReel(reelIds.indexOf(f.id)); else p.onAnswer(f);
              }}>
              <span className="nf-ring"><span className="nf-img" style={img ? { backgroundImage: `url("${img}")` } : undefined} /></span>
              {f.k === 'ans' ? (
                <span className="nf-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M20.5 11.6c0 4.4-3.8 7.9-8.5 7.9-1.3 0-2.6-.3-3.7-.8L3.5 20l1.2-3.9c-.8-1.3-1.2-2.8-1.2-4.5C3.5 7.2 7.3 3.7 12 3.7s8.5 3.5 8.5 7.9z" /></svg>
                </span>
              ) : null}
              <span className="nf-n">{f.mine ? p.L('You') : f.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── 2. Ask BKK vote cards ─────────────────────────────
export interface VoteAnswer { id: string; body: string; score: number; name: string }
export interface VoteCard { id: string; body: string; details: string | null; official: boolean; at: string; answers: number; voters: number; top: VoteAnswer[] }
export interface VoteResult { others: number; same: number; pct: number | null }
export const feedVoteCards = (limit = 6) => rpc<VoteCard[]>('kr8_feed_vote_cards', { p_limit: limit }).then((r) => (r || []).filter((c) => c && c.top && c.top.length >= 2));
export const feedVote = (answer: string) => rpc<VoteResult>('kr8_feed_vote', { p_answer: answer });
/** after every Nth Reel a vote card (founder brief: every 4th) */
export const VOTE_EVERY = 4;
/** percentages from this many other voters (the This or That rule, 24 Nov) */
export const VOTE_PCT_FROM = 10;

/** the result line, one language, never a made-up number */
export function voteLine(L: LFn, r: VoteResult): { main: string; sub: string | null } {
  const f = (s: string, a: number | string, b: number | string = '') => L(s).replace('{0}', String(a)).replace('{1}', String(b));
  if (r.pct !== null && r.others >= VOTE_PCT_FROM) return { main: f('You agree with {0}% of Bangkok', r.pct), sub: f('{0} people voted here', r.others) };
  if (r.others === 0) return { main: L('You’re the first to vote on this one'), sub: L('Bangkok’s % shows from 10 votes') };
  if (r.same === 0) return { main: f('No one else picked this yet · {0} voted here', r.others), sub: L('Bangkok’s % shows from 10 votes') };
  return { main: f('{0} of {1} who voted here picked this too', r.same, r.others), sub: L('Bangkok’s % shows from 10 votes') };
}

/** the same Bangkok street photos and tints the Ask BKK timeline uses (picked from the question id, so it never jumps) */
const SCENES = ['charoen-krung', 'khao-san-road', 'siam-square', 'thonglor', 'sampeng-lane', 'lhong-1919', 'asiatique-the-riverfront', 'talat-phlu',
  'phra-athit-road', 'silom-road', 'ekkamai', 'giant-swing', 'chatuchak-weekend-market', 'pak-khlong-talat'];
const TINTS = ['pk', 'bl', 'gd', 'tl'];
function pickScene(id: string): { scene: string; tint: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return { scene: SCENES[h % SCENES.length], tint: TINTS[(h >>> 4) % TINTS.length] };
}
const BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/app/');

export function VoteSlide(p: {
  L: LFn; lang: string; card: VoteCard; result: { pick: string; r: VoteResult } | null; busy: string | null;
  onPick: (answer: string) => void; onOpen: () => void;
}) {
  const { L, card } = p;
  const sc = pickScene(card.id);
  // a Kring Team question carries both languages (English body, Thai details): show the reader's one only
  const official2 = card.official && !!card.details && mostlyEnglish(card.body) && hasThai(card.details);
  const qText = official2 ? (p.lang === 'th' ? (card.details as string) : card.body) : card.body;
  const picked = p.result?.pick || p.busy;
  const line = p.result ? voteLine(L, p.result.r) : null;
  const [grow, setGrow] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const feed = el?.closest('#s-feed');
    if (!el || !feed || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => { feed.classList.toggle('fv-cur', e.isIntersecting && e.intersectionRatio > 0.6); }, { threshold: [0, 0.6, 1] });
    io.observe(el);
    return () => { io.disconnect(); feed.classList.remove('fv-cur'); };
  }, []);
  useEffect(() => { if (!p.result) { setGrow(false); return undefined; } const t = setTimeout(() => setGrow(true), 40); return () => clearTimeout(t); }, [p.result]);
  return (
    <div ref={ref} className={`slide fv t-${sc.tint}`} data-vote-card={card.id} onClick={(e) => e.stopPropagation()}>
      <span className="fv-scene" aria-hidden="true" style={{ backgroundImage: `url('${BASE}media/places/${sc.scene}.jpg')` }} />
      <div className="fv-body">
        <div className="fv-k">{L('Ask BKK')} · {card.answers === 1 ? L('1 answer') : L('{0} answers').replace('{0}', String(card.answers))}</div>
        {official2
          ? <h2 className="fv-q">{qText}</h2>
          : <AskText L={L} kind="q" id={card.id} text={qText} as="div" className="fv-q" />}
        <p className="fv-hint">{picked ? ' ' : L('Tap the answer you agree with')}</p>
        <div className="fv-opts" role="group" aria-label={L('Answers')}>
          {card.top.map((a) => {
            const me = picked === a.id;
            return (
              <button type="button" key={a.id} data-answer={a.id}
                className={`fv-o${me ? ' mine' : picked ? ' other' : ''}`} disabled={!!picked} aria-pressed={me}
                onClick={() => p.onPick(a.id)}>
                <AskText L={L} kind="a" id={a.id} text={a.body} className="fv-t" />
                <span className="fv-by">{a.name === 'Kring Team' ? L('Kring Team') : a.name}</span>
                {me ? <span className="fv-ok" aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
        <div className={`fv-res${line ? ' on' : ''}`} aria-live="polite">
          {line ? (
            <>
              <b>{line.main}</b>
              {p.result && p.result.r.pct !== null ? <span className="fv-bar" aria-hidden="true"><i style={{ width: grow ? `${Math.max(4, p.result.r.pct)}%` : '0%' }} /></span> : null}
              {line.sub ? <small>{line.sub}</small> : null}
            </>
          ) : null}
        </div>
        <button type="button" className="fv-all" onClick={p.onOpen}>
          {card.answers === 1 ? L('See the answer') : L('See all {0} answers').replace('{0}', String(card.answers))}
        </button>
      </div>
    </div>
  );
}
