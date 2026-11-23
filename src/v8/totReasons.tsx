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
import { useEffect, useRef, useState } from 'react';
import { fmt, REASON_MAX, type ReasonPreset, type TaskTx, type VoteReason, type VoteStreak } from './v5Tasks';

const DOTS = 7;

export function TotReasons(p: {
  th: boolean; tx: TaskTx; presets: ReasonPreset[]; mineKey: string | null; mineOwn: boolean; top: VoteReason | null;
  mine: VoteReason | null;
  busy: string | null; upBusy: boolean; onPick: (k: string) => void; onUp: (id: string) => void;
  onText: (t: string) => Promise<string | null>;
}) {
  const { tx, top } = p;
  // the top reason, then the member's own underneath when someone else holds the top spot
  const rows = [top, p.mine && p.mine.id !== top?.id ? p.mine : null].filter((r): r is VoteReason => !!r);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (open) box.current?.focus(); }, [open]);
  // trimmed, because the server trims too — a box of spaces must not look sendable
  const body = text.trim();
  const send = async () => {
    if (sending || body.length < 2) return;
    setSending(true); setErr(null);
    const e = await p.onText(body);
    setSending(false);
    if (e) { setErr(e); return; }
    setText(''); setOpen(false);
  };
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
            {/* 24 Nov (founder): own words too. Last chip, after the presets — one tap is still the easy path. */}
            <button type="button" className={`tor-chip own${p.mineOwn ? ' on' : ''}`} aria-pressed={open || p.mineOwn}
              aria-expanded={open} disabled={!!p.busy} onClick={() => { setErr(null); setOpen((o) => !o); }}>
              <i aria-hidden="true">✏️</i>{tx.ownWords}{p.mineOwn ? <i aria-hidden="true">✓</i> : null}
            </button>
          </div>
          {open ? (
            <div className="tor-own">
              <input ref={box} type="text" className="tor-in" value={text} maxLength={REASON_MAX}
                placeholder={tx.ownPh} aria-label={tx.ownWords} enterKeyHint="send" disabled={sending}
                onChange={(e) => { setText(e.target.value); if (err) setErr(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
              <button type="button" className="tor-send" disabled={sending || body.length < 2} onClick={() => void send()}>{tx.ownSend}</button>
            </div>
          ) : null}
          {open && err ? <span className="tor-err">{err}</span> : null}
        </>
      ) : null}
      {/* 24 Nov audit: only reasons[0] used to render, so the member's own words vanished the moment anyone overtook
          them — while the chip still showed a ✓. Their own line always shows, under the top one when both exist. */}
      {rows.map((r) => (
        <div className="tor-top" key={r.id}>
          <span className="tor-av" style={r.photo ? { backgroundImage: `url('${r.photo}')` } : undefined} aria-hidden="true">
            {r.photo ? '' : (r.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="tor-tx">
            <small>{r.mine ? tx.myReason : (r.name || tx.topReason)}</small>
            <b>{p.th ? r.th : r.en}</b>
          </span>
          {r.mine ? (
            // you cannot agree with yourself (the server refuses it) — the count still shows
            <span className="tor-ups">▲ {r.ups}</span>
          ) : (
            // the word matters: a bare "▲ 12" looked identical to the count above and nobody knew it could be tapped
            <button type="button" className={`tor-up${r.upvoted ? ' on' : ''}`} aria-label={tx.agree}
              disabled={r.upvoted || p.upBusy} onClick={() => p.onUp(r.id)}>▲ {r.ups}<em>{tx.agree}</em></button>
          )}
        </div>
      ))}
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
