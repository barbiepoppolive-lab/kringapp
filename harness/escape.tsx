// In-app browser escape harness (tools/push_e2e.mjs): the real EscapeScreen + ask card + hand-off landing, without the app.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import * as push from '../src/v8/push';
import { PushAskCard } from '../src/v8/V5Push';
import { EscapeScreen } from '../src/v8/V5Escape';
import { isLiffOpen } from '../src/v8/escape';
import { V5_L } from '../src/v8/v5Strings';
import { v5HandoffBoot, v5Session } from '../src/v8/v5Live';
const lang = new URLSearchParams(location.search).get('lang') || 'th';
const L = (en: string) => (V5_L[lang] && V5_L[lang][en]) || en;
const w = window as unknown as Record<string, unknown>;
w.__push = push;
void v5HandoffBoot().then(async (r) => { w.__handoff = r; w.__uid = (await v5Session().catch(() => null))?.user?.id || null; });
createRoot(document.getElementById('root')!).render(
  <div className="v8-app-root" style={{ position: 'relative', minHeight: '100vh', color: '#fff' }}>
    <EscapeScreen L={L} lang={lang} liff={isLiffOpen(location.search, navigator.userAgent)} signedIn={false} authReady />
    <PushAskCard L={L} lang={lang} toast={() => undefined} onInstallHelp={() => undefined} />
  </div>);
