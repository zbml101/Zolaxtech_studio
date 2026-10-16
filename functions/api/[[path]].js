// Cloudflare Pages Function: forwards every /api/* request to the backend (SnapDeploy).
// Set BACKEND_URL in the Pages project (Settings > Environment variables), e.g. https://your-app.snapdeploy.dev
export async function onRequest({ request, env }) {
  const backend = String(env.BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(backend)) {
    return json(500, { error: 'BACKEND_URL is not set. Add it in the Cloudflare Pages project settings, then redeploy.' });
  }

  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('accept-encoding'); // let Cloudflare handle compression
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers.set('x-forwarded-for', ip);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream;
  try {
    upstream = await fetch(backend + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch (err) {
    return json(502, { error: 'The backend did not answer. If it was asleep, wait a minute and try again.' });
  }

  const out = new Response(upstream.body, upstream);
  out.headers.set('cache-control', 'no-store');
  return out;
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
