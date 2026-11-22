export async function onRequest({ request, env }) {
  const upstream = new URL(request.url);
  upstream.pathname = upstream.pathname.slice('/api'.length) || '/';

  const forwarded = new Request(new Request(upstream, request), { redirect: 'manual' });
  const response = await env.API.fetch(forwarded);
  const location = response.headers.get('Location');

  // FastAPI redirects some routes to their canonical trailing slash.
  if (location && response.status >= 300 && response.status < 400) {
    const target = new URL(location, upstream);
    if (target.origin === upstream.origin) {
      const redirected = new Response(response.body, response);
      redirected.headers.set('Location', '/api' + target.pathname + target.search + target.hash);
      return redirected;
    }
  }
  return response;
}
