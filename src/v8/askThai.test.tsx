import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { createAskApi, fmtCount, isMissing, nextVote, orderThread, resetAskLocal, type AskAnswer, type AskPerson } from './askThai';
import { AskThaiView, askErrText } from './V5AskThai';
import { AskSwitch } from './V5AskSwitch';
import { V5_L, KX_L } from './v5Strings';

const me: AskPerson = { id: 'me', name: 'Mint', photo: '/x.jpg', local: true };
const L = (en: string) => en;
const P = (id: string, local = false): AskPerson => ({ id, name: id, photo: '', local });
const A = (id: string, score: number, parentId: string | null = null, at = '2026-11-16T10:00:00Z'): AskAnswer =>
  ({ id, parentId, by: P(id), body: id, media: null, score, myVote: 0, at });

describe('Ask BKK logic', () => {
  it('orders the thread: best answer first, replies under their answer', () => {
    const o = orderThread([A('a', 3), A('b', 9), A('r1', 1, 'a', '2026-11-16T11:00:00Z'), A('c', 0), A('r0', 5, 'b')]);
    expect(o.map((x) => x.id)).toEqual(['b', 'r0', 'a', 'r1', 'c']);
    expect(o[0].best).toBe(true);
    expect(o.filter((x) => x.best).length).toBe(1);
    expect(orderThread([A('z', 0)])[0].best).toBe(false);   // no "Best" without a single upvote
  });
  it('tapping the same arrow again takes the vote back', () => {
    expect(nextVote(0, 1)).toBe(1);
    expect(nextVote(1, 1)).toBe(0);
    expect(nextVote(1, -1)).toBe(-1);
  });
  it('short counts', () => {
    expect(fmtCount(148)).toBe('148');
    expect(fmtCount(1200)).toBe('1.2k');
    expect(fmtCount(25000)).toBe('25k');
  });
  it('treats a missing function or table as "migration not applied"', () => {
    expect(isMissing({ code: 'PGRST202' })).toBe(true);
    expect(isMissing({ code: '42883' })).toBe(true);
    expect(isMissing({ message: 'KR8_SIGN_IN' })).toBe(false);
  });
});

describe('Ask BKK local store (no table yet / demo)', () => {
  beforeEach(() => resetAskLocal());
  it('live build without demo starts empty, never with example posts', async () => {
    const api = createAskApi({ live: false, demo: false, me: () => me });
    expect(await api.feed()).toEqual([]);
  });
  it('anyone can ask, anyone can answer and reply, votes count once', async () => {
    let who: AskPerson | null = me;
    const api = createAskApi({ live: false, demo: false, me: () => who });
    const q = await api.ask({ body: 'Where is good for mango sticky rice? 🥭', area: 'Ari' });
    who = P('liam');
    const a = await api.answer(q, null, 'Try Mae Varee');
    await api.answer(q, a, '+1 😋');
    who = P('ploy', true);
    expect(await api.vote('a', a, 1)).toBe(2);
    expect(await api.vote('a', a, 1)).toBe(2);   // same vote twice does not add
    expect(await api.vote('a', a, 0)).toBe(1);
    const t = await api.thread(q);
    expect(t.answers.map((x) => x.body)).toEqual(['Try Mae Varee', '+1 😋']);
    expect(t.answers[1].parentId).toBe(a);
    const f = await api.feed();
    expect(f[0].answers).toBe(2);
    expect(f[0].top?.body).toBe('Try Mae Varee');
    who = null;
    await expect(api.ask({ body: 'signed out?' })).rejects.toThrow('KR8_SIGN_IN');
  });
});

describe('Ask BKK screens', () => {
  beforeEach(() => resetAskLocal());
  it('switch: Reels is the default, tapping Ask BKK switches', () => {
    let mode: 'reels' | 'ask' = 'reels';
    const { rerender } = render(<div className="v8-app-root"><AskSwitch L={L} mode={mode} onMode={(m) => { mode = m; }} dot /></div>);
    expect(screen.getByRole('tab', { name: 'Reels' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: /Ask BKK/ }));
    expect(mode).toBe('ask');
    rerender(<div className="v8-app-root"><AskSwitch L={L} mode={mode} onMode={() => {}} dot /></div>);
    expect(screen.getByRole('tab', { name: 'Ask BKK' }).getAttribute('aria-selected')).toBe('true');
  });
  it('timeline shows posts, BKK Local badge, top answer; a tap opens the thread with "Best"', async () => {
    const api = createAskApi({ live: false, demo: true, me: () => me });
    const need = (f: () => void) => f();
    render(<div className="v8-app-root"><AskThaiView L={L} api={api} me={me} areas={['Bangkok', 'Ari']} areaLabel={(a) => a} need={need} toast={() => {}} /></div>);
    await screen.findByText(/Best time to visit So Heng Tai/);
    expect(screen.getByText(/Weekday, 9–10am/)).toBeTruthy();
    // 21 Nov: the top-answer preview reads "name · ▲ n" (no BKK Local badge, no stray dots); the badge shows in the thread
    const h = document.querySelector('.rv4-bub .h') as HTMLElement;
    expect(h.textContent).toBe('Ploy·96');
    expect(document.querySelector('.rv4-bub .at-tr')).toBeNull();
    fireEvent.click(screen.getByText(/Best time to visit So Heng Tai/));
    await screen.findByText('★ Best');
    expect(screen.getAllByText('BKK Local').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Add an answer')).toBeTruthy();
    expect(screen.getByLabelText('GIF')).toBeTruthy();
  });
  // 23 Nov (m199): writing a question is the Kring team's job — kr8_ask_create raises KR8_ASK_TEAM_ONLY for members.
  // 24 Nov (founder): so the "Ask Bangkok locals anything" row came off the member screen; it could only ever error.
  it('no Ask row on the member screen — questions are the team\'s to write', async () => {
    const api = createAskApi({ live: false, demo: false, me: () => me });
    render(<div className="v8-app-root"><AskThaiView L={L} api={api} me={me} areas={['Bangkok', 'Ari']} areaLabel={(a) => a} need={(f) => f()} toast={() => {}} /></div>);
    await screen.findByText('No questions yet');
    expect(screen.queryByText('Ask Bangkok locals anything')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ask$/ })).toBeNull();
  });

  it('the composer still posts to the top of the timeline when it is opened for the team', async () => {
    const api = createAskApi({ live: false, demo: false, me: () => me });
    render(<div className="v8-app-root"><AskThaiView L={L} api={api} me={me} areas={['Bangkok', 'Ari']} areaLabel={(a) => a} need={(f) => f()} toast={() => {}} openCompose /></div>);
    const post = await screen.findByRole('button', { name: 'Post' }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Is Chatuchak open on Friday?' } });
    await act(async () => { fireEvent.click(post); });
    await waitFor(() => expect(screen.getAllByText('Is Chatuchak open on Friday?').length).toBeGreaterThan(0));
  });
});

