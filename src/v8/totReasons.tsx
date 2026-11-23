/**
 * 24 Nov: two things the database already had (m204 + m205) but the This-or-That card never showed.
 *
 * (1) One-tap reasons. After the vote, the three preset reasons for the side the member picked — one tap, never typing
 *     (typing is what killed the roast card). Then today's top reason with that person's name, photo and its upvotes,
 *     and one tap to agree. Tapping a different chip just replaces your own reason, until someone upvotes it.
 * (2) The guess streak. A small flame row with the last settled days as dots.
 *
 * Both sit UNDER the pair (passed to TotHero as `after`, outside `.toth-hero`), so they stay on screen when the hero
 * folds into its slim strip 2 s after the vote. One language at a time: every line reads `th` or `en`, never both.
 */
import { fmt, type ReasonPreset, type TaskTx, type VoteReason, type VoteStreak } from './v5Tasks';

const DOTS = 7;

export function TotReasons(p: {
  th: boolean; tx: TaskTx; presets: ReasonPreset[]; mineKey: string | null; top: VoteReason | null;
  busy: string | null; upBusy: boolean; onPick: (k: string) => void; onUp: (id: string) => void;
}) {
  const { tx, top } = p;
  // no presets written for today's pair and nothing said yet → show nothing at all rather than an empty heading
  if (!p.presets.length && !top) return null;
  return (
    <div className="toth-rsn">
      {p.presets.length ? (
        <>
          <span className="tor-lab">{tx.whyQ}</span>
          <div className="tor-chips">
            {p.presets.map((r) => {
              const on = p.mineKey === r.k;
              return (
                <button type="button" key={r.k} className={`tor-chip${on ? ' on' : ''}`} aria-pressed={on}
                  disabled={!!p.busy} onClick={() => p.onPick(r.k)}>
                  {p.th ? r.th : r.en}{on ? <i aria-hidden="true">✓</i> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
      {top ? (
        <div className="tor-top">
          <span className="tor-av" style={top.photo ? { backgroundImage: `url('${top.photo}')` } : undefined} aria-hidden="true">
            {top.photo ? '' : (top.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="tor-tx">
            <small>{top.mine ? tx.myReason : (top.name || tx.topReason)}</small>
            <b>{p.th ? top.th : top.en}</b>
          </span>
          {top.mine ? (
            // you cannot agree with yourself (the server refuses it) — the count still shows
            <span className="tor-ups">▲ {top.ups}</span>
          ) : (
            <button type="button" className={`tor-up${top.upvoted ? ' on' : ''}`} aria-label={tx.agree}
              disabled={top.upvoted || p.upBusy} onClick={() => p.onUp(top.id)}>▲ {top.ups}</button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TotStreak({ tx, s }: { tx: TaskTx; s: VoteStreak }) {
  // first-ever vote: no finished day has been counted yet, so there is no run and no week to draw
  if (!s || s.days <= 0) return <div className="tor-stk"><span className="tor-fire" aria-hidden="true">🔥</span><span className="tor-sl">{tx.streakNew}</span></div>;
  const line = s.current >= 2 ? fmt(tx.streakRun, s.current)
    : s.current === 1 ? tx.streakOne
    : fmt(tx.streakSome, s.hits, s.days);
  const days = [...(s.last || [])].reverse();                      // server sends newest first; read left → right
  const pad = Math.max(0, DOTS - days.length);                     // fewer than 7 counted days is normal early on
  return (
    <div className="tor-stk">
      <span className="tor-fire" aria-hidden="true">🔥</span>
      <span className="tor-sl">{line}</span>
      <span className="tor-dots" aria-hidden="true">
        {Array.from({ length: pad }, (_, i) => <i key={`p${i}`} />)}
        {days.map((d, i) => <i key={d.day || i} className={d.hit ? 'hit' : d.mine ? 'miss' : ''} />)}
      </span>
    </div>
  );
}
