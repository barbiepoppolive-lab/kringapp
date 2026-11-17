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
  it('renders one self-contained card with the question, red risk line and a reply-as-team box', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const { helpCaseCard } = await import('./adminHelp');
    const shared = await import('./shared');
    const card = helpCaseCard(mk(50));
    expect(card.dataset.urgency).toBe('risk');
    expect(card.textContent).toContain('Shared my link on LINE, why no Rings?');
    expect(card.textContent).not.toContain('[Help]');
    expect(card.textContent).toContain('1-hour promise at risk');
    (card.querySelector('textarea') as HTMLTextAreaElement).value = 'LINE opens don’t count ครับ';
    (card.querySelector('.hpa-send') as HTMLButtonElement).click();
    await Promise.resolve(); await Promise.resolve();
    expect(shared.rpc).toHaveBeenCalledWith('kr8_admin_team_reply', { p_member: 'm50', p_body: 'LINE opens don’t count ครับ' });
    vi.useRealTimers();
  });
});
