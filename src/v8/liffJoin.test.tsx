// Invite join sheet: "Join with LINE" opens the LINE app via liff.line.me when the build has a LIFF ID and we are not in LINE.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

vi.mock('./lineEnv', async () => {
  const real = await vi.importActual<typeof import('./lineEnv')>('./lineEnv');
  return { ...real, lineChannel: () => '2012552357', liffUrl: (ref?: string | null) => real.liffUrl(ref, '2012552357-AbCd1234') };
});
const signInLine = vi.hoisted(() => vi.fn(async () => 'redirect' as const));
vi.mock('./v5Live', async () => ({ ...(await vi.importActual<typeof import('./v5Live')>('./v5Live')), v5SignInLine: signInLine }));

const L = (s: string) => s;
const Lf = (s: string, a: string) => s.replace('{0}', a);
const IG = 'Mozilla/5.0 (iPhone) Instagram 300.0';
const LINE = 'Mozilla/5.0 (iPhone) Line/14.19.0';

describe('Join with LINE + LIFF', () => {
  const orig = window.location;
  const assign = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('kr8_ref', 'pich');
    assign.mockReset();
    signInLine.mockClear();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, origin: 'https://kringapp.com', pathname: '/app/', search: '?ref=pich', assign } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });
  const tap = async (ua: string) => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
    const { V5SignInSheet } = await import('./V5Sheets');
    const r = render(<V5SignInSheet L={L} Lf={Lf} onClose={() => undefined} invitedBy="pich" />);
    fireEvent.click(r.container.querySelector('#v5LineBtn')!);
    await new Promise((ok) => setTimeout(ok, 20));
    r.unmount();
  };

  it('LIFF build, Instagram browser → https://liff.line.me/<id>?ref=pich (opens the LINE app)', async () => {
    vi.stubEnv('VITE_LIFF_ID', '2012552357-AbCd1234');
    await tap(IG);
    expect(assign).toHaveBeenCalledWith('https://liff.line.me/2012552357-AbCd1234?ref=pich');
    expect(signInLine).not.toHaveBeenCalled();
  });
  it('LIFF build, inside LINE → the one-tap web login stays', async () => {
    vi.stubEnv('VITE_LIFF_ID', '2012552357-AbCd1234');
    await tap(LINE);
    expect(signInLine).toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
  it('no LIFF ID → exactly the old behaviour (web login) everywhere', async () => {
    vi.stubEnv('VITE_LIFF_ID', '');
    await tap(IG);
    expect(signInLine).toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
