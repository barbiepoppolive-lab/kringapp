import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import { V5MintSheet } from '../src/v8/V5KxCard';
import { V5_L, KX_L } from '../src/v8/v5Strings';
const q = new URLSearchParams(location.search);
const lang = q.get('lang') || 'th';
const L = (en: string) => (KX_L[lang] && KX_L[lang][en]) || (V5_L[lang] && V5_L[lang][en]) || en;
const Lf = (en: string, ...a: string[]) => a.reduce((s, x, i) => s.replace(`{${i}}`, x), L(en));
const card = q.get('fix') ? ({ first_name: 'Nut', langs: ['TH'], bio: '', area: 'Ari', who: 'local', photo: '/_t/fireworks.jpg', member_no: 16 } as never) : null;
createRoot(document.getElementById('root')!).render(
  <div className="v8-app-root" style={{ position: 'relative', minHeight: '100vh' }}>
    <V5MintSheet L={L} Lf={Lf as never} card={card} uiLang={lang} photoFix={!!q.get('fix')} onSaved={() => {}} onClose={() => {}} toast={() => {}} onAfter={() => {}} />
  </div>);
