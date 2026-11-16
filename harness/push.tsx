// Dings e2e harness (tools/push_e2e.mjs): the real ask card + push module + public/sw.js, without signing in.
// Serve with `vite --base /app/` so the worker's scope (/app/) covers this page, like the live app.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import * as push from '../src/v8/push';
import { PushAskCard } from '../src/v8/V5Push';
import { V5_L } from '../src/v8/v5Strings';
const lang = new URLSearchParams(location.search).get('lang') || 'th';
const L = (en: string) => (V5_L[lang] && V5_L[lang][en]) || en;
const w = window as unknown as Record<string, unknown>;
w.__push = push;
w.__toasts = [] as string[];
w.__opened = [] as string[];
navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'kr8-push-open') (w.__opened as string[]).push(e.data.url); });
function App() {
  const [t, setT] = useState('');
  return (
    <div className="v8-app-root" style={{ position: 'relative', minHeight: '100vh', color: '#fff' }}>
      <p id="toast">{t}</p>
      <PushAskCard L={L} lang={lang} toast={(m) => { (w.__toasts as string[]).push(m); setT(m); }} onInstallHelp={() => setT('install')} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
