/** Trim e2e harness (16 Nov): pick → (trim when over 60 s) → prepare, with the app's real code. ?lang=th|en */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import '../src/v8/kx.css';
import '../src/v8/go.css';
import { V5_L, KX_L, loadV5Lang } from '../src/v8/v5Strings';
import { applyTrim, checkReel, makeAudio, prepareReel, ReelError, type ReelInfo, type ReelReady } from '../src/v8/v5Reel';
import { GoTrim } from '../src/v8/V5Trim';
import { GoCompose } from '../src/v8/V5Go';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

const lang = new URLSearchParams(location.search).get('lang') || 'th';
await loadV5Lang(lang);
const L = (en: string) => (lang === 'en' ? en : (V5_L[lang] && V5_L[lang][en]) || (KX_L[lang] && KX_L[lang][en]) || en);
const Lf = (en: string, a: string, b = '') => L(en).replace('{0}', a).replace('{1}', b);
const noop = () => {};
type W = Window & { __trim?: Record<string, unknown>; __blob?: Blob };
const w = window as W;
w.__trim = { step: 'pick' };

function App() {
  const [trim, setTrim] = useState<ReelInfo | null>(null);
  const [reel, setReel] = useState<ReelInfo | null>(null);
  const [problem, setProblem] = useState('');
  const pick = async (f?: File) => {
    if (!f) return;
    try {
      const info = await checkReel(f);
      w.__trim = { step: info.needsTrim ? 'trim' : 'compose', fullMs: info.durationMs };
      if (info.needsTrim) setTrim(info); else setReel(info);
    } catch (e) { setProblem(String((e as ReelError).code)); w.__trim = { step: 'problem', code: (e as ReelError).code }; }
  };
  const prepare = async (info: ReelInfo) => {
    const ac = makeAudio();
    w.__trim = { ...w.__trim, step: 'preparing', window: info.trim, durationMs: info.durationMs };
    const t0 = performance.now();
    try {
      const r: ReelReady = await prepareReel(info, ac, () => undefined);
      w.__blob = r.blob;
      const inp = new Input({ source: new BlobSource(r.blob), formats: ALL_FORMATS });
      const dur = await inp.computeDuration();
      const a = await inp.getPrimaryAudioTrack();
      w.__trim = { ...w.__trim, step: 'ready', mime: r.mime, size: r.blob.size, isFile: r.blob instanceof File, reportedMs: r.durationMs, outSec: dur, audio: !!a,
        audioCodec: a?.codec || null, posterSize: r.poster.size, shrunk: r.shrunk, secs: Math.round((performance.now() - t0) / 100) / 10, hasVideoEncoder: typeof VideoEncoder !== 'undefined' };
    } catch (e) {
      w.__trim = { ...w.__trim, step: 'failed', code: (e as ReelError).code, why: (e as ReelError).why };
    } finally { void ac?.close(); }
  };
  if (trim) return <GoTrim L={L} lang={lang} reel={trim} onBack={() => { setTrim(null); w.__trim = { step: 'pick' }; }}
    onUse={(win) => { const info = applyTrim(trim, win); setTrim(null); setReel(info); w.__trim = { step: 'compose', window: win }; }} />;
  return <>
    <GoCompose L={L} Lf={Lf} lang={lang} reel={reel} stage="idle" progress={0} problem={problem} caption="" onCaption={noop} places={[{ id: 'p', name_en: 'Ari', kr_area: 'Ari' } as never]}
      onAddPlace={noop} onRemovePlace={noop} people={[]} onPeople={noop} onPick={(f) => void pick(f)} onPost={() => reel && void prepare(reel)} onClose={noop} />
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
