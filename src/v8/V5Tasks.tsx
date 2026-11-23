/**
 * Daily tasks UI (founder picks 20 Nov): orb A (gold progress ring, left edge), sheet header B (big ring), quick vote A (this or that),
 * watch-3 B (thin top bar), check-in A (soft toast), reminder A (bubble, no border), Me line B (mini ring). Poppo workflow, not its look.
 * The server decides everything (v5Tasks.ts); this file only shows state and asks.
 */
import { TotHero } from './totHero';
import { TotReasons, TotStreak } from './totReasons';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import './tasks.css';
import { RoastCard } from './V5Roast';
import {
  claimedCount, doable, fmt, leftCount, readyCount, resetsIn, streakDays, taskClaim, TASK_ORDER, taskReason, taskReasonsToday, taskReasonText, taskReasonUp, taskState,
  tasksToday, taskStreak, taskVote, taskVoteWho, taskWatch,
  tLang, TX, VOTE_NUMS_MIN, type TaskId, type TaskRow, type TasksToday, type TaskTx, type VoteReasons, type VoteStreak, type VoteWho,
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
  post: <svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  bonus: <svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>,
  open: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  ask: <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>,
  vote: <svg viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6z" /></svg>,
  watch: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5z" /></svg>,
  say: <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
};
const Check = () => <svg viewBox="0 0 24 24" className="dt-ck" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>;

