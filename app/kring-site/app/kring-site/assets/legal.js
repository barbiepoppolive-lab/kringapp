/* one language at a time on the legal pages: ?lang=th|en, else the language chosen on the main site, else the phone */
(() => {
  let pick = new URLSearchParams(location.search).get('lang');
  if (!pick) { try { pick = localStorage.getItem('kring-lang'); } catch (e) {} }
  if (!pick) pick = (navigator.language || 'en').slice(0, 2);
  const set = l => {
    l = l === 'th' ? 'th' : 'en';
    document.documentElement.lang = l;
    document.querySelectorAll('[data-l]').forEach(el => { el.hidden = el.dataset.l !== l; });
    document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.set === l)));
    document.querySelectorAll('a[data-keep]').forEach(a => { const u = new URL(a.getAttribute('href'), location.href); u.searchParams.set('lang', l); a.href = u.pathname.split('/').pop() + u.search + u.hash; });
  };
  document.querySelectorAll('.langs button').forEach(b => b.addEventListener('click', () => { set(b.dataset.set); try { localStorage.setItem('kring-lang', b.dataset.set); } catch (e) {} }));
  set(pick);
})();
