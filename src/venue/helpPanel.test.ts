// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterThreads, previewLine, quickReplies, sortThreads, statusChip, type HelpThread } from './helpPanelLogic';

const invoke = vi.fn(async () => ({ data: { ok: true, text: 'แปลเป็นไทยแล้วครับ' }, error: null }));
vi.mock('./shared', async () => {
  const el = (tag: string, attrs: Record<string, unknown> = {}, ...kids: unknown[]) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === undefined || v === false) continue; if (k === 'class') n.className = String(v); else n.setAttribute(k, v === true ? '' : String(v)); }
    for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k as Node | string);
    return n;
  };
  return { el, rpc: vi.fn(async () => null), v5Client: async () => ({ functions: { invoke } }) };
});

const THAI = /[\u0E01-\u0E3E\u0E40-\u0E7F]/;   // Thai letters (the baht sign is fine)
const now = Date.parse('2026-11-18T10:00:00Z');   // 15:30 IST
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
const th = (o: Partial<HelpThread> & { member: string }): HelpThread => ({
  thread_id: 't-' + o.member, member_no: 10, name: 'Kaew', photo: null, verified: true, test: false,
  last_at: iso(5), last_from: 'member', last_body: 'hi', last_en: null, unanswered: 0, waiting_since: null, team_replied: true, ...o,
});
const LIST: HelpThread[] = [
  th({ member: 'answeredOld', last_at: iso(600), last_from: 'team', last_body: 'ได้เลยครับ', last_en: 'Sure!' }),
  th({ member: 'waitNew', member_no: 21, unanswered: 1, waiting_since: iso(12), last_at: iso(12), team_replied: false, last_body: '[Help] ริงไม่ขึ้นค่ะ', last_en: 'My Rings are not showing.' }),
  th({ member: 'answeredNew', last_at: iso(30), last_from: 'team', last_body: 'Thanks!' }),
  th({ member: 'waitOld', member_no: 7, unanswered: 2, waiting_since: iso(50), last_at: iso(48), last_body: 'ยังรออยู่นะคะ', last_en: 'Still waiting.' }),
];
const DETAIL = {
  member: 'waitOld', unanswered: 2,
  flags: [{ key: 'ring_farming', severity: 'amber', summary: 'Likes only #59' }],
  messages: [
    { id: 1, from: 'member', body: '[Help] โค้ดยังไม่มาค่ะ', at: iso(300), translation_en: 'My code has not come.' },
    { id: 2, from: 'team', body: 'กำลังตรวจสอบให้ครับ', at: iso(290), translation_en: 'We are checking it for you.' },
    { id: 3, from: 'member', body: 'ขอบคุณค่ะ', at: iso(50), translation_en: 'Thank you.' },
    { id: 4, from: 'member', body: 'ยังรออยู่นะคะ', at: iso(48), translation_en: 'Still waiting.', suggested_reply: 'โค้ดส่งแล้วครับ ดูที่รางวัลของฉันนะครับ', suggested_reply_en: 'Your code is sent. Look under My prizes.' },
  ],
};
const MEMBER = { card: { no: 7, name: 'Ploy', photo: null, verified: true, joined_at: iso(3 * 24 * 60) }, reels: [{ status: 'approved', hidden: false }, { status: 'pending', hidden: false }],
  board: { rank: 4, rings: 31 }, rings_week: { score: 31 }, links: [{ user_id: 'x', no: 12, reason: 'face', dismissed: false }] };

