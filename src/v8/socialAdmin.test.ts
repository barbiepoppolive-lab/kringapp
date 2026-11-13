// T-210 · admin "Social queue" tab with the DB calls mocked: cards, Copy + Open, refused sends.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: [string, Record<string, unknown>][] = [];
let prepareErr = '';
const ROWS = [
  { id: 'a1', subreddit: 'Bangkok', thread_url: 'https://www.reddit.com/r/Bangkok/comments/1abc2d/x/', thread_title: 'Where to eat near Ari?',
    reply_text: 'Try the khao man gai on Soi Ari 1. I use Kring for this.', why_helps: 'Answers the question with a real spot', mentions_kring: false,
    status: 'pending', send_mode: null, final_text: null, result_url: null, error: null, created_at: '2026-11-11T10:00:00Z', sent_at: null },
];
vi.mock('../venue/shared', async () => {
  const real = await vi.importActual<typeof import('../venue/shared')>('../venue/shared');
  return {
    ...real,
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push([fn, args]);
      if (fn === 'kr8_admin_social_list') return ROWS;
      if (fn === 'kr8_social_status') return [{ sent_today: 2, max_per_day: 5, next_allowed_at: '2026-11-11T11:00:00Z', kring_allowed: false }];
      if (fn === 'kr8_admin_social_prepare') {
        if (prepareErr) throw new Error(prepareErr);
        return { text: ROWS[0].reply_text + "\n\n(Disclosure: I'm building Kring.)", thread_url: ROWS[0].thread_url };
      }
      return null;
    },
    v5Client: async () => ({ functions: { invoke: async () => ({ data: null, error: { message: 'x', context: { json: async () => ({ error: 'REDDIT_OFF' }) } } }) } }),
  };
});
import { socialView } from '../venue/socialAdmin';

const tick = () => new Promise((r) => setTimeout(r, 0));
describe('Social queue tab', () => {
  let copied = '';
  beforeEach(() => {
    calls.length = 0; prepareErr = ''; copied = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { copied = t; } } });
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });
  const mount = async () => { const body = document.createElement('div'); let n = -1; await socialView(body, (c) => { n = c; }); return { body, count: () => n }; };

  it('shows the card with subreddit, thread, why, the Kring warning and the day status', async () => {
    const { body, count } = await mount();
    expect(count()).toBe(1);
    expect(body.querySelector('[data-social="a1"]')!.textContent).toContain('r/Bangkok');
    expect(body.querySelector('[data-mentions]')).not.toBeNull();   // detected from the text even though the flag is false
    expect(body.querySelector('#socialStatus')!.textContent).toMatch(/^2\/5 today/);
    expect(body.querySelectorAll('#socialSend-a1, #socialCopy-a1, #socialEdit-a1, #socialSkip-a1').length).toBe(4);
  });
  it('Copy + Open: reserves through the DB, copies the exact text with the disclosure line, marks it done, offers Open + Undo', async () => {
    const { body } = await mount();
    (body.querySelector('#socialCopy-a1') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) await tick();
    expect(calls.map((c) => c[0])).toContain('kr8_admin_social_prepare');
    expect(calls.find((c) => c[0] === 'kr8_admin_social_prepare')![1]).toEqual({ p_id: 'a1', p_mode: 'manual' });
    expect(copied).toMatch(/Disclosure: I'm building Kring\.\)$/);
    expect(calls.map((c) => c[0])).toContain('kr8_admin_social_done');
    expect((body.querySelector('#socialOpen-a1') as HTMLAnchorElement).href).toBe(ROWS[0].thread_url);
    expect(body.querySelector('#socialUndo-a1')).not.toBeNull();
  });
  it('a refused Copy + Open (too soon) copies nothing and explains why', async () => {
    prepareErr = 'KR8_SOCIAL_TOO_SOON';
    const { body } = await mount();
    (body.querySelector('#socialCopy-a1') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) await tick();
    expect(copied).toBe('');
    expect(body.textContent).toContain('Less than 20 minutes since the last one');
    expect(calls.map((c) => c[0])).not.toContain('kr8_admin_social_done');
  });
  it('Send without the Reddit API connected says to use Copy + Open', async () => {
    const { body } = await mount();
    (body.querySelector('#socialSend-a1') as HTMLButtonElement).click();
    for (let i = 0; i < 5; i++) await tick();
    expect(body.textContent).toContain('Reddit API not connected yet · use Copy + Open');
  });
});
