import { describe, expect, it } from 'vitest';
import { fqHeadline, fqLine } from './feedQuality';
import { dataUrlB64, frameFeatures } from '../../supabase/functions/face-check-aws/quality';

describe('0150 Feed quality: AWS answers → features', () => {
  it('keeps brightness / sharpness, the Person confidence, faces biggest first, LINE texts', () => {
    const f = frameFeatures('middle',
      { Labels: [{ Name: 'Person', Confidence: 92.44 }, { Name: 'Cafe', Confidence: 88 }, { Name: 'Cup', Confidence: 60 }], ImageProperties: { Quality: { Brightness: 61.27, Sharpness: 33.33, Contrast: 70 } } },
      { FaceDetails: [{ Confidence: 99, BoundingBox: { Width: 0.1, Height: 0.1 }, AgeRange: { Low: 22, High: 30 } }, { Confidence: 98, BoundingBox: { Width: 0.3, Height: 0.4 }, AgeRange: { Low: 9, High: 15 } }] },
      { TextDetections: [{ DetectedText: 'TikTok', Type: 'LINE', Confidence: 99 }, { DetectedText: 'TikTok', Type: 'WORD', Confidence: 99 }, { DetectedText: 'faint', Type: 'LINE', Confidence: 50 }] });
    expect(f).toMatchObject({ at: 'middle', b: 61.3, s: 33.3, person: 92.4, labels: ['Person', 'Cafe'], words: 1, text: ['TikTok'] });
    expect(f.faces.map((x) => x.high)).toEqual([15, 30]);
    expect(f.faces[0].a).toBe(0.12);
  });
  it('survives empty / failed answers', () => {
    expect(frameFeatures('poster', null, null, null)).toMatchObject({ b: null, s: null, person: 0, labels: [], faces: [], words: 0, text: [] });
  });
  it('reads a data: photo, not a link', () => {
    expect(dataUrlB64('data:image/jpeg;base64,/9j/AAA')).toBe('/9j/AAA');
    expect(dataUrlB64('https://kringapp.com/app/icon-512.png')).toBeNull();
  });
});

describe('0150 Autopilot card lines', () => {
  it('headline and a disagreement line, in plain English', () => {
    expect(fqHeadline({ reels_scored: 51, reels_waiting: 0, people_scored: 56, suggest: { feed: 30, profile: 10, not_yet: 11 }, disagree: [], held: [], last_run: null, last_scan: null }))
      .toBe('51 Reels scored · 0 waiting · 56 photos · Feed 30 · Profile only 10 · Not yet 11');
    expect(fqLine({ post_id: 'x', member_no: 152, name: 'Wan', score: 30, suggest: 'not_yet', in_feed: true, reasons: ['too dark', 'no place tagged', 'x'] }))
      .toBe('#152 Wan · 30/100 · in the Feed, bot says Not yet · too dark, no place tagged');
  });
});
