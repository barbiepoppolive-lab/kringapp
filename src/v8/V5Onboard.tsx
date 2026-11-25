/**
 * m214 (25 Nov 2026) retention push, first-visit + friends.
 *  · OnbStrip: Feed, first 3 days. One slim glass line in the prize ticker's place: the next step + a 3-part bar
 *    (LinkedIn profile-strength / Duolingo path idea). Tap = the three steps drop down, each with its own button.
 *    Never a sheet, never with a sheet (the app hides it while any sheet is open), hideable.
 *  · OnbMeLine: the same steps as one quiet line in the Me status block (opens inline).
 *  · AlikeRow: "Answered like you" (This or That result, Ask BKK thread, top of People), Follow in one tap.
 * One language per screen: own 6-language table, like badges.tsx.
 */
import { useEffect, useState } from 'react';
import './onboard.css';
import { onbAlike, onbCount, onbNext, useAlikeGen, type AlikePerson, type OnbState, type OnbStep } from './onboard';

const TX = {
  en: { head: 'Become a Bangkok Local', sub: '3 quick steps · the tag shows on your profile', ask: 'Answer 1 Ask BKK question', like: 'Like 3 Reels',
    clip: 'Post your first clip', bAsk: 'Answer', bLike: 'Watch', bClip: 'Post', hide: 'Hide', open: 'Show steps', close: 'Close',
    step: 'Step done · {0}/3', done: 'You’re a Bangkok Local ✓ · it’s on your profile', alike: 'Answered like you', alikeAsk: 'Also answered this',
    same1: '1 same pick', sameN: '{0} same picks', follow: 'Follow', following: 'Following' },
  th: { head: 'มาเป็นคนกรุงเทพฯ ตัวจริง', sub: '3 ขั้นง่ายๆ · ได้ป้ายโชว์บนโปรไฟล์', ask: 'ตอบคำถาม 1 ข้อใน ถาม BKK', like: 'กดใจรีล 3 อัน',
    clip: 'โพสต์คลิปแรกของคุณ', bAsk: 'ตอบ', bLike: 'ดูรีล', bClip: 'โพสต์', hide: 'ซ่อน', open: 'ดูขั้นตอน', close: 'ปิด',
    step: 'เสร็จแล้ว {0}/3', done: 'คุณเป็นคนกรุงเทพฯ ตัวจริงแล้ว ✓ ป้ายขึ้นบนโปรไฟล์แล้ว', alike: 'ตอบเหมือนคุณ', alikeAsk: 'คนที่ตอบข้อนี้ด้วย',
    same1: 'เลือกตรงกัน 1 ข้อ', sameN: 'เลือกตรงกัน {0} ข้อ', follow: 'ติดตาม', following: 'ติดตามแล้ว' },
  zh: { head: '成为曼谷本地人', sub: '3 个小步骤 · 标签会显示在你的主页', ask: '回答 1 个 Ask BKK 问题', like: '给 3 个 Reel 点赞',
    clip: '发布你的第一个短片', bAsk: '回答', bLike: '去看', bClip: '发布', hide: '隐藏', open: '查看步骤', close: '关闭',
    step: '完成一步 · {0}/3', done: '你已是曼谷本地人 ✓ 标签已在主页', alike: '和你答得一样', alikeAsk: '也回答了这个问题',
    same1: '1 个相同选择', sameN: '{0} 个相同选择', follow: '关注', following: '已关注' },
  hi: { head: 'बैंकॉक लोकल बनें', sub: '3 आसान कदम · टैग आपकी प्रोफ़ाइल पर दिखेगा', ask: 'Ask BKK का 1 सवाल जवाब दें', like: '3 Reels लाइक करें',
    clip: 'अपनी पहली क्लिप पोस्ट करें', bAsk: 'जवाब दें', bLike: 'देखें', bClip: 'पोस्ट', hide: 'छिपाएँ', open: 'कदम देखें', close: 'बंद',
    step: 'कदम पूरा · {0}/3', done: 'आप बैंकॉक लोकल हैं ✓ टैग प्रोफ़ाइल पर है', alike: 'आप जैसा जवाब दिया', alikeAsk: 'इन्होंने भी जवाब दिया',
    same1: '1 जवाब एक जैसा', sameN: '{0} जवाब एक जैसे', follow: 'फ़ॉलो', following: 'फ़ॉलो किया' },
  ja: { head: 'バンコク・ローカルになろう', sub: 'かんたん3ステップ · プロフィールにタグが付きます', ask: 'Ask BKKの質問に1つ答える', like: 'リールに3回いいね',
    clip: '最初のクリップを投稿', bAsk: '答える', bLike: '見る', bClip: '投稿', hide: '非表示', open: 'ステップを見る', close: '閉じる',
    step: 'ステップ完了 · {0}/3', done: 'バンコク・ローカルになりました ✓ プロフィールに表示中', alike: 'あなたと同じ答え', alikeAsk: 'この質問にも答えた人',
    same1: '1問同じ', sameN: '{0}問同じ', follow: 'フォロー', following: 'フォロー中' },
  ko: { head: '방콕 로컬 되기', sub: '3단계만 하면 · 프로필에 태그가 붙어요', ask: 'Ask BKK 질문 1개 답하기', like: '릴스 3개 좋아요',
    clip: '첫 클립 올리기', bAsk: '답하기', bLike: '보기', bClip: '올리기', hide: '숨기기', open: '단계 보기', close: '닫기',
    step: '완료 · {0}/3', done: '방콕 로컬이 되었어요 ✓ 프로필에 표시돼요', alike: '나와 같은 답', alikeAsk: '이 질문에 답한 사람',
    same1: '1개 같은 선택', sameN: '{0}개 같은 선택', follow: '팔로우', following: '팔로잉' },
};
type Tx = typeof TX.en;
export const onbTx = (lang: string): Tx => (TX as Record<string, Tx>)[lang] || TX.en;
const fmt = (s: string, ...a: (string | number)[]) => a.reduce<string>((o, v, i) => o.replace(`{${i}}`, String(v)), s);

