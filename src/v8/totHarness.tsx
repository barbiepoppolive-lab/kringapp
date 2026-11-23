/**
 * Screenshot harness for the This-or-That card (24 Nov) — NOT part of the app build.
 * `vite.harness.config.ts` builds this on its own, so nothing here ever reaches dist/ or the live site.
 *
 * It mounts the real ThisOrThatCard, so the real RPC wiring runs: the screenshots are taken against the shipped
 * component and the shipped CSS, with the kr8_* responses served by Playwright's route interception (see
 * scripts/tot-shots.cjs) rather than a signed-in member. Nothing in here is mocked inside the app itself.
 */
import { createRoot } from 'react-dom/client';
import './fonts-v8.css';
import './v8.css';
import './kx.css';
import './rv2.css';
import './rv4.css';
import './glass.css';
import { ThisOrThatCard } from './V5Tasks';

const lang = new URLSearchParams(window.location.search).get('lang') || 'en';
const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <div className="v8-app-root" style={{ background: '#0E0B18', minHeight: '100dvh' }}>
      <div className="at-list">
        <ThisOrThatCard lang={lang} inline />
      </div>
    </div>,
  );
}
