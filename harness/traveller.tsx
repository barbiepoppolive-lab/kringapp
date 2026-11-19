// 0138 preview: the member "Traveller tag" screens with SAMPLE data. ?lang=en|th &v=form|pending|refused|approved|edit
import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import { V5MintSheet } from '../src/v8/V5KxCard';
import { TravellerPage } from '../src/v8/V5Traveller';
import type { TravellerState } from '../src/v8/travellerLogic';
import { V5_L, KX_L } from '../src/v8/v5Strings';
const q = new URLSearchParams(location.search);
const lang = q.get('lang') || 'en';
const v = q.get('v') || 'form';
const L = (en: string) => (lang === 'en' ? en : (V5_L[lang] && V5_L[lang][en]) || (KX_L[lang] && KX_L[lang][en]) || en);
const Lf = (en: string, ...a: string[]) => a.reduce((s, x, i) => s.replace(`{${i}}`, x), L(en));
const at = new Date().toISOString();
const S: Record<string, TravellerState | null> = {
  form: null,
  pending: { who: 'local', request: { id: 'r1', status: 'pending', reason_code: null, reason_note: null, at, decided_at: null } },
  refused: { who: 'local', request: { id: 'r1', status: 'refused', reason_code: 'unclear', reason_note: null, at, decided_at: at } },
  approved: { who: 'traveller', request: { id: 'r1', status: 'approved', reason_code: null, reason_note: null, at, decided_at: at } },
};
const card = { first_name: 'Lena', langs: ['EN'], bio: 'Street food and sunsets', area: 'Ari', who: 'local', photo: '/harness/img/lena.jpg', member_no: 77, verified: true } as never;
const send = async () => { await new Promise((r) => setTimeout(r, 400)); return S.pending!; };
function App() {
  if (v === 'edit') {
    return <V5MintSheet L={L} Lf={Lf as never} card={card} uiLang={lang} onSaved={() => {}} onClose={() => {}} toast={() => {}} onAfter={() => {}}
      loadTraveller={async () => S[q.get('s') || 'pending']} />;
  }
  return <TravellerPage L={L} state={S[v] ?? null} onClose={() => {}} onSent={() => { location.search = `?lang=${lang}&v=pending`; }} send={send} />;
}
createRoot(document.getElementById('root')!).render(
  <div className="v8-app-root" style={{ position: 'relative', minHeight: '100vh' }}><App /></div>);