const askLine = (q: { body: string; details?: string | null }, lang: 'th' | 'en'): string => {
  const d = q.details || ''; const en = /[A-Za-z]/.test(q.body) && (q.body.match(/[A-Za-z]/g) || []).length > (q.body.match(/[\u0E00-\u0E7F]/g) || []).length;
  return lang === 'th' && en && /[\u0E00-\u0E7F]/.test(d) ? d : q.body;   // one language only: the Thai version for Thai readers
};
function rowText(t: TaskRow, tx: TaskTx, lang: 'th' | 'en'): { title: string; sub: string } {
  switch (t.id) {
    case 'open': return { title: tx.open, sub: t.claimed ? tx.openDone : tx.openS };
    case 'ask': { const rule = fmt(tx.askRule, t.min_chars || 15);   // 22 Nov: the 15-character rule, so a 3-word answer is not a surprise
      // 24 Nov audit: done, this said only "Answer posted" — the member could not see WHICH question they answered.
      // The vote row names the pick; this one names the question.
      return { title: tx.ask, sub: t.done ? (t.question ? `${tx.askDone} · “${askLine(t.question, lang)}”` : tx.askDone)
        : t.question ? `${rule} · “${askLine(t.question, lang)}”` : rule }; }
    case 'vote': {
      const v = t.vote;
      if (v && v.pick) { const lab = v.pick === 'a' ? (lang === 'th' ? v.a_th : v.a_en) : v.pick === 'b' ? (lang === 'th' ? v.b_th : v.b_en) : (lang === 'th' ? v.c_th : v.c_en) || ''; return { title: tx.vote, sub: fmt(tx.voteDone, lab) }; }
      return { title: tx.vote, sub: v ? (lang === 'th' ? v.q_th : v.q_en) : '' };
    }
    case 'watch': return { title: tx.watch, sub: fmt(tx.watchS, t.progress ?? 0, t.goal ?? 3) };
    case 'say': return { title: tx.say, sub: tx.sayS };
    case 'post': return { title: tx.post, sub: t.done ? tx.postDone : t.question ? `“${t.question.body}” · ${tx.postS}` : tx.postS };
    case 'bonus': return { title: tx.bonus, sub: tx.bonusS };
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
    if (t.id === 'vote') { if (t.vote?.kind === 'roast') { props.onAsk(null); return; } setVote(true); return; }
    if (t.id === 'watch') { props.onClose(); }
    if (t.id === 'post') { props.onClose(); window.dispatchEvent(new Event('kr8:post')); }
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
                <span className="rw">{t.id === 'post' ? '+3–7' : fmt(tx.ringsShort, t.rings)}</span>
                {t.id === 'bonus' && st === 'go' ? <span className="dt-tag">{c}/{n}</span>
                  : st === 'soon' ? <span className="dt-tag">{tx.soon}</span>
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
        <p className="dt-msg dt-skl">{tx.streakLine}</p>
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

// ───────────── who voted (24 Nov) ─────────────
const AV_BG = ['#5B8CFF', '#FF4FD8', '#F0A848', '#3FC9A3', '#A77BFF', '#FF7A6B'];
/** "Jaaaa, Nut, Ploy +6 voted" with small round photos (a coloured letter when a member has none). */
function VoteWho({ rows, tx }: { rows: VoteWho[]; tx: TaskTx }) {
  if (!rows.length) return null;
  const names = rows.map((r) => r.first_name).filter(Boolean);
  if (!names.length) return null;
  const more = Math.max(0, (rows[0]?.n ?? names.length) - names.length);
  const line = more > 0 ? fmt(tx.whoMore, names.join(', '), more) : names.join(', ');
  return (
    <span className="toth-who">
      <span className="toth-avs" aria-hidden="true">
        {rows.map((r, i) => (
          <span key={i} className="toth-av" style={r.photo ? { backgroundImage: `url('${r.photo}')` } : { background: AV_BG[i % AV_BG.length] }}>
            {r.photo ? '' : (r.first_name || '?').slice(0, 1).toUpperCase()}
          </span>
        ))}
      </span>
      <span className="toth-wn">{fmt(tx.whoVoted, line)}</span>
    </span>
  );
}

// ───────────── quick vote (A: this or that · price check) ─────────────
const placeImg = (f: string | null) => (f ? `${((import.meta as unknown as { env?: Record<string, string> }).env?.BASE_URL) || '/'}media/places/${f}` : '');
/** 20 Nov (founder): "This or that": Kring-made, one a day, one locked vote per member. Shown as the FIRST card of Ask BKK
 *  (inline) and from the Daily tasks "Quick vote" row (sheet). Before voting: the two pictures only, no numbers (the server
 *  doesn't send them either). After the vote: glow ring + check on the pick, the other side dims, bars fill, "Vote counted ✓". */
export function ThisOrThatCard(props: { lang: string; inline?: boolean; onClose?: () => void }) {
  const L = tLang(props.lang);
  const tx = TX[L];
  const { data } = useTasks();
  useEffect(() => { if (!store.data) void tasksRefresh(); }, []);
  const t = data?.tasks?.find((x) => x.id === 'vote');
  const v = t?.vote;
  const [busy, setBusy] = useState<'a' | 'b' | 'c' | null>(null);
  const [fresh, setFresh] = useState(false);   // voted in this view → play the reveal
  const [grow, setGrow] = useState(false);
  useEffect(() => { if (v?.pick && v.pct) { const id = requestAnimationFrame(() => requestAnimationFrame(() => setGrow(true))); return () => cancelAnimationFrame(id); } setGrow(false); return undefined; }, [v?.pick, !!v?.pct]);   // eslint-disable-line react-hooks/exhaustive-deps
  // 24 Nov (founder): show who voted (m204) — first names + photos only, and only once this member has voted
  const [who, setWho] = useState<VoteWho[]>([]);
  const voted = !!t?.vote?.pick;
  const day = data?.day;
  useEffect(() => {
    if (!voted) { setWho([]); return undefined; }
    let off = false;
    void taskVoteWho(day).then((r) => { if (!off) setWho(Array.isArray(r) ? r : []); }).catch(() => { /* the names are a nicety, never a blocker */ });
    return () => { off = true; };
  }, [voted, day]);
  // 24 Nov: one-tap reasons (m204) + the guess streak (m205). Both only mean anything once this member has voted, and
  // both are extras — if either call fails the card itself still works, so nothing here can block the vote.
  const [rsn, setRsn] = useState<VoteReasons | null>(null);
  const [stk, setStk] = useState<VoteStreak | null>(null);
  const [rBusy, setRBusy] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  useEffect(() => {
    if (!voted) { setRsn(null); setStk(null); return undefined; }
    let off = false;
    void taskReasonsToday(day).then((r) => { if (!off) setRsn(r); }).catch(() => { /* extra, never a blocker */ });
    void taskStreak().then((r) => { if (!off) setStk(r); }).catch(() => { /* extra, never a blocker */ });
    return () => { off = true; };
  }, [voted, day]);
  if (!v) return null;
  if (v.kind === 'roast') return props.inline ? <RoastCard lang={props.lang} day={data?.day} q={L === 'th' ? v.q_th : v.q_en} aImg={v.a_img} bImg={v.b_img} aLab={L === 'th' ? v.a_th : v.a_en} bLab={L === 'th' ? v.b_th : v.b_en} /> : null;
  const lab = (k: 'a' | 'b' | 'c') => (k === 'a' ? (L === 'th' ? v.a_th : v.a_en) : k === 'b' ? (L === 'th' ? v.b_th : v.b_en) : (L === 'th' ? v.c_th : v.c_en) || '');
  const mine = v.pick || busy;
  const shown = !!(v.pick && v.pct);
  const pick = async (k: 'a' | 'b' | 'c') => {
    if (mine) return;
    setBusy(k);
    try { navigator.vibrate?.(20); } catch { /* no haptics */ }
    try { tasksSet(await taskVote(k)); setFresh(true); }
    catch (e) { if ((e as { code?: string })?.code === 'ALREADY_VOTED') await tasksRefresh(); }
    finally { setBusy(null); }
  };
  const pc = (k: 'a' | 'b' | 'c') => (v.pct && typeof v.pct[k] === 'number' ? (v.pct[k] as number) : 0);
  const keys = (v.kind === 'pair' ? ['a', 'b'] : ['a', 'b', 'c']) as ('a' | 'b' | 'c')[];
  const n = v.pct?.n ?? 0;
  // 24 Nov (founder): one vote read as "100% / 0%" and looked broken — no digits at all under 10 votes, the count in words instead
  const nums = shown && n >= VOTE_NUMS_MIN;
  const countLine = shown && !nums ? fmt(tx.votedSoFar, n, VOTE_NUMS_MIN) : '';
  const summary = shown ? (nums ? `${keys.map((k) => `${pc(k)}%`).join(' · ')} · ${n === 1 ? tx.votes1 : fmt(tx.votesN, n)}` : countLine) : '';
  const earned = fresh && !!data?.verified && (t?.rings ?? 0) > 0;
  // every reason RPC returns the whole day's reasons, so a tap needs no second read; if the server refuses (the reason is
  // locked once someone has upvoted it, KR8_REASON_LOCKED) just re-read what it does have.
  const reReason = async () => { try { setRsn(await taskReasonsToday(day)); } catch { /* leave what is on screen */ } };
  const pickReason = async (k: string) => {
    if (rBusy) return;
    setRBusy(k);
    try { navigator.vibrate?.(12); } catch { /* no haptics */ }
    try { setRsn(await taskReason(k)); } catch { await reReason(); } finally { setRBusy(null); }
  };
  const upReason = async (id: string) => {
    if (upBusy) return;
    setUpBusy(true);
    try { setRsn(await taskReasonUp(id)); } catch { await reReason(); } finally { setUpBusy(false); }
  };
  // own words (24 Nov): returns an error line to show under the box, or null when it went through
  const textReason = async (t: string): Promise<string | null> => {
    try { setRsn(await taskReasonText(t)); return null; }
    catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'KR8_REASON_LOCKED') { await reReason(); return tx.ownLocked; }
      if (code === 'KR8_BAD_TEXT') return tx.ownBad;
      await reReason();
      return tx.network;
    }
  };
  const myPick = (v.pick || null) as 'a' | 'b' | 'c' | null;
  const myReason = rsn?.reasons?.find((r) => r.mine) || null;
  const after = shown ? (
    <>
      <TotReasons th={L === 'th'} tx={tx} presets={(myPick && rsn?.presets?.[myPick]) || []} mineKey={myReason?.key ?? null}
        mineOwn={!!myReason?.own_words} onText={textReason} mine={myReason}
        top={rsn?.reasons?.[0] || null} busy={rBusy} upBusy={upBusy} onPick={(k) => void pickReason(k)} onUp={(id) => void upReason(id)} />
      {stk ? <TotStreak tx={tx} s={stk} /> : null}
    </>
  ) : null;
  // 20 Nov (founder): at the top of Ask BKK the pair question is a full-bleed hero that folds into a slim strip after the vote
  if (props.inline && v.kind === 'pair') {
    return (
      <TotHero th={L === 'th'} q={L === 'th' ? v.q_th : v.q_en} imgs={{ a: placeImg(v.a_img), b: placeImg(v.b_img) }} lab={lab} pct={pc}
        pick={(v.pick as 'a' | 'b' | null) || null} busy={(busy as 'a' | 'b' | null) || null} shown={shown} grow={grow} fresh={fresh}
        onPick={(k) => void pick(k)} summary={summary} counted={tx.counted} locked={tx.locked} cap={<><Rings s={13} />{tx.thisOrThat}</>}
        nums={nums} countLine={countLine} who={shown ? <VoteWho rows={who} tx={tx} /> : null}
        guessQ={tx.guessQ} picked={fmt(tx.youPicked, lab((v.pick || busy || 'a') as 'a' | 'b'))} after={after}
        ringChip={earned ? <span className="toth-chip ring"><Rings s={12} />{tx.ringPlus}</span> : null} />
    );
  }
  const card = (
    <div className={`tot${props.inline ? ' inline' : ''}${shown ? ' shown' : ''}${fresh ? ' fresh' : ''}`} id={props.inline ? 'totCard' : 'totSheetCard'} lang={L}>
      <div className="tot-top">
        <span className="tot-cap"><Rings s={13} />{v.kind === 'price' ? tx.priceCheck : tx.thisOrThat}</span>
        {props.onClose ? <button type="button" className="tot-x" aria-label={tx.close} onClick={props.onClose}>×</button> : null}
      </div>
      <h3 className="tot-q">{L === 'th' ? v.q_th : v.q_en}</h3>
      {v.kind === 'pair' ? (
        <div className="tot-pair">
          {keys.map((k) => {
            const me = (v.pick || busy) === k;
            return (
              <button type="button" key={k} data-side={k} className={`tot-side${me ? ' mine' : mine ? ' other' : ''}`} disabled={!!mine}
                aria-pressed={me} onClick={() => void pick(k)} style={{ backgroundImage: `url('${placeImg(k === 'a' ? v.a_img : v.b_img)}')` }}>
                <span className="tot-shade" aria-hidden="true" />
                {me ? <span className="tot-check" aria-hidden="true">✓</span> : null}
                {me && v.pick ? <span className="tot-yours">{tx.yourPick}</span> : null}
                <span className="tot-nm">{lab(k)}</span>
                {shown ? <span className="tot-bar"><i style={{ width: grow ? `${pc(k)}%` : '0%' }} />{nums ? <b>{pc(k)}%</b> : null}</span> : null}
              </button>
            );
          })}
          <span className="tot-or" aria-hidden="true">{L === 'th' ? 'หรือ' : 'or'}</span>
        </div>
      ) : (
        <>
          {v.img ? <div className="tot-pimg" style={{ backgroundImage: `url('${placeImg(v.img)}')` }} /> : null}
          <div className="tot-opts">
            {keys.map((k) => {
              const me = (v.pick || busy) === k;
              return (
                <button type="button" key={k} data-side={k} className={`tot-op${me ? ' mine' : mine ? ' other' : ''}`} disabled={!!mine} aria-pressed={me} onClick={() => void pick(k)}>
                  {shown ? <i className="tot-fill" style={{ width: grow ? `${pc(k)}%` : '0%' }} /> : null}
                  <span>{lab(k)}{me && v.pick ? <em className="tot-yours sm">{tx.yourPick}</em> : null}</span>
                  {me ? <span className="tot-check sm" aria-hidden="true">✓</span> : null}
                  {shown && nums ? <b>{pc(k)}%</b> : null}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="tot-foot" role="status">
        {shown ? (
          <>
            <span className="tot-sum" id="totSummary">{summary}</span>
            <VoteWho rows={who} tx={tx} />
            <span className="tot-chips">{fresh ? <span className="tot-chip ok">{tx.counted}</span> : <span className="tot-chip">{tx.locked}</span>}{earned ? <span className="tot-chip ring"><Rings s={12} />{tx.ringPlus}</span> : null}</span>
          </>
        ) : <span className="tot-hint">{tx.tapVote}</span>}
      </div>
    </div>
  );
  if (props.inline) return card;
  return <div className="tot-scrim" role="dialog" aria-label={tx.thisOrThat} onClick={props.onClose}><div className="tot-sheet" onClick={(e) => e.stopPropagation()}>{card}</div></div>;
}
/** the Daily tasks "Quick vote" row opens the same card */
export function VoteSheet(props: { lang: string; onClose: () => void }) {
  return <ThisOrThatCard lang={props.lang} onClose={props.onClose} />;
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
