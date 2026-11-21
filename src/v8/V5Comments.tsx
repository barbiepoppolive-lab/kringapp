/**
 * Reel comments (0189, founder-approved 21 Nov). Bottom sheet over the Reel: the comments, then one input.
 *   · Only face-checked members can comment; everyone else reads them and sees one gentle line (verify / sign in).
 *   · The server filters every comment (links, phone numbers, LINE / contacts, @handles, rude words, alcohol, 300 characters,
 *     20 a day, 10 s apart); a refused comment shows a friendly line here and the text stays in the box to edit.
 *   · The Reel's creator can delete any comment and turn comments off / on; authors delete their own; anyone signed in reports.
 *   · Comments earn no Rings. One language per screen: every visible string goes through L().
 *   · 0191 replies (Instagram-style): "Reply" under every comment; replies sit indented under their top comment with the name they
 *     answer, folded into "View N replies" when there are more than 2; a reply to a reply joins the same top comment.
 */
import { useEffect, useRef, useState } from 'react';
import './comments.css';
import { commentReasonText } from './commentStrings';
import {
  v5CommentAdd, v5CommentDelete, v5CommentReply, v5CommentReport, v5CommentsSetOff, v5ReelComments,
  type V5Comment, type V5Comments,
} from './v5Live';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

function ago(L: Tx, Lf: Txf, iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return L('now');
  if (m < 60) return Lf('{0}m', String(m));
  if (m < 1440) return Lf('{0}h', String(Math.round(m / 60)));
  return Lf('{0}d', String(Math.round(m / 1440)));
}

const initial = (n: string | null) => (n || '?').trim().charAt(0).toUpperCase() || '?';

