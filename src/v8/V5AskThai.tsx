/**
 * Ask a Thai (founder-approved "Screen 2", 16 Nov): the plain Twitter-style timeline under Feed › Ask a Thai,
 * the full thread (best answer first) and the Ask sheet. Look copied from ask2/final.html screens 02–04.
 * No explainer text anywhere. Every visible word goes through L().
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './askThai.css';
import {
  ASK_MAX_Q, ASK_MAX_TEXT, askAge, checkAskFile, fmtCount, nextVote,
  type AskAnswer, type AskApi, type AskPerson, type AskQuestion, type AskReportReason, type AskThreadData,
} from './askThai';
import { initialAvatar } from './v8Data';
import { withRef } from './invite';

type LFn = (en: string) => string;
/** A server refusal the member can act on (ghost mode, too many posts, banned words, no card) gets its own message;
 *  anything else keeps the plain fallback. */
const ASK_ERR: Record<string, string> = {
  GHOST: 'This account is paused. Please use your main Kring account.',
  SLOW_DOWN: 'Slow down a little and try again soon.',
  BAD_TEXT: 'Keep it short, with no phone numbers, links or LINE IDs.',
  NO_CARD: 'Make your Kring card first.',
  VERIFY_FIRST: 'Verify your face in 5 seconds to post and chat. One person, one account.',
};
export function askErrText(L: LFn, e: unknown, fallback: string): string {
  const m = /KR8_([A-Z_]+)/.exec(String((e as { message?: string } | null)?.message ?? e ?? ''));
  return L((m && ASK_ERR[m[1]]) || fallback);
}
const EMOJI = ['😊', '😂', '😍', '🙏', '👍', '🔥', '🤯', '😋', '🥹', '❤️', '🌅', '📸', '🏮', '🛺', '☕', '🌧️'];

const Ic: React.FC<{ d: string; s?: number; className?: string }> = ({ d, s = 22, className }) => (
  <svg className={`at-ic ${className || ''}`} viewBox="0 0 24 24" width={s} height={s} aria-hidden="true"><path d={d} /></svg>
);
const IC = {
  ask: 'M4 5h16v11H9l-5 4zM10.2 8.6a1.9 1.9 0 113 1.5c-.7.4-1.2.8-1.2 1.6M12 13.6v.1',
  back: 'M15 5l-7 7 7 7',
  share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6',
  x: 'M6 6l12 12M18 6L6 18',
  pin: 'M12 21s-6-5.6-6-10.5A6 6 0 0118 10.5C18 15.4 12 21 12 21zM12 8.3a2.2 2.2 0 100 4.4 2.2 2.2 0 000-4.4z',
  send: 'M5 12h13M13 6l6 6-6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

/** ⋯ → Report → reason (same reasons and words as the Reel report). 'block' also blocks the person. */
const REPORT_REASONS: [AskReportReason, string][] = [
  ['spam', 'Spam or scam'],
  ['unsafe', 'Unsafe, adult or harassment'],
  ['block', 'Block this person'],
];
export const AskReportSheet: React.FC<{ L: LFn; onPick: (r: AskReportReason) => void; onClose: () => void }> = ({ L, onPick, onClose }) => {
  const [step, setStep] = useState<'menu' | 'why'>('menu');
  return (
    <div className="at-sheet-bg" role="presentation" onClick={onClose}>
      <div className="at-sheet" role="dialog" aria-label={step === 'menu' ? L('More') : L('Report')} onClick={(e) => e.stopPropagation()}>
        {step === 'menu' ? (
          <button type="button" className="at-sheet-row danger" data-ask-report="open" onClick={() => setStep('why')}>⚑ {L('Report')}</button>
        ) : (
          <>
            <p className="at-sheet-q">{L('Why are you reporting it?')}</p>
            {REPORT_REASONS.map(([r, label]) => (
              <button type="button" key={r} className={`at-sheet-row${r === 'block' ? ' danger' : ''}`} data-reason={r} onClick={() => onPick(r)}>{L(label)}</button>
            ))}
          </>
        )}
        <button type="button" className="at-sheet-row at-sheet-x" onClick={onClose}>{L('Close')}</button>
      </div>
    </div>
  );
};
const MoreBtn: React.FC<{ L: LFn; onClick: () => void; id: string }> = ({ L, onClick, id }) => (
  <button type="button" className="at-more" aria-label={L('More')} data-ask-more={id} onClick={onClick}><Ic d={IC.more} s={20} /></button>
);

export function askTime(L: LFn, iso: string): string {
  const a = askAge(iso);
  if (a.u === 'now') return L('Now');
  return L(`{0}${a.u}`).replace('{0}', String(a.n));
}

/** T301-015: an image URL that is checked first; null while loading or when it fails (no blank dark boxes or circles). */
function useImgOk(url: string | null | undefined): string | null {
  const [ok, setOk] = useState<string | null>(url && url.startsWith('data:') ? url : null);
  useEffect(() => {
    if (!url) { setOk(null); return; }
    if (url.startsWith('data:')) { setOk(url); return; }
    let gone = false;
    const im = new Image();
    im.onload = () => { if (!gone) setOk(url); };
    im.onerror = () => { if (!gone) setOk(null); };
    im.src = url;
    return () => { gone = true; };
  }, [url]);
  return ok;
}
const Av: React.FC<{ p: AskPerson; s: number }> = ({ p, s }) => {
  const ok = useImgOk(p.photo);
  return <span className="at-av" style={{ width: s, height: s, backgroundImage: `url("${ok || initialAvatar(p.name || '?')}")` }} aria-hidden="true" />;
};
/** question / answer photo: shown only once it really loaded */
const Media: React.FC<{ m: { url: string; gif?: boolean }; cls: string }> = ({ m, cls }) => {
  const ok = useImgOk(m.url);
  return ok ? <div className={`${cls}${m.gif ? ' gif' : ''}`} style={{ backgroundImage: `url("${ok}")` }} /> : null;
};
const Badge: React.FC<{ L: LFn }> = ({ L }) => <span className="at-badge">{L('Thai Local')}</span>;
/** 0073: the Kring Team account: "Kring Team · Official" instead of the Thai Local badge */
const Official: React.FC<{ L: LFn }> = ({ L }) => <span className="at-badge at-official" data-official="1">{L('Official')}</span>;
const who = (p: AskPerson, L: LFn) => (p.official ? <Official L={L} /> : p.local ? <Badge L={L} /> : null);

/** Photo / GIF / emoji pickers shared by the answer bar and the Ask sheet */
function useMedia(onErr: (m: string) => void, L: LFn) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pick = (f: File | null | undefined) => {
    if (!f) return;
    const bad = checkAskFile(f);
    if (bad) { onErr(bad === 'size' ? L('Photo is too big · up to 5 MB') : L('Use a photo or GIF')); return; }
    setFile(f);
    setUrl(URL.createObjectURL(f));
  };
  const clear = () => { setFile(null); setUrl(''); };
  return { file, url, pick, clear };
}

