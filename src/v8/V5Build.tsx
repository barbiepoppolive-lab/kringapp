/**
 * Six-step profile builder (founder-approved design "variant B", 25 Nov 2026).
 *
 * Runs right after a new card is saved, and resumes from the Me tab. One question per screen, tap-first,
 * the member's own card sits on top and fills in live as they answer. Every step is skippable and every
 * finished step is written straight away, so leaving halfway loses nothing.
 *
 * Storage: all existing columns on kr8_members — gender + show_gender (kr8_set_gender), area and langs
 * (kr8_save_card), interests (kr8_set_interests), bio (kr8_set_bio). Which steps are done lives in
 * kr8_member_coach (kr8_coach_seen / kr8_coach_state), no new table. Step 6 saves to kr8_members.qa_q / qa_answer
 * through kr8_set_qa (migration 0251). Reuses the live helpers in v5Live,
 * v5Kx (kxSetGender, kxCoachSeen) and V5Gender, nothing duplicated.
 *
 * One language per screen: every visible string goes through L(), never Thai with English under it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './build.css';
import { v5SaveCard, v5SetBio, v5SetInterests, v5SetQa, V5_AREAS, V5_INTERESTS } from './v5Live';
import type { V5Card, V5Me } from './v5Live';
import { kxCoachSeen, kxSetGender } from './v5Kx';
import { GENDER_LABEL, genderPayload, isGender, type Gender } from './V5Gender';
import { INTEREST, QA_QUESTIONS } from './V5Me';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;

/** The six steps, in order. `key` is the kr8_member_coach key that marks the step finished. */
export const BUILD_STEPS = ['pb_gender', 'pb_area', 'pb_likes', 'pb_langs', 'pb_bio', 'pb_qa'] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

/** Finished-flow mark in kr8_member_coach (keys must match ^[a-z0-9_]{1,24}$). */
export const V5_BUILD_DONE = 'pb_done';

/** Member card gender values the database accepts; the words are the card editor's own (GENDER_LABEL). */
const GENDER_TILES: { v: Gender; em: string }[] = [
  { v: 'female', em: '👩' },
  { v: 'male', em: '👨' },
  { v: 'kathoey', em: '🌈' },
];

/** Step 4 offers the five languages Bangkok members actually pick; the card keeps any others already on it. */
const BUILD_LANGS: { v: string; en: string }[] = [
  { v: 'TH', en: 'Thai' }, { v: 'EN', en: 'English' }, { v: 'ZH', en: 'Chinese' },
  { v: 'KO', en: 'Korean' }, { v: 'JA', en: 'Japanese' },
];

/** Step 5 starter lines — tapped, then editable. Never an empty box as the first thing a member sees. */
export const BIO_STARTERS = [
  'I’m always hunting for a café to work in — send me one',
  'I’d rather walk the sois for food than go to a mall',
  'I want to practise English, and I’ll teach you Thai',
];
/** Step 6 is one light question; the three taps are starting points, not the only answers. */
export const QA_KEY = 'soi_shop';
export const QA_QUESTION = QA_QUESTIONS[QA_KEY];
export const QA_STARTERS = [
  'The coffee place at the mouth of the soi',
  'The chicken-rice shop',
  'The 24-hour noodle cart',
];

/** Areas offered first; the rest of V5_AREAS follows so nobody is stuck. */
const AREA_FIRST = ['Ari', 'Thonglor', 'Ekkamai', 'Ratchada', 'Silom', 'Sukhumvit', 'Phrom Phong', 'Siam', 'Chatuchak'];
const AREA_ORDER = [...AREA_FIRST, ...V5_AREAS.filter((a) => a !== 'Bangkok' && !AREA_FIRST.includes(a))];

