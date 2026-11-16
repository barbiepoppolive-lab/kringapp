/* 17 Nov real-phone fixes: refresh keeps the tab, Reel sound is remembered with a "Tap for sound" hint, posters never blank. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { restoredTab, rememberTab } from './tabMemory';
import { _resetSound, rememberSound, soundHintWanted, soundWanted } from './reelSound';
import { V5ReelVideo, toggleReelSound } from './V5ReelVideo';
import { V5ShareCard, cardNo } from './V5ShareCard';

class IO { cb: IntersectionObserverCallback; constructor(cb: IntersectionObserverCallback) { this.cb = cb; } observe() { /* noop */ } disconnect() { /* noop */ } unobserve() { /* noop */ } takeRecords() { return []; } }
beforeEach(() => { vi.stubGlobal('IntersectionObserver', IO); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); sessionStorage.clear(); } catch { /* */ } _resetSound(); });

describe('refresh keeps the tab', () => {
  it('remembers the last tab for this browser tab', () => {
    expect(restoredTab('')).toBeNull();
    rememberTab('me');
    expect(restoredTab('')).toBe('me');
    expect(restoredTab('?src=pwa')).toBe('me');
  });
  it('deep links win over the remembered tab', () => {
    rememberTab('me');
    for (const q of ['?tab=deals', '?reel=12', '?deal=trip', '?person=Joob', '?post=5']) expect(restoredTab(q)).toBeNull();
  });
  it('ignores junk and blocked storage', () => {
    sessionStorage.setItem('kr8-tab', 'admin');
    expect(restoredTab('')).toBeNull();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberTab('people')).not.toThrow();
    expect(restoredTab('')).toBeNull();
    get.mockRestore(); set.mockRestore();
  });
});

describe('Reel sound is remembered', () => {
  it('never tapped: muted with the hint; tapped on: sound wanted, no longer "never"', () => {
    expect(soundWanted()).toBe(false);
    expect(soundHintWanted()).toBe(true);
    rememberSound(true);
    expect(soundWanted()).toBe(true);
    expect(localStorage.getItem('kr8-sound')).toBe('1');
    rememberSound(false);
    expect(soundWanted()).toBe(false);
    expect(soundHintWanted()).toBe(false);
  });
  it('works for the page even when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => rememberSound(true)).not.toThrow();
    expect(soundWanted()).toBe(true);
    get.mockRestore(); set.mockRestore();
  });
  it('the badge says "Tap for sound" until the first tap, then the tap is remembered', () => {
    const { container } = render(
      <div className="slide" onClick={(e) => toggleReelSound(e)}>
        <V5ReelVideo src="/v.mp4" poster="/p.jpg" first label="Reel" soundHint="แตะเพื่อเปิดเสียง" />
      </div>,
    );
    expect(container.querySelector('.reel-sound-hint')?.textContent).toBe('แตะเพื่อเปิดเสียง');
    const v = container.querySelector('video') as HTMLVideoElement;
    v.muted = true;
    vi.spyOn(v, 'play').mockResolvedValue(undefined);
    act(() => { fireEvent.click(v); });
    expect(v.muted).toBe(false);
    expect(localStorage.getItem('kr8-sound')).toBe('1');
    expect(container.querySelector('.reel-sound-hint')).toBeNull();
  });
});

describe('iPhone never shows a blank Reel stage (K-003)', () => {
  it('the first Reel has the poster on the video AND as the stage background', () => {
    const { container } = render(<V5ReelVideo src="/v.mp4" poster="/p.jpg" first label="Reel" />);
    expect(container.querySelector('video')?.getAttribute('poster')).toBe('/p.jpg');
    expect((container.querySelector('.reel-bg') as HTMLElement).style.backgroundImage).toContain('/p.jpg');
  });
});

describe('Share card is a clean member pass', () => {
  it('shows name, member no., a white QR of the profile link, and Save image + Share', () => {
    const onShare = vi.fn();
    render(<V5ShareCard L={(x) => x} p={{ name: 'Arm', no: '184', photo: null, who: 'local', link: 'https://test.kringapp.pages.dev/app/?person=u1' }} onShare={onShare} onSaved={vi.fn()} />);
    const card = document.getElementById('shareCardPass')!;
    expect(card.querySelector('[data-sc="name"]')!.textContent).toBe('Arm');
    expect(card.querySelector('[data-sc="no"]')!.textContent).toBe('#00184');
    expect(card.querySelector('[data-qr]')!.getAttribute('data-qr')).toBe('https://test.kringapp.pages.dev/app/?person=u1');
    expect(card.textContent).toContain('Bangkok local');
    expect(document.getElementById('shareCardSave')!.textContent).toBe('Save image');
    fireEvent.click(document.getElementById('myCodeShare')!);
    expect(onShare).toHaveBeenCalledTimes(1);
  });
  it('member number is always 5 digits or a dash', () => {
    expect(cardNo(7)).toBe('#00007');
    expect(cardNo('#00184')).toBe('#00184');
    expect(cardNo(null)).toBe('#—');
  });
});
