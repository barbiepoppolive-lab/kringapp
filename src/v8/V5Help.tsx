/**
 * Kring Helper (18 Nov 2026, founder approved Help design "B · Chat-first").
 * Me tab row → full-screen helper chat: greeting, 6 quick-reply chips, typed question → instant FAQ answer card
 * (👍 / Not quite), similar questions, "Talk to the team" (opens the member's thread with the Kring Team, 0097).
 * Thai mode: Thai main + English small under (like the rest of v5). Other languages: English.
 */
import React, { useEffect, useRef, useState } from 'react';
import { HELP_CHIPS, HELP_EMAIL, HELP_TEAM_PROMISE, faqById, matchHelp, type HelpFaq } from './helpFaq';
import './help.css';

/** helper UI copy: [Thai, English] */
export const HELP_UI = {
  rowMain: ['มีคำถาม? ถามผู้ช่วยกริ๊ง!', 'Questions? Ask Kring Helper'],
  instant: ['ตอบทันที', 'instant'],
  title: ['Kring Helper', 'Kring Helper'],
  sub: ['ตอบทันที', 'replies instantly'],
  today: ['วันนี้', 'Today'],
  greet: ['สวัสดีครับ {0} 👋 ผมคือผู้ช่วยกริ๊ง! เลือกคำถามด้านล่าง หรือพิมพ์ถามได้เลยครับ', 'Hi {0} 👋 I’m Kring Helper. Pick a question below or type your own.'],
  anyTime: ['ถ้าคำตอบยังไม่ใช่ กด “คุยกับทีมงาน” ได้ทุกเมื่อครับ', 'Not the answer? Tap “Talk to the team” any time.'],
  fromFaq: ['คำตอบจากคำถามที่พบบ่อย', 'From the FAQ'],
  answered: ['ได้คำตอบแล้ว', 'Answered'],
  notQuite: ['ยังไม่ใช่', 'Not quite'],
  thanks: ['ดีใจที่ช่วยได้ครับ 🙌', 'Glad that helped.'],
  sorry: ['ขอโทษครับ ลองดูคำถามที่คล้ายกัน หรือคุยกับทีมงานได้เลยครับ', 'Sorry about that. Try a similar question, or talk to the team.'],
  notSure: ['ยังไม่แน่ใจคำตอบข้อนี้ครับ ลองพิมพ์อีกแบบ หรือคุยกับทีมงานได้เลยครับ', 'I’m not sure about that one. Try other words, or talk to the team.'],
  similar: ['คำถามที่คล้ายกัน', 'Similar questions'],
  team: ['คุยกับทีมงาน', 'Talk to the team'],
  opening: ['กำลังเปิดแชท…', 'Opening the chat…'],
  placeholder: ['พิมพ์คำถาม…', 'Type your question…'],
  send: ['ส่ง', 'Send'],
  back: ['กลับ', 'Back'],
  email: ['หรืออีเมลหาเรา', 'Or email us'],
  help: ['ความช่วยเหลือ', 'Help'],
} satisfies Record<string, [string, string]>;
type UiKey = keyof typeof HELP_UI;

const fill = (s: string, name: string) => s.replace('{0}', name).replace(/\s+👋/, name ? ' 👋' : '👋');
/** Thai main + English small (Thai mode) or English only */
function Bi({ k, th, en, thai, name = '', cls }: { k?: UiKey; th?: string; en?: string; thai: boolean; name?: string; cls?: string }) {
  const t = k ? fill(HELP_UI[k][0], name) : th || '';
  const e = k ? fill(HELP_UI[k][1], name) : en || '';
  return thai
    ? <span className={`hp-bi ${cls || ''}`}><span lang="th" className="th">{t}</span><small lang="en" className="en">{e}</small></span>
    : <span className={`hp-bi ${cls || ''}`}><span lang="en">{e}</span></span>;
}

export function RingsMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="hp-rings" viewBox="0 0 40 24" width={size} aria-hidden="true">
      <circle cx="13" cy="12" r="8.5" fill="none" stroke="#9AA6FF" strokeWidth="3.2" />
      <circle cx="27" cy="12" r="8.5" fill="none" stroke="#FF7CC0" strokeWidth="3.2" />
    </svg>
  );
}

