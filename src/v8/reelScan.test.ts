import { describe, expect, it } from 'vitest';
import { makeScanFrames, scanFramesOf } from './v5Reel';

// 0148: the copied-Reel scan frames are best effort: no decodable <video> → no frames, posting goes on with the poster only.
describe('Reel scan frames', () => {
  it('no video element → no frames, nothing kept', async () => {
    const poster = new Blob(['x'], { type: 'image/jpeg' });
    const info = { file: new File(['v'], 'v.mp4'), url: 'blob:x', durationMs: 15000, width: 1080, height: 1920 };
    expect(await makeScanFrames(info, null, poster)).toEqual([]);
    expect(scanFramesOf(poster)).toEqual([]);
  });
  it('a video that never decodes gives up without throwing (seek timeouts, blank frames)', async () => {
    const poster = new Blob(['y'], { type: 'image/jpeg' });
    const vv = document.createElement('video');
    Object.defineProperty(vv, 'videoWidth', { value: 0 });
    expect(await makeScanFrames({ file: new File(['v'], 'v.mp4'), url: 'blob:x', durationMs: 9000, width: 1, height: 1 }, vv, poster)).toEqual([]);
  });
});
