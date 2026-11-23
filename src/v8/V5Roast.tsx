/**
 * Roast or Forgive Kring (m198, founder 23 Nov). Ask BKK top card when today's vote kind = 'roast'.
 * - First open each day: the Hungry Ghost story plays full screen (media/ghost/story.html), then the card.
 * - Comments float on each photo (roast left, forgive right), no boxes, slow scroll, top comment gets a crown.
 * - Posting a comment also casts the day's vote on that side (Daily Card vote task). 3 comments a day, no contacts.
 */
import { useEffect, useRef, useState } from 'react';
import './roast.css';
import { v5Client, V5Error, v5ErrCode } from './v5Live';
import { tasksRefresh } from './V5Tasks';

interface RItem { id: number; side: 'a' | 'b'; body: string; name: string; likes: number; liked: boolean; me: boolean; seed?: boolean }
interface RList { day: string; counts: { a: number; b: number }; mine: 'a' | 'b' | null; items: RItem[] }
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const c = await v5Client();
  let res;
  try { res = await c.rpc(fn, args); } catch (e) { throw new V5Error(v5ErrCode(e)); }
  if (res.error) throw new V5Error(v5ErrCode(res.error));
  return res.data as T;
}
const BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.BASE_URL) || '/';
const img = (f: string | null) => (f ? `${BASE}media/places/${f}` : '');

const T = {
  th: { or: 'หรือ', roastN: '{0} คนแซว', forgiveN: '{0} คนให้อภัย', write: 'เขียนแซว 😂', forgive: 'ส่งคำให้อภัย 🥺', empty: 'ยังไม่มีใคร… เป็นคนแรกเลย', top: '👑 ฮาสุด', topF: '👑 ใจดีสุด',
    hintA: 'แซว Kring ได้เต็มที่ 1 ประโยค 😂', hintB: 'ให้อภัย Kring ด้วยคำสั้นๆ 🥺', send: 'ส่ง', cancel: 'ยกเลิก', skip: 'ข้าม',
    errLen: 'พิมพ์ 2–140 ตัวอักษรนะ', errLimit: 'วันนี้ส่งครบ 3 ข้อความแล้ว', errContact: 'ห้ามใส่ลิงก์หรือช่องทางติดต่อนะ', errFace: 'ยืนยันใบหน้าก่อน แล้วค่อยส่งได้เลย', err: 'ส่งไม่สำเร็จ ลองอีกครั้ง' },
  en: { or: 'or', roastN: '{0} roasting', forgiveN: '{0} forgiving', write: 'Write a roast 😂', forgive: 'Send forgiveness 🥺', empty: 'Nothing yet… be the first', top: '👑 Funniest', topF: '👑 Kindest',
    hintA: 'Roast Kring in one line 😂', hintB: 'Forgive Kring in a few words 🥺', send: 'Send', cancel: 'Cancel', skip: 'Skip',
    errLen: 'Write 2–140 characters', errLimit: "You've sent 3 today", errContact: 'No links or contact details, please', errFace: 'Verify your face first, then you can post', err: "Couldn't send. Try again." },
};
/** QA only (test site / local): ?roastdemo shows sample comments (Thai only) */
const DEMO = typeof location !== 'undefined' && /pages\.dev|localhost|127\.0\.0\.1/.test(location.host) && new URLSearchParams(location.search).has('roastdemo');
const SAMPLE: RList = { day: 'demo', counts: { a: 148, b: 241 }, mine: null, items: ([
  ['a', 'ขอบคุณ Kring ที่สอนว่าของฟรีไม่มีในโลก… มีแต่ของโดนงับ 🙂', 'Mint', 41], ['a', 'เพิ่งรู้ว่าแอปหาเพื่อน หาเพื่อนให้ผีด้วย 👻', 'Bank', 36],
  ['a', 'รางวัลโดนงับไม่เป็นไร ชินแล้ว แฟนเก่าก็เคยงับใจ 🥲', 'Fah', 29], ['a', 'แหวนสองวงดูแลกันดีกว่าผู้ชายบางคนอีก', 'Tom', 21],
  ['a', 'ผีหิวคือพนักงานดีเด่นประจำเดือนของ Kring ใช่มะ', 'Beam', 18], ['a', 'รอบหน้าขอเป็นผีบ้าง ได้กินฟรี 555', 'Oat', 12],
  ['b', 'ให้อภัย เพราะแหวนฟ้าวิ่งไปช่วยแหวนชมพู ใจบางเลย 🥹', 'Ploy', 52], ['b', 'แอปอื่นพังเงียบๆ Kring พังแล้วยังมาเล่าให้ขำ ให้อภัยค่ะ', 'Nut', 40],
  ['b', 'โกรธไม่ลง ผีหิวน่ารักเกิน ขอสติกเกอร์ด่วน 👻', 'May', 31], ['b', 'ให้อภัยได้ แต่ผีหิวต้องมาเป็นมาสคอตนะ', 'Golf', 24],
  ['b', 'คืนครบแถมให้ด้วย แบบนี้ใครจะโกรธลง 💛', 'Pim', 17], ['b', 'แหวนสองวงนี้ shipping แล้วนะ 💍', 'Earn', 9],
] as const).map(([side, body, name, likes], i) => ({ id: i + 1, side, body, name, likes, liked: false, me: false })) };
const f = (s: string, n: number) => s.replace('{0}', n.toLocaleString());

