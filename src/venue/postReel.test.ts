// Admin "Post a Reel": the caption template, the never-use words, and the one-tap share / desktop fallback.
import { describe, expect, it, vi } from 'vitest';
import { bannedIn, fileSize, REEL_CAPTION, shareReel, uploadUrl, type ShareEnv } from './postReel';

const vid = () => new File([new Uint8Array(2048)], 'reel.mp4', { type: 'video/mp4' });

describe('caption template', () => {
  it('has a Thai line, an English line, the link and the three hashtags', () => {
    const lines = REEL_CAPTION.split('\n');
    expect(lines[0]).toMatch(/[฀-๿]/);
    expect(lines[1]).toMatch(/^[\x20-\x7E]+$/);
    expect(REEL_CAPTION).toContain('kringapp.com');
    for (const h of ['#Bangkok', '#Kring', '#กริ๊ง']) expect(REEL_CAPTION).toContain(h);
  });
  it('uses none of the never-use words', () => {
    expect(bannedIn(REEL_CAPTION)).toEqual([]);
  });
  it('catches never-use words he types, without false hits inside other words', () => {
    expect(bannedIn('Meet new friends · a local Tour')).toEqual(['meet', 'tour']);
    expect(bannedIn('a real hidden  gem in Ari')).toEqual(['hidden gem']);
    expect(bannedIn('มาลุ้นกัน')).toEqual(['ลุ้น']);
    expect(bannedIn('ghost mode, Sukhumvit')).toEqual([]);
  });
});

describe('share', () => {
  const env = (o: Partial<ShareEnv> = {}) => ({ copy: vi.fn(), open: vi.fn(), ...o });
  it('phone: copies the caption and opens the share sheet with the video', async () => {
    const share = vi.fn(async () => undefined);
    const e = env({ canShare: () => true, share });
    const f = vid();
    expect(await shareReel('instagram', f, 'cap', e)).toBe('shared');
    expect(e.copy).toHaveBeenCalledWith('cap');
    expect(share).toHaveBeenCalledWith({ files: [f], text: 'cap' });
    expect(e.open).not.toHaveBeenCalled();
  });
  it('closing the share sheet is not "posted"', async () => {
    const e = env({ canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
    expect(await shareReel('youtube', vid(), 'cap', e)).toBe('cancelled');
  });
  it('desktop: copies the caption and opens the upload page', async () => {
    const e = env({ canShare: () => false, share: vi.fn() });
    expect(await shareReel('x', vid(), 'Hi #Kring', e)).toBe('opened');
    expect(e.open).toHaveBeenCalledWith('https://x.com/compose/post?text=Hi%20%23Kring');
    expect(e.copy).toHaveBeenCalled();
  });
  it('no video picked → nothing happens', async () => {
    const e = env();
    expect(await shareReel('instagram', null, 'cap', e)).toBe('nofile');
    expect(e.open).not.toHaveBeenCalled();
  });
  it('upload pages and sizes', () => {
    expect(uploadUrl('instagram', '')).toBe('https://www.instagram.com/');
    expect(uploadUrl('youtube', '')).toBe('https://studio.youtube.com/channel/UC/videos/upload?d=ud');
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(5.25 * 1024 * 1024)).toBe('5.3 MB');
  });
});