/** Steps still to do, given what kr8_coach_state() returned. */
export function missingSteps(done: readonly string[]): BuildStep[] {
  return BUILD_STEPS.filter((k) => !done.includes(k));
}
/** Steps a member's card already answers (filled before the builder existed, or after "Replay intro" cleared the coach marks). */
export function cardDoneSteps(card: V5Card | null | undefined, qaAnswer?: string | null): BuildStep[] {
  if (!card) return [];
  const out: BuildStep[] = [];
  if (isGender(card.gender)) out.push('pb_gender');
  if (card.area && card.area !== 'Bangkok') out.push('pb_area');
  if ((card.interests || []).length >= 3) out.push('pb_likes');
  if ((card.langs || []).length) out.push('pb_langs');
  if ((card.bio || '').trim()) out.push('pb_bio');
  if ((qaAnswer || '').trim()) out.push('pb_qa');
  return out;
}
/** True when the builder should be offered: the card exists and at least one step is unfinished. */
export function buildIncomplete(done: readonly string[]): boolean {
  return !done.includes(V5_BUILD_DONE) && missingSteps(done).length > 0;
}

export interface V5BuildProps {
  L: Tx;
  Lf: Txf;
  card: V5Card;
  /** Saved step-6 answer (kr8_profile.qa_answer), so a resumed run shows it. */
  qaInit?: string | null;
  /** The step-6 answer was saved; the caller patches its profile copy. */
  onQa?: (r: { qa_q: string | null; qa_answer: string | null }) => void;
  /** Keys already in kr8_member_coach, so a resumed run opens on the first unfinished step. */
  done: readonly string[];
  /** Fresh kr8_me() after a step is saved, so the rest of the app stays in step. */
  onCard: (me: V5Me) => void;
  /** A step was written; the caller adds the key to its own copy of the coach state. */
  onStepDone: (key: string) => void;
  /** Closed with the flow finished (true) or left part-done (false). */
  onClose: (finished: boolean) => void;
  errText: (e: unknown) => string;
  /** Area name in the screen's language (the app's kxArea); defaults to L. */
  areaL?: Tx;
  /** 25 Nov: open on this step (the Me question bubble opens step 6, answered or not); default: the first unfinished step */
  startAt?: BuildStep | null;
}

