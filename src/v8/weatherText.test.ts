// T-301 (T301-007): the Weather sheet speaks the app language; Thai has no English sentence and no % sign.
import { describe, expect, it } from 'vitest';
import { V5_L } from './v5Strings';
import { DEFAULT_WEATHER, weatherText, type V8Weather } from './v8Data';
import zh from './strings/v5.zh';
import ja from './strings/v5.ja';
import ko from './strings/v5.ko';
import hi from './strings/v5.hi';

const th = (en: string) => V5_L.th[en] || en;
const thf = (en: string, a: string, b = '') => th(en).replace('{0}', a).replace('{1}', b);
const rainy: V8Weather = { ...DEFAULT_WEATHER, tempC: 31, feelsLikeC: 36, rainProbAfternoon: 84, source: 'open-meteo', conditionIcon: '🌦',
  conditionLabel: 'Tropical shower likely this afternoon', localPickTitle: 'Rain plan: stay under the skywalk' };
const dry: V8Weather = { ...rainy, rainProbAfternoon: 10, conditionIcon: '☀', conditionLabel: 'Sunny & warm in Bangkok', localPickTitle: 'Find shade before 3pm' };

describe('Weather sheet text', () => {
  for (const [name, w] of [['rainy', rainy], ['dry', dry], ['loading', DEFAULT_WEATHER]] as const) {
    it(`Thai, ${name}: no English sentence, no % sign`, () => {
      const t = weatherText(w, th, thf);
      for (const s of [t.feels, t.label, t.title, t.desc, t.tip]) {
        expect(s).not.toMatch(/\b(the|and|rain|afternoon|Bangkok|shade|skywalk)\b/i);
        expect(s).not.toContain('%');
      }
    });
  }
  it('numbers are filled in', () => {
    const t = weatherText(rainy, th, thf);
    expect(t.desc).toContain('84');
    expect(t.feels).toContain('36');
  });
  it('every weather key exists in TH, zh, ja, ko and hi', () => {
    const keys = Object.keys(V5_L.th).filter((k) => /skywalk|Feels like|Bangkok weather|Partly cloudy|Sunny & warm|Find shade|Stay cool|Tropical sh|See deals|^Warm \{0\}°C/.test(k));
    expect(keys.length).toBe(14);
    for (const T of [zh, ja, ko, hi]) for (const k of keys) expect(T[k], k).toBeTruthy();
  });
});
