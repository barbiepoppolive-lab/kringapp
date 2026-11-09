/* one language at a time on the legal pages: ?lang=th|en (the app links with its own language), else the phone's
   language (Thai only when it starts with "th"), else English. The buttons switch the page and keep ?lang on links. */
(() => {
  const q = (new URLSearchParams(location.search).get('lang') || '').toLowerCase();
  const pick = q ? (q.startsWith('th') ? 'th' : 'en') : ((navigator.language || '').toLowerCase().startsWith('th') ? 'th' : 'en');
  const set = l => {
    l = l === 'th' ? 'th' : 'en';
    document.documentElement.lang = l;
    document.querySelectorAll('[data-l]').forEach(el => { el.hidden = el.dataset.l !== l; });
    document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.set === l)));
    document.querySelectorAll('a[data-keep]').forEach(a => { const u = new URL(a.getAttribute('href'), location.href); u.searchParams.set('lang', l); a.href = u.pathname.split('/').pop() + u.search + u.hash; });
  };
  document.querySelectorAll('.langs button').forEach(b => b.addEventListener('click', () => {
    set(b.dataset.set);
    try { const u = new URL(location.href); u.searchParams.set('lang', b.dataset.set); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
  }));
  set(pick);
})();
