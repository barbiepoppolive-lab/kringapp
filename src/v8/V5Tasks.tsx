/**
 * Daily tasks UI (founder picks 20 Nov): orb A (gold progress ring, left edge), sheet header B (big ring), quick vote A (this or that),
 * watch-3 B (thin top bar), check-in A (soft toast), reminder A (bubble, no border), Me line B (mini ring). Poppo workflow, not its look.
 * The server decides everything (v5Tasks.ts); this file only shows state and asks.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import './tasks.css';
import {
  claimedCount, doable, fmt, leftCount, readyCount, resetsIn, streakDays, taskClaim, TASK_ORDER, taskState, tasksToday, taskVote, taskWatch,
  tLang, TX, type TaskId, type TaskRow, type TasksToday, type TaskTx,
} from './v5Tasks';

// ───────────── one shared store (the Feed orb, the sheet and the Me line read the same state) ─────────────
type Store = { data: TasksToday | null; loading: boolean; err: boolean };
let store: Store = { data: null, loading: false, err: false };
const subs = new Set<() => void>();
const emit = (s: Partial<Store>) => { store = { ...store, ...s }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
let inflight: Promise<void> | null = null;
export function tasksRefresh(): Promise<void> {
  if (inflight) return inflight;
  emit({ loading: true });
  inflight = tasksToday()
    .then((d) => emit({ data: d, loading: false, err: false }))
    .catch(() => emit({ loading: false, err: true }))
    .finally(() => { inflight = null; });
  return inflight;
}
export const tasksSet = (d: TasksToday) => emit({ data: d, err: false });
export function useTasks(): Store { return useSyncExternalStore(subscribe, () => store, () => store); }
/** test hook */
export function _tasksReset() { store = { data: null, loading: false, err: false }; inflight = null; }

