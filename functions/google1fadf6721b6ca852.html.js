// Google Search Console ownership file, served exactly at /google1fadf6721b6ca852.html.
// Pages strips ".html" with a 308 redirect for static files, which can make Google's check fail; this answers directly with 200.
export const onRequest = () =>
  new Response('google-site-verification: google1fadf6721b6ca852.html', {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