export function V5Build(props: V5BuildProps) {
  const { L, Lf, card } = props;
  const AL: Tx = props.areaL || L;
  const first = useMemo(() => {
    if (props.startAt && BUILD_STEPS.includes(props.startAt)) return BUILD_STEPS.indexOf(props.startAt);
    const m = missingSteps(props.done);
    return m.length ? BUILD_STEPS.indexOf(m[0]) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [i, setI] = useState(first);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [finished, setFinished] = useState(false);
  const busyRef = useRef(false);

  // live draft of the card
  const [gender, setGender] = useState<Gender | null>(isGender(card.gender) ? card.gender : null);
  // live rule (V5Gender): shown to others only when the member switches it on, so the toggle starts off
  const [showGender, setShowGender] = useState<boolean>(card.show_gender === true);
  const [area, setArea] = useState<string>(card.area && card.area !== 'Bangkok' ? card.area : '');
  const [likes, setLikes] = useState<string[]>(card.interests ? [...card.interests] : []);
  const [langs, setLangs] = useState<string[]>(card.langs ? [...card.langs] : []);
  const [bio, setBio] = useState<string>(card.bio || '');
  const [bioEdit, setBioEdit] = useState(false);
  const [qa, setQa] = useState<string>(props.qaInit || '');
  const [qaEdit, setQaEdit] = useState(false);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const qaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (bioEdit) bioRef.current?.focus(); }, [bioEdit]);
  useEffect(() => { if (qaEdit) qaRef.current?.focus(); }, [qaEdit]);

  const step = BUILD_STEPS[i];
  const last = i === BUILD_STEPS.length - 1;

  /** The meta line under the name on the live card, built from whatever is answered so far. */
  const previewBits = (): string[] => {
    const out: string[] = [];
    if (gender && showGender) out.push(L(GENDER_LABEL[gender]));
    if (area) out.push(AL(area));
    for (const k of likes.slice(0, 2)) out.push(L(INTEREST[k]?.[1] || k));
    return out;
  };
  /** What the member has not filled in yet, shown in gold so the card looks unfinished on purpose. */
  const previewWaiting = (): string => {
    if (step === 'pb_gender') return L('pick one…');
    if (step === 'pb_area') return L('pick your area…');
    if (step === 'pb_likes') return L('pick what you like…');
    if (step === 'pb_langs') return L('pick your languages…');
    if (step === 'pb_bio') return L('add a line…');
    if (step === 'pb_qa') return L('answer today’s question…');
    return '';
  };

  const mark = async (key: string) => {
    await kxCoachSeen(key);
    props.onStepDone(key);
  };
  /** Saves the current step, then moves on. Skip calls `go` with save = false. */
  const go = (save: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr('');
    void (async () => {
      try {
        if (save) await saveStep();
      } catch (e) {
        setErr(props.errText(e));
        busyRef.current = false;
        setBusy(false);
        return;
      }
      busyRef.current = false;
      setBusy(false);
      // 25 Nov: opened from the Me bubble for this one step → save it and go back to Me (the builder's own progress is untouched)
      if (props.startAt) { props.onClose(false); return; }
      if (last) {
        await kxCoachSeen(V5_BUILD_DONE);
        props.onStepDone(V5_BUILD_DONE);
        setFinished(true);
      } else setI((n) => n + 1);
    })();
  };

  const saveStep = async () => {
    if (step === 'pb_gender') {
      if (!gender) return;
      const gp = genderPayload(gender, showGender);
      const r = await kxSetGender(gp.gender, gp.show);
      await mark('pb_gender');
      // kr8_set_gender returns only the two fields, so the card copy is patched locally
      props.onCard({ card: { ...card, gender: r.gender, show_gender: r.show_gender } } as unknown as V5Me);
      return;
    }
    if (step === 'pb_area') {
      if (!area) return;
      props.onCard(await v5SaveCard({ first_name: card.first_name, langs: card.langs, bio: card.bio || '', area, who: card.who, photo: null, age_ok: true }));
      await mark('pb_area');
      return;
    }
    if (step === 'pb_likes') {
      if (likes.length < 3) return;
      await v5SetInterests(likes);
      await mark('pb_likes');
      props.onCard({ card: { ...card, area: area || card.area, interests: likes } } as unknown as V5Me);
      return;
    }
    if (step === 'pb_langs') {
      if (!langs.length) return;
      props.onCard(await v5SaveCard({ first_name: card.first_name, langs, bio: card.bio || '', area: area || card.area, who: card.who, photo: null, age_ok: true }));
      await mark('pb_langs');
      return;
    }
    if (step === 'pb_bio') {
      const v = bio.trim().slice(0, 80);
      if (!v) return;
      await v5SetBio(v);
      await mark('pb_bio');
      props.onCard({ card: { ...card, bio: v, area: area || card.area, interests: likes, langs } } as unknown as V5Me);
      return;
    }
    // Step 6: kr8_set_qa (0251). Checked like the bio server-side (KR8_BAD_BIO → the same friendly line as the bio).
    const a = qa.trim().slice(0, 140);
    if (!a) return;
    const r = await v5SetQa(QA_KEY, a);
    await mark('pb_qa');
    props.onQa?.(r);
  };

  const ready =
    step === 'pb_gender' ? !!gender
      : step === 'pb_area' ? !!area
        : step === 'pb_likes' ? likes.length >= 3
          : step === 'pb_langs' ? langs.length >= 1
            : step === 'pb_bio' ? !!bio.trim()
              : !!qa.trim();

  const flipLike = (k: string) =>
    setLikes((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 8 ? p : [...p, k]));
  const flipLang = (v: string) =>
    setLangs((p) => (p.includes(v) ? p.filter((x) => x !== v) : p.length >= 6 ? p : [...p, v]));

  const photo = card.photo || '';
  const name = card.first_name || L('You');
  const memberNo = (card as V5Card & { member_no?: number | null }).member_no;
  const no = memberNo ? `#${memberNo}` : '';

  if (finished) {
    return (
      <div className="kpb" id="buildFlow" data-step="done">
        <div className="kpb-glow" />
        <div className="kpb-body kpb-done">
          <div className="kpb-tick" aria-hidden="true">✓</div>
          <h1>{Lf('That’s you, {0}', name)}</h1>
          <div className="kpb-card kpb-card-big">
            {photo ? <span className="kpb-img" style={{ backgroundImage: `url('${photo}')` }} /> : <span className="kpb-img">🙂</span>}
            <span className="kpb-tx">
              <b className="kpb-nm">{no ? `${name} · ${no}` : name}</b>
              <small className="kpb-meta">{previewBits().join(' · ')}</small>
              {bio.trim() ? <small className="kpb-bioline">{bio.trim()}</small> : null}
              {qa.trim() ? <small className="kpb-qaline">{L(QA_QUESTION)} — {qa.trim()}</small> : null}
            </span>
          </div>
          <p className="kpb-in">{L('You’re on the People page now')}</p>
          <button type="button" className="kpb-cta" id="buildDone" onClick={() => props.onClose(true)}>{L('See People')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="kpb" id="buildFlow" data-step={step}>
      <div className="kpb-glow" />
      <div className="kpb-top">
        <button type="button" className="kpb-back" aria-label={L('Back')} disabled={(i === 0 && !props.startAt) || busy}
          onClick={() => (props.startAt ? props.onClose(false) : setI((n) => Math.max(0, n - 1)))}>‹</button>
        <span className="kpb-dots" aria-hidden="true">
          {BUILD_STEPS.map((k, n) => <i key={k} className={n <= i ? 'on' : ''} />)}
        </span>
        <button type="button" className="kpb-skip" id="buildSkip" disabled={busy} onClick={() => go(false)}>{L('Skip')}</button>
      </div>

      <div className="kpb-body">
        <div className="kpb-card" id="buildPreview">
          {photo ? <span className="kpb-img" style={{ backgroundImage: `url('${photo}')` }} /> : <span className="kpb-img">🙂</span>}
          <span className="kpb-tx">
            <b className="kpb-nm">{no ? `${name} · ${no}` : name}</b>
            <small className="kpb-meta">
              {previewBits().map((b, n) => <React.Fragment key={n}>{n ? ' · ' : ''}{b}</React.Fragment>)}
              {previewBits().length ? ' · ' : ''}<b className="kpb-w">{previewWaiting()}</b>
            </small>
          </span>
        </div>

        <div className="kpb-n">{Lf('{0} / 6', String(i + 1))}</div>

        {step === 'pb_gender' && (<>
          <h1>{L('You are')}</h1>
          <p className="kpb-hint">{L('It helps people find you. You can hide it below.')}</p>
          <div className="kpb-big">
            {GENDER_TILES.map((g) => (
              <button type="button" key={g.v} data-gender={g.v} aria-pressed={gender === g.v}
                className={gender === g.v ? 'on' : ''} onClick={() => setGender(g.v)}>
                <span className="kpb-em">{g.em}</span>{L(GENDER_LABEL[g.v])}
              </button>
            ))}
          </div>
          <button type="button" className={`kpb-tog ${showGender ? 'on' : ''}`} id="buildShowGender"
            aria-pressed={showGender} onClick={() => setShowGender((s) => !s)}>
            <span className="kpb-sw" aria-hidden="true"><i /></span>{L('Show this on my profile')}
          </button>
        </>)}

        {step === 'pb_area' && (<>
          <h1>{L('Which area are you around?')}</h1>
          <p className="kpb-hint">{L('Pick the one you are in most')}</p>
          <div className="kpb-chips">
            {AREA_ORDER.map((a) => (
              <button type="button" key={a} data-area={a} aria-pressed={area === a}
                className={area === a ? 'on' : ''} onClick={() => setArea(a)}>{AL(a)}</button>
            ))}
          </div>
        </>)}

        {step === 'pb_likes' && (<>
          <h1>{L('What are you into?')}</h1>
          <p className="kpb-hint">{likes.length >= 3 ? Lf('{0} picked · up to 8', String(likes.length)) : L('Pick 3 or more')}</p>
          <div className="kpb-chips">
            {V5_INTERESTS.map((k) => (
              <button type="button" key={k} data-interest={k} aria-pressed={likes.includes(k)}
                className={likes.includes(k) ? 'on' : ''} onClick={() => flipLike(k)}>
                {INTEREST[k]?.[0]} {L(INTEREST[k]?.[1] || k)}
              </button>
            ))}
          </div>
        </>)}

        {step === 'pb_langs' && (<>
          <h1>{L('You speak')}</h1>
          <p className="kpb-hint">{L('Tap every one you can hold a chat in')}</p>
          <div className="kpb-chips">
            {BUILD_LANGS.map((g) => (
              <button type="button" key={g.v} data-lang={g.v} aria-pressed={langs.includes(g.v)}
                className={langs.includes(g.v) ? 'on' : ''} onClick={() => flipLang(g.v)}>{L(g.en)}</button>
            ))}
          </div>
        </>)}

        {step === 'pb_bio' && (<>
          <h1>{L('A short intro')}</h1>
          <p className="kpb-hint">{L('Tap the one that fits, then change it')}</p>
          <div className="kpb-lines">
            {BIO_STARTERS.map((s) => {
              const t = L(s);
              return (
                <button type="button" key={s} data-starter={s} aria-pressed={bio === t}
                  className={bio === t ? 'on' : ''} onClick={() => { setBio(t); setBioEdit(false); }}>{t}</button>
              );
            })}
          </div>
          {bioEdit ? (
            <textarea ref={bioRef} className="kpb-area" id="buildBio" maxLength={80} rows={2}
              value={bio} onChange={(e) => setBio(e.target.value.slice(0, 80))} placeholder={L('Your own words')} />
          ) : (
            <button type="button" className="kpb-own" id="buildBioOwn" onClick={() => { setBio(''); setBioEdit(true); }}>{L('or write your own')}</button>
          )}
        </>)}

        {step === 'pb_qa' && (<>
          <h1>{L('Today’s question')}</h1>
          <p className="kpb-hint">{L(QA_QUESTION)}</p>
          <div className="kpb-lines">
            {QA_STARTERS.map((s) => {
              const t = L(s);
              return (
                <button type="button" key={s} data-qa={s} aria-pressed={qa === t}
                  className={qa === t ? 'on' : ''} onClick={() => { setQa(t); setQaEdit(false); }}>{t}</button>
              );
            })}
          </div>
          {qaEdit ? (
            <textarea ref={qaRef} className="kpb-area" id="buildQa" maxLength={140} rows={2}
              value={qa} onChange={(e) => setQa(e.target.value.slice(0, 140))} placeholder={L('Your own words')} />
          ) : (
            <button type="button" className="kpb-own" id="buildQaOwn" onClick={() => { setQa(''); setQaEdit(true); }}>{L('or write your own')}</button>
          )}
        </>)}

        {err ? <p className="kpb-err" role="alert">{err}</p> : null}

        <button type="button" className={`kpb-cta ${ready ? '' : 'off'}`} id="buildNext" disabled={!ready || busy}
          onClick={() => go(true)}>
          {last ? L('Finish') : L('Next')}
        </button>
      </div>
    </div>
  );
}

/** Me tab row and the People / message re-prompt both use this one line. */
export function buildLeftLabel(L: Tx, Lf: Txf, done: readonly string[]): string {
  const n = missingSteps(done).length;
  return n === 1 ? L('1 step left on your profile') : Lf('{0} steps left on your profile', String(n));
}

export default V5Build;
