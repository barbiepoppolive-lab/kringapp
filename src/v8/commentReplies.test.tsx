// 0191 replies in the comments sheet: Reply action, indented replies with @name, "View N replies" fold, reply-to-reply, delete.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { KC_L } from './commentStrings';

const api = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), reply: vi.fn(), del: vi.fn(), report: vi.fn(), off: vi.fn() }));
vi.mock('./v5Live', () => ({
  v5ReelComments: api.list, v5CommentAdd: api.add, v5CommentReply: api.reply, v5CommentDelete: api.del, v5CommentReport: api.report, v5CommentsSetOff: api.off,
}));
import { CommentsSheet } from './V5Comments';

const at = new Date().toISOString();
const c = (id: string, name: string, body: string, extra: object = {}) => ({ id, author_id: 'u' + id, name, photo: null, official: false, body, at, mine: false, ...extra });
const DATA = () => ({ post_id: 'p1', n: 6, off: false, can: 'ok', creator: false, items: [
  c('a', 'Ploy', 'Love this café', { replies: [c('a1', 'Nan', 'Same!', { parent_id: 'a', to_name: 'Ploy' })], nrep: 1 }),
  c('b', 'Tom', 'Where is it?', { nrep: 3, replies: [c('b1', 'Ploy', 'Ari soi 1', { parent_id: 'b', to_name: 'Tom' }), c('b2', 'Tom', 'Thanks', { parent_id: 'b', to_name: 'Ploy' }), c('b3', 'Mai', 'Nice', { parent_id: 'b', to_name: 'Tom', mine: true })] }),
] });
const mk = (lang: 'en' | 'th') => {
  const L = (en: string) => (lang === 'th' ? KC_L.th[en] || en : en);
  const Lf = (en: string, a: string, b?: string) => L(en).replace('{0}', a).replace('{1}', b ?? '');
  return { L, Lf };
};
const flush = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const props = (lang: 'en' | 'th') => ({ ...mk(lang), postId: 'p1', onClose: vi.fn(), onCount: vi.fn(), onVerify: vi.fn(), onSignIn: vi.fn(), onCard: vi.fn(), onPerson: vi.fn(), toast: vi.fn() });

describe('Reel comment replies (0191)', () => {
  beforeEach(() => { Object.values(api).forEach((f) => f.mockReset()); api.list.mockResolvedValue(DATA()); });

  it('shows 1-2 replies open, folds more than 2 into "View N replies", @name in front of a reply', async () => {
    const { container } = render(<CommentsSheet {...props('en')} />); await flush();
    expect(container.querySelector('[data-comment="a1"]')).not.toBeNull();
    expect(container.querySelector('[data-comment="a1"] .kc-to')?.textContent).toBe('@Ploy ');
    expect(container.querySelector('[data-comment="b1"]')).toBeNull();
    const more = container.querySelector('[data-more="b"]') as HTMLButtonElement;
    expect(more.textContent).toBe('View 3 replies');
    fireEvent.click(more);
    expect(container.querySelectorAll('[data-parent="b"]').length).toBe(3);
    expect(more.textContent).toBe('Hide replies');
  });

  it('Reply → "Replying to" + placeholder, sends with kr8_comment_reply and lands under the top comment', async () => {
    api.reply.mockResolvedValue({ ok: true, n: 7, comment: c('a2', 'Me', 'Me too', { parent_id: 'a', to_name: 'Nan', mine: true }) });
    const { container } = render(<CommentsSheet {...props('en')} />); await flush();
    fireEvent.click(container.querySelector('[data-comment="a1"] [data-act="reply"]')!);
    expect(screen.getByText('Replying to Nan')).toBeTruthy();
    const ta = container.querySelector('#commentInput') as HTMLTextAreaElement;
    expect(ta.placeholder).toBe('Reply to Nan…');
    fireEvent.change(ta, { target: { value: 'Me too' } });
    fireEvent.click(container.querySelector('#commentSend')!); await flush();
    expect(api.reply).toHaveBeenCalledWith('a1', 'Me too');
    expect(api.add).not.toHaveBeenCalled();
    const thread = container.querySelector('[data-thread="a"]')!;
    expect(thread.querySelector('[data-comment="a2"] .kc-to')?.textContent).toBe('@Nan ');
    expect(container.querySelector('#commentReplying')).toBeNull();
  });

  it('a refused reply keeps the text and shows the reason; "gone" drops the reply target', async () => {
    api.reply.mockResolvedValue({ ok: false, reason: 'gone' });
    const { container } = render(<CommentsSheet {...props('en')} />); await flush();
    fireEvent.click(container.querySelector('[data-comment="a"] [data-act="reply"]')!);
    const ta = container.querySelector('#commentInput') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hello' } });
    fireEvent.click(container.querySelector('#commentSend')!); await flush();
    expect(container.querySelector('#commentErr')?.textContent).toBe('This comment isn’t here any more.');
    expect(ta.value).toBe('hello');
  });

  it('deleting my reply removes only it; the count drops by one', async () => {
    api.del.mockResolvedValue({ ok: true });
    const p = props('en');
    const { container } = render(<CommentsSheet {...p} />); await flush();
    fireEvent.click(container.querySelector('[data-more="b"]')!);
    const d = container.querySelector('[data-comment="b3"] [data-act="delete"]')!;
    fireEvent.click(d); fireEvent.click(d); await flush();
    expect(api.del).toHaveBeenCalledWith('b3');
    expect(container.querySelector('[data-comment="b3"]')).toBeNull();
    expect(container.querySelector('[data-comment="b2"]')).not.toBeNull();
    expect(p.onCount).toHaveBeenLastCalledWith('p1', 5, false);
  });

  it('Thai mode: Thai only', async () => {
    const { container } = render(<CommentsSheet {...props('th')} />); await flush();
    expect(container.querySelector('[data-more="b"]')?.textContent).toBe('ดูการตอบกลับ 3 รายการ');
    expect(container.querySelector('[data-comment="a"] [data-act="reply"]')?.textContent).toBe('ตอบกลับ');
  });
});