// ───────────────────────── timeline ─────────────────────────
const Post: React.FC<{ q: AskQuestion; L: LFn; onOpen: () => void; onVote: (v: 1) => void; onShare: () => void; areaLabel: (a: string) => string }> = ({ q, L, onOpen, onVote, onShare, areaLabel }) => (
  <article className="at-tw" data-ask-id={q.id}>
    <Av p={q.by} s={40} />
    <div className="at-tw-main">
      <button type="button" className="at-tw-open" onClick={onOpen}>
        <div className="at-tw-h"><b>{q.by.name}</b>{who(q.by, L)}<span>· {areaLabel(q.area)} · {askTime(L, q.at)}</span></div>
        <div className="at-tw-q">{q.body}</div>
        {q.media && <Media m={q.media} cls="at-tw-img" />}
        {q.top && (
          <div className="at-tw-ans">
            <div className="h"><Av p={q.top.by} s={20} />{q.top.by.name}{who(q.top.by, L)}</div>
            {q.top.body && <div className="t">{q.top.body}</div>}
          </div>
        )}
      </button>
      <div className="at-tw-f">
        <button type="button" className={q.myVote === 1 ? 'on' : ''} aria-label={`${fmtCount(q.score)} ${L('Upvote')}`} aria-pressed={q.myVote === 1} onClick={() => onVote(1)}>▲ {fmtCount(q.score)}</button>
        <button type="button" aria-label={`${fmtCount(q.answers)} ${L('Answers')}`} onClick={onOpen}>💬 {fmtCount(q.answers)}</button>
        <button type="button" aria-label={L('Share')} onClick={onShare}>↗</button>
      </div>
    </div>
  </article>
);