async function setup() {
  const shared = await import('./shared');
  const rpc = vi.mocked(shared.rpc);
  rpc.mockReset();
  const saved: { id: number; from: 'team'; body: string; at: string; translation_en: string }[] = [];   // what the server really stored (21 Nov: Sent only after the row exists)
  rpc.mockImplementation((async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'kr8_admin_help_threads') return LIST;
    if (fn === 'kr8_admin_help_thread') { const d = structuredClone(DETAIL); d.messages = [...d.messages, ...saved]; return d; }
    if (fn === 'kr8_admin_v2_member') return MEMBER;
    if (fn === 'kr8_admin_v2_photos') return {};
    if (fn === 'kr8_admin_team_reply_en') { saved.push({ id: 99, from: 'team', body: String(args?.p_body), at: new Date().toISOString(), translation_en: String(args?.p_body_en) }); return 99; }
    return null;
  }) as never);
  const screen = (...kids: (Node | string | null | undefined | false)[]) => { const s = document.createElement('div'); s.className = 'scr'; for (const k of kids) if (k) s.append(k); document.body.replaceChildren(s); return s; };
  return { rpc, screen, mod: await import('./helpPanel') };
}
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
/** all visible text except the member's / team's raw Thai message lines */
const chromeText = () => { const c = document.body.cloneNode(true) as HTMLElement; c.querySelectorAll('.hp-b-text, textarea').forEach((n) => n.remove()); return c.textContent || ''; };

describe('Help panel logic', () => {
  it('sorts waiting first (oldest wait first), then the rest newest first', () => {
    expect(sortThreads(LIST).map((t) => t.member)).toEqual(['waitOld', 'waitNew', 'answeredNew', 'answeredOld']);
    expect(sortThreads([...LIST, th({ member: 'testWait', test: true, unanswered: 1, waiting_since: iso(90) })]).map((t) => t.member).slice(0, 3)).toEqual(['waitOld', 'waitNew', 'testWait']);
  });
  it('status chips: waiting / member replied / answered, red after 45 min', () => {
    expect(statusChip(LIST[1], now)).toEqual({ text: 'Waiting 12 min', tone: 'a' });
    expect(statusChip(LIST[3], now)).toEqual({ text: 'Member replied · 50 min', tone: 'r' });
    expect(statusChip(LIST[0], now)).toEqual({ text: 'Answered', tone: 'g' });
  });
  it('filters Waiting · All · Today (India day)', () => {
    expect(filterThreads(LIST, 'waiting', now).map((t) => t.member).sort()).toEqual(['waitNew', 'waitOld']);
    expect(filterThreads(LIST, 'all', now)).toHaveLength(4);
    expect(filterThreads(LIST, 'today', now)).toHaveLength(4);   // 10 h ago is still today in IST (05:30)
    expect(filterThreads([th({ member: 'y', last_at: '2026-11-17T17:00:00Z' })], 'today', now)).toHaveLength(0);   // 22:30 IST yesterday
  });
  it('previews are English: translation for Thai, [Help] tag removed, team marked', () => {
    expect(previewLine(LIST[1])).toBe('My Rings are not showing.');
    expect(previewLine(LIST[0])).toBe('Kring Team: Sure!');
    expect(THAI.test(previewLine(th({ member: 'z', last_body: 'สวัสดีครับ', last_en: null })))).toBe(false);
  });
  it('quick replies are English only', () => {
    const q = quickReplies();
    expect(q.length).toBeGreaterThanOrEqual(4);
    expect(quickReplies({ min_rings_for_paid_seat: 40 }).find((r) => r.id === 'prize')?.text).toContain('at least 40 Rings');
    for (const r of q) { expect(THAI.test(r.label + r.text)).toBe(false); expect(r.text.length).toBeGreaterThan(20); }
  });
});