/** Me tab: one row under "This week" */
export function HelpMeRow({ lang, onOpen }: { lang: string; onOpen: () => void }) {
  const thai = lang === 'th';
  return (
    <button type="button" className="hp-row" id="meHelpRow" onClick={onOpen}
      aria-label={thai ? `${HELP_UI.rowMain[0]} · ${HELP_UI.rowMain[1]}` : HELP_UI.rowMain[1]}>
      <span className="hp-av" aria-hidden="true"><RingsMark /></span>
      <Bi k="rowMain" thai={thai} cls="grow" />
      <span className="hp-live" aria-hidden="true"><i>●</i> {thai ? <><span className="th">{HELP_UI.instant[0]}</span><br />{HELP_UI.instant[1]}</> : HELP_UI.instant[1]}</span>
      <svg className="hp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></svg>
    </button>
  );
}

type Msg =
  | { id: number; kind: 'greet' }
  | { id: number; kind: 'me'; text: string }
  | { id: number; kind: 'answer'; faq: HelpFaq; similar: HelpFaq[]; vote?: 'up' | 'no'; query: string }
  | { id: number; kind: 'unsure'; similar: HelpFaq[]; query: string }
  | { id: number; kind: 'bot'; ui: UiKey };

export type HelpEventKind = 'shown' | 'up' | 'not_quite' | 'team' | 'no_match';
export interface HelpSheetProps {
  lang: string; name: string;
  onClose: () => void;
  /** opens the member's Kring Team thread with this first question; resolves when the chat is open */
  onTeam: (question: string) => Promise<void>;
  onEvent?: (kind: HelpEventKind, faq: string | null, query: string | null) => void;
}

