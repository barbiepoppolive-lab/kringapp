export function onRequest({ params }) {
  const place = String(params.place || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
  const ref = place ? 'nattham-' + place : 'nattham';
  // _headers does not apply to Pages Functions, so the security headers are set here.
  return new Response(null, { status: 302, headers: { Location: '/app/?join=1&ref=' + ref, 'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex' } });
}
