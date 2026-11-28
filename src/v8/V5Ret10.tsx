import { useAskTr } from './askTr';
/**
 * Retention 10 (26 Nov 2026) — the screens. Founder-approved mock canvas, built light: dark glass like the tasks sheet and the
 * first-visit strip, the app's blue→pink only on bars / rings / the main button, no borders, no glow, Kring rings glyph for Rings.
 * Data + words: ret10.ts. Server: m219–m224.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePosters } from './V5Go';
import { initialAvatar } from './v8Data';
import {
  b5Arm, b5Hidden, b5Hide, b5Store, bestieAct, bestieInvite, bestieNudge, bestieOf, bestiePill, bestieSeen, bestieStore, errCode, extraStore, fairPlay,
  dailyStore, fmt, followSuggest, HTW_OPEN, htwHero, seatsStore, fpParts, HOW_OPEN, openHowItWorks, rulesStore, newcomers, createPhoto, photoStore, type MemberPhoto, OQ_PRESETS, PO_OPEN, openQAnswer, openQOf, poMarkSeen, poReason, poSeen, poStore, r10Tx, setOpenQ, taskExtraClaim,
  type Bestie, type BestieOf, type DailyPick, type FairPlay, type FollowSuggest, type Newcomers, type OpenQ, type R10Reel,
} from './ret10';
import { v5CompressImage, v5DailyPhotoCheck, v5ToggleLike, v5ToggleSave } from './v5Live';
import { tasksRefresh, useTasks } from './V5Tasks';
import './ret10.css';

export const R10_PLAY = 'kr8:r10-play';
export const R10_PROFILE = 'kr8:r10-profile';
export function playReels(reels: R10Reel[], start: number, title?: string) {
  try { window.dispatchEvent(new CustomEvent(R10_PLAY, { detail: { reels, start, title } })); } catch { /* old browser */ }
}
export function openProfileOf(id: string) { try { window.dispatchEvent(new CustomEvent(R10_PROFILE, { detail: id })); } catch { /* old browser */ } }
const placeOf = (lang: string, r: R10Reel) => (r.place ? (lang === 'th' ? r.place.th || r.place.en : r.place.en || r.place.th) : null) || '';