export function HelpSheet({ lang, name, onClose, onTeam, onEvent }: HelpSheetProps) {
  const thai = lang === 'th';
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, kind: 'greet' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const lastQ = useRef('');
  const body = useRef<HTMLDivElement>(null);
  const nid = () => idRef.current++;

  // the newest question goes to the top, so the answer card reads from its first line
  useEffect(() => {
    const b = body.current; if (!b || msgs.length < 2) return;
    const mine = b.querySelectorAll<HTMLElement>('[data-me]');
    const last = mine[mine.length - 1];
    b.scrollTo({ top: last ? Math.max(0, last.offsetTop - b.offsetTop - 10) : b.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const ask = (q: string, fromChip?: HelpFaq) => {
    const query = q.trim().slice(0, 300);
    if (!query) return;
    lastQ.current = query;
    const m = fromChip ? { faq: fromChip, similar: matchHelp(fromChip.qEn).similar } : matchHelp(query);
    const said = fromChip ? (thai ? fromChip.qTh : fromChip.qEn) : query;
    if (m.faq) {
      onEvent?.('shown', m.faq.id, query);
      setMsgs((p) => [...p, { id: nid(), kind: 'me', text: said }, { id: nid(), kind: 'answer', faq: m.faq!, similar: m.similar, query }]);
    } else {
      onEvent?.('no_match', null, query);
      setMsgs((p) => [...p, { id: nid(), kind: 'me', text: said }, { id: nid(), kind: 'unsure', similar: m.similar, query }]);
    }
  };
  const send = () => { const q = text; setText(''); ask(q); };
  const vote = (id: number, v: 'up' | 'no') => {
    let faqId = '';
    setMsgs((p) => {
      const out = p.map((x) => { if (x.id === id && x.kind === 'answer' && !x.vote) { faqId = x.faq.id; return { ...x, vote: v }; } return x; });
      return faqId ? [...out, { id: nid(), kind: 'bot', ui: v === 'up' ? 'thanks' : 'sorry' } as Msg] : out;
    });
    setTimeout(() => { if (faqId) onEvent?.(v === 'up' ? 'up' : 'not_quite', faqId, null); }, 0);
  };
  const team = async (faq?: HelpFaq) => {
    if (busy) return;
    setBusy(true);
    const q = lastQ.current || (faq ? faq.qEn : '');
    onEvent?.('team', faq?.id || null, q || null);
    try { await onTeam(q); } finally { setBusy(false); }
  };
  const lastBot = [...msgs].reverse().find((m) => m.kind === 'answer' || m.kind === 'unsure');

  const TeamBtn = ({ faq }: { faq?: HelpFaq }) => (
    <div className="hp-teamwrap">
      <button type="button" className="hp-team" id="helpTeam" disabled={busy} onClick={() => void team(faq)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" /></svg>
        <Bi k={busy ? 'opening' : 'team'} thai={thai} />
      </button>
      <p className="hp-note" id="helpPromise"><Bi th={HELP_TEAM_PROMISE.th} en={HELP_TEAM_PROMISE.en} thai={thai} /></p>
    </div>
  );
  const Chips = ({ list, id }: { list: HelpFaq[]; id?: string }) => (
    <div className="hp-chips" id={id}>
      {list.map((f) => (
        <button type="button" key={f.id} className="hp-chip" data-faq={f.id} onClick={() => ask(f.qEn, f)}>
          <Bi th={f.chipTh || f.qTh} en={f.chipEn || f.qEn} thai={thai} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="v8-sheet full hp-sheet" id="sh-help" role="dialog" aria-label="Kring Helper">
      <div className="hp-head">
        <button type="button" className="hp-back" id="helpBack" aria-label={thai ? HELP_UI.back[0] : HELP_UI.back[1]} onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
        </button>
        <span className="hp-av" aria-hidden="true"><RingsMark /></span>
        <span className="hp-who"><b>Kring Helper</b><small><i>●</i> {thai ? <><span className="th">{HELP_UI.sub[0]}</span> · {HELP_UI.sub[1]}</> : HELP_UI.sub[1]}</small></span>
      </div>
      <div className="hp-body" ref={body} id="helpBody" aria-live="polite">
        <span className="hp-day">{thai ? HELP_UI.today[0] : HELP_UI.today[1]}</span>
        {msgs.map((m) => {
          if (m.kind === 'greet') return (
            <React.Fragment key={m.id}>
              <div className="hp-bub bot" id="helpGreet"><Bi k="greet" name={name} thai={thai} /></div>
              <Chips list={HELP_CHIPS.map((id) => faqById(id)!)} id="helpChips" />
              <div className="hp-bub bot sm"><Bi k="anyTime" thai={thai} /></div>
            </React.Fragment>
          );
          if (m.kind === 'me') return <div key={m.id} className="hp-bub me" data-me="1"><span>{m.text}</span></div>;
          if (m.kind === 'bot') return <div key={m.id} className="hp-bub bot sm"><Bi k={m.ui} thai={thai} /></div>;
          if (m.kind === 'unsure') return (
            <React.Fragment key={m.id}>
              <div className="hp-bub bot" data-unsure="1"><Bi k="notSure" thai={thai} /></div>
              {m === lastBot ? <>
                <p className="hp-also"><Bi k="similar" thai={thai} /></p>
                <Chips list={m.similar} />
                <TeamBtn />
              </> : null}
            </React.Fragment>
          );
          const f = m.faq;
          return (
            <React.Fragment key={m.id}>
              <div className="hp-bub card" data-answer={f.id}>
                <span className="hp-tag">{thai ? HELP_UI.fromFaq[0] : HELP_UI.fromFaq[1]}</span>
                <b className="hp-aq"><Bi th={f.qTh} en={f.qEn} thai={thai} /></b>
                <p className="hp-ans"><Bi th={f.aTh} en={f.aEn} thai={thai} /></p>
                <div className="hp-yn">
                  <button type="button" className={`up${m.vote === 'up' ? ' on' : ''}`} data-vote="up" disabled={!!m.vote} onClick={() => vote(m.id, 'up')}>
                    <span aria-hidden="true">👍</span><Bi k="answered" thai={thai} />
                  </button>
                  <button type="button" className={`no${m.vote === 'no' ? ' on' : ''}`} data-vote="no" disabled={!!m.vote} onClick={() => vote(m.id, 'no')}>
                    <Bi k="notQuite" thai={thai} />
                  </button>
                </div>
              </div>
              {m === lastBot ? <>
                {m.similar.length ? <><p className="hp-also"><Bi k="similar" thai={thai} /></p><Chips list={m.similar} id="helpSimilar" /></> : null}
                <TeamBtn faq={f} />
              </> : null}
            </React.Fragment>
          );
        })}
        {!lastBot ? <TeamBtn /> : null}
        <p className="hp-mail" id="helpEmail">{thai ? HELP_UI.email[0] : HELP_UI.email[1]} · <a href={`mailto:${HELP_EMAIL}?subject=Kring%20help`}>{HELP_EMAIL}</a></p>
      </div>
      <form className="hp-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input id="helpInput" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} enterKeyHint="send"
          placeholder={thai ? `${HELP_UI.placeholder[0]}  ${HELP_UI.placeholder[1]}` : HELP_UI.placeholder[1]} aria-label={HELP_UI.placeholder[1]} />
        <button type="submit" className="hp-send" id="helpSend" aria-label={thai ? HELP_UI.send[0] : HELP_UI.send[1]} disabled={!text.trim()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M12 6l6 6-6 6" /></svg>
        </button>
      </form>
    </div>
  );
}
