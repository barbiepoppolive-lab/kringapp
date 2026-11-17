/** Founder rule (18 Nov): ONE language at a time on member screens. Kring Helper: Thai mode = Thai only, English mode = English only. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { HELP_UI, HelpMeRow, HelpSheet } from './V5Help';

const latin = /[A-Za-z]{3,}/;
const thaiChars = /[฀-๿]/;
const noop = async () => {};
// jsdom has no Element.scrollTo (the helper scrolls the newest question to the top)
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

describe('Kring Helper shows one language at a time', () => {
  it('Thai mode: no English line under Thai, header + placeholder Thai only', () => {
    const { container } = render(<HelpSheet lang="th" name="Pim" onClose={() => {}} onTeam={noop} />);
    expect(container.querySelectorAll('[lang="en"]').length).toBe(0);
    expect(container.querySelector('.hp-who b')?.textContent).toBe(HELP_UI.title[0]);
    expect((container.querySelector('#helpInput') as HTMLInputElement).placeholder).toBe(HELP_UI.placeholder[0]);
    // FAQ content is kept: tap a chip, the Thai answer card shows, with no English under it
    fireEvent.click(container.querySelector('.hp-chip') as HTMLElement);
    const card = container.querySelector('[data-answer]') as HTMLElement;
    expect(card.textContent).toMatch(thaiChars);
    expect(card.querySelectorAll('[lang="en"], small.en').length).toBe(0);
  });
  it('English mode: no Thai anywhere', () => {
    const { container } = render(<HelpSheet lang="en" name="Pim" onClose={() => {}} onTeam={noop} />);
    expect(container.querySelectorAll('[lang="th"]').length).toBe(0);
    expect(container.textContent).not.toMatch(thaiChars);
    fireEvent.click(container.querySelector('.hp-chip') as HTMLElement);
    expect((container.querySelector('[data-answer]') as HTMLElement).textContent).not.toMatch(thaiChars);
  });
  it('Me row: Thai only in Thai mode, English only in English mode', () => {
    const th = render(<HelpMeRow lang="th" onOpen={() => {}} />).container;
    expect(th.textContent).toMatch(thaiChars);
    expect(th.textContent).not.toMatch(latin);
    const en = render(<HelpMeRow lang="en" onOpen={() => {}} />).container;
    expect(en.textContent).not.toMatch(thaiChars);
  });
});

describe('0105 Help → founder email', () => {
  const sql = readFileSync('supabase/migrations/0105_kr8_help_email_alert.sql', 'utf8');
  it('reuses the notify-new-member hook (pg_net + vault secret), member [Help] messages only, never blocks', () => {
    expect(sql).toContain("vault.decrypted_secrets where name = 'notify_hook_secret'");
    expect(sql).toContain('net.http_post');
    expect(sql).toContain('/functions/v1/notify-new-member');
    expect(sql).toContain("'table', 'kr8_help_message'");
    expect(sql).toContain("like '[Help]%'");
    expect(sql).toContain('if public.kr8_is_team(new.sender) then return new; end if;');
    expect(sql).toContain('kr8_is_test_member(new.sender)');
    expect(sql).toMatch(/exception when others then\s+return new;/);
    expect(sql).toContain('UNDO');
  });
  it('the edge function has the kr8_help_message branch', () => {
    const fn = readFileSync('supabase/functions/notify-new-member/index.ts', 'utf8');
    expect(fn).toContain('p.table === "kr8_help_message"');
  });
});