/** the Kring interlocking rings (same glyph as the tasks sheet) */
export const RingsIc = ({ s = 16 }: { s?: number }) => (
  <svg className="r10-rings" width={s} height={s * 0.6} viewBox="0 0 34 20" aria-hidden="true"><circle cx="11" cy="10" r="7.5" className="b" /><circle cx="23" cy="10" r="7.5" className="p" /></svg>
);
const Av = ({ photo, name, cls = '' }: { photo: string | null | undefined; name: string; cls?: string }) => (
  <span className={`r10-av ${cls}`} style={{ backgroundImage: `url("${photo || initialAvatar(name || '?')}")` }} aria-hidden="true" />
);
function Sheet(props: { id: string; label: string; onClose: () => void; children: ReactNode; cls?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // portalled to the app root: above the tab bar and outside any page that makes its own stacking layer
  const host = (typeof document !== 'undefined' && document.querySelector('.v8-app-root')) || null;
  const el = (
    <div className="r10-wrap" role="dialog" aria-modal="true" aria-label={props.label} onClick={(e) => e.stopPropagation()}>
      <div className="r10-dim" onClick={props.onClose} />
      <div className={`r10-sheet ${props.cls || ''}`} id={props.id}><div className="r10-grab" />{props.children}</div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}

// ───────────────────────────── 1. Welcome new Locals (tasks sheet card) ─────────────────────────────
export function WelcomeCard(props: { lang: string; onFace: () => void; onClose: () => void }) {
  const tx = r10Tx(props.lang);
  const x = extraStore.use(true);
  const w = x?.welcome;
  const posters = usePosters((w?.reels || []).map((r) => r.poster_path));
  const [busy, setBusy] = useState(false);
  if (!x || x.gated || !w || (!w.reels.length && !w.claimed)) return null;
  const n = w.goal;
  const claim = async () => {
    setBusy(true);
    try { extraStore.set(await taskExtraClaim('welcome')); window.dispatchEvent(new Event('kr8:tasks-refresh')); }
    catch (e) { if (errCode(e) === 'TASK_FACE') props.onFace(); } finally { setBusy(false); }
  };
  return (
    <section className="r10-wc" id="r10Welcome" data-done={w.done ? '1' : '0'} lang={props.lang === 'th' ? 'th' : 'en'}>
      <div className="r10-wc-h">
        <span><b>{n === 1 ? tx.welcome1 : fmt(tx.welcome3, n)}</b><small>{w.claimed ? tx.welcomeDone : tx.welcomeSub}</small></span>
        <em className="r10-pill">{w.rings === 1 ? tx.ring1 : fmt(tx.rings, w.rings)}</em>
      </div>
      {w.reels.length ? (
        <div className="r10-wc-g" style={{ gridTemplateColumns: `repeat(${Math.max(w.reels.length, 2)}, minmax(0, 1fr))` }}>
          {w.reels.map((r, i) => (
            <button type="button" key={r.id} className={`r10-wc-t${r.liked ? ' liked' : ''}`} data-welcome={r.id}
              onClick={() => { props.onClose(); playReels(w.reels, i, tx.welcomeSub); }}>
              <span className="r10-wc-img" style={posters[r.poster_path] ? { backgroundImage: `url("${posters[r.poster_path]}")` } : undefined}>
                <i className="r10-new">{tx.newTag}</i>{r.liked ? <i className="r10-ok" aria-hidden="true">♥</i> : null}
              </span>
              <span className="r10-wc-n">{r.name}{placeOf(props.lang, r) ? ` · ${placeOf(props.lang, r)}` : ''}</span>
              <span className="r10-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (r.likes / 5) * 100)}%` }} /></span>
              <small>{fmt(tx.ofLikes, Math.min(r.likes, 5))}</small>
            </button>
          ))}
        </div>
      ) : null}
      {w.claimed ? null : w.done ? (
        <button type="button" className="r10-main" id="r10WelcomeClaim" disabled={busy} onClick={() => void claim()}><RingsIc />{tx.claim} {fmt(tx.rings, w.rings)}</button>
      ) : (
        <button type="button" className="r10-main" id="r10WelcomeGo" onClick={() => { const i = Math.max(0, w.reels.findIndex((r) => !r.liked)); props.onClose(); playReels(w.reels, i, tx.welcomeSub); }}>
          {tx.watchLike} · {w.liked}/{n}</button>
      )}
    </section>
  );
}

// ───────────────────────────── 5. Bangkok at 5 ─────────────────────────────
/** one row in the tasks sheet list */
export function B5TaskRow(props: { lang: string; onFace: () => void; onClose: () => void }) {
  const tx = r10Tx(props.lang);
  const x = extraStore.use(true);
  const [busy, setBusy] = useState(false);
  const b = x?.b5;
  if (!x || x.gated || !b) return null;
  const st = b.claimed ? 'done' : b.done ? 'claim' : b.status === 'pending' ? 'wait' : b.status === 'hidden' ? 'off' : b.open ? 'go' : 'soon';
  const claim = async () => {
    setBusy(true);
    try { extraStore.set(await taskExtraClaim('b5')); window.dispatchEvent(new Event('kr8:tasks-refresh')); }
    catch (e) { if (errCode(e) === 'TASK_FACE') props.onFace(); } finally { setBusy(false); }
  };
  return (
    <div className={`dt-row st-${st} r10-b5row`} data-task="b5">
      <span className="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg></span>
      <span className="tx"><b>{tx.b5}</b><small>{st === 'wait' ? tx.b5Review : st === 'off' ? tx.b5Hidden : st === 'soon' ? tx.b5Opens : tx.b5TaskSub}</small></span>
      <span className="rw">+{b.rings}</span>
      {st === 'done' ? <span className="dt-btn done">{tx.done}</span>
        : st === 'claim' ? <button type="button" className="dt-btn claim" disabled={busy} onClick={() => void claim()}>{tx.claim}</button>
        : st === 'go' ? <button type="button" className="dt-btn" onClick={() => { props.onClose(); b5Arm(); window.dispatchEvent(new Event('kr8:post')); }}>{tx.go}</button>
        : <span className="dt-tag">{st === 'soon' ? '17:00' : '…'}</span>}
    </div>
  );
}

/** Feed: the slim banner in the ticker's place, 17:00–19:00 Bangkok, until the member posts or hides it for the day */
export function B5Banner(props: { lang: string; onOpen: () => void; onHidden?: () => void }) {
  const tx = r10Tx(props.lang);
  const x = extraStore.use(true);
  const row = b5Store.use(true);
  const [, setH] = useState(0);
  const b = x?.b5;
  if (!b || !b.open || x?.gated || b.clip || b5Hidden(x?.day || '')) return null;
  const n = row?.n_today || 0;
  return (
    <div className="onb r10-b5ban" id="r10B5Banner" lang={props.lang === 'th' ? 'th' : 'en'}>
      <button type="button" className="onb-line" onClick={props.onOpen} aria-label={`${tx.b5Banner} · ${tx.b5How}`}>
        <span className="onb-l1"><b>{tx.b5Banner}</b></span>
        <span className="r10-b5sub">{n ? `${n === 1 ? tx.b5N1 : fmt(tx.b5N, n)} · ` : ''}{tx.b5How}</span>
      </button>
      <button type="button" className="r10-x" aria-label={tx.close} onClick={() => { b5Hide(x?.day || ''); setH((k) => k + 1); props.onHidden?.(); }}>×</button>
    </div>
  );
}

/** the "5pm" tile at the start of the New in Bangkok row (approved clips of the last 24 h) */
export function B5Tile(props: { lang: string; onOpen: () => void }) {
  const tx = r10Tx(props.lang);
  const row = b5Store.use(true);
  const posters = usePosters(row?.items?.length ? [row.items[0].poster_path] : []);
  if (!row || !row.items.length) return null;
  const img = posters[row.items[0].poster_path];
  return (
    <button type="button" role="listitem" className="nf-t r10-b5t" id="r10B5Tile" aria-label={tx.b5} onClick={props.onOpen}>
      <span className="nf-ring r10-b5ring"><span className="nf-img" style={img ? { backgroundImage: `url("${img}")` } : undefined} /></span>
      <span className="r10-b5n" aria-hidden="true">{row.n}</span>
      <span className="nf-n">{tx.b5Tile}</span>
    </button>
  );
}

export function B5Sheet(props: { lang: string; onClose: () => void }) {
  const tx = r10Tx(props.lang);
  const row = b5Store.use(true);
  const x = extraStore.use(true);
  const posters = usePosters((row?.items || []).map((r) => r.poster_path));
  useEffect(() => { void b5Store.refresh(); void extraStore.refresh(); }, []);
  const items = row?.items || [];
  const today = items.filter((r) => r.day === row?.day);
  const b = x?.b5;
  const n = row?.n_today || 0;
  return (
    <Sheet id="r10B5Sheet" label={tx.b5} onClose={props.onClose}>
      <div className="r10-b5h">
        <b>{tx.b5}</b>
        <small>{n ? (n === 1 ? tx.b5N1 : fmt(tx.b5N, n)) : items.length ? tx.b5Yday : tx.b5None}</small>
      </div>
      {items.length ? (
        <div className="r10-b5g">
          {(today.length ? today : items).slice(0, 9).map((r, i, a) => (
            <button type="button" key={r.id} className="r10-b5c" data-b5={r.id} onClick={() => { props.onClose(); playReels(a, i, tx.b5); }}
              style={posters[r.poster_path] ? { backgroundImage: `url("${posters[r.poster_path]}")` } : undefined}>
              <span>{placeOf(props.lang, r) || r.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      {b && !x?.gated ? (
        b.clip ? <p className="r10-note" id="r10B5State">{b.status === 'pending' ? tx.b5Review : b.status === 'hidden' ? tx.b5Hidden : tx.done}</p>
          : b.open ? (
            <>
              <p className="r10-note">{tx.b5How} · {tx.b5Until}</p>
              <button type="button" className="r10-main" id="r10B5Post" onClick={() => { props.onClose(); b5Arm(); window.dispatchEvent(new Event('kr8:post')); }}>{tx.b5Post}</button>
            </>
          ) : <p className="r10-note">{tx.b5Opens}</p>
      ) : null}
    </Sheet>
  );
}

// ───────────────────────────── 3. Follow 3 (first-visit steps) ─────────────────────────────
let f3Cache: FollowSuggest | null = null;
export function Follow3Row(props: { lang: string; onOpen: () => void }) {
  const tx = r10Tx(props.lang);
  const [s, setS] = useState<FollowSuggest | null>(f3Cache);
  useEffect(() => { followSuggest().then((r) => { f3Cache = r; setS(r); }).catch(() => undefined); }, []);
  if (!s || !s.eligible || ((s.following || 0) < 3 && !(s.people || []).length)) return null;
  const n = Math.min(s.following || 0, 3);
  const done = n >= 3;
  return (
    <div className={`onb-step r10-f3row${done ? ' done' : ''}`} data-step="follow">
      <span className="onb-dot" aria-hidden="true">{done ? '✓' : '+'}</span>
      <span className="onb-tx">{tx.f3Row}{!done && n > 0 ? <em> · {n}/3</em> : null}</span>
      {done ? null : <button type="button" className="onb-go" id="r10F3Go" onClick={props.onOpen}>{tx.follow}</button>}
    </div>
  );
}

export function Follow3Sheet(props: { lang: string; onClose: () => void; onFollow: (id: string) => Promise<boolean> }) {
  const tx = r10Tx(props.lang);
  const [s, setS] = useState<FollowSuggest | null>(f3Cache);
  const [on, setOn] = useState<Record<string, 'busy' | 'on'>>({});
  const [base, setBase] = useState<number | null>(null);
  useEffect(() => { followSuggest().then((r) => { f3Cache = r; setS(r); setBase(Math.min(r.following || 0, 3)); }).catch(() => undefined); }, []);
  const done = Object.values(on).filter((v) => v === 'on').length;
  const n = Math.min(3, (base ?? 0) + done);
  const follow = async (id: string) => {
    if (on[id]) return;
    setOn((o) => ({ ...o, [id]: 'busy' }));
    const ok = await props.onFollow(id).catch(() => false);
    setOn((o) => { const c = { ...o }; if (ok) c[id] = 'on'; else delete c[id]; return c; });
  };
  const area = s?.area && s.area !== 'Bangkok' ? s.area : '';
  return (
    <Sheet id="r10Follow3" label={tx.f3Title} onClose={() => { f3Cache = null; props.onClose(); }}>
      <div className="r10-steps" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}</div>
      <h2 className="r10-h2">{area ? fmt(tx.f3Near, area) : tx.f3Title}</h2>
      <p className="r10-sub">{tx.f3Sub}</p>
      <div className="r10-list">
        {(s?.people || []).map((p) => {
          const st = on[p.user_id];
          return (
            <div className="r10-prow" key={p.user_id} data-f3={p.user_id}>
              <button type="button" className="r10-who" onClick={() => openProfileOf(p.user_id)}>
                <Av photo={p.photo} name={p.first_name} />
                <span><b>{p.first_name}<i className="r10-vf" aria-label="verified">✓</i></b><small>{p.reels === 1 ? tx.nReel1 : fmt(tx.nReels, p.reels)}</small></span>
              </button>
              <button type="button" className={`r10-fol${st === 'on' ? ' on' : ''}`} disabled={!!st} aria-pressed={st === 'on'} onClick={() => void follow(p.user_id)}>
                {st === 'on' ? tx.following : tx.follow}</button>
            </div>
          );
        })}
        {s && !(s.people || []).length ? <p className="r10-note">…</p> : null}
      </div>
      <button type="button" className="r10-main" id="r10F3Done" onClick={() => { f3Cache = null; props.onClose(); }}>
        {n >= 3 ? fmt(tx.f3Done, n) : fmt(tx.f3Prog, n)}</button>
      {n < 3 ? <button type="button" className="r10-link" id="r10F3Skip" onClick={() => { f3Cache = null; props.onClose(); }}>{tx.skip}</button> : null}
    </Sheet>
  );
}

// ───────────────────────────── 4. Live on your profile ─────────────────────────────
export function ProfileOnlyWatcher(props: { lang: string; active: boolean; onPost: () => void; onWatch: (id: string) => void }) {
  const d = poStore.use(props.active);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (props.active) void poStore.refresh(); }, [props.active]);
  useEffect(() => {   // once per Reel on this phone
    if (!props.active || !d || open) return;
    const seen = poSeen();
    const fresh = d.reels.find((r) => !seen.includes(r.id));
    if (fresh) setOpen(fresh.id);
  }, [d, props.active]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<string>).detail);
    window.addEventListener(PO_OPEN, on);
    return () => window.removeEventListener(PO_OPEN, on);
  }, []);
  const r = open ? d?.reels.find((x) => x.id === open) : null;
  if (!r || !d) return null;
  return <ProfileOnlySheet lang={props.lang} reel={r} examples={d.examples} onClose={() => { poMarkSeen(r.id); setOpen(null); }}
    onPost={() => { poMarkSeen(r.id); setOpen(null); props.onPost(); }} onWatch={() => { poMarkSeen(r.id); setOpen(null); props.onWatch(r.id); }} />;
}
export function ProfileOnlySheet(props: { lang: string; reel: { id: string; poster_path: string; reason: string | null }; examples: R10Reel[];
  onClose: () => void; onPost: () => void; onWatch: () => void }) {
  const tx = r10Tx(props.lang);
  const posters = usePosters([props.reel.poster_path, ...props.examples.map((e) => e.poster_path)]);
  const [title, tip] = poReason(props.lang, props.reel.reason);
  return (
    <Sheet id="r10ProfileOnly" label={tx.poTitle} onClose={props.onClose}>
      <div className="r10-poh">
        <button type="button" className="r10-pot" aria-label={tx.poWatch} onClick={props.onWatch}
          style={posters[props.reel.poster_path] ? { backgroundImage: `url("${posters[props.reel.poster_path]}")` } : undefined} />
        <span>
          <b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>{tx.poTitle}</b>
          <small>{tx.poSub}</small>
        </span>
      </div>
      <div className="r10-why" id="r10PoWhy" data-reason={props.reel.reason || ''}>
        <small>{tx.poWhy}</small><b>{title}</b><span>{tip}</span>
      </div>
      {props.examples.length ? (
        <>
          <p className="r10-k">{tx.poExamples}</p>
          <div className="r10-ex">
            {props.examples.map((e, i) => (
              <button type="button" key={e.id} className="r10-exc" onClick={() => { props.onClose(); playReels(props.examples, i, tx.poExamples); }}
                style={posters[e.poster_path] ? { backgroundImage: `url("${posters[e.poster_path]}")` } : undefined}>
                <span>{e.name}{placeOf(props.lang, e) ? ` · ${placeOf(props.lang, e)}` : ''}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button type="button" className="r10-main" id="r10PoPost" onClick={props.onPost}>{tx.poPost}</button>
      <button type="button" className="r10-link" id="r10PoWatch" onClick={props.onWatch}>{tx.poWatch}</button>
    </Sheet>
  );
}

// ───────────────────────────── 6. Profile question opens the chat ─────────────────────────────
const oqCache = new Map<string, OpenQ>();
export function useOpenQ(user: string | null | undefined, on = true): OpenQ | null {
  const [q, setQ] = useState<OpenQ | null>(user ? oqCache.get(user) || null : null);
  useEffect(() => {
    if (!user || !on) { setQ(null); return undefined; }
    let dead = false;
    setQ(oqCache.get(user) || null);
    openQOf(user).then((r) => { oqCache.set(user, r); if (!dead) setQ(r); }).catch(() => undefined);
    return () => { dead = true; };
  }, [user, on]);
  return q;
}
/** m240 (27 Nov, founder): another member's question reads in the reader's app language, like their bio */
function QTr(props: { user: string; text: string }) {
  return <>{useAskTr('o', props.user, props.text) || props.text}</>;
}
/** inside the Say hi sheet: the question card + the answer box (replaces the openers and the free hello) */
export function OpenQAnswer(props: { lang: string; to: string; name: string; q: string; onSent: (thread: string) => void; onError: (m: string) => void }) {
  const tx = r10Tx(props.lang);
  const [a, setA] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = a.trim();
    if (t.length < 2 || busy) return;
    setBusy(true);
    try { const id = await openQAnswer(props.to, t); oqCache.delete(props.to); props.onSent(id); }
    catch (e) { props.onError(errCode(e)); } finally { setBusy(false); }
  };
  return (
    <div className="r10-oq" id="r10OpenQ">
      <div className="r10-oqc"><small>{fmt(tx.asks, props.name)}</small><b><QTr user={props.to} text={props.q} /></b><span>{tx.answerStarts}</span></div>
      <label className="r10-lab" htmlFor="r10OqAns">{tx.yourAnswer}</label>
      <div className="r10-oqi">
        <textarea id="r10OqAns" rows={2} maxLength={280} value={a} onChange={(e) => setA(e.target.value)} />
        <button type="button" className="r10-send" id="r10OqSend" aria-label={tx.sendAnswer} disabled={busy || a.trim().length < 2} onClick={() => void send()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
      </div>
      <p className="r10-note">{fmt(tx.noHi, props.name)}</p>
    </div>
  );
}
/** on another member's profile: their question, one tap opens the answer (= Say hi) */
export function ProfileQCard(props: { lang: string; user: string; name: string; onAnswer: () => void }) {
  const tx = r10Tx(props.lang);
  const q = useOpenQ(props.user);
  if (!q || !q.on || !q.q || q.thread) return null;
  return (
    <button type="button" className="r10-oqc r10-pq" id="profileOpenQ" onClick={props.onAnswer}>
      <small>{fmt(tx.asks, props.name)}</small><b><QTr user={props.user} text={q.q} /></b><span>{tx.answerStarts} ›</span>
    </button>
  );
}
/** Me: one quiet line + an editor sheet */
export function OpenQMeLine(props: { lang: string; uid: string }) {
  const tx = r10Tx(props.lang);
  const q = useOpenQ(props.uid);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<OpenQ | null>(null);
  const v = cur || q;
  return (
    <>
      <button type="button" className="me-st2 r10-meln" id="meOpenQ" onClick={() => setOpen(true)}>
        <span aria-hidden="true">✦ </span>{fmt(tx.oqLine, v?.on ? tx.oqOn : tx.oqOff)}<span aria-hidden="true"> ›</span>
      </button>
      {open ? <OpenQEditor lang={props.lang} cur={v} onClose={() => setOpen(false)} onSaved={(r) => { const n = { user_id: props.uid, on: r.on, q: r.q, thread: null }; oqCache.set(props.uid, n); setCur(n); setOpen(false); }} /> : null}
    </>
  );
}
function OpenQEditor(props: { lang: string; cur: OpenQ | null; onClose: () => void; onSaved: (r: { q: string | null; on: boolean }) => void }) {
  const tx = r10Tx(props.lang);
  const [q, setQ] = useState(props.cur?.q || '');
  const [on, setOn] = useState(props.cur ? props.cur.on : true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { props.onSaved(await setOpenQ(q, on && q.trim().length > 0)); } catch { setErr(tx.oqBad); } finally { setBusy(false); }
  };
  return (
    <Sheet id="r10OqEdit" label={tx.oqTitle} onClose={props.onClose}>
      <div className="r10-sw">
        <span><b>{tx.oqTitle}</b><small>{tx.oqSub}</small></span>
        <button type="button" role="switch" aria-checked={on} id="r10OqSwitch" className={`r10-tg${on ? ' on' : ''}`} onClick={() => setOn((o) => !o)}><i /></button>
      </div>
      <textarea className="r10-ta" id="r10OqText" rows={2} maxLength={80} placeholder={tx.oqPh} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="r10-chips">
        {OQ_PRESETS[props.lang === 'th' ? 'th' : 'en'].map((p) => <button type="button" key={p} className="r10-chip" onClick={() => setQ(p)}>{p}</button>)}
      </div>
      {err ? <p className="r10-err" role="alert">{err}</p> : null}
      <button type="button" className="r10-main" id="r10OqSave" disabled={busy} onClick={() => void save()}>{tx.save}</button>
    </Sheet>
  );
}

// ───────────────────────────── 8. Bestie streak ─────────────────────────────
/** profile pills (their active streaks) + "Start a bestie streak" when we follow each other */
export function ProfileBestie(props: { lang: string; user: string; mutual: boolean; mine: boolean }) {
  const tx = r10Tx(props.lang);
  const [rows, setRows] = useState<BestieOf[] | null>(null);
  const st = bestieStore.use(!props.mine);
  const [msg, setMsg] = useState('');
  useEffect(() => { let d = false; bestieOf(props.user).then((r) => { if (!d) setRows(r || []); }).catch(() => { if (!d) setRows([]); }); return () => { d = true; }; }, [props.user]);
  const withThem = (st?.items || []).find((b) => b.partner.user_id === props.user);
  const can = !props.mine && props.mutual && !withThem;
  if (!(rows && rows.length) && !can && !withThem) return null;
  const start = async () => {
    try { await bestieInvite(props.user); setMsg(tx.bsSent); void bestieStore.refresh(); }
    catch (e) { setMsg(errCode(e) === 'BESTIE_FULL' ? tx.bsFull : tx.bsMutual); }
  };
  return (
    <div className="r10-pb" id="profileBestie">
      {(rows || []).slice(0, 2).map((b, i) => <span key={i} className="r10-flame"><Flame />{bestiePill(props.lang, b)}</span>)}
      {withThem && withThem.status === 'pending' ? <span className="r10-flame dim">{fmt(tx.bsWait, withThem.partner.first_name)}</span> : null}
      {can ? (msg ? <span className="r10-flame dim" role="status">{msg}</span>
        : <button type="button" className="r10-flame btn" id="profileBestieStart" onClick={() => void start()}><Flame />{tx.bsStart}</button>) : null}
    </div>
  );
}
const Flame = () => <svg className="r10-fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.9 2.5-5 .3 1.6 1 2.6 2 3 .2-3-.5-5.5.5-8z" /></svg>;

export function BestieMeLine(props: { lang: string }) {
  const tx = r10Tx(props.lang);
  const st = bestieStore.use(true);
  const [open, setOpen] = useState(false);
  const items = st?.items || [];
  if (!items.length) return null;
  const nNew = items.filter((b) => b.nudge_new || (b.status === 'pending' && !b.mine_invite)).length;
  const best = Math.max(0, ...items.map((b) => b.streak?.count || 0));
  return (
    <>
      <button type="button" className="me-st2 r10-meln" id="meBestie" onClick={() => { setOpen(true); void bestieSeen().catch(() => undefined); }}>
        <Flame />{fmt(tx.bsMe, best)}{nNew ? <i className="r10-dot" aria-label={tx.bsNew} /> : null}<span aria-hidden="true"> ›</span>
      </button>
      {open ? <BestieSheet lang={props.lang} items={items} onClose={() => { setOpen(false); void bestieStore.refresh(); }} /> : null}
    </>
  );
}
function BestieSheet(props: { lang: string; items: Bestie[]; onClose: () => void }) {
  const tx = r10Tx(props.lang);
  const [items, setItems] = useState(props.items);
  const act = async (f: () => Promise<{ items: Bestie[] }>) => { try { const r = await f(); setItems(r.items); bestieStore.set(r as never); } catch { /* stays */ } };
  return (
    <Sheet id="r10Bestie" label={tx.bs} onClose={props.onClose}>
      <h2 className="r10-h2">{tx.bs}</h2>
      {items.map((b) => {
        const s = b.streak;
        if (b.status === 'pending') {
          return (
            <div className="r10-bsp" key={b.id} data-bestie={b.id}>
              <Av photo={b.partner.photo} name={b.partner.first_name} />
              <span>{b.mine_invite ? fmt(tx.bsWait, b.partner.first_name) : fmt(tx.bsInvited, b.partner.first_name)}</span>
              {b.mine_invite ? null : (
                <span className="r10-two">
                  <button type="button" className="r10-fol" onClick={() => void act(() => bestieAct(b.id, 'accept'))}>{tx.bsAccept}</button>
                  <button type="button" className="r10-link" onClick={() => void act(() => bestieAct(b.id, 'decline'))}>{tx.bsLater}</button>
                </span>
              )}
            </div>
          );
        }
        return (
          <div className="r10-bs" key={b.id} data-bestie={b.id}>
            <div className="r10-bsh">
              <span className="r10-pair"><Av photo={b.partner.photo} name={b.partner.first_name} /><b>{b.partner.first_name}</b></span>
              <span className="r10-bsn"><Flame /><b>{s?.count || 0}</b><small>{s && s.alive ? (s.count === 1 ? tx.bsDay1 : fmt(tx.bsDays, s.count)) : tx.bsBroke}</small></span>
            </div>
            {b.nudged_me ? <p className="r10-note hl">{fmt(tx.bsNudgedMe, b.partner.first_name)}</p> : null}
            <p className="r10-k">{tx.bsToday}</p>
            <div className="r10-bst"><span>{tx.ncYou}</span><em className={s?.me_today ? 'ok' : ''}>{s?.me_today ? tx.bsDone : tx.bsNot}</em></div>
            <div className="r10-bst"><span>{b.partner.first_name}</span><em className={s?.them_today ? 'ok' : ''}>{s?.them_today ? tx.bsDone : tx.bsNot}</em></div>
            {s && !s.alive ? <button type="button" className="r10-main" onClick={() => void act(() => bestieAct(b.id, 'restart'))}>{tx.bsBroke}</button>
              : !s?.them_today ? <button type="button" className="r10-main" disabled={b.i_nudged} onClick={() => void act(() => bestieNudge(b.id))}>
                  {b.i_nudged ? tx.bsNudged : fmt(tx.bsNudge, b.partner.first_name)}</button> : null}
            <button type="button" className="r10-link" onClick={() => void act(() => bestieAct(b.id, 'end'))}>{tx.bsEnd}</button>
          </div>
        );
      })}
      <p className="r10-note">{tx.bsNoRings}</p>
    </Sheet>
  );
}

// ───────────────────────────── 9. Fair-play breakdown ─────────────────────────────
const APP_ORDER = ['facebook', 'instagram', 'tiktok', 'line', 'other'];
const APP_NAME: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', line: 'LINE' };
export function FairPlaySheet(props: { lang: string; user: string; onClose: () => void; onProfile?: (id: string) => void; onHow?: () => void;
  onShare?: () => void; shareLabel?: string }) {
  const tx = r10Tx(props.lang);
  const [d, setD] = useState<FairPlay | null | undefined>(undefined);
  const [who, setWho] = useState<'v' | 'n' | null>(null);
  const [days, setDays] = useState(false);
  useEffect(() => { let dead = false; setD(undefined); fairPlay(props.user).then((r) => { if (!dead) setD(r); }).catch(() => { if (!dead) setD(null); }); return () => { dead = true; }; }, [props.user]);
  const df = new Intl.DateTimeFormat(props.lang === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const parts = d ? fpParts(d) : [];
  const total = parts.reduce((s, p) => s + p.rings, 0) || 1;
  const names = (list: { user_id: string | null; name: string | null; n: number }[]) => (
    <div className="r10-who2">{list.map((p, i) => (
      <button type="button" key={(p.user_id || 'x') + i} className="r10-wn" disabled={!p.user_id} onClick={() => p.user_id && props.onProfile?.(p.user_id)}>
        {p.name || tx.fpMember}{p.n > 1 ? <em>×{p.n}</em> : null}</button>))}</div>
  );
  return (
    <Sheet id="kxFairPlay" label={tx.fpLikes} onClose={props.onClose} cls="r10-fp">
      {d === undefined ? <p className="r10-note">…</p> : d === null ? <p className="r10-note">…</p> : (
        <>
          <div className="r10-fph">
            <span>
              <b id="fpTitle">{d.is_me ? fmt(tx.fpTitleMe, d.rings) : fmt(tx.fpTitle, d.first_name, d.rings)}</b>
              <small>{d.rank ? fmt(tx.fpRank, d.rank) : tx.fpOpen}</small>
            </span>
            {!d.is_me && props.onProfile ? <button type="button" className="r10-link sm" id="fpProfile" onClick={() => props.onProfile?.(d.user_id)}>{tx.fpProfile}</button> : null}
          </div>
          {d.rings === 0 ? <p className="r10-note" id="fpNone">{tx.fpNone}</p> : (
            <div className="r10-stack" aria-hidden="true">{parts.map((p) => <i key={p.key} className={`c-${p.key}`} style={{ width: `${(p.rings / total) * 100}%` }} />)}</div>
          )}
          <div className="r10-fps">
            {d.likes_verified.n + d.likes_newer.n > 0 ? (
              <section className="r10-fpc" data-fp="likes">
                <div className="r10-fpt"><span><i className="c-likes" />{tx.fpLikes}</span><b>{d.likes_verified.rings + d.likes_newer.rings}</b></div>
                <div className="r10-fpl"><span>{fmt(tx.fpVer, d.likes_verified.n)}{d.likes_verified.visitors ? ` · ${tx.fpVis}` : ''}</span>
                  {d.likes_verified.who.length ? <button type="button" className="r10-link sm" onClick={() => setWho(who === 'v' ? null : 'v')}>{who === 'v' ? tx.fpHide : tx.fpWho}</button> : null}</div>
                {who === 'v' ? names(d.likes_verified.who) : null}
                {d.likes_newer.n > 0 || d.likes_newer.who.length ? (
                  <div className="r10-fpl"><span>{fmt(tx.fpNew, d.likes_newer.n, d.likes_newer.day_cap)}</span>
                    {d.likes_newer.who.length ? <button type="button" className="r10-link sm" onClick={() => setWho(who === 'n' ? null : 'n')}>{who === 'n' ? tx.fpHide : tx.fpWho}</button> : null}</div>
                ) : null}
                {who === 'n' ? names(d.likes_newer.who) : null}
              </section>
            ) : null}
            {d.saves.n > 0 ? <section className="r10-fpc" data-fp="saves"><div className="r10-fpt"><span><i className="c-saves" />{tx.fpSaves} · {d.saves.n} × {d.weights.save}</span><b>{d.saves.rings}</b></div></section> : null}
            {d.opens.n > 0 || Object.keys(d.opens.not_counted || {}).length ? (
              <section className="r10-fpc" data-fp="opens">
                <div className="r10-fpt"><span><i className="c-opens" />{tx.fpOpens}</span><b>{d.opens.rings}</b></div>
                {APP_ORDER.filter((k) => d.opens.by_app?.[k]).map((k) => <div className="r10-fpl" key={k}><span>{APP_NAME[k] || tx.fpOther}</span><span>{d.opens.by_app[k]}</span></div>)}
                {d.opens.over_cap > 0 ? <div className="r10-fpl warn"><span>{fmt(tx.fpNot, fmt(tx.fpOver, d.opens.day_cap))}</span><span>{d.opens.over_cap}</span></div> : null}
                {Object.entries(d.opens.not_counted || {}).map(([k, n]) => (
                  <div className="r10-fpl warn" key={k} data-why={k}><span>{fmt(tx.fpNot, (tx as unknown as Record<string, string>)[`why_${k}`] || tx.why_other)}</span><span>{n}</span></div>
                ))}
              </section>
            ) : null}
            {d.rules_adjust !== 0 ? <section className="r10-fpc" data-fp="rules"><div className="r10-fpt"><span>{tx.fpRules}</span><b>{d.rules_adjust > 0 ? `+${d.rules_adjust}` : d.rules_adjust}</b></div>
              <div className="r10-fpl"><span>{tx.fpRulesSub}</span></div></section> : null}
            {d.tasks > 0 ? <section className="r10-fpc" data-fp="tasks"><div className="r10-fpt"><span><i className="c-tasks" />{tx.fpTasks}</span><b>{d.tasks}</b></div></section> : null}
            {(d.ask_awards || 0) > 0 ? <section className="r10-fpc" data-fp="award"><div className="r10-fpt"><span><i className="c-award" />{tx.fpAward}</span><b>{d.ask_awards}</b></div></section> : null}
            {(d.daily_top || 0) > 0 ? <section className="r10-fpc" data-fp="dtop"><div className="r10-fpt"><span><i className="c-bonus" />{tx.fpTop}</span><b>{d.daily_top}</b></div></section> : null}
            {(d.daily_climb || 0) > 0 ? <section className="r10-fpc" data-fp="dclimb"><div className="r10-fpt"><span><i className="c-bonus" />{tx.fpClimb}</span><b>{d.daily_climb}</b></div></section> : null}
            {d.ask_opens > 0 ? <section className="r10-fpc" data-fp="ask"><div className="r10-fpt"><span><i className="c-tasks" />{tx.fpAsk}</span><b>{d.ask_opens}</b></div></section> : null}
            {d.invites_shown && d.invites > 0 ? <section className="r10-fpc" data-fp="invites"><div className="r10-fpt"><span><i className="c-invites" />{tx.fpInv}</span><b>{d.invites}</b></div></section> : null}
            {d.lag !== 0 ? <section className="r10-fpc" data-fp="lag"><div className="r10-fpt"><span>{tx.fpLag}</span><b>{d.lag > 0 ? `+${d.lag}` : d.lag}</b></div></section> : null}
          </div>
          <p className="r10-note">{tx.fpReels}{d.more_reels > 0 ? ` · ${d.more_reels === 1 ? tx.fpMore1 : fmt(tx.fpMore, d.more_reels)}` : ''} · {tx.fpSame}</p>
          <button type="button" className="r10-link" id="fpDays" aria-expanded={days} onClick={() => setDays((x) => !x)}>{days ? tx.fpDaysHide : tx.fpDays}</button>
          {days ? (
            <div className="r10-days" id="fpDayList">
              {d.days.map((x) => (
                <div className="r10-day" key={x.day}><span>{df.format(Date.parse(`${x.day}T12:00:00Z`))}</span>
                  <small>{[x.reels ? `${tx.dReels} ${x.reels}` : '', x.tasks ? `${tx.dTasks} ${x.tasks}` : '', x.bonus ? `${tx.dBonus} ${x.bonus}` : '', d.invites_shown && x.invites ? `${tx.dInv} ${x.invites}` : ''].filter(Boolean).join(' · ') || '–'}</small>
                  <b>{x.reels + x.tasks + (x.bonus || 0) + (d.invites_shown ? x.invites : 0)}</b></div>
              ))}
            </div>
          ) : null}
          {props.onShare && d.is_me ? <button type="button" className="r10-main" id="fpShare" onClick={props.onShare}>{props.shareLabel || tx.fpShare}</button> : null}
        </>
      )}
    </Sheet>
  );
}

// ───────────────────────────── 10. Newcomers league ─────────────────────────────
export function NewcomersLeague(props: { lang: string; onPerson: (id: string) => void }) {
  const tx = r10Tx(props.lang);
  const [d, setD] = useState<Newcomers | null>(null);
  useEffect(() => { let dead = false; newcomers().then((r) => { if (!dead) setD(r); }).catch(() => undefined); return () => { dead = true; }; }, []);
  if (!d || (!d.rows.length && !d.mine_new)) return null;
  return (
    <section className="r10-nc" id="kxNewcomers" lang={props.lang === 'th' ? 'th' : 'en'}>
      <div className="r10-nch"><b>{tx.ncTitle}</b><small>{tx.ncSub}</small></div>
      {d.rows.length ? d.rows.map((r) => (
        <button type="button" key={r.user_id} className={`r10-ncr${r.me ? ' me' : ''}${r.rank <= d.top ? ' top' : ''}`} data-nc={r.rank} onClick={() => props.onPerson(r.user_id)}>
          <span className="n">{r.rank}</span><Av photo={r.photo} name={r.first_name} /><span className="t">{r.me ? tx.ncYou : r.first_name}</span>
          <b>{r.rings}<RingsIc s={14} /></b>
        </button>
      )) : <p className="r10-note">{tx.ncEmpty}</p>}
      {d.me ? <p className="r10-ncme" id="kxNewcomersMe">{d.me.next ? fmt(tx.ncTo, d.me.next.need, d.me.next.rank) : d.me.rank === 1 ? tx.ncTop : ''}</p> : null}
    </section>
  );
}

// ───────────────────────────── Daily photo (m226) ─────────────────────────────
const BASE10 = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/app/');
export const PHOTO_OPEN = 'kr8:r10-photo';
export function openPhotoSheet() { try { window.dispatchEvent(new Event(PHOTO_OPEN)); } catch { /* old browser */ } }
/** tasks sheet: the photo option, until today's post task is done */
export function PhotoTaskRow(props: { lang: string; postDone: boolean; verified: boolean; onFace: () => void; onClose: () => void }) {
  const tx = r10Tx(props.lang);
  if (props.postDone) return null;
  return (
    <div className="dt-row st-go r10-phrow" data-task="photo">
      <span className="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="13" rx="2.5" /><circle cx="12" cy="12.5" r="3.2" /><path d="M9 6l1.2-2h3.6L15 6" /></svg></span>
      <span className="tx"><b>{tx.phRow}</b><small>{tx.phRowS}</small></span>
      <span className="rw">+3</span>
      <button type="button" className="dt-btn" id="r10PhotoGo" onClick={() => { if (!props.verified) { props.onFace(); return; } props.onClose(); openPhotoSheet(); }}>{tx.go}</button>
    </div>
  );
}
export function PhotoSheet(props: { lang: string; area: string | null; onClose: () => void; onPosted: () => void; toast: (m: string) => void }) {
  const tx = r10Tx(props.lang);
  const [img, setImg] = useState<string | null>(null);
  const [cap, setCap] = useState('');
  const [busy, setBusy] = useState(false);
  const inp = { current: null as HTMLInputElement | null };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setImg(await v5CompressImage(f, 1080, 520000)); } catch { props.toast(tx.phBad); }
  };
  const [why, setWhy] = useState('');
  const post = async () => {
    if (!img || busy) return;
    setBusy(true); setWhy('');
    try {
      // m242 (27 Nov, founder): gallery photos allowed, but a bit of the member must be in it (checked first, face optional)
      const v = await v5DailyPhotoCheck(img);
      if (v !== 'ok') {
        setWhy(v === 'noperson' ? tx.phNoPerson : v === 'notyou' || v === 'other' ? tx.phNotYou : v === 'text' ? tx.phText : v === 'child' ? tx.phChild : tx.phCheckErr);
        return;
      }
      await createPhoto(img, props.area, cap.trim() || null); props.toast(tx.phPosted); props.onPosted(); props.onClose();
    }
    catch (e) { const c = errCode(e); props.toast(c === 'PHOTO_DAY' ? tx.phDay : c === 'VERIFY_FIRST' ? tx.phFace : c === 'PHOTO_CHECK' ? tx.phCheckErr : tx.phBad); }
    finally { setBusy(false); }
  };
  return (
    <Sheet id="r10Photo" label={tx.phTitle} onClose={props.onClose}>
      <div className="r10-b5h"><b>{tx.phTitle}</b><small>{tx.phLine}</small></div>
      {img ? (
        <div className="r10-phprev" style={{ backgroundImage: `url("${img}")` }} />
      ) : (
        <div className="r10-phex" id="r10PhotoExamples">
          {[['ex-back', tx.exBack], ['ex-side', tx.exSide], ['ex-outfit', tx.exOutfit]].map(([f, l]) => (
            <span key={f} style={{ backgroundImage: `url("${BASE10}media/r10/${f}.jpg")` }}><i>{l}</i></span>
          ))}
        </div>
      )}
      <p className="r10-note">{tx.phRules}</p>
      {why ? <p className="r10-note r10-phwhy" id="r10PhotoWhy" role="alert">{why}</p> : null}
      {img ? <input className="r10-ta" id="r10PhotoCap" maxLength={140} placeholder={tx.phCap} value={cap} onChange={(e) => setCap(e.target.value)} /> : null}
      {/* m242: camera or gallery; the server check makes sure the member is in it (no screenshots / internet pictures) */}
      <input ref={(el) => { inp.current = el; }} id="r10PhotoInput" type="file" accept="image/*" hidden
        onChange={(e) => { setWhy(''); void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {img ? (
        <>
          <button type="button" className="r10-main" id="r10PhotoPost" disabled={busy} onClick={() => void post()}>{busy ? tx.phChecking : tx.phPost}</button>
          <button type="button" className="r10-link" onClick={() => document.getElementById('r10PhotoInput')?.click()}>{tx.phRetake}</button>
        </>
      ) : <button type="button" className="r10-main" id="r10PhotoTake" onClick={() => document.getElementById('r10PhotoInput')?.click()}>{tx.phPick}</button>}
    </Sheet>
  );
}
/** m242 (27 Nov, founder: "people don't know"): one-time intro to the photo of the day, with the 3 example photos */
const PI_KEY = 'kr8_photo_intro_v1';
export function photoIntroSeen(): boolean { try { return localStorage.getItem(PI_KEY) === '1'; } catch { return true; } }
export function PhotoIntroSheet(props: { lang: string; onGo: () => void; onClose: () => void }) {
  const tx = r10Tx(props.lang);
  const done = (go: boolean) => { try { localStorage.setItem(PI_KEY, '1'); } catch { /* private mode */ } if (go) props.onGo(); else props.onClose(); };
  return (
    <Sheet id="r10PhotoIntro" label={tx.piTitle} onClose={() => done(false)}>
      <div className="r10-b5h"><b>{tx.piTitle}</b><small>{tx.piLine}</small></div>
      <div className="r10-phex">
        {[['ex-back', tx.exBack], ['ex-side', tx.exSide], ['ex-outfit', tx.exOutfit]].map(([f, l]) => (
          <span key={f} style={{ backgroundImage: `url("${BASE10}media/r10/${f}.jpg")` }}><i>{l}</i></span>
        ))}
      </div>
      <button type="button" className="r10-main" id="r10PhotoIntroGo" onClick={() => done(true)}>{tx.piGo}</button>
      <button type="button" className="r10-link" id="r10PhotoIntroLater" onClick={() => done(false)}>{tx.piLater}</button>
    </Sheet>
  );
}
/** profile / Me grid: a member's photos (own unpromoted ones carry "On your profile") */
export function usePhotos(user: string | null | undefined): MemberPhoto[] {
  const v = photoStore(user || '-').use(!!user);
  useEffect(() => { if (user) void photoStore(user).refresh(); }, [user]);
  return user ? v || [] : [];
}
export const PHOTO_VIEW = 'kr8:r10-photoview';
export function PhotoViewer(props: { lang: string; onComment?: (postId: string) => void; toast?: (m: string) => void }) {
  const tx = r10Tx(props.lang);
  const [p, setP] = useState<(MemberPhoto & { mine?: boolean; user?: string | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setP((e as CustomEvent<MemberPhoto & { mine?: boolean; user?: string | null }>).detail);
    window.addEventListener(PHOTO_VIEW, on);
    return () => window.removeEventListener(PHOTO_VIEW, on);
  }, []);
  if (!p) return null;
  const [t, tip] = p.reason ? poReason(props.lang, p.reason) : ['', ''];
  // m241 (27 Nov, founder): a daily photo can be liked, saved and commented on, like a Reel
  const like = async () => {
    if (p.mine || busy) return;
    setBusy(true);
    try { const r = await v5ToggleLike(p.id); setP({ ...p, liked: r.liked, likes: r.likes }); if (p.user) void photoStore(p.user).refresh(); }
    catch (e) { props.toast?.(errCode(e)); } finally { setBusy(false); }
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try { const on = await v5ToggleSave(p.id); setP({ ...p, saved: on }); } catch (e) { props.toast?.(errCode(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet id="r10PhotoView" label={tx.phTitle} onClose={() => setP(null)} cls="r10-pv">
      <div className="r10-pvimg" style={{ backgroundImage: `url("${p.photo}")` }} onDoubleClick={() => { if (!p.liked) void like(); }} />
      <div className="r10-pvact" id="r10PhotoActs">
        <button type="button" id="r10PvLike" className={p.liked ? 'on' : ''} aria-pressed={!!p.liked} aria-label={tx.pvLike} disabled={!!p.mine} onClick={() => void like()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" /></svg>{p.likes ? <b>{p.likes}</b> : null}</button>
        <button type="button" id="r10PvComment" aria-label={tx.pvComment} onClick={() => { const id = p.id; setP(null); props.onComment?.(id); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H9l-4 4z" /></svg>{p.comments ? <b>{p.comments}</b> : null}</button>
        <button type="button" id="r10PvSave" className={p.saved ? 'on' : ''} aria-pressed={!!p.saved} aria-label={p.saved ? tx.pvSaved : tx.pvSave} onClick={() => void save()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z" /></svg></button>
      </div>
      {p.body ? <p className="r10-sub">{p.body}</p> : null}
      {p.mine && !p.feed ? <p className="r10-note">{tx.poTag}</p> : null}
      {p.mine && p.reason ? <div className="r10-why"><small>{tx.poWhy}</small><b>{t}</b><span>{tip}</span></div> : null}
    </Sheet>
  );
}

// ───────────────────────────── Leaderboard orb (Me) ─────────────────────────────
/** The one always-on glow in Me: this week's rank + Rings to the next rank; tap = the weekly board. Unchecked → "Join the board".
 *  28 Nov (founder): the Kring rings (blue + pink, interlocked as in the logo) float inside the circle with a slow 3D tilt, and one
 *  thin pink light travels round the edge. CSS transforms/opacity only; paused when the orb is off screen or the app is in the
 *  background; still with "reduce motion". The rank (if any) is a small tag on the circle. */
export function LeaderOrb(props: { lang: string; rank: number | null; need: number | null; nextRank: number | null; state?: string | null; verified: boolean; onOpen: () => void; onFace: () => void; onWarm?: () => void }) {
  const tx = r10Tx(props.lang);
  const join = !props.verified;
  const line = join ? tx.orbFace
    : props.state === 'floor' && props.need ? fmt(tx.orbFloor, props.need)   // under the 25-Ring minimum: the board's own "N to a prize seat"
    : props.rank === 1 ? tx.orbTop
    : props.need && props.nextRank && props.rank && props.nextRank < props.rank ? fmt(tx.orbTo, props.need, props.nextRank) : props.rank ? '' : tx.orbNone;
  const ref = useRef<HTMLButtonElement | null>(null);
  const [still, setStill] = useState(false);
  useEffect(() => {   // no animation work while nobody can see it
    const el = ref.current;
    let onScreen = true;
    const upd = () => setStill(!onScreen || (typeof document !== 'undefined' && document.visibilityState === 'hidden'));
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); upd(); });
      io.observe(el);
    }
    document.addEventListener('visibilitychange', upd);
    return () => { io?.disconnect(); document.removeEventListener('visibilitychange', upd); };
  }, []);
  return (
    <button type="button" ref={ref} className={`r10-orb${join ? ' join' : ''}`} id="meOrb" data-still={still ? '1' : '0'}
      aria-label={`${tx.orbLabel}${props.rank ? ` · #${props.rank}` : ''}`}
      onPointerDown={props.onWarm} onClick={join ? props.onFace : props.onOpen}>
      <span className="r10-orbc">
        <i className="r10-orbhl" aria-hidden="true" />
        <span className="r10-orb3d" aria-hidden="true">
          <i className="r10-orbsh" />
          <svg className="r10-orbrg" viewBox="0 0 34 20" width="40" height="24" focusable="false">
            <defs>
              <linearGradient id="r10OrbB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#A9B2FF" /><stop offset="1" stopColor="#5C64F2" /></linearGradient>
              <linearGradient id="r10OrbP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF9BD0" /><stop offset="1" stopColor="#E0399F" /></linearGradient>
            </defs>
            <circle cx="11" cy="10" r="7.5" fill="none" stroke="url(#r10OrbB)" strokeWidth="2.6" />
            <circle cx="23" cy="10" r="7.5" fill="none" stroke="url(#r10OrbP)" strokeWidth="2.6" />
            {/* the weave: the blue ring passes over the pink one at the lower crossing */}
            <path d="M18.05 12.57A7.5 7.5 0 0 1 15.3 16.14" fill="none" stroke="#151326" strokeWidth="4.4" strokeLinecap="butt" />
            <path d="M18.05 12.57A7.5 7.5 0 0 1 15.3 16.14" fill="none" stroke="url(#r10OrbB)" strokeWidth="2.6" strokeLinecap="butt" />
          </svg>
        </span>
        {props.rank && !join ? <b className="r10-orbrk">#{props.rank}</b> : null}
      </span>
      <small>{join ? tx.orbJoin : line || tx.orbLabel}</small>
    </button>
  );
}

// ───────────────────────────── m228: daily bonuses (variant A) ─────────────────────────────
/** the board strip under "Last week's winners": today's top 3 (+10/+6/+3) and the biggest climber (+5). Quiet glass, no glow. */
export function DailyTopStrip(props: { lang: string; onPerson: (id: string) => void }) {
  const tx = r10Tx(props.lang);
  const d = dailyStore.use(true);
  useEffect(() => {   // the server refreshes every 5 minutes; read again on that rhythm while the board is open
    const t = window.setInterval(() => { void dailyStore.refresh(); }, 5 * 60_000);
    void dailyStore.refresh();
    return () => window.clearInterval(t);
  }, []);
  if (!d || !d.on) return null;
  const top = d.top || [];
  const won = d.state === 'won';
  const who = (id: string) => d.who?.[id];
  const chip = (p: DailyPick, k: string, label: string) => {
    const w = who(p.member_id);
    if (!w) return null;
    return (
      <button type="button" key={k} className={`r10-dtc${k === 'climb' ? ' cl' : ''}`} data-dt={k} onClick={() => props.onPerson(p.member_id)}
        aria-label={`${w.me ? tx.dtYou : w.first_name} ${label}`}>
        {k === 'climb' ? <i className="r10-dtup" aria-hidden="true">📈</i> : null}<Av photo={w.photo} name={w.first_name} /><b>{label}</b>
      </button>
    );
  };
  return (
    <div className={`r10-dt${won ? ' won' : ''}${top.length ? '' : ' empty'}`} id="kxDailyTop" data-state={d.state} lang={props.lang === 'th' ? 'th' : 'en'}>
      <button type="button" className="r10-dth" onClick={() => openHowItWorks('strip')}>
        <b>{won ? tx.dtWon : top.length ? tx.dtTitle : fmt(tx.dtEmpty, d.min ?? 10)}</b>
        <small>{won ? tx.dtWonSub : tx.dtSub}</small>
      </button>
      {top.length || d.climber ? (
        <span className="r10-dtcs">
          {top.map((p) => chip(p, `t${p.rank}`, `+${p.bonus}`))}
          {d.climber ? chip(d.climber, 'climb', `+${d.climber.bonus}`) : null}
        </span>
      ) : null}
    </div>
  );
}

/** "How it works" (board ⓘ, How to win, Ask BKK): daily bonuses + Ask BKK awards. Mounted once; opened with openHowItWorks(). */
export function HowItWorksHost(props: { lang: string; onWin?: () => void }) {
  const [open, setOpen] = useState('');
  useEffect(() => {
    const f = (e: Event) => setOpen((e as CustomEvent<string>).detail || 'x');
    window.addEventListener(HOW_OPEN, f);
    return () => window.removeEventListener(HOW_OPEN, f);
  }, []);
  if (!open) return null;
  return <HowItWorksSheet lang={props.lang} from={open} onClose={() => setOpen('')} onWin={props.onWin} />;
}
export function HowItWorksSheet(props: { lang: string; from?: string; onClose: () => void; onWin?: () => void }) {
  const tx = r10Tx(props.lang);
  const d = dailyStore.use(true);
  const cfg = rulesStore.use(true);
  const b = d?.bonus || [cfg?.daily_top_1 ?? 10, cfg?.daily_top_2 ?? 6, cfg?.daily_top_3 ?? 3];
  const daily = !!d?.on;
  const awards = (cfg?.ask_awards_on ?? 0) === 1 || props.from === 'ask';
  const rows: { k: string; ic: string; t: string; s: string }[] = [
    ...(daily ? [
      { k: 'top', ic: '🌙', t: fmt(tx.hwTopT, b[0], b[1], b[2]), s: fmt(tx.hwTopS, b[0], b[1], b[2], cfg?.daily_top_min ?? 10) },
      { k: 'climb', ic: '📈', t: fmt(tx.hwClimbT, d?.climb ?? cfg?.daily_climb ?? 5), s: fmt(tx.hwClimbS, d?.climb ?? 5, cfg?.daily_climb_min ?? 5) },
    ] : []),
    ...(awards ? [{ k: 'ask', ic: '🏆', t: tx.hwAskT, s: tx.hwAskS }] : []),
    { k: 'fp', ic: '🔍', t: tx.hwFpT, s: tx.hwFpS },
  ];
  return (
    <Sheet id="kxHowItWorks" label={tx.hwTitle} onClose={props.onClose} cls="r10-hw">
      <div className="r10-hwh" lang={props.lang === 'th' ? 'th' : 'en'}><b>{tx.hwTitle}</b><small>{tx.hwSub}</small></div>
      <div className="r10-hwl" lang={props.lang === 'th' ? 'th' : 'en'}>
        {rows.map((r) => <div className="r10-hwr" key={r.k} data-hw={r.k}><i aria-hidden="true">{r.ic}</i><span><b>{r.t}</b><small>{r.s}</small></span></div>)}
      </div>
      {props.onWin && (props.from === 'board' || props.from === 'strip') ? <button type="button" className="r10-link" id="hwWin" onClick={() => { props.onClose(); props.onWin?.(); }}>{tx.hwWin} ›</button> : null}
      <button type="button" className="r10-main" id="hwOk" onClick={props.onClose}>{tx.hwOk}</button>
    </Sheet>
  );
}
/** Ask BKK page: the one-line award rule (opens the same sheet) */
export function AskAwardLine(props: { lang: string }) {
  const tx = r10Tx(props.lang);
  const cfg = rulesStore.use(true);
  if (!cfg || (cfg.ask_awards_on ?? 0) !== 1) return null;
  return (
    <button type="button" className="r10-awl" id="askAwardRule" lang={props.lang === 'th' ? 'th' : 'en'} onClick={() => openHowItWorks('ask')}>
      <span aria-hidden="true">🏆</span><b>{tx.askAwLine}</b><small>{tx.askAwHow} ›</small>
    </button>
  );
}

// ───────────────────────────── r12: How to win (founder mock htw_a2, 26 Nov) ─────────────────────────────
export type HtwAct = 'tasks' | 'top' | 'ask' | 'invite' | 'share' | 'photo' | 'reel';
const HTW = {
  en: { title: 'How to win', upTo: 'Up to', aWeek: 'a week',
    heroWon: 'Just from daily tasks ({0} a day). Last week that alone won a prize seat (#{1} · {2}).', heroTop: 'Just from daily tasks ({0} a day). Last week that alone took #1 ({1}).',
    heroNext: 'Add {0} link opens and it was #{1} · {2}.', heroShort: 'From daily tasks ({0} a day). Last week #{1} needed {2} more Rings than that: about {3} link opens.',
    heroNone: 'From daily tasks alone ({0} a day). Add link opens, likes and saves to climb.', today: 'Today: {0} of {1} done',
    perDay: 'per day', perWeek: 'per week', each: 'each', dayMax: 'per day max',
    tasksT: 'Daily tasks', tasksS: 'Reel +{1} or photo +{0} · Photo of the day +{6} · Ask BKK +{2} · Vote +{3} · Watch 3 +{4} · All done +{5}',
    tasks1: 'Open today’s tasks', tasks2: 'Post a Reel or a photo, add a photo of the day, answer Ask BKK, vote and watch 3 Reels', tasks3: 'Rings land as you finish each one. All done adds +{0}', tasksGo: 'Open today’s tasks',
    topT: 'Today’s top 3 bonus', topS: '+{0} / +{1} / +{2} at 23:59 · climber +{3}',
    top1: 'Collect the most Rings today (Bangkok time)', top2: 'At 23:59 the top 3 get +{0} / +{1} / +{2}, the biggest climber +{3}', top3: 'You need at least {0} Rings today to count', topGo: 'See today’s top 3',
    askT: 'Ask BKK awards', askS: 'Most helpful or Funniest at 8pm',
    ask1: 'Answer today’s Ask BKK question with a real tip', ask2: 'At 8pm the most helpful and the funniest answers win +{0} each', ask3: 'Up to {0} awards a week', askGo: 'Answer today’s question',
    invT: 'Bring a friend', invS: 'When your friend passes the face check',
    inv1: 'Tap Invite a friend to share your personal link', inv2: 'Your friend signs up and does the 5-second face check', inv3: 'You get +{0} the moment they pass. No limit', invGo: 'Invite a friend', invFine: 'Second accounts and look-alike faces don’t count',
    shT: 'Share your post', shS: 'Each person who opens your link +{0} · likes +{1} · saves +{2} · travellers ×{3}',
    sh1: 'Tap Share and send your link to friends, your IG story or LINE', sh2: 'Each person who opens it gives +{0}, up to {1} a day', sh3: 'Likes +{0} and saves +{1}. Verified travellers count ×{2}',
    shGo: 'Share my latest post', shFirst: 'Post your first photo', shReel: 'Post a Reel',
    prizes: 'This week’s prizes · top {0} · TrueMoney', ok: 'Got it' },
  th: { title: 'วิธีชนะ', upTo: 'สูงสุด', aWeek: 'ต่อสัปดาห์',
    heroWon: 'จากภารกิจรายวันอย่างเดียว (วันละ {0}) สัปดาห์ที่แล้วแค่นี้ก็ได้ที่นั่งรับรางวัล (อันดับ {1} · {2})', heroTop: 'จากภารกิจรายวันอย่างเดียว (วันละ {0}) สัปดาห์ที่แล้วแค่นี้ก็ได้อันดับ 1 ({1})',
    heroNext: 'ถ้ามีคนเปิดลิงก์เพิ่มอีก {0} คน ก็ได้อันดับ {1} · {2}', heroShort: 'จากภารกิจรายวัน (วันละ {0}) สัปดาห์ที่แล้วอันดับ {1} ต้องมีมากกว่านี้อีก {2} ริง หรือมีคนเปิดลิงก์ราว {3} คน',
    heroNone: 'จากภารกิจรายวันอย่างเดียว (วันละ {0}) เพิ่มคนเปิดลิงก์ ไลก์ และเซฟ เพื่อไต่อันดับ', today: 'วันนี้ทำได้ {0} จาก {1}',
    perDay: 'ต่อวัน', perWeek: 'ต่อสัปดาห์', each: 'ต่อคน', dayMax: 'สูงสุดต่อวัน',
    tasksT: 'ภารกิจรายวัน', tasksS: 'รีล +{1} หรือรูป +{0} · รูปประจำวัน +{6} · ถาม BKK +{2} · โหวต +{3} · ดู 3 คลิป +{4} · ครบทุกอย่าง +{5}',
    tasks1: 'เปิดภารกิจของวันนี้', tasks2: 'โพสต์รีลหรือรูป ลงรูปประจำวัน ตอบ ถาม BKK โหวต และดูรีลให้จบ 3 คลิป', tasks3: 'ทำเสร็จข้อไหนได้ริงทันที ทำครบทุกข้อรับเพิ่มอีก +{0}', tasksGo: 'เปิดภารกิจวันนี้',
    topT: 'โบนัส 3 อันดับแรกของวัน', topS: '+{0} / +{1} / +{2} ตอน 23:59 · ไต่อันดับไวสุด +{3}',
    top1: 'เก็บริงให้ได้มากที่สุดภายในวันนี้ (เวลากรุงเทพฯ)', top2: 'ตอน 23:59 สามอันดับแรกได้ +{0} / +{1} / +{2} คนที่ไต่อันดับไวสุดได้ +{3}', top3: 'วันนั้นต้องมีอย่างน้อย {0} ริงถึงจะนับ', topGo: 'ดู 3 อันดับแรกวันนี้',
    askT: 'รางวัล ถาม BKK', askS: 'คำตอบมีประโยชน์ที่สุดหรือฮาที่สุด ประกาศ 2 ทุ่ม',
    ask1: 'ตอบคำถาม ถาม BKK ของวันนี้ด้วยทริคที่ใช้ได้จริง', ask2: 'ตอน 2 ทุ่ม คำตอบที่มีประโยชน์ที่สุดและฮาที่สุดได้ +{0}', ask3: 'ได้สูงสุด {0} รางวัลต่อสัปดาห์', askGo: 'ตอบคำถามวันนี้',
    invT: 'ชวนเพื่อนมาเล่น', invS: 'เมื่อเพื่อนสแกนใบหน้าผ่าน',
    inv1: 'กด ชวนเพื่อน เพื่อแชร์ลิงก์ส่วนตัวของคุณ', inv2: 'เพื่อนสมัครและสแกนใบหน้า 5 วินาที', inv3: 'คุณได้ +{0} ทันทีที่เพื่อนผ่าน ชวนได้ไม่จำกัด', invGo: 'ชวนเพื่อน', invFine: 'บัญชีที่สองและหน้าที่คล้ายกันไม่นับ',
    shT: 'แชร์โพสต์ของคุณ', shS: 'คนเปิดลิงก์ของคุณ คนละ +{0} · ไลก์ +{1} · เซฟ +{2} · นักท่องเที่ยว ×{3}',
    sh1: 'กดแชร์ แล้วส่งลิงก์ให้เพื่อน ลงสตอรี่ IG หรือ LINE', sh2: 'ทุกคนที่เปิดลิงก์ได้ +{0} สูงสุดวันละ {1} คน', sh3: 'ไลก์ +{0} เซฟ +{1} นักท่องเที่ยวที่ยืนยันแล้วนับ ×{2}',
    shGo: 'แชร์โพสต์ล่าสุด', shFirst: 'โพสต์รูปแรกของคุณ', shReel: 'โพสต์รีล',
    prizes: 'รางวัลสัปดาห์นี้ · {0} อันดับแรก · TrueMoney', ok: 'เข้าใจแล้ว' },
};
const thb = (n: number) => `฿${n.toLocaleString('en-US')}`;
export function HowToWinHost(props: { lang: string; uid: string | null; latestReel: string | null; onOpen?: () => void; onAct: (a: HtwAct, arg?: string | null) => void }) {
  const [open, setOpen] = useState('');
  useEffect(() => {
    const f = (e: Event) => { setOpen((e as CustomEvent<string>).detail || 'x'); props.onOpen?.(); };
    window.addEventListener(HTW_OPEN, f);
    return () => window.removeEventListener(HTW_OPEN, f);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return <HowToWinSheet lang={props.lang} uid={props.uid} latestReel={props.latestReel} onClose={() => setOpen('')} onAct={(a, x) => { setOpen(''); props.onAct(a, x); }} />;
}
export function HowToWinSheet(props: { lang: string; uid: string | null; latestReel: string | null; onClose: () => void; onAct: (a: HtwAct, arg?: string | null) => void }) {
  const lang = props.lang === 'th' ? 'th' : 'en';
  const t = HTW[lang];
  const cfg = rulesStore.use(true) || {};
  const seats = seatsStore.use(true);
  const tasks = useTasks().data;
  const photos = usePhotos(props.uid);
  const [ex, setEx] = useState<string | null>(null);
  useEffect(() => { void tasksRefresh(); void seatsStore.refresh(); }, []);
  const c = (k: string, d: number) => (typeof cfg[k] === 'number' ? cfg[k] : d);
  const perDay = tasks?.max || (c('task_post', 5) + c('task_photo_day', 2) + c('task_ask', 3) + c('task_vote', 1) + c('task_watch', 1) + c('task_bonus', 2));   // m233: 14
  const open = c('open', 5), cap = c('v2_opens_day_cap', 10);
  const h = htwHero(perDay, seats?.seats || [], open);
  const paid = Array.from({ length: 10 }, (_, i) => c(`prize_${i + 1}`, 0)).filter((p) => p > 0);
  let line = '';
  if (h.won && h.won.rank === 1) line = fmt(t.heroTop, perDay, thb(h.won.amount));
  else if (h.won) line = `${fmt(t.heroWon, perDay, h.won.rank, thb(h.won.amount))}${h.next ? ` ${fmt(t.heroNext, h.next.opens, h.next.rank, thb(h.next.amount))}` : ''}`;
  else if (h.short) line = fmt(t.heroShort, perDay, h.short.rank, h.short.need, Math.ceil(h.short.need / open));
  else line = fmt(t.heroNone, perDay);
  const done = Math.min(perDay, tasks?.rings_today ?? 0);
  const askQ = tasks?.tasks?.find((x) => x.id === 'ask')?.question?.id || null;
  const b = [c('daily_top_1', 10), c('daily_top_2', 6), c('daily_top_3', 3), c('daily_climb', 5)];
  const share: { a: HtwAct; label: string } = props.latestReel ? { a: 'share', label: t.shGo } : photos.length ? { a: 'reel', label: t.shReel } : { a: 'photo', label: t.shFirst };
  const rows: { k: string; ic: string; tt: string; s: string; v: string; u: string; steps: string[]; go: string; act: HtwAct; arg?: string | null; fine?: string }[] = [
    { k: 'tasks', ic: '✅', tt: t.tasksT, s: fmt(t.tasksS, c('task_photo', 3), c('task_post', 5), c('task_ask', 3), c('task_vote', 1), c('task_watch', 1), c('task_bonus', 2), c('task_photo_day', 2)), v: String(perDay), u: t.perDay,
      steps: [t.tasks1, t.tasks2, fmt(t.tasks3, c('task_bonus', 2))], go: t.tasksGo, act: 'tasks' },
    { k: 'top', ic: '🌙', tt: t.topT, s: fmt(t.topS, b[0], b[1], b[2], b[3]), v: `+${b[0]}`, u: t.perDay,
      steps: [t.top1, fmt(t.top2, b[0], b[1], b[2], b[3]), fmt(t.top3, c('daily_top_min', 10))], go: t.topGo, act: 'top' },
    { k: 'ask', ic: '🏅', tt: t.askT, s: t.askS, v: `+${c('ask_award', 5) * c('ask_award_week_max', 2)}`, u: t.perWeek,
      steps: [t.ask1, fmt(t.ask2, c('ask_award', 5)), fmt(t.ask3, c('ask_award_week_max', 2))], go: t.askGo, act: 'ask', arg: askQ },
    { k: 'friend', ic: '👯', tt: t.invT, s: t.invS, v: `+${c('invite', 10)}`, u: t.each,
      steps: [t.inv1, t.inv2, fmt(t.inv3, c('invite', 10))], go: t.invGo, act: 'invite', fine: t.invFine },
    { k: 'share', ic: '🔗', tt: t.shT, s: fmt(t.shS, open, c('like', 1), c('save', 3), c('traveller_mult', 2)), v: `+${open * cap}`, u: t.dayMax,
      steps: [t.sh1, fmt(t.sh2, open, cap), fmt(t.sh3, c('like', 1), c('save', 3), c('traveller_mult', 2))], go: share.label, act: share.a, arg: props.latestReel },
  ];
  return (
    <Sheet id="kxHtw" label={t.title} onClose={props.onClose} cls="r10-htw">
      <div lang={lang} className="htw-in">
        <h2 className="htw-h">{t.title}</h2>
        <div className="htw-hero" id="htwHero" data-week={h.week} data-won={h.won?.rank ?? ''} data-next={h.next ? `${h.next.rank}:${h.next.opens}` : ''}>
          <div className="big">{t.upTo} <RingsIc s={34} /><span>{h.week}</span> {t.aWeek}</div>
          <p>{line}</p>
          <div className="bar"><i style={{ width: `${Math.round((done / Math.max(1, perDay)) * 100)}%` }} /></div>
          <small id="htwToday">{fmt(t.today, done, perDay)}</small>
        </div>
        {rows.map((r) => {
          const on = ex === r.k;
          return (
            <div key={r.k} className={`htw-r${on ? ' on' : ''}`} data-htw={r.k}>
              <button type="button" className="htw-row" aria-expanded={on} onClick={() => setEx(on ? null : r.k)}>
                <i className="ic" aria-hidden="true">{r.ic}</i>
                <span className="t"><b>{r.tt}</b><small>{r.s}</small></span>
                <span className="v"><span><RingsIc s={20} />{r.v}</span><small>{r.u}</small></span>
                <i className="chev" aria-hidden="true">›</i>
              </button>
              {on ? (
                <div className="htw-ex">
                  <ol>{r.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
                  <button type="button" className="r10-main htw-go" data-go={r.act} onClick={() => props.onAct(r.act, r.arg)}>{r.go}</button>
                  {r.fine ? <p className="fine">{r.fine}</p> : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {paid.length ? (
          <div className="htw-pz" id="htwPrizes"><p>{fmt(t.prizes, paid.length)}</p>
            <div className="g">{paid.map((p, i) => <span key={i}><b>#{i + 1}</b> {thb(p)}</span>)}</div></div>
        ) : null}
        <button type="button" className="r10-link" id="htwOk" onClick={props.onClose}>{t.ok}</button>
      </div>
    </Sheet>
  );
}
/** r12: the small "My prizes 🎁" button (under the Me orb, on the board header). Gold dot = an unclaimed prize. No glow. */
export function MyPrizesBtn(props: { lang: string; dot: boolean; onOpen: () => void; id: string; cls?: string }) {
  return (
    <button type="button" className={`r10-myp ${props.cls || ''}`} id={props.id} data-dot={props.dot ? '1' : '0'} onClick={props.onOpen} lang={props.lang === 'th' ? 'th' : 'en'}
      aria-label={props.lang === 'th' ? 'รางวัลของฉัน' : 'My prizes'}>
      {props.cls === 'ico' ? null : <>{props.lang === 'th' ? 'รางวัลของฉัน' : 'My prizes'} </>}<span aria-hidden="true">🎁</span>{props.dot ? <i className="dot" aria-label={props.lang === 'th' ? 'มีรางวัลรอรับ' : 'Prize to claim'} /> : null}
    </button>
  );
}
