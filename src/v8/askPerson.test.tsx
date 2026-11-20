import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createAskApi, resetAskLocal, type AskPerson } from './askThai';
import { AskThaiView } from './V5AskThai';

const me: AskPerson = { id: 'me', name: 'Mint', photo: '/x.jpg', local: true };
const L = (en: string) => en;

describe('Ask a Thai: a name or photo opens the profile (20 Nov)', () => {
  it('question author on the card and answer authors in the thread call onPerson; the card itself still opens the thread', async () => {
    resetAskLocal?.();
    const api = createAskApi({ live: false, demo: true, me: () => me });
    const hits: string[] = [];
    render(<div className="v8-app-root"><AskThaiView L={L} api={api} me={me} areas={['Bangkok']} areaLabel={(a) => a} need={(f) => f()} toast={() => {}}
      onPerson={(p) => hits.push(p.id)} /></div>);
    await screen.findByText(/Best time to visit So Heng Tai/);
    const btns = document.querySelectorAll<HTMLButtonElement>('.at-tw .at-pbtn');
    expect(btns.length).toBeGreaterThan(0);
    fireEvent.click(btns[0]);
    expect(hits.length).toBe(1);
    expect(document.querySelector('.at-thread')).toBeNull();          // the name tap did not open the thread
    fireEvent.click(screen.getByText(/Best time to visit So Heng Tai/));
    await screen.findByText('★ Best');
    const inThread = document.querySelectorAll<HTMLButtonElement>('.at-thread .at-pbtn');
    expect(inThread.length).toBeGreaterThan(2);
    fireEvent.click(document.querySelector<HTMLButtonElement>('.at-thread .at-c .at-pbtn')!);
    expect(hits.length).toBe(2);
  });
});