// ───────────────────────── thread (screen 03) ─────────────────────────
const VoteRow: React.FC<{ L: LFn; score: number; my: -1 | 0 | 1; onVote: (v: -1 | 1) => void; hot?: boolean }> = ({ L, score, my, onVote, hot }) => (
  <span className={`at-votes${my ? ' voted' : ''}${hot ? ' hot' : ''}`}>
    <button type="button" className={my === 1 ? 'on' : ''} aria-label={L('Upvote')} aria-pressed={my === 1} onClick={() => onVote(1)}>▲</button>
    <b>{fmtCount(score)}</b>
    <button type="button" className={my === -1 ? 'on' : ''} aria-label={L('Downvote')} aria-pressed={my === -1} onClick={() => onVote(-1)}>▼</button>
  </span>
);

const Thread: React.FC<{
  L: LFn; api: AskApi; id: string; me: AskPerson | null; areaLabel: (a: string) => string;
  onClose: () => void; onShare: (q: AskQuestion) => void; need: (after: () => void) => void; toast: (m: string) => void; onChanged: (q: AskQuestion) => void;
  onReportedQ: (id: string) => void;
}> = ({ L, api, id, me, areaLabel, onClose, onShare, need, toast, onChanged, onReportedQ }) => {
  const [rep, setRep] = useState<{ kind: 'q' | 'a'; id: string } | null>(null);
  const report = (r: AskReportReason) => {
    const target = rep;
    setRep(null);
    if (!target) return;
    need(() => {
      api.report(target.kind, target.id, r).then(() => {
        toast(L('Thanks · we’ll check it. You won’t see it again.'));
        if (target.kind === 'q') { onReportedQ(target.id); return; }
        setData((d) => (d ? { ...d, answers: d.answers.filter((x) => x.id !== target.id && x.parentId !== target.id) } : d));
      }).catch((e) => toast(askErrText(L, e, 'Something went wrong')));
    });
  };
  const mine = (p: AskPerson) => !!me && p.id === me.id;
  const [data, setData] = useState<AskThreadData | null>(null);
  const [err, setErr] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<AskAnswer | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const media = useMedia(toast, L);
  const photoIn = useRef<HTMLInputElement>(null);
  const gifIn = useRef<HTMLInputElement>(null);
  const inp = useRef<HTMLInputElement>(null);
  const load = useCallback(() => {
    setErr(false);
    api.thread(id).then((d) => { setData(d); onChanged(d.q); }).catch(() => setErr(true));
  }, [api, id, onChanged]);
  useEffect(load, [load]);

  const voteQ = (tap: -1 | 1) => need(() => {
    if (!data) return;
    const v = nextVote(data.q.myVote, tap);
    const q = { ...data.q, myVote: v, score: data.q.score + v - data.q.myVote };
    setData({ ...data, q });
    onChanged(q);
    api.vote('q', q.id, v).catch((e) => toast(askErrText(L, e, 'Something went wrong')));
  });
  const voteA = (a: AskAnswer, tap: -1 | 1) => need(() => {
    if (!data) return;
    const v = nextVote(a.myVote, tap);
    setData({ ...data, answers: data.answers.map((x) => (x.id === a.id ? { ...x, myVote: v, score: x.score + v - x.myVote } : x)) });
    api.vote('a', a.id, v).catch((e) => toast(askErrText(L, e, 'Something went wrong')));
  });
  const send = () => need(async () => {
    if (!data || busy || (!text.trim() && !media.file)) return;
    setBusy(true);
    try {
      await api.answer(data.q.id, replyTo ? replyTo.parentId || replyTo.id : null, text.slice(0, ASK_MAX_TEXT), media.file);
      setText(''); media.clear(); setReplyTo(null); setEmoji(false);
      load();
    } catch (e) {
      toast(askErrText(L, e, 'Couldn’t post · try again'));
    } finally {
      setBusy(false);
    }
  });
  const q = data?.q;
  const answers = data ? data.answers : [];   // order is fixed when the thread loads, so a vote never makes rows jump
  const canSend = !!(text.trim() || media.file);

  return (
    <div className="at-page at-thread" role="dialog" aria-label={L('Ask a Thai')}>
      <div className="at-top">
        <button type="button" className="at-iconbtn" aria-label={L('Back')} onClick={onClose}><Ic d={IC.back} /></button>
        {q && <button type="button" className="at-iconbtn at-r" aria-label={L('Share')} onClick={() => onShare(q)}><Ic d={IC.share} /></button>}
        {q && !mine(q.by) && <button type="button" className="at-iconbtn" aria-label={L('More')} data-ask-more={q.id} onClick={() => setRep({ kind: 'q', id: q.id })}><Ic d={IC.more} /></button>}
      </div>
      <div className="at-scroll">
        {err && <button type="button" className="at-retry" onClick={load}>{L('Try again')}</button>}
        {q && (
          <div className="at-q">
            <div className="m">{q.by.name}{(q.by.local || q.by.official) && <> {who(q.by, L)}</>} · {areaLabel(q.area)} · {askTime(L, q.at)}</div>
            <h1>{q.body}</h1>
            {q.details && <p>{q.details}</p>}
            {q.media && <Media m={q.media} cls="img" />}
            <div className="qa">
              <VoteRow L={L} score={q.score} my={q.myVote} onVote={voteQ} hot />
              <span>💬 {answers.length === 1 ? L('1 answer') : L('{0} answers').replace('{0}', fmtCount(answers.length))}</span>
            </div>
          </div>
        )}
        {answers.map((a) => (
          <div key={a.id} className={`at-c${a.parentId ? ' reply' : ''}`} data-answer-id={a.id}>
            <div className="h">
              <Av p={a.by} s={26} />{a.by.name}
              {a.by.official || a.by.local ? who(a.by, L) : <small>· {L('traveller')}</small>}
              {a.best && <span className="star">{L('★ Best')}</span>}
              {!mine(a.by) && <MoreBtn L={L} id={a.id} onClick={() => setRep({ kind: 'a', id: a.id })} />}
            </div>
            {a.body && <div className="t">{a.body}</div>}
            {a.media && <Media m={a.media} cls="img" />}
            <div className="f">
              <VoteRow L={L} score={a.score} my={a.myVote} onVote={(v) => voteA(a, v)} />
              <button type="button" className="at-reply" onClick={() => need(() => { setReplyTo(a); inp.current?.focus(); })}>{L('Reply')}</button>
            </div>
          </div>
        ))}
        <div className="at-pad" />
      </div>
      <div className="at-bar">
        {(replyTo || media.url || emoji) && (
          <div className="at-bar-x">
            {replyTo && (
              <div className="at-replying">
                <span>{L('Replying to {0}').replace('{0}', replyTo.by.name)}</span>
                <button type="button" aria-label={L('Close')} onClick={() => setReplyTo(null)}><Ic d={IC.x} s={16} /></button>
              </div>
            )}
            {media.url && (
              <div className="at-prev">
                <span style={{ backgroundImage: `url("${media.url}")` }} />
                <button type="button" aria-label={L('Remove photo')} onClick={media.clear}><Ic d={IC.x} s={14} /></button>
              </div>
            )}
            {emoji && (
              <div className="at-emoji">
                {EMOJI.map((e) => <button type="button" key={e} onClick={() => setText((t) => (t + e).slice(0, ASK_MAX_TEXT))}>{e}</button>)}
              </div>
            )}
          </div>
        )}
        <div className="at-composer">
          <input
            ref={inp}
            value={text}
            maxLength={ASK_MAX_TEXT}
            placeholder={L('Add an answer')}
            aria-label={L('Add an answer')}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => { if (!me) { inp.current?.blur(); need(() => inp.current?.focus()); } }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSend) send(); }}
          />
          <button type="button" className="at-tool" aria-label={L('Photo')} onClick={() => need(() => photoIn.current?.click())}>🖼️</button>
          <button type="button" className={`at-tool${emoji ? ' on' : ''}`} aria-label={L('Emoji')} onClick={() => setEmoji((x) => !x)}>😊</button>
          <button type="button" className="at-tool at-gif" aria-label={L('GIF')} onClick={() => need(() => gifIn.current?.click())}>{L('GIF')}</button>
          {canSend && <button type="button" className="at-go" aria-label={L('Post')} disabled={busy} onClick={send}><Ic d={IC.send} s={18} /></button>}
        </div>
        <input ref={photoIn} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { media.pick(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={gifIn} type="file" accept="image/gif" hidden onChange={(e) => { media.pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {rep && <AskReportSheet L={L} onPick={report} onClose={() => setRep(null)} />}
    </div>
  );
};

// ───────────────────────── Ask sheet (screen 04) ─────────────────────────
const Compose: React.FC<{
  L: LFn; api: AskApi; areas: readonly string[]; areaLabel: (a: string) => string; defaultArea: string;
  onClose: () => void; onDone: (id: string) => void; toast: (m: string) => void; initial?: string;
}> = ({ L, api, areas, areaLabel, defaultArea, onClose, onDone, toast, initial }) => {
  const [body, setBody] = useState(initial || '');
  const [details, setDetails] = useState('');
  const [area, setArea] = useState(defaultArea);
  const [emoji, setEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<'q' | 'd'>('q');
  const media = useMedia(toast, L);
  const photoIn = useRef<HTMLInputElement>(null);
  const gifIn = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ta.current?.focus(); }, []);
  // the question box grows with its text (no inner scroll)
  useEffect(() => { const t = ta.current; if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; } }, [body]);
  const ok = body.trim().length >= 3 && !busy;
  const post = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const id = await api.ask({ body: body.slice(0, ASK_MAX_Q), details: details.slice(0, ASK_MAX_TEXT), area, file: media.file });
      onDone(id);
    } catch (e) {
      toast(askErrText(L, e, 'Couldn’t post · try again'));
      setBusy(false);
    }
  };
  const addEmoji = (e: string) => (focus === 'q' ? setBody((t) => (t + e).slice(0, ASK_MAX_Q)) : setDetails((t) => (t + e).slice(0, ASK_MAX_TEXT)));
  return (
    <div className="at-page at-compose" role="dialog" aria-label={L('Ask')}>
      <div className="at-top">
        <button type="button" className="at-iconbtn" aria-label={L('Close')} onClick={onClose}><Ic d={IC.x} /></button>
        <button type="button" className="at-post" disabled={!ok} onClick={post}>{L('Post')}</button>
      </div>
      <div className="at-scroll at-cbody">
        <textarea ref={ta} className="at-ti" rows={1} value={body} maxLength={ASK_MAX_Q} placeholder={L('Your question')} aria-label={L('Your question')}
          onFocus={() => setFocus('q')} onChange={(e) => setBody(e.target.value.replace(/\n/g, ' '))} />
        <textarea className="at-bdy" rows={3} value={details} maxLength={ASK_MAX_TEXT} placeholder={L('Add details (optional)')} aria-label={L('Add details (optional)')}
          onFocus={() => setFocus('d')} onChange={(e) => setDetails(e.target.value)} />
        {media.url && (
          <div className="at-cimg" style={{ backgroundImage: `url("${media.url}")` }}>
            <button type="button" aria-label={L('Remove photo')} onClick={media.clear}><Ic d={IC.x} s={16} /></button>
          </div>
        )}
      </div>
      <div className="at-tools-wrap">
        {emoji && <div className="at-emoji">{EMOJI.map((e) => <button type="button" key={e} onClick={() => addEmoji(e)}>{e}</button>)}</div>}
        <div className="at-tools">
          <label className="at-chip2 at-area">
            <Ic d={IC.pin} s={16} />{areaLabel(area)}
            <select value={area} aria-label={L('Area')} onChange={(e) => setArea(e.target.value)}>
              {areas.map((a) => <option key={a} value={a}>{areaLabel(a)}</option>)}
            </select>
          </label>
          <button type="button" className="at-chip2" onClick={() => photoIn.current?.click()}>🖼️ {L('Photo')}</button>
          <button type="button" className={`at-chip2${emoji ? ' on' : ''}`} aria-label={L('Emoji')} onClick={() => setEmoji((x) => !x)}>😊</button>
          <button type="button" className="at-chip2 at-gifchip" onClick={() => gifIn.current?.click()}>{L('GIF')}</button>
        </div>
      </div>
      <input ref={photoIn} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { media.pick(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={gifIn} type="file" accept="image/gif" hidden onChange={(e) => { media.pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
};

// ───────────────────────── the whole Ask a Thai view ─────────────────────────
export interface AskThaiViewProps {
  L: LFn;
  /** invite-1: the member's invite code, added to shared links */
  refCode?: string;
  /** audit 18 Nov: the app's one-tap share (adds the code itself; LINE picker inside LINE, copy without a share sheet) */
  shareLink?: (url: string, text: string) => void;
  api: AskApi;
  me: AskPerson | null;
  areas: readonly string[];
  areaLabel: (a: string) => string;
  defaultArea?: string;
  /** run `after` now when signed in, or open sign-in first */
  need: (after: () => void) => void;
  toast: (m: string) => void;
  /** harness / deep link: open this thread or the Ask sheet straight away */
  openThread?: string;
  openCompose?: boolean;
  composeText?: string;
}
export const AskThaiView: React.FC<AskThaiViewProps> = ({ L, api, me, areas, areaLabel, defaultArea = 'Bangkok', need, toast, openThread, openCompose, composeText, refCode, shareLink }) => {
  const [items, setItems] = useState<AskQuestion[] | null>(null);
  const [err, setErr] = useState(false);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [thread, setThread] = useState<string | null>(openThread || null);
  const [compose, setCompose] = useState(!!openCompose);
  const listRef = useRef<HTMLDivElement>(null);

  // Phone Back closes the thread / Ask page (one history step for both, so "Post" → thread needs no extra step)
  const pageOpen = !!thread || compose;
  const pushed = useRef(false);
  useEffect(() => {
    try {
      if (pageOpen && !pushed.current) { history.pushState({ kr8: 'ask' }, ''); pushed.current = true; }
      else if (!pageOpen && pushed.current) { pushed.current = false; if (history.state && history.state.kr8 === 'ask') history.back(); }
    } catch { /* no history (embedded) */ }
  }, [pageOpen]);
  useEffect(() => {
    const onPop = () => {
      if (pushed.current && !(history.state && history.state.kr8 === 'ask')) { pushed.current = false; setThread(null); setCompose(false); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refresh = useCallback(() => {
    setErr(false);
    api.feed().then((r) => { setItems(r); setMore(r.length >= 20); }).catch(() => setErr(true));
  }, [api]);
  useEffect(refresh, [refresh]);

  const loadMore = () => {
    if (!items || !more || loadingMore || !items.length) return;
    setLoadingMore(true);
    api.feed(items[items.length - 1].at)
      .then((r) => { setItems((cur) => [...(cur || []), ...r.filter((x) => !(cur || []).some((c) => c.id === x.id))]); setMore(r.length >= 20); })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) loadMore();
  };
  const patch = useCallback((q: AskQuestion) => setItems((cur) => (cur ? cur.map((x) => (x.id === q.id ? { ...x, score: q.score, myVote: q.myVote, answers: q.answers, top: q.top } : x)) : cur)), []);
  const vote = (q: AskQuestion) => need(() => {
    const v = nextVote(q.myVote, 1);
    patch({ ...q, myVote: v, score: q.score + v - q.myVote });
    api.vote('q', q.id, v).catch((e) => toast(askErrText(L, e, 'Something went wrong')));
  });
  const share = async (q: AskQuestion) => {
    const url = withRef(typeof location !== 'undefined' ? location.origin + location.pathname : '', refCode);   // invite-1: my invite code
    const text = `${q.body} · ${L('Ask a Thai')}`;
    if (shareLink) { shareLink(url, text); return; }
    try {
      if (typeof navigator !== 'undefined' && navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast(L('Link copied'));
    } catch { /* closed the share sheet */ }
  };

  return (
    <div className="at-root">
      <div className="at-list" ref={listRef} onScroll={onScroll} aria-busy={items === null}>
        {err && <button type="button" className="at-retry" onClick={refresh}>{L('Try again')}</button>}
        {items === null && !err && [0, 1, 2].map((i) => <div key={i} className="at-tw at-skel"><span className="at-av" /><div className="at-tw-main"><i /><i /><i /></div></div>)}
        {items && items.length === 0 && <div className="at-empty">{L('No questions yet')}</div>}
        {items && items.map((q) => (
          <Post key={q.id} q={q} L={L} areaLabel={areaLabel} onOpen={() => setThread(q.id)} onVote={() => vote(q)} onShare={() => void share(q)} />
        ))}
        <div className="at-pad" />
      </div>
      <button type="button" className="at-fab" onClick={() => need(() => setCompose(true))}><Ic d={IC.ask} s={20} />{L('Ask')}</button>
      {thread && (
        <Thread L={L} api={api} id={thread} me={me} areaLabel={areaLabel} need={need} toast={toast} onChanged={patch}
          onClose={() => { setThread(null); }} onShare={(q) => void share(q)}
          onReportedQ={(qid) => { setThread(null); setItems((cur) => (cur ? cur.filter((x) => x.id !== qid) : cur)); }} />
      )}
      {compose && (
        <Compose L={L} api={api} areas={areas} areaLabel={areaLabel} defaultArea={defaultArea} toast={toast} initial={composeText}
          onClose={() => setCompose(false)}
          onDone={(id) => { setCompose(false); refresh(); listRef.current?.scrollTo({ top: 0 }); setThread(id); }} />
      )}
    </div>
  );
};
export default AskThaiView;