/** full-screen intro, once a day */
function GhostIntro(props: { lang: string; onDone: () => void }) {
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.data === 'kr8-ghost-done') props.onDone(); };
    window.addEventListener('message', on);
    const safety = window.setTimeout(props.onDone, 40000);
    return () => { window.removeEventListener('message', on); window.clearTimeout(safety); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const tx = props.lang === 'th' ? T.th : T.en;
  return (
    <div className="rk-intro" role="dialog" aria-label="Kring">
      <iframe title="Kring" src={`${BASE}media/ghost/story.html?lang=${props.lang === 'th' ? 'th' : 'en'}`} />
      <button type="button" className="rk-skip" onClick={props.onDone}>{tx.skip} ›</button>
    </div>
  );
}

export function RoastCard(props: { lang: string; q: string; aImg: string | null; bImg: string | null; aLab: string; bLab: string; day?: string }) {
  const L = props.lang === 'th' ? 'th' : 'en';
  const tx = T[L];
  const [data, setData] = useState<RList | null>(null);
  const [compose, setCompose] = useState<'a' | 'b' | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const key = `kr8_ghost_${props.day || ''}`;
  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem(key); } catch { return false; } });
  const load = () => (DEMO ? Promise.resolve(setData(SAMPLE)) : call<RList>('kr8_roast_list').then(setData).catch(() => {}));
  useEffect(() => { void load(); const t = window.setInterval(load, 30000); return () => window.clearInterval(t); }, []);
  const doneIntro = () => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setIntro(false); };
  const send = async () => {
    if (!compose) return;
    setBusy(true); setMsg('');
    try { const d = await call<RList>('kr8_roast_post', { p_side: compose, p_body: text }); setData(d); setCompose(null); setText(''); void tasksRefresh(); }
    catch (e) {
      const c = (e as { code?: string }).code || '';
      setMsg(/LEN/.test(c) ? tx.errLen : /LIMIT/.test(c) ? tx.errLimit : /CONTACT/.test(c) ? tx.errContact : /FACE/.test(c) ? tx.errFace : tx.err);
    } finally { setBusy(false); }
  };
  const side = (s: 'a' | 'b') => {
    const items = (data?.items || []).filter((x) => x.side === s);
    const loop = items.length > 3;
    const row = (x: RItem, k: string) => (
      <div key={k} className="rk-c"><i className="dot" aria-hidden="true" /><div className="t">{x.body}</div></div>
    );
    return (
      <div className={`rk-half ${s === 'a' ? 'r' : 'f'}`}>
        <div className="ph" style={{ backgroundImage: `url('${img(s === 'a' ? props.aImg : props.bImg)}')` }} />
        <div className="rk-feed">
          {items.length ? (
            <div className={`rk-track${loop ? ' loop' : ''}`} style={loop ? { animationDuration: `${Math.max(18, items.length * 5)}s` } : undefined}>
              {items.map((x) => row(x, `a${x.id}`))}{loop ? items.map((x) => row(x, `b${x.id}`)) : null}
            </div>
          ) : <p className="rk-empty">{tx.empty}</p>}
        </div>
        <div className="rk-lab"><b>{s === 'a' ? props.aLab : props.bLab}</b><small>{f(s === 'a' ? tx.roastN : tx.forgiveN, (s === 'a' ? data?.counts.a : data?.counts.b) || 0)}</small></div>
      </div>
    );
  };
  const total = (data?.counts.a || 0) + (data?.counts.b || 0);
  const pa = total ? Math.round(((data?.counts.a || 0) / total) * 100) : 50;
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (compose) window.setTimeout(() => ta.current?.focus(), 60); }, [compose]);
  return (
    <div className="rk" lang={L}>
      {intro ? <GhostIntro lang={L} onDone={doneIntro} /> : null}
      <div className="rk-hero">
        {side('a')}{side('b')}
        <div className="rk-seam" />
        <div className="rk-q">{props.q}</div>
        <div className="rk-or">{tx.or}</div>
      </div>
      <div className="rk-bar"><i className="a" style={{ width: `${pa}%` }} /><i className="b" /></div>
      <div className="rk-btns">
        <button type="button" className="a" onClick={() => { setCompose('a'); setMsg(''); }}>{tx.write}</button>
        <button type="button" className="b" onClick={() => { setCompose('b'); setMsg(''); }}>{tx.forgive}</button>
      </div>
      {(() => { const mine = (data?.items || []).filter((x) => !x.seed).sort((a, b) => b.id - a.id); return mine.length ? (
        <div className="rk-list">
          <p className="rk-lh">{L === 'th' ? 'ความเห็นจากสมาชิก' : 'From members'} · {mine.length}</p>
          {mine.slice(0, 40).map((x) => <div key={x.id} className={`rk-li ${x.side}`}><i className="dot" aria-hidden="true" /><span>{x.body}</span></div>)}
        </div>) : null; })()}
      {compose ? (
        <div className="rk-sh" onClick={() => setCompose(null)}>
          <div className={`rk-box ${compose}`} onClick={(e) => e.stopPropagation()}>
            <textarea ref={ta} maxLength={140} value={text} placeholder={compose === 'a' ? tx.hintA : tx.hintB} onChange={(e) => setText(e.target.value)} />
            <div className="rk-row"><small>{text.length}/140</small>{msg ? <em>{msg}</em> : null}
              <button type="button" className="ghost" onClick={() => setCompose(null)}>{tx.cancel}</button>
              <button type="button" className="go" disabled={busy || text.trim().length < 2} onClick={() => void send()}>{tx.send}</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