describe('Ask BKK report (⋯ → Report → reason)', () => {
  beforeEach(() => resetAskLocal());
  it('reporting an answer removes it (and its replies) for the reporter; own posts have no ⋯', async () => {
    const api = createAskApi({ live: false, demo: true, me: () => me });
    const toasts: string[] = [];
    render(<div className="v8-app-root"><AskThaiView L={L} api={api} me={me} areas={['Bangkok']} areaLabel={(a) => a} need={(f) => f()} toast={(m) => toasts.push(m)} openThread="dq1" /></div>);
    await screen.findByText(/Had the pool room to myself/);
    expect(screen.getByText(/Mondays some cafés nearby close/)).toBeTruthy();   // reply under da2
    fireEvent.click(document.querySelector('[data-ask-more="da2"]')!);
    fireEvent.click(screen.getByText(/Report/));
    expect(screen.getByText('Why are you reporting it?')).toBeTruthy();
    expect(screen.getByText('Block this person')).toBeTruthy();
    await act(async () => { fireEvent.click(document.querySelector('[data-reason="spam"]')!); });
    await waitFor(() => expect(screen.queryByText(/Had the pool room to myself/)).toBeNull());
    expect(screen.queryByText(/Mondays some cafés nearby close/)).toBeNull();
    expect(toasts).toContain('Thanks · we’ll check it. You won’t see it again.');
    expect(document.querySelector('[data-ask-more="dq1"]')).toBeTruthy();   // the question has its own ⋯
  });
  it('no ⋯ on my own answer', async () => {
    const api = createAskApi({ live: false, demo: false, me: () => me });
    const q = await api.ask({ body: 'Is Lumphini open late?' });
    const mine = await api.answer(q, null, 'Until 9pm I think');
    render(<div className="v8-app-root"><AskThaiView L={L} api={api} me={me} areas={['Bangkok']} areaLabel={(a) => a} need={(f) => f()} toast={() => {}} openThread={q} /></div>);
    await screen.findAllByText('Until 9pm I think');
    expect(document.querySelector(`[data-ask-more="${mine}"]`)).toBeNull();
    expect(document.querySelector(`[data-ask-more="${q}"]`)).toBeNull();
  });
});

describe('Ask BKK copy rules', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const keys = ['Ask BKK', 'Ask', 'BKK Local', 'traveller', 'Upvote', 'Downvote', 'Answers', '1 answer', '{0} answers', '★ Best', 'Reply', 'Replying to {0}',
    'Add an answer', 'Your question', 'Add details (optional)', 'Emoji', 'GIF', 'Remove photo', 'Photo is too big · up to 5 MB', 'Use a photo or GIF',
    'Couldn’t post · try again', 'No questions yet', 'Now', '{0}m', '{0}h', '{0}d', 'Reels', 'Photo', 'Post', 'Share', 'Back', 'Close', 'Try again',
    'Something went wrong', 'Link copied', 'Area', 'Feed', 'More', 'Report', 'Why are you reporting it?', 'Spam or scam', 'Unsafe, adult or harassment',
    'Block this person', 'Thanks · we’ll check it. You won’t see it again.'];
  it('every visible string has Thai', () => {
    for (const k of keys) expect(V5_L.th[k] || KX_L.th[k], k).toBeTruthy();
  });
  it('no banned words in the Ask BKK screens or their strings', () => {
    const banned = /\b(meet|guide|tour|host|creator|reviews|hidden gem|alcohol|gift|wallet|credit|lucky|draw|temples)\b/i;
    const text = ['V5AskThai.tsx', 'V5AskSwitch.tsx', 'askThai.ts'].map(read).join('\n').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const literals = text.match(/'[^'\n]*'|`[^`\n]*`|>[^<>{}\n]+</g) || [];
    for (const s of literals) expect(banned.test(s), s).toBe(false);
  });
});

describe('Ask BKK server refusals', () => {
  it('shows the ghost / slow-down / text messages, and the fallback for anything else', () => {
    expect(askErrText(L, { message: 'KR8_GHOST' }, 'x')).toMatch(/^This account is paused/);
    expect(askErrText(L, new Error('KR8_SLOW_DOWN'), 'x')).toBe('Slow down a little and try again soon.');
    expect(askErrText(L, { message: 'KR8_BAD_TEXT' }, 'x')).toMatch(/^Keep it short/);
    expect(askErrText(L, { message: 'KR8_BAD_FILE' }, 'Couldn’t post · try again')).toBe('Couldn’t post · try again');
    expect(askErrText(L, null, 'Something went wrong')).toBe('Something went wrong');
  });
});
