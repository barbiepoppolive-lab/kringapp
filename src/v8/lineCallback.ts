// /app/line-callback.html (T-205): LINE sends the member back here with ?code=&state=. Finish the sign-in, go back.
import { v5ErrCode, v5FinishLine } from './v5Live';
import { V5_L, v5ErrText } from './v5Strings';

const lang = (() => { try { return localStorage.getItem('kr8_lang') || 'en'; } catch { return 'en'; } })();
const L = (en: string) => V5_L[lang]?.[en] || en;
const app = document.getElementById('app')!;
const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

// take LINE's code out of the address bar before the Supabase client starts (it would read ?code= as its own)
const search = window.location.search;
window.history.replaceState(null, '', window.location.pathname);
app.textContent = L('Signing you in with LINE…');

v5FinishLine(search).then((next) => window.location.replace(next)).catch((e) => {
  app.replaceChildren(document.createTextNode(L(v5ErrText(v5ErrCode(e))[0])), document.createElement('br'));
  const a = document.createElement('a');
  a.href = base;
  a.textContent = L('Back to Kring');
  app.append(a);
});