export function CommentsSheet(props: {
  L: Tx; Lf: Txf; postId: string; readOnly?: boolean;
  onClose: () => void; onCount: (postId: string, n: number, off: boolean) => void;
  onVerify: () => void; onSignIn: () => void; onCard: () => void; onPerson: (id: string) => void; toast: (s: string) => void;
}) {
  const { L, Lf, postId } = props;
  const [data, setData] = useState<V5Comments | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [armDel, setArmDel] = useState('');
  const [reportId, setReportId] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});   // top comments whose replies are unfolded
  const listRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLTextAreaElement>(null);

  const load = () => v5ReelComments(postId).then((d) => { setData(d); setFailed(false); props.onCount(postId, d.n, d.off); }).catch(() => setFailed(true));
  useEffect(() => { void load(); }, [postId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!armDel) return; const t = setTimeout(() => setArmDel(''), 3000); return () => clearTimeout(t); }, [armDel]);
  // grow the box with the text (max ~4 lines)
  useEffect(() => { const el = inRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 104) + 'px'; }, [text]);

  const items = data?.items || [];
  const patch = (next: V5Comment[], n: number) => { if (!data) return; setData({ ...data, items: next, n }); props.onCount(postId, n, data.off); };
  /** drop one comment or reply from the list; a top comment takes its replies with it. Returns how many rows went. */
  const without = (c: V5Comment): [V5Comment[], number] => {
    if (!c.parent_id) return [items.filter((x) => x.id !== c.id), 1 + (c.nrep ?? c.replies?.length ?? 0)];
    return [items.map((x) => (x.id === c.parent_id ? { ...x, replies: (x.replies || []).filter((r) => r.id !== c.id), nrep: Math.max(0, (x.nrep ?? x.replies?.length ?? 1) - 1) } : x)), 1];
  };
  const startReply = (c: V5Comment) => {
    setReplyTo({ id: c.id, name: c.official ? L('Kring Team') : c.name || '' }); setErr('');
    setTimeout(() => inRef.current?.focus(), 30);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy || props.readOnly) return;
    setBusy(true); setErr('');
    try {
      const r = replyTo ? await v5CommentReply(replyTo.id, body) : await v5CommentAdd(postId, body);
      if (r.ok) {
        setText('');
        const pid = r.comment.parent_id;
        if (pid) {
          patch(items.map((x) => (x.id === pid ? { ...x, replies: [...(x.replies || []), r.comment], nrep: (x.nrep ?? x.replies?.length ?? 0) + 1 } : x)), r.n);
          setOpen((o) => ({ ...o, [pid]: true })); setReplyTo(null);
          setTimeout(() => listRef.current?.querySelector(`[data-comment="${r.comment.id}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 60);
        } else {
          patch([...items, { ...r.comment, replies: [], nrep: 0 }], r.n);
          setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50);
        }
      } else {
        setErr(L(commentReasonText(r.reason)));
        if (r.reason === 'gone') { setReplyTo(null); void load(); }
        if (['verify', 'off', 'banned', 'signin', 'no_card', 'no_reel'].includes(r.reason)) void load();
      }
    } catch {
      setErr(L('Couldn’t post. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  const del = async (c: V5Comment) => {
    if (props.readOnly) return;
    if (armDel !== c.id) { setArmDel(c.id); return; }
    setArmDel('');
    const before = items; const n0 = data?.n || 0;
    const [next, gone] = without(c);
    patch(next, Math.max(0, n0 - gone));
    if (replyTo && (replyTo.id === c.id || (!c.parent_id && c.replies?.some((r) => r.id === replyTo.id)))) setReplyTo(null);
    try { await v5CommentDelete(c.id); props.toast(L('Comment deleted')); } catch { patch(before, n0 || before.length); props.toast(L('Couldn’t post. Try again.')); }
  };
  const report = async (c: V5Comment, reason: 'rude' | 'spam' | 'unsafe') => {
    setReportId('');
    if (props.readOnly) return;
    const [next, gone] = without(c);
    patch(next, Math.max(0, (data?.n || 1) - gone));
    try { await v5CommentReport(c.id, reason); props.toast(L('Thanks. This comment is hidden for you.')); } catch { void load(); }
  };
  const setOff = async (off: boolean) => {
    if (!data || props.readOnly) return;
    setData({ ...data, off, can: off ? 'off' : 'ok' });
    props.onCount(postId, data.n, off);
    try { await v5CommentsSetOff(postId, off); props.toast(L(off ? 'Comments turned off' : 'Comments turned on')); void load(); } catch { void load(); }
  };

  const can = data?.can || '';
  const row = (c: V5Comment) => (
          <div className={`kc-row${c.parent_id ? ' kc-rep' : ''}`} key={c.id} data-comment={c.id} data-parent={c.parent_id || undefined} data-mine={c.mine ? '1' : undefined}>
            <button type="button" className="kc-av" aria-label={c.name || ''} onClick={() => !c.official && props.onPerson(c.author_id)}
              style={c.photo ? { backgroundImage: `url('${c.photo}')` } : undefined}>{c.photo ? null : initial(c.official ? 'K' : c.name)}</button>
            <div className="kc-main">
              <div className="kc-who"><b>{c.official ? L('Kring Team') : c.name}</b><span>{ago(L, Lf, c.at)}</span></div>
              <p className="kc-body" dir="auto">{c.parent_id && c.to_name ? <span className="kc-to">@{c.to_name} </span> : null}{c.body}</p>
              {!props.readOnly && can !== 'signin' && reportId !== c.id ? (
                <div className="kc-acts">
                  {can === 'ok' ? (
                    <button type="button" className="kc-act" data-act="reply" onClick={() => startReply(c)}>{L('Reply')}</button>
                  ) : null}
                  {c.mine || data?.creator ? (
                    <button type="button" className={`kc-act${armDel === c.id ? ' arm' : ''}`} data-act="delete" onClick={() => void del(c)}>
                      {L(armDel === c.id ? 'Tap again to delete' : 'Delete')}
                    </button>
                  ) : null}
                  {!c.mine && can !== 'no_card' ? (
                    <button type="button" className="kc-act" data-act="report" onClick={() => setReportId(c.id)}>{L('Report')}</button>
                  ) : null}
                </div>
              ) : null}
              {reportId === c.id ? (
                <div className="kc-report" role="group" aria-label={L('Report this comment')}>
                  {([['rude', 'Rude or harassing'], ['spam', 'Spam or scam'], ['unsafe', 'Unsafe or adult']] as const).map(([k, label]) => (
                    <button type="button" key={k} className="kc-chip" data-reason={k} onClick={() => void report(c, k)}>{L(label)}</button>
                  ))}
                  <button type="button" className="kc-chip ghost" onClick={() => setReportId('')}>{L('Cancel')}</button>
                </div>
              ) : null}
            </div>
          </div>
  );

  const left = 300 - text.length;
  return (
    <div className="v8-sheet kc-sheet" id="sh-comments" role="dialog" aria-label={L('Comments')}>
      <div className="grab" />
      <div className="sh-head kc-head">
        <h3>{L('Comments')}{data && data.n > 0 ? <span className="kc-n">{data.n}</span> : null}</h3>
        <div className="kc-head-r">
          {data?.creator && !props.readOnly ? (
            <button type="button" className="kc-off" id="commentsOffToggle" aria-pressed={data.off} onClick={() => void setOff(!data.off)}>
              {L(data.off ? 'Turn on comments' : 'Turn off comments')}
            </button>
          ) : null}
          <button type="button" className="xbtn" aria-label={L('Close')} onClick={props.onClose}>✕</button>
        </div>
      </div>
      <div className="kc-list" ref={listRef}>
        {data?.off ? <p className="kc-note" id="commentsOffNote">{L('Comments are off for this Reel.')}</p> : null}
        {!data && !failed ? <p className="kc-empty">…</p> : null}
        {failed ? <p className="kc-empty">{L('Couldn’t reach Kring. Check your connection and try again.')}</p> : null}
        {data && items.length === 0 && !data.off ? (
          <p className="kc-empty" id="commentsEmpty">{L(can === 'ok' ? 'No comments yet. Be the first.' : 'No comments yet.')}</p>
        ) : null}
        {items.map((c) => {
          const reps = c.replies || [];
          const nrep = c.nrep ?? reps.length;
          const folded = nrep > 2 && !open[c.id];
          return (
            <div className="kc-thread" key={c.id} data-thread={c.id}>
              {row(c)}
              {nrep > 2 ? (
                <button type="button" className="kc-more" data-more={c.id} aria-expanded={!folded} onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}>
                  <i aria-hidden="true" />{folded ? Lf('View {0} replies', String(nrep)) : L('Hide replies')}
                </button>
              ) : null}
              {folded ? null : reps.map((r) => row(r))}
            </div>
          );
        })}
      </div>
      <div className="kc-foot">
        {err ? <p className="kc-err" id="commentErr" role="alert">{err}</p> : null}
        {replyTo && can === 'ok' && !props.readOnly ? (
          <div className="kc-replying" id="commentReplying">
            <span>{Lf('Replying to {0}', replyTo.name)}</span>
            <button type="button" className="kc-replying-x" aria-label={L('Stop replying')} onClick={() => setReplyTo(null)}>✕</button>
          </div>
        ) : null}
        {!data ? null : can === 'ok' && !props.readOnly ? (
          <div className="kc-compose">
            <textarea ref={inRef} id="commentInput" rows={1} maxLength={320} value={text} placeholder={replyTo ? Lf('Reply to {0}…', replyTo.name) : L('Add a comment…')} aria-label={replyTo ? Lf('Reply to {0}…', replyTo.name) : L('Add a comment…')}
              onChange={(e) => { setText(e.target.value); if (err) setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Backspace' && !text && replyTo) { setReplyTo(null); return; } if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) { e.preventDefault(); void send(); } }} />
            {left <= 50 ? <span className={`kc-left${left < 0 ? ' over' : ''}`}>{left}</span> : null}
            <button type="button" className="kc-send" id="commentSend" aria-label={L('Send')} disabled={!text.trim() || busy || left < 0} onClick={() => void send()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
            </button>
          </div>
        ) : can === 'verify' ? (
          <div className="kc-gate" id="commentGate" data-gate="verify">
            <span className="kc-gate-ic" aria-hidden="true">✓</span>
            <p>{L(commentReasonText('verify'))}</p>
            <button type="button" className="kc-gate-btn" id="commentVerify" onClick={props.onVerify}>{L('Verify')}</button>
          </div>
        ) : can === 'signin' ? (
          <div className="kc-gate" id="commentGate" data-gate="signin">
            <button type="button" className="kc-gate-btn wide" id="commentSignIn" onClick={props.onSignIn}>{L('Sign in to comment')}</button>
          </div>
        ) : can === 'no_card' ? (
          <div className="kc-gate" id="commentGate" data-gate="card">
            <button type="button" className="kc-gate-btn wide" id="commentCard" onClick={props.onCard}>{L('Make your Kring card to comment')}</button>
          </div>
        ) : can === 'banned' || can === 'no_reel' ? (
          <p className="kc-note foot" id="commentGate" data-gate={can}>{L(commentReasonText(can))}</p>
        ) : null}
      </div>
    </div>
  );
}
