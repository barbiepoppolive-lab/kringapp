export function onRequest({ params }) {
  const place = String(params.place || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
  const ref = place ? 'nattham-' + place : 'nattham';
  return new Response(null, { status: 302, headers: { Location: '/app/?join=1&ref=' + ref, 'Cache-Control': 'no-store' } });
}
