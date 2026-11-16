/* Ask a Thai harness (16 Nov). The real app shell in demo mode (example data, no database), Feed tab.
 *   /harness/askthai.html?demo=1             Feed › Reels with the "Reels · Ask a Thai" switch
 *   /harness/askthai.html?demo=1&feed=ask    Feed › Ask a Thai timeline (tap a post for its thread, "Ask" for the Ask sheet)
 *   &lang=th                                 Thai
 * The live app hides the demo-only "+" button on the Feed (FEED_TOP_BAR = false); this page hides it and the demo-only
 * "DEMO · example content" tag too, so it looks like live. */
import { createRoot } from 'react-dom/client';
import { KringAppV8 } from '../src/v8/KringAppV8';
import { loadV5Lang } from '../src/v8/v5Strings';

await loadV5Lang(new URLSearchParams(location.search).get('lang') || 'en');
const st = document.createElement('style');
st.textContent = '.v8-app-root #s-feed .feed-top{display:none!important}.v8-app-root #s-feed.at-has-sw .spill.kp-wx{left:12px!important}vite-error-overlay{display:none!important}.v8-app-root[data-demo=\'1\']::after{display:none!important}';
document.head.appendChild(st);
createRoot(document.getElementById('root')!).render(<KringAppV8 initialTab="feed" />);
