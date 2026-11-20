/* 0183/0184 batch (20 Nov): bio rules (same as the server's kr8_bio_ok), first tap turns Reel sound on, private follower lists. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { bioProblem } from './bioRules';
import { _resetSound, armFirstTapSound, rememberSound, soundNeverTapped, soundWanted } from './reelSound';
import { GoProfilePage } from './V5Go';

describe('bio: max 80, no phone numbers / links / LINE IDs', () => {
  it('blocks what the server blocks, lets normal lines through', () => {
    for (const ok of ['Coffee walks, street food, sunset spots', 'ชอบกาแฟ เดินเล่น ถ่ายรูป', 'Waiting in line for mango sticky rice', 'Born 1999, 3 cats', 'Love Line Friends store', ''])
      expect(bioProblem(ok)).toBeNull();
    expect(bioProblem('Call me 081-234-5678')).toBe('phone');
    expect(bioProblem('โทร ๐๘๑๒๓๔๕๖๗๘')).toBe('phone');
    expect(bioProblem('081 234 5678')).toBe('phone');
    expect(bioProblem('visit kringapp.com')).toBe('link');
    expect(bioProblem('https://x.y')).toBe('link');
    expect(bioProblem('line id: kring99')).toBe('line');
    expect(bioProblem('ไลน์ kring99')).toBe('line');
    expect(bioProblem('add line abc123')).toBe('line');
    expect(bioProblem('ig @kringapp')).toBe('line');
    expect(bioProblem('x'.repeat(81))).toBe('long');
  });
  it('the server rule is in migration 0183 and kr8_save_card uses it', () => {
    const sql = readFileSync('supabase/migrations/0183_bio_ask_bkk.sql', 'utf8');
    expect(sql).toContain('create or replace function public.kr8_bio_ok');
    expect(sql).toContain("not public.kr8_bio_ok(p_bio) then raise exception 'KR8_BAD_BIO'");
    expect(sql).toContain('create or replace function public.kr8_set_bio');
  });
});

describe('Reel sound: the first tap anywhere turns it on for good', () => {
  it('first tap → on and remembered; a choice made by that tap (mute button) is kept', () => {
    _resetSound(); try { localStorage.removeItem('kr8-sound'); } catch { /* */ }
    expect(soundNeverTapped()).toBe(true);
    const off = armFirstTapSound();
    fireEvent.click(document.body);
    expect(soundWanted()).toBe(true);
    off();
    _resetSound(); localStorage.removeItem('kr8-sound');
    const off2 = armFirstTapSound();
    const b = document.createElement('button'); b.onclick = () => rememberSound(false); document.body.appendChild(b);
    fireEvent.click(b);
    expect(soundWanted()).toBe(false);
    off2();
  });
  it('works when storage is blocked (in-memory fallback)', () => {
    _resetSound();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const off = armFirstTapSound();
    fireEvent.click(document.body);
    expect(soundWanted()).toBe(true);
    off(); get.mockRestore(); set.mockRestore();
  });
});

describe('followers & following: "Only me"', () => {
  const L = (s: string) => s; const Lf = (s: string, a: string) => s.replace('{0}', a);
  const p = { user_id: 'u1', first_name: 'Ploy', photo: null, langs: ['TH'], bio: '', area: 'Ari', who: 'local' as const, verified: true, ig_handle: null, interests: [],
    member_no: 'KR 1', online: false, here: false, mine: false, level: { level: 'tea' as const, posts: 0, visits: 0, points: 0, next: null, need_points: 0, pct: 0 },
    followers: 12, following: 7, likes: 0, gifts: 0, i_follow: false, follows_me: false, reels: [], lists_private: true };
  const page = (extra: object) => render(<GoProfilePage L={L} Lf={Lf} lang="en" p={p} kx={null} reels={{ reels: [] } as never} busy={false} onBack={vi.fn()} onFollow={vi.fn()}
    onHi={vi.fn()} onReport={vi.fn()} onBlock={vi.fn()} onShare={vi.fn()} onOpen={vi.fn()} onMath={vi.fn()} {...extra as { onList: () => void }} />);
  it('counts stay; a tap shows the glass note instead of the list', () => {
    const onList = vi.fn(); page({ onList });
    expect(document.getElementById('profileFollowers')!.textContent).toBe('12');
    fireEvent.click(document.getElementById('profileFollowers')!.closest('button')!);
    expect(onList).not.toHaveBeenCalled();
    expect(screen.getByText('This member keeps their list private')).toBeTruthy();
  });
  it('the admin still opens the list; the server refuses other viewers (0184)', () => {
    const onList = vi.fn(); page({ onList, adminSees: true });
    fireEvent.click(document.getElementById('profileFollowing')!.closest('button')!);
    expect(onList).toHaveBeenCalledWith('following');
    const sql = readFileSync('supabase/migrations/0184_lists_private.sql', 'utf8');
    expect(sql).toContain("raise exception 'KR8_LIST_PRIVATE'");
    expect(sql).toContain('not public.kr8_is_admin()');
  });
});