// ───────────── small pieces ─────────────
export function Rings({ s = 20, cls = '' }: { s?: number; cls?: string }) {
  return (
    <svg className={`dt-rings ${cls}`} width={s} height={s * 0.6} viewBox="0 0 34 20" aria-hidden="true">
      <circle cx="11" cy="10" r="7.5" className="b" /><circle cx="23" cy="10" r="7.5" className="p" />
    </svg>
  );
}
function Ring({ pct, size, stroke, children, cls = '' }: { pct: number; size: number; stroke: number; children?: React.ReactNode; cls?: string }) {
  const r = (size - stroke) / 2;
  return (
    <span className={`dt-ring ${cls}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="tr" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className="fl" strokeWidth={stroke} pathLength={100}
          strokeDasharray={`${Math.max(0, Math.min(100, pct))} 100`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="in">{children}</span>
    </span>
  );
}
const Ic: Record<TaskId, React.ReactNode> = {
  open: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  ask: <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>,
  vote: <svg viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6z" /></svg>,
  watch: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5z" /></svg>,
  say: <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
};
const Check = () => <svg viewBox="0 0 24 24" className="dt-ck" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>;

function rowText(t: TaskRow, tx: TaskTx, lang: 'th' | 'en'): { title: string; sub: string } {
  switch (t.id) {
    case 'open': return { title: tx.open, sub: t.claimed ? tx.openDone : tx.openS };
    case 'ask': return { title: tx.ask, sub: t.done ? tx.askDone : t.question ? `“${t.question.body}”` : tx.askNone };
    case 'vote': {
      const v = t.vote;
      if (v && v.pick) { const lab = v.pick === 'a' ? (lang === 'th' ? v.a_th : v.a_en) : v.pick === 'b' ? (lang === 'th' ? v.b_th : v.b_en) : (lang === 'th' ? v.c_th : v.c_en) || ''; return { title: tx.vote, sub: fmt(tx.voteDone, lab) }; }
      return { title: tx.vote, sub: v ? (lang === 'th' ? v.q_th : v.q_en) : '' };
    }
    case 'watch': return { title: tx.watch, sub: fmt(tx.watchS, t.progress ?? 0, t.goal ?? 3) };
    case 'say': return { title: tx.say, sub: tx.sayS };
  }
}

// ───────────── the orb on the Feed (A) + reminder bubble (A, no border) + check-in toast (A) + watch bar (B) ─────────────
export interface TasksFeedProps {
  lang: string; name: string; verified: boolean;
  onAsk: (questionId: string | null) => void;
  onVerify: () => void;
  /** the Feed scroller (orb slides half away while scrolling) */
  scrollEl?: HTMLElement | null;
}
export function TasksFeed(props: TasksFeedProps) {
  const L = tLang(props.lang);
  const tx = TX[L];
  const { data } = useTasks();
  const [open, setOpen] = useState(false);
  const [away, setAway] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [toast, setToast] = useState(false);
  const [face, setFace] = useState(false);
  useEffect(() => { void tasksRefresh(); }, []);
  useEffect(() => { void tasksRefresh(); }, [props.verified]);
  // orb: partly hidden while the Feed scrolls
  useEffect(() => {
    const el = props.scrollEl;
    if (!el) return;
    let t = 0;
    const on = () => { setAway(true); window.clearTimeout(t); t = window.setTimeout(() => setAway(false), 900); };
    el.addEventListener('scroll', on, { passive: true });
    return () => { el.removeEventListener('scroll', on); window.clearTimeout(t); };
  }, [props.scrollEl]);
  // watch-3: count Reels watched to the end (server checks the time really passed)
  const dataRef = useRef(data); dataRef.current = data;
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ post: string; phase: 'start' | 'end' }>).detail;
      const w = dataRef.current?.tasks?.find((x) => x.id === 'watch');
      if (!d?.post || !w || w.claimed || w.done) return;
      void taskWatch(d.post, d.phase).then((r) => {
        if (d.phase !== 'end' || !r.counted) return;
        const cur = dataRef.current;
        if (!cur?.tasks) return;
        const goal = w.goal ?? 3;
        tasksSet({ ...cur, tasks: cur.tasks.map((x) => (x.id === 'watch' ? { ...x, progress: Math.min(goal, r.progress), done: r.progress >= goal } : x)) });
      }).catch(() => undefined);
    };
    window.addEventListener('kr8-reel-watch', on);
    return () => window.removeEventListener('kr8-reel-watch', on);
  }, []);
  // check-in toast once a day; reminder bubble once a session (after a while on the Feed) while tasks are left
  useEffect(() => {
    if (!data?.on || !data.day) return;
    const o = data.tasks?.find((t) => t.id === 'open');
    let seen = '';
    try { seen = localStorage.getItem('kr8_dt_toast') || ''; } catch { /* private mode */ }
    if (o && !o.claimed && seen !== data.day) {
      // 20 Nov: never together with the Feed tip ("A save gives…"): while a tip is up, the toast waits for it to close
      let t = 0;
      const show = () => {
        if (document.getElementById('goCoach')) { t = window.setTimeout(show, 1200); return; }
        setToast(true); try { localStorage.setItem('kr8_dt_toast', data.day || ''); } catch { /* ignore */ }
      };
      t = window.setTimeout(show, 1800);
      return () => window.clearTimeout(t);
    }
    let b = '';
    try { b = sessionStorage.getItem('kr8_dt_bubble') || ''; } catch { /* ignore */ }
    if (!b && leftCount(data) > 0) {
      const t = window.setTimeout(() => { setBubble(true); try { sessionStorage.setItem('kr8_dt_bubble', '1'); } catch { /* ignore */ } }, 9000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [data?.on, data?.day]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!bubble) return; const t = window.setTimeout(() => setBubble(false), 6500); return () => window.clearTimeout(t); }, [bubble]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(false), 9000); return () => window.clearTimeout(t); }, [toast]);
  if (!data?.on || !data.tasks) return null;
  const n = doable(data).length;
  const c = claimedCount(data);
  const ready = readyCount(data);
  const left = leftCount(data);
  const w = data.tasks.find((t) => t.id === 'watch');
  const showBar = !!w && !w.claimed && !w.done && (w.progress ?? 0) > 0;
  const streak = streakDays(data.streak);
  const collectOpen = async () => {
    setToast(false);
    if (!data.verified) { setFace(true); return; }
    try { tasksSet(await taskClaim('open')); burst(); } catch (e) { if ((e as { code?: string }).code === 'TASK_FACE') setFace(true); }
  };
  return (
    <>
      {showBar ? (
        <div className="dt-wbar" role="status" aria-label={fmt(tx.watchS, w!.progress ?? 0, w!.goal ?? 3)}>
          <span className="segs">{Array.from({ length: w!.goal ?? 3 }, (_, i) => <i key={i} className={i < (w!.progress ?? 0) ? 'on' : ''} />)}</span>
          <b>{fmt(tx.watchBar, w!.progress ?? 0, w!.goal ?? 3)}</b>
        </div>
      ) : null}
      {toast ? (
        <div className="dt-toast" role="status">
          <Rings s={30} />
          <span className="t"><b>{fmt(tx.welcome, props.name || '')}</b><small>{fmt(tx.checkin, Math.max(1, streak + 1))}</small></span>
          <button type="button" className="dt-btn claim" onClick={() => void collectOpen()}>{tx.collect}</button>
        </div>
      ) : null}
      <button type="button" id="dtOrb" className={`dt-orb${away ? ' away' : ''}${c === n ? ' full' : ''}${ready ? ' has' : ''}`} aria-label={`${tx.dailyTasks} · ${fmt(tx.of, c, n)}`}
        onClick={() => { setBubble(false); setOpen(true); void tasksRefresh(); }}>
        <Ring pct={(c / Math.max(1, n)) * 100} size={46} stroke={2.5}>{c === n ? <Check /> : <Rings s={22} />}</Ring>
        {ready ? <i className="dt-dot">{ready}</i> : null}
      </button>
      {bubble && left > 0 ? (
        <button type="button" className="dt-bubble" onClick={() => { setBubble(false); setOpen(true); }}>
          {left === 1 ? tx.taskLeft : fmt(tx.tasksLeft, left)}
        </button>
      ) : null}
      {open ? <TasksSheet lang={props.lang} onClose={() => setOpen(false)} onAsk={(q) => { setOpen(false); props.onAsk(q); }}
        onFace={() => { setOpen(false); setFace(true); }} /> : null}
      {face ? <FaceNudge lang={props.lang} onClose={() => setFace(false)} onGo={() => { setFace(false); props.onVerify(); }} /> : null}
    </>
  );
}

function burst() {
  try { window.dispatchEvent(new CustomEvent('kr8-dt-burst')); } catch { /* ignore */ }
}

// ───────────── the sheet (header B: big ring) ─────────────
export function TasksSheet(props: { lang: string; onClose: () => void; onAsk: (q: string | null) => void; onFace: () => void }) {
  const L = tLang(props.lang);
  const tx = TX[L];
  const { data, err } = useTasks();
  const [vote, setVote] = useState(false);
  const [popping, setPopping] = useState<TaskId | null>(null);
  const [busy, setBusy] = useState<TaskId | null>(null);
  const [failMsg, setFailMsg] = useState('');
  const [prevRings, setPrevRings] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!data?.on || !data.tasks) {
    return (
      <div className="dt-wrap" role="dialog" aria-label={tx.dailyTasks}>
        <div className="dt-dim" onClick={props.onClose} />
        <div className="dt-sheet"><div className="dt-grab" /><p className="dt-msg">{err ? tx.network : '…'}</p></div>
      </div>
    );
  }
  const n = doable(data).length;
  const c = claimedCount(data);
  const all = c === n;
  const rs = resetsIn(data.resets_at);
  const streak = streakDays(data.streak);
  const rows = TASK_ORDER.map((id) => data.tasks!.find((t) => t.id === id)).filter(Boolean) as TaskRow[];
  const claim = async (id: TaskId) => {
    if (!data.verified) { props.onFace(); return; }
    setBusy(id); setFailMsg('');
    setPrevRings(data.rings_today ?? 0);
    try {
      setPopping(id);
      const d = await taskClaim(id);
      window.setTimeout(() => { tasksSet(d); setPopping(null); burst(); }, 650);
    } catch (e) {
      setPopping(null);
      if ((e as { code?: string }).code === 'TASK_FACE') props.onFace(); else setFailMsg(tx.claimFail);
    } finally { setBusy(null); }
  };
  const go = (t: TaskRow) => {
    if (t.id === 'open') { void claim('open'); return; }
    if (t.id === 'ask') { props.onAsk(t.question?.id || null); return; }
    if (t.id === 'vote') { setVote(true); return; }
    if (t.id === 'watch') { props.onClose(); }
  };
  const dayLabels = weekLabels(data.day, tx);
  return (
    <div className="dt-wrap" role="dialog" aria-label={tx.dailyTasks} lang={L}>
      <div className="dt-dim" onClick={props.onClose} />
      <div className="dt-sheet" id="dtSheet">
        <div className="dt-grab" />
        <div className="dt-head">
          <div className="dt-ht"><b>{all ? tx.allDone : tx.today}</b>{streak > 0 ? <span className="dt-sk">{fmt(tx.streak, streak)}</span> : null}</div>
          <div className="dt-hb">
            <Ring pct={(c / Math.max(1, n)) * 100} size={64} stroke={3} cls="big"><b>{c}</b><small>{fmt(tx.ofN, n)}</small></Ring>
            <div className="dt-hr">
              <span className="cap">{tx.ringsToday}</span>
              <span className="num"><Rings s={26} /><Count v={data.rings_today ?? 0} from={prevRings} /><em>/ {data.max ?? 6}</em></span>
              <small>{all ? tx.seeTomorrow : rs ? fmt(tx.resets, rs.h, rs.m) : ''}</small>
            </div>
          </div>
        </div>
        <div className="dt-list">
          {rows.map((t) => {
            const st = taskState(t);
            const { title, sub } = rowText(t, tx, L);
            return (
              <div key={t.id} className={`dt-row st-${st}${popping === t.id ? ' pop' : ''}`} data-task={t.id}>
                <span className="ic" aria-hidden="true">{Ic[t.id]}</span>
                <span className="tx"><b>{title}</b><small>{sub}</small></span>
                <span className="rw">{fmt(tx.ringsShort, t.rings)}</span>
                {st === 'soon' ? <span className="dt-tag">{tx.soon}</span>
                  : st === 'done' ? <span className="dt-btn done"><Check />{tx.done}</span>
                  : st === 'claim' ? (
                    <button type="button" className="dt-btn claim" disabled={busy === t.id} onClick={() => void claim(t.id)}>
                      {tx.claim}<span className="dt-burst" aria-hidden="true"><Rings s={18} /><Rings s={13} /><Rings s={10} /></span>
                    </button>
                  ) : <button type="button" className="dt-btn" onClick={() => go(t)}>{tx.go}</button>}
              </div>
            );
          })}
        </div>
        {failMsg ? <p className="dt-msg err" role="alert">{failMsg}</p> : null}
        <div className="dt-week" aria-label={fmt(tx.streak, streak)}>
          {(data.streak || []).map((on, i, a) => (
            <span key={i} className={`d${on ? ' on' : ''}${i === a.length - 1 ? ' now' : ''}`}>
              <i>{on ? <Check /> : null}</i><small>{i === a.length - 1 ? tx.todayShort : dayLabels[i]}</small>
            </span>
          ))}
        </div>
      </div>
      {vote ? <VoteSheet lang={props.lang} onClose={() => setVote(false)} /> : null}
    </div>
  );
}

/** weekday labels for the 7 days ending on `day` (YYYY-MM-DD, Bangkok) */
function weekLabels(day: string | undefined, tx: TaskTx): string[] {
  const d0 = day ? new Date(`${day}T12:00:00Z`) : new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(d0.getTime() - (6 - i) * 86400000);
    const wd = (d.getUTCDay() + 6) % 7;   // Monday = 0
    return tx.days[wd];
  });
}

function Count({ v, from }: { v: number; from: number | null }) {
  const [shown, setShown] = useState(from ?? v);
  useEffect(() => {
    if (from === null || from === v) { setShown(v); return; }
    let i = from; setShown(i);
    const t = window.setInterval(() => { i += 1; setShown(i); if (i >= v) window.clearInterval(t); }, 120);
    return () => window.clearInterval(t);
  }, [v]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <b className="cnt" key={shown}>{shown}</b>;
}

// ───────────── quick vote (A: this or that · price check) ─────────────
const placeImg = (f: string | null) => (f ? `${((import.meta as unknown as { env?: Record<string, string> }).env?.BASE_URL) || '/'}media/places/${f}` : '');
export function VoteSheet(props: { lang: string; onClose: () => void }) {
  const L = tLang(props.lang);
  const tx = TX[L];
  const { data } = useTasks();
  const t = data?.tasks?.find((x) => x.id === 'vote');
  const v = t?.vote;
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const lab = (k: 'a' | 'b' | 'c') => (k === 'a' ? (L === 'th' ? v.a_th : v.a_en) : k === 'b' ? (L === 'th' ? v.b_th : v.b_en) : (L === 'th' ? v.c_th : v.c_en) || '');
  const pick = async (k: 'a' | 'b' | 'c') => {
    if (v.pick || busy) return;
    setBusy(true);
    try { tasksSet(await taskVote(k)); } catch { /* keep the sheet; they can tap again */ } finally { setBusy(false); }
  };
  const pct = (k: 'a' | 'b' | 'c') => (v.pct && typeof v.pct[k] === 'number' ? `${v.pct[k]}%` : '');
  return (
    <div className="dt-vote" role="dialog" aria-label={tx.quickVote} lang={L}>
      <div className="dt-vtop">
        <button type="button" className="x" aria-label={tx.close} onClick={props.onClose}>×</button>
        <span className="dt-chip"><Rings s={14} />{tx.dailyTasks} · +{t?.rings ?? 1}</span>
      </div>
      <span className="cap">{v.kind === 'price' ? tx.priceCheck : tx.quickVote}</span>
      <h3>{L === 'th' ? v.q_th : v.q_en}</h3>
      {v.kind === 'pair' ? (
        <div className="dt-pair">
          {(['a', 'b'] as const).map((k) => (
            <button type="button" key={k} className={`ph${v.pick === k ? ' mine' : ''}${v.pick ? ' shown' : ''}`} disabled={busy} onClick={() => void pick(k)}
              style={{ backgroundImage: `url('${placeImg(k === 'a' ? v.a_img : v.b_img)}')` }}>
              {v.pick ? <b className="pc">{pct(k)}</b> : null}
              <span className="nm">{lab(k)}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {v.img ? <div className="dt-pimg" style={{ backgroundImage: `url('${placeImg(v.img)}')` }} /> : null}
          <div className="dt-opts">
            {(['a', 'b', 'c'] as const).map((k) => (
              <button type="button" key={k} className={`op${v.pick === k ? ' mine' : ''}`} disabled={busy} onClick={() => void pick(k)}>
                <span>{lab(k)}</span>{v.pick ? <b>{pct(k)}</b> : null}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="dt-vnote">{v.pick ? '' : v.kind === 'price' ? tx.pricePick : tx.tapSide}</p>
      {v.pick ? <button type="button" className="dt-wide" onClick={props.onClose}>{tx.next}</button> : null}
    </div>
  );
}

// ───────────── gentle face nudge (no gate: the task stays done) ─────────────
export function FaceNudge(props: { lang: string; onClose: () => void; onGo: () => void }) {
  const tx = TX[tLang(props.lang)];
  return (
    <div className="dt-wrap" role="dialog" aria-label={tx.faceT}>
      <div className="dt-dim" onClick={props.onClose} />
      <div className="dt-sheet dt-face" id="dtFace">
        <div className="dt-grab" />
        <span className="dt-fic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="11" r="3.2" /><path d="M7.5 17.5c1.2-1.8 2.8-2.6 4.5-2.6s3.3.8 4.5 2.6" /></svg></span>
        <b className="t">{tx.faceT}</b>
        <p>{tx.faceS}</p>
        <button type="button" className="dt-wide pink" id="dtFaceGo" onClick={props.onGo}>{tx.faceGo}</button>
        <button type="button" className="dt-link" onClick={props.onClose}>{tx.later}</button>
      </div>
    </div>
  );
}

// ───────────── Me line (B: mini ring + one line + Claim N) ─────────────
export function TasksMeLine(props: { lang: string; onOpen: () => void }) {
  const tx = TX[tLang(props.lang)];
  const { data } = useTasks();
  useEffect(() => { if (!store.data) void tasksRefresh(); }, []);
  if (!data?.on || !data.tasks) return null;
  const n = doable(data).length;
  const c = claimedCount(data);
  const ready = readyCount(data);
  const s = streakDays(data.streak);
  return (
    <button type="button" className="dt-meline" id="dtMeLine" onClick={props.onOpen}>
      <Ring pct={(c / Math.max(1, n)) * 100} size={30} stroke={2.5}><Rings s={14} /></Ring>
      <span className="t"><b>{tx.dailyTasks}</b><small>{fmt(tx.of, c, n)}{s > 0 ? ` · ${fmt(tx.streak, s)}` : ''}</small></span>
      {ready ? <span className="dt-btn claim sm">{tx.claim} {ready}</span> : <span className="go" aria-hidden="true">›</span>}
    </button>
  );
}

/** The sheet + face nudge opened from Me (the Feed has its own). */
export function TasksFromMe(props: { lang: string; onClose: () => void; onAsk: (q: string | null) => void; onVerify: () => void }) {
  const [face, setFace] = useState(false);
  useEffect(() => { void tasksRefresh(); }, []);
  if (face) return <FaceNudge lang={props.lang} onClose={() => { setFace(false); props.onClose(); }} onGo={() => { setFace(false); props.onVerify(); }} />;
  return <TasksSheet lang={props.lang} onClose={props.onClose} onAsk={props.onAsk} onFace={() => setFace(true)} />;
}
