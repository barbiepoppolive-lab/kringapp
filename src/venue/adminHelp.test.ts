// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { HELP_RISK_MIN, helpQuestion, helpUrgency, helpWaitLabel, sortHelpCases, type HelpCase } from './adminHelpLogic';

vi.mock('./shared', async () => {
  const el = (tag: string, attrs: Record<string, unknown> = {}, ...kids: unknown[]) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === undefined || v === false) continue; if (k === 'class') n.className = String(v); else n.setAttribute(k, v === true ? '' : String(v)); }
    for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k as Node | string);
    return n;
  };
  return { el, rpc: vi.fn(async () => 7) };
});

const now = Date.parse('2026-11-18T10:00:00Z');
const mk = (min: number, extra: Partial<HelpCase> = {}): HelpCase => ({
  thread_id: 't' + min, member: 'm' + min, member_no: 500 + min, name: 'Kaew', photo: null, verified: false, test: false,
  waiting_since: new Date(now - min * 60_000).toISOString(), last_at: new Date(now).toISOString(), unanswered: 1,
  question: '[Help] Shared my link on LINE, why no Rings?', messages: ['[Help] Shared my link on LINE, why no Rings?'],
  history: [{ from: 'member', body: '[Help] Shared my link on LINE, why no Rings?', at: new Date(now - min * 60_000).toISOString() }], ...extra,
});

describe('admin Help cases', () => {
  it('turns red after 45 minutes and is "missed" after an hour', () => {
    expect(helpUrgency(mk(10), now)).toBe('ok');
    expect(helpUrgency(mk(HELP_RISK_MIN), now)).toBe('ok');
    expect(helpUrgency(mk(46), now)).toBe('risk');
    expect(helpUrgency(mk(61), now)).toBe('late');
    expect(helpWaitLabel(mk(75), now)).toBe('waiting 1 h 15 min');
  });
  it('strips the [Help] tag and sorts oldest first, test members last', () => {
    expect(helpQuestion('[Help] why no Rings?')).toBe('why no Rings?');
    expect(helpQuestion('[Help] ')).toBe('(no question typed)');
    const s = sortHelpCases([mk(5), mk(50, { test: true }), mk(30)]);
    expect(s.map((c) => c.member)).toEqual(['m30', 'm5', 'm50']);
  });
  it('renders one self-contained card with the question, red risk line and a reply-as-team box (silent fallback when no AI draft)', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const { helpCaseCard } = await import('./adminHelp');
    const shared = await import('./shared');
    vi.mocked(shared.rpc).mockClear();
    const card = helpCaseCard(mk(50));
    expect(card.dataset.urgency).toBe('risk');
    expect(card.textContent).toContain('Shared my link on LINE, why no Rings?');
    expect(card.textContent).not.toContain('[Help]');
    expect(card.textContent).toContain('1-hour promise at risk');
    expect(card.querySelector('.hpa-suggest-hd')).toBeNull();
    (card.querySelector('textarea') as HTMLTextAreaElement).value = 'LINE opens don’t count ครับ';
    (card.querySelector('.hpa-send') as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    expect(shared.rpc).toHaveBeenCalledWith('kr8_admin_team_reply_en', { p_member: 'm50', p_body: 'LINE opens don’t count ครับ', p_body_en: 'LINE opens don’t count ครับ' });
    vi.useRealTimers();
  });
  it('T-402 Help AI: shows English translation under every Thai line and prefills editable Suggested reply without auto-sending', async () => {
    const { helpCaseCard } = await import('./adminHelp');
    const shared = await import('./shared');
    vi.mocked(shared.rpc).mockClear();
    const card = helpCaseCard(mk(12, {
      member: 'm74',
      member_no: 74,
      name: 'พลอยนภัส',
      unanswered: 3,
      unanswered_items: [
        { id: 38, body: 'ขอบคุณค่ะ', translation_en: 'Thank you.' },
        { id: 41, body: '[Help] ตรวจให้หน่อยค่ะ', translation_en: 'Please check it for me.' },
        { id: 42, body: 'ตรวจคลิปให้ทีนะคะ', translation_en: 'Please check my clip.', suggested_reply: 'คลิปล่าสุดของคุณอนุมัติขึ้นฟีดเรียบร้อยแล้วครับ ขอบคุณมากนะครับ' },
      ],
      suggested_reply: 'คลิปล่าสุดของคุณอนุมัติขึ้นฟีดเรียบร้อยแล้วครับ ขอบคุณมากนะครับ',
      suggested_reply_en: 'Your latest clip is approved and live on the feed. Thank you!',
      history: [
        { id: 38, from: 'member', body: 'ขอบคุณค่ะ', at: new Date(now - 12 * 60_000).toISOString(), translation_en: 'Thank you.' },
        { id: 41, from: 'member', body: '[Help] ตรวจให้หน่อยค่ะ', at: new Date(now - 6 * 60_000).toISOString(), translation_en: 'Please check it for me.' },
        { id: 42, from: 'member', body: 'ตรวจคลิปให้ทีนะคะ', at: new Date(now - 5 * 60_000).toISOString(), translation_en: 'Please check my clip.' },
      ],
    }));

    // English translations appear under every Thai line in both unanswered quotes and Chat so far
    const qEn = [...card.querySelectorAll('.hpa-q .hpa-en')].map((n) => n.textContent);
    expect(qEn).toEqual(['EN: Thank you.', 'EN: Please check it for me.', 'EN: Please check my clip.']);
    const histEn = [...card.querySelectorAll('.hpa-hist .hpa-en')].map((n) => n.textContent);
    expect(histEn).toEqual(['EN: Thank you.', 'EN: Please check it for me.', 'EN: Please check my clip.']);

    // Suggested reply box is prefilled, never auto-sent, and editable before tapping Send as Kring Team
    expect(card.querySelector('.hpa-suggest-hd')?.textContent).toContain('Suggested reply');
    const ta = card.querySelector('textarea') as HTMLTextAreaElement;
    // founder reads and edits ENGLISH only; the unchanged English draft sends Sonnet's Thai version
    expect(ta.value).toBe('Your latest clip is approved and live on the feed. Thank you!');
    expect(/[\u0E00-\u0E7F]/.test(card.querySelector('.hpa-suggest-hd')?.textContent || '')).toBe(false);
    expect(shared.rpc).not.toHaveBeenCalled();
    (card.querySelector('.hpa-send') as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(shared.rpc).toHaveBeenCalledWith('kr8_admin_team_reply_en', { p_member: 'm74', p_body: 'คลิปล่าสุดของคุณอนุมัติขึ้นฟีดเรียบร้อยแล้วครับ ขอบคุณมากนะครับ', p_body_en: 'Your latest clip is approved and live on the feed. Thank you!' });
  });
});