const STEPS: OnbStep[] = ['ask', 'like', 'clip'];
const label = (tx: Tx, k: OnbStep) => (k === 'ask' ? tx.ask : k === 'like' ? tx.like : tx.clip);
const btn = (tx: Tx, k: OnbStep) => (k === 'ask' ? tx.bAsk : k === 'like' ? tx.bLike : tx.bClip);
const isDone = (s: OnbState, k: OnbStep) => (k === 'ask' ? !!s.ask : k === 'like' ? (s.likes || 0) >= 3 : !!s.clip);

/** the 3-part bar (one part per step, filled in order of what is done) */
function Bar({ n }: { n: number }) {
  return <span className="onb-bar" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

/** The three rows (shared by the Feed drop-down and the Me line). */
export function OnbSteps(props: { lang: string; st: OnbState; onGo: (k: OnbStep) => void }) {
  const tx = onbTx(props.lang);
  const next = onbNext(props.st);
  return (
    <ol className="onb-steps">
      {STEPS.map((k, i) => {
        const done = isDone(props.st, k);
        return (
          <li key={k} className={`onb-step${done ? ' done' : ''}${k === next ? ' next' : ''}`} data-step={k}>
            <span className="onb-dot" aria-hidden="true">{done ? '✓' : i + 1}</span>
            <span className="onb-tx">{label(tx, k)}{k === 'like' && !done && (props.st.likes || 0) > 0 ? <em> · {props.st.likes}/3</em> : null}</span>
            {done ? null : <button type="button" className="onb-go" data-onb-go={k} onClick={() => props.onGo(k)}>{btn(tx, k)}</button>}
          </li>
        );
      })}
    </ol>
  );
}

/** Feed: slim line in the ticker's place; tap opens the steps under it. */
export function OnbStrip(props: { lang: string; st: OnbState; onGo: (k: OnbStep) => void; onHide: () => void }) {
  const tx = onbTx(props.lang);
  const [open, setOpen] = useState(false);
  const n = onbCount(props.st);
  const next = onbNext(props.st);
  return (
    <div className={`onb${open ? ' open' : ''}`} id="onbStrip" lang={props.lang}>
      <button type="button" className="onb-line" aria-expanded={open} aria-controls="onbPanel" onClick={() => setOpen((o) => !o)}
        aria-label={`${tx.head} · ${n}/3 · ${open ? tx.close : tx.open}`}>
        <span className="onb-l1"><b>{next ? label(tx, next) : tx.head}</b><span className="onb-n">{n}/3</span></span>
        <Bar n={n} />
        <svg className="onb-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
      </button>
      {open ? (
        <div className="onb-panel" id="onbPanel">
          <div className="onb-ph">
            <span><b>{tx.head} <span className="onb-tick">✓</span></b><small>{tx.sub}</small></span>
            <button type="button" className="onb-hide" id="onbHide" onClick={props.onHide}>{tx.hide}</button>
          </div>
          <OnbSteps lang={props.lang} st={props.st} onGo={(k) => { setOpen(false); props.onGo(k); }} />
        </div>
      ) : null}
    </div>
  );
}

/** Me: one quiet line in the status block ("✦ Become a Bangkok Local · 1/3 ›"), opens the rows in place. */
export function OnbMeLine(props: { lang: string; st: OnbState; onGo: (k: OnbStep) => void }) {
  const tx = onbTx(props.lang);
  const [open, setOpen] = useState(false);
  const n = onbCount(props.st);
  return (
    <div className={`onb-me${open ? ' open' : ''}`} id="meOnb">
      <button type="button" className="me-st2 onb-me-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">✦ </span>{tx.head}<span className="onb-n"> · {n}/3</span><Bar n={n} />
      </button>
      {open ? <OnbSteps lang={props.lang} st={props.st} onGo={props.onGo} /> : null}
    </div>
  );
}

function Av({ p }: { p: AlikePerson }) {
  const ch = (Array.from((p.first_name || '?').trim())[0] || '?').toUpperCase();
  return p.photo ? <img className="al-av" src={p.photo} alt="" loading="lazy" decoding="async" /> : <span className="al-av al-ini" aria-hidden="true">{ch}</span>;
}

/**
 * "Answered like you". kind 'vote' + ref = the This-or-That day; 'ask' + ref = the Ask BKK question id; 'any' = People.
 * Shows nothing until the server says eligible (2+ answers/votes) and has someone to show.
 */
export function AlikeRow(props: { lang: string; kind: 'any' | 'vote' | 'ask'; refId?: string | null; place: 'people' | 'result';
  onPerson: (id: string) => void; onFollow: (id: string) => Promise<boolean> }) {
  const tx = onbTx(props.lang);
  const gen = useAlikeGen();
  const [rows, setRows] = useState<AlikePerson[] | null>(null);
  const [fol, setFol] = useState<Record<string, 'busy' | 'on'>>({});
  useEffect(() => {
    let off = false;
    void onbAlike(props.kind, props.refId || null, props.place === 'people' ? 12 : 8)
      .then((r) => { if (!off) setRows(r?.eligible && Array.isArray(r.people) ? r.people : []); })
      .catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [props.kind, props.refId, props.place, gen]);
  if (!rows || !rows.length) return null;
  const follow = async (id: string) => {
    if (fol[id]) return;
    setFol((f) => ({ ...f, [id]: 'busy' }));
    const on = await props.onFollow(id).catch(() => false);
    setFol((f) => { const o = { ...f }; if (on) o[id] = 'on'; else delete o[id]; return o; });
  };
  return (
    <section className={`al al-${props.place}`} id={props.place === 'people' ? 'pplAlike' : `alike-${props.kind}`} aria-label={props.kind === 'ask' ? tx.alikeAsk : tx.alike} lang={props.lang}>
      <h4 className="al-h">{props.kind === 'ask' ? tx.alikeAsk : tx.alike}</h4>
      <div className="al-row">
        {rows.map((p) => {
          const same = p.same_votes + p.same_questions;
          const st = fol[p.user_id];
          return (
            <div className="al-p" key={p.user_id} data-alike={p.user_id}>
              <button type="button" className="al-who" onClick={() => props.onPerson(p.user_id)}>
                <Av p={p} />
                <span className="al-nm"><b>{p.first_name}</b>{p.verified ? <i className="al-ok" aria-label="verified">✓</i> : null}</span>
                {props.kind === 'any' && same > 0 ? <small>{same === 1 ? tx.same1 : fmt(tx.sameN, same)}</small> : null}
              </button>
              <button type="button" className={`al-fol${st === 'on' ? ' on' : ''}`} disabled={!!st} aria-pressed={st === 'on'} onClick={() => void follow(p.user_id)}>
                {st === 'on' ? tx.following : tx.follow}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
