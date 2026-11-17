import { describe, expect, it } from 'vitest';
import { createAskApi } from './askThai';

// 0093: a face-gated member's Ask / answer never reaches the photo upload (no orphan files in kr8-ask)
describe('Ask face gate', () => {
  const api = createAskApi({ live: true, demo: false, me: () => null, gate: () => true });
  const file = new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' });
  it('ask is refused before any upload', async () => {
    await expect(api.ask({ body: 'Where is a good rooftop?', details: '', area: 'Bangkok', file })).rejects.toThrow('KR8_VERIFY_FIRST');
  });
  it('answer is refused before any upload', async () => {
    await expect(api.answer('q1', null, 'Try Sukhumvit 11', file)).rejects.toThrow('KR8_VERIFY_FIRST');
  });
});
