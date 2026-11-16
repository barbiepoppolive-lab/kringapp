// 16 Nov: website "Install" goes straight to the install step (never "Make your card" first) + ghost mode (0061) client parts.
// The ghost rules themselves live in SQL and are tested in supabase/tests/0061_ghost_test.sql (scratch Postgres, 48 checks).
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { A2HSBanner, installAskIn, resetInstallAsk, takeInstallAsk } from './A2HS';
import { V5_L, v5ErrText } from './v5Strings';
import { GHOST_HIDES, isGhostMe } from '../venue/adminApp';

const L = (s: string) => s;
const go = (path: string) => history.replaceState(null, '', path);

describe('?install=1 from the website', () => {
  beforeEach(() => { resetInstallAsk(); localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { go('/'); resetInstallAsk(); });
  it('reads the flag from a link', () => {
    expect(installAskIn('https://kringapp.com/app/?install=1')).toBe(true);
    expect(installAskIn('https://kringapp.com/app/?install=1&ref=mint')).toBe(true);
    expect(installAskIn('https://kringapp.com/app/?join=1')).toBe(false);
    expect(installAskIn('not a url')).toBe(false);
  });
  it('is taken once, removed from the address bar, and keeps ?ref / ?src', () => {
    go('/app/?install=1&ref=mint&src=tt#x');
    expect(takeInstallAsk()).toBe(true);
    expect(location.search).toBe('?ref=mint&src=tt');
    expect(location.hash).toBe('#x');
    expect(takeInstallAsk()).toBe(true);   // same page load: same answer (the app and the sheet both ask)
  });
  it('without the flag: nothing', () => {
    go('/app/?ref=mint');
    expect(takeInstallAsk()).toBe(false);
    expect(location.search).toBe('?ref=mint');
  });
  it('opens the install sheet at once, even on a first visit with nothing due, and closing it tells the app', () => {
    go('/app/?install=1');
    let closed = 0;
    const r = render(<A2HSBanner L={L} onClose={() => { closed++; }} />);
    expect(r.container.querySelector('#a2hs')).not.toBeNull();
    act(() => { (r.container.querySelector('#a2hsLater') as HTMLButtonElement).click(); });
    expect(r.container.querySelector('#a2hs')).toBeNull();
    expect(closed).toBe(1);
  });
  it('a normal first visit (no flag) shows nothing', () => {
    go('/app/');
    const r = render(<A2HSBanner L={L} />);
    expect(r.container.querySelector('#a2hs')).toBeNull();
  });
});

describe('ghost mode (client side)', () => {
  it('KR8_GHOST has a translated message', () => {
    const [k] = v5ErrText('GHOST');
    expect(k).toMatch(/Ghost mode is on/);
    expect(k in V5_L.th).toBe(true);
    expect(V5_L.th['Ghost mode · nobody can see you']).toBeTruthy();
  });
  it('admin reads the ghost state safely', () => {
    expect(isGhostMe({ card: false })).toBe(true);
    expect(isGhostMe({ card: true, user_id: 'u', first_name: 'Delta', member_no: 7, ghost: true })).toBe(true);
    expect(isGhostMe({ card: true, user_id: 'u' })).toBe(false);
    expect(isGhostMe(null)).toBe(false);
    expect(GHOST_HIDES.length).toBeGreaterThanOrEqual(5);
  });
});
