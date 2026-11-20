import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { AskText, inTarget } from './askTr';

const invoke = vi.fn(async (_fn: string, o: { body: { items: { kind: string; id: string }[]; target: string } }) =>
  ({ data: { status: 'ok', items: o.body.items.map((i) => ({ ...i, status: 'ok', text: 'Let me think about it first' })) } }));
vi.mock('./v5Live', () => ({ v5Client: async () => ({ functions: { invoke } }) }));
const L = (s: string) => s;

describe('Ask BKK in one language (20 Nov)', () => {
  it('knows when a text is already in the reader’s language', () => {
    expect(inTarget('How do Thais say no?', 'en')).toBe(true);
    expect(inTarget('What does เกรงใจ look like in everyday life?', 'en')).toBe(true);   // one quoted Thai word
    expect(inTarget('ขอคิดดูก่อนนะคะ', 'en')).toBe(false);
    expect(inTarget('ขอคิดดูก่อนนะคะ', 'th')).toBe(true);
    expect(inTarget('Bring fruit', 'th')).toBe(false);
  });
  it('shows the original first, then the translation with "Translated · See original"', async () => {
    localStorage.setItem('kr8_lang', 'en');
    render(<AskText L={L} kind="a" id="00000000-0000-0000-0000-00000000000a" text="ขอคิดดูก่อนนะคะ" toggle />);
    expect(screen.getByText('ขอคิดดูก่อนนะคะ')).toBeTruthy();   // never waits
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(screen.getByText('Let me think about it first')).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith('kr8-ask-translate', { body: { items: [{ kind: 'a', id: '00000000-0000-0000-0000-00000000000a' }], target: 'en' } });
    fireEvent.click(screen.getByText('Translated · See original'));
    expect(screen.getByText('ขอคิดดูก่อนนะคะ')).toBeTruthy();
    expect(screen.getByText('See translation')).toBeTruthy();
  });
  it('an English text in English mode is not sent anywhere', () => {
    invoke.mockClear();
    render(<AskText L={L} kind="a" id="00000000-0000-0000-0000-00000000000b" text="Bring a fruit basket" toggle />);
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByText(/Translated/)).toBeNull();
  });
});