describe('Help panel screens', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(now); window.HTMLElement.prototype.scrollIntoView = () => undefined; });
  afterEach(async () => { (await import('./helpPanel')).helpPanelLeave(); vi.useRealTimers(); invoke.mockClear(); });

  it('#help lists every chat, waiting first, English previews, no Thai anywhere', async () => {
    const { mod, screen } = await setup();
    const counts: number[] = [];
    mod.helpPanelView(screen, undefined, (n) => counts.push(n));
    await flush();
    (document.querySelector('[data-f="all"]') as HTMLButtonElement).click();
    const rows = [...document.querySelectorAll<HTMLElement>('.hp-row')];
    expect(rows.map((r) => r.dataset.member)).toEqual(['waitOld', 'waitNew', 'answeredNew', 'answeredOld']);
    expect(rows[0].getAttribute('href')).toBe('#help/waitOld');
    expect(rows[0].textContent).toContain('Member replied · 50 min');
    expect(rows[0].classList.contains('late')).toBe(true);
    expect(rows[1].textContent).toContain('My Rings are not showing.');
    expect(document.body.textContent).toContain('2 waiting · 1 past 45 min');
    expect(THAI.test(document.body.textContent || '')).toBe(false);
    expect(counts[counts.length - 1]).toBe(2);
    (document.querySelector('[data-f="waiting"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll('.hp-row')).toHaveLength(2);
  });

  it('#help/<uid> shows English under every Thai line, member strip + tappable flags, prefilled English draft, English-only chrome', async () => {
    const { mod, screen } = await setup();
    mod.helpPanelView(screen, 'waitOld');
    await flush();
    const bubbles = [...document.querySelectorAll<HTMLElement>('.hp-b')];
    expect(bubbles).toHaveLength(4);
    expect(bubbles.map((b) => b.className.split(' ')[1])).toEqual(['member', 'team', 'member', 'member']);
    for (const b of bubbles) expect(b.querySelector('.hp-b-en')?.textContent).toMatch(/^EN: \S/);
    expect(bubbles[1].querySelector('.hp-b-en')?.textContent).toBe('EN: We are checking it for you.');
    expect(bubbles[0].textContent).not.toContain('[Help]');
    const strip = document.getElementById('hpStrip')!;
    expect(strip.getAttribute('href')).toBe('#m/waitOld');
    expect(strip.textContent).toContain('Ploy #7');
    expect(strip.textContent).toContain('✓ verified');
    expect(strip.textContent).toContain('1 live Reel');
    expect(strip.textContent).toContain('#4 on board');
    expect(strip.textContent).toContain('31 Rings this week');
    const flags = [...document.querySelectorAll<HTMLAnchorElement>('#hpFlags a')];
    expect(flags.map((f) => f.textContent)).toEqual(['Look-alike #12', 'Ring farming pair']);
    expect(flags.every((f) => f.getAttribute('href') === '#m/waitOld')).toBe(true);
    expect((document.getElementById('hpText') as HTMLTextAreaElement).value).toBe('Your code is sent. Look under My prizes.');
    expect(document.getElementById('hpState')?.textContent).toContain('1-hour promise at risk');
    expect(THAI.test(chromeText())).toBe(false);
  });

  it('Send: unchanged draft sends Sonnet Thai via kr8_admin_team_reply_en and shows the bubble at once', async () => {
    const { mod, screen, rpc } = await setup();
    mod.helpPanelView(screen, 'waitOld');
    await flush();
    (document.getElementById('hpSend') as HTMLButtonElement).click();
    await flush();
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('kr8_admin_team_reply_en', { p_member: 'waitOld', p_body: 'โค้ดส่งแล้วครับ ดูที่รางวัลของฉันนะครับ', p_body_en: 'Your code is sent. Look under My prizes.' });
    const all = [...document.querySelectorAll('.hp-b')]; const last = all[all.length - 1];
    expect(last.className).toContain('team');
    expect(last.querySelector('.hp-b-en')?.textContent).toBe('EN: Your code is sent. Look under My prizes.');
    expect(document.getElementById('hpStatus')?.textContent).toBe('Sent as Kring Team ✓ · message #99');
    expect((document.getElementById('hpText') as HTMLTextAreaElement).value).toBe('');
  });

  it('Send: a server refusal shows a red "Not sent — reason", never "Sent"', async () => {
    const { mod, screen, rpc } = await setup();
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation((async (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'kr8_admin_team_reply_en') throw new Error('KR8_ADMIN_ONLY');
      return (base as (f: string, a?: Record<string, unknown>) => unknown)(fn, args);
    }) as never);
    mod.helpPanelView(screen, 'waitOld');
    await flush();
    (document.getElementById('hpSend') as HTMLButtonElement).click();
    await flush();
    const st = document.getElementById('hpStatus')!;
    expect(st.className).toContain('bad');
    expect(st.textContent).toMatch(/^Not sent — your admin sign-in has expired/);
    expect((document.getElementById('hpSend') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Send: an id with no saved row is "Not sent", not "Sent"', async () => {
    const { mod, screen, rpc } = await setup();
    const base = rpc.getMockImplementation()!;
    rpc.mockImplementation((async (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'kr8_admin_team_reply_en') return 12345;   // id came back but the chat has no such message
      return (base as (f: string, a?: Record<string, unknown>) => unknown)(fn, args);
    }) as never);
    mod.helpPanelView(screen, 'waitOld');
    await flush();
    (document.getElementById('hpSend') as HTMLButtonElement).click();
    await flush();
    expect(document.getElementById('hpStatus')?.textContent).toBe('Not sent — the server did not save the message. Tap Send again.');
  });

  it('Send: edited English / quick reply is translated to Thai first, then sent', async () => {
    const { mod, screen, rpc } = await setup();
    mod.helpPanelView(screen, 'waitOld');
    await flush();
    (document.querySelector('[data-q="thanks"]') as HTMLButtonElement).click();
    const ta = document.getElementById('hpText') as HTMLTextAreaElement;
    expect(ta.value).toBe('Thanks for your message! The team is checking this and will reply here soon.');
    (document.getElementById('hpSend') as HTMLButtonElement).click();
    await flush();
    expect(invoke).toHaveBeenCalledWith('kr8-help-ai', { body: { mode: 'translate_reply', text_en: ta.value || 'Thanks for your message! The team is checking this and will reply here soon.', lang: 'th' } });
    expect(rpc).toHaveBeenCalledWith('kr8_admin_team_reply_en', { p_member: 'waitOld', p_body: 'แปลเป็นไทยแล้วครับ', p_body_en: 'Thanks for your message! The team is checking this and will reply here soon.' });
  });

  it('auto-refresh every 20 s keeps what the founder typed', async () => {
    const { mod, screen, rpc } = await setup();
    mod.helpPanelView(screen, 'waitOld');
    await flush();
    const ta = document.getElementById('hpText') as HTMLTextAreaElement;
    ta.value = 'Half-typed answer'; ta.dispatchEvent(new Event('input'));
    const calls = rpc.mock.calls.filter((c) => c[0] === 'kr8_admin_help_thread').length;
    vi.advanceTimersByTime(20_000);
    await flush();
    expect(rpc.mock.calls.filter((c) => c[0] === 'kr8_admin_help_thread').length).toBe(calls + 1);
    expect((document.getElementById('hpText') as HTMLTextAreaElement).value).toBe('Half-typed answer');
  });

  it('before 0120 is applied: falls back to the waiting cases', async () => {
    const { mod, screen, rpc } = await setup();
    rpc.mockImplementation((async (fn: string) => {
      if (fn === 'kr8_admin_help_threads') throw new Error('Could not find the function public.kr8_admin_help_threads');
      if (fn === 'kr8_admin_help_cases') return [{ thread_id: 't', member: 'm1', member_no: 3, name: 'Joob', photo: null, verified: false, test: false, waiting_since: iso(5), last_at: iso(5), unanswered: 1,
        question: '[Help] สวัสดีค่ะ', messages: ['[Help] สวัสดีค่ะ'], history: [{ from: 'member', body: '[Help] สวัสดีค่ะ', at: iso(5), translation_en: 'Hello.' }] }];
      return null;
    }) as never);
    mod.helpPanelView(screen);
    await flush();
    expect(document.querySelectorAll('.hp-row')).toHaveLength(1);
    expect(document.querySelector('.hp-prev')?.textContent).toBe('Hello.');
    expect(document.getElementById('hpNote')?.textContent).toContain('0120');
  });
});
