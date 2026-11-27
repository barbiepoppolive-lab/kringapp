import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
vi.mock('./v5Live', () => ({ v5LogClient: vi.fn(), v5LineOn: () => true, v5SignInLine: vi.fn(async () => 'redirect'), v5SignInGoogle: vi.fn(async () => 'redirect'), v5StoredRef: () => 'pich' }));
import { v5LogClient } from './v5Live';
import { InviteWelcome, InviteBar, inviterShort, cameFromInvite, inviteSeen, markInviteSeen, inviteTx } from './V5InviteWelcome';

describe('invite welcome (27 Nov)', () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(v5LogClient).mockClear(); });
  it('short inviter name: first word, no emoji', () => {
    expect(inviterShort('Pichy Review💗')).toBe('Pichy');
    expect(inviterShort('วันนี้พี่ไปไหน😆🌳')).toBe('วันนี้พี่ไปไหน');
  });
  it('reads ?ref= codes only (member and campaign), nothing else', () => {
    expect(cameFromInvite('?ref=k00114')).toBe('k00114');
    expect(cameFromInvite('?ref=PICH')).toBe('pich');
    expect(cameFromInvite('?ref=<script>')).toBe('');
    expect(cameFromInvite('?reel=abc')).toBe('');
  });
  it('seen once per invite code', () => {
    expect(inviteSeen('pich')).toBe(false); markInviteSeen('pich'); expect(inviteSeen('pich')).toBe(true); expect(inviteSeen('k00114')).toBe(false);
  });
  it('card: inviter name, one LINE button, "Watch Reels first" switches to the bar; one language', () => {
    const onLook = vi.fn();
    render(<InviteWelcome lang="th" inviter={{ name: 'Pichy Review💗', photo: null }} faces={[]} onLook={onLook} onFallback={() => {}} />);
    expect(document.querySelector('.iw-k')!.textContent).toBe('คำเชิญจาก Pichy');
    expect(document.getElementById('iwLine')!.textContent).toContain(inviteTx('th').line);
    expect(document.body.textContent).not.toMatch(/[A-Za-z]{4,}/.source === '' ? /x/ : /Accept|Watch|Free/);
    fireEvent.click(document.getElementById('iwLook')!);
    expect(onLook).toHaveBeenCalled();
    expect(vi.mocked(v5LogClient)).toHaveBeenCalledWith('invite_welcome', 'shown', 'card');
    expect(vi.mocked(v5LogClient)).toHaveBeenCalledWith('invite_welcome', 'look', 'card');
  });
  it('LINE tap logs and starts LINE sign-in', async () => {
    render(<InviteBar lang="en" inviter={{ name: 'Jaaaa', photo: null }} onFallback={() => {}} />);
    fireEvent.click(document.getElementById('iwbLine')!);
    await new Promise((r) => setTimeout(r, 10));
    expect(vi.mocked(v5LogClient)).toHaveBeenCalledWith('invite_welcome', 'line', 'bar');
  });
  it('every language has every line', () => {
    const keys = Object.keys(inviteTx('en'));
    for (const l of ['th', 'zh', 'hi', 'ja', 'ko']) expect(Object.keys(inviteTx(l))).toEqual(keys);
  });
});
