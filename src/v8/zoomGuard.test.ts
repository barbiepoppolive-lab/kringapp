import { describe, expect, it, vi } from 'vitest';
import { installZoomGuard } from './zoomGuard';

describe('F · pinch on a Reel snaps the page back to 100%', () => {
  it('adds maximum-scale=1 after a zoomed touch on a Reel, then restores the meta', () => {
    vi.useFakeTimers();
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">';
    document.body.innerHTML = '<section id="s-feed"><video id="v"></video></section><p id="txt">x</p>';
    const vv = { scale: 2 };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    const off = installZoomGuard(window);
    const meta = document.querySelector('meta')!;
    const touch = (type: string, el: Element, n: number) => { const e = new Event(type, { bubbles: true }) as TouchEvent; Object.defineProperty(e, 'touches', { value: { length: n } }); el.dispatchEvent(e); };
    touch('touchstart', document.getElementById('v')!, 1);
    touch('touchend', document.getElementById('v')!, 0);
    expect(meta.getAttribute('content')).toContain('maximum-scale=1');
    vi.advanceTimersByTime(400);
    expect(meta.getAttribute('content')).not.toContain('maximum-scale');
    // elsewhere in the app, zoom is left alone (accessibility)
    touch('touchstart', document.getElementById('txt')!, 1);
    touch('touchend', document.getElementById('txt')!, 0);
    expect(meta.getAttribute('content')).not.toContain('maximum-scale');
    off();
    vi.useRealTimers();
  });
});
