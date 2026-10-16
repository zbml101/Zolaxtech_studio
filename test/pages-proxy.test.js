// Tests the Cloudflare Pages proxy function with a fake fetch.
const assert = require('assert');
(async () => {
  const { onRequest } = await import('../functions/api/[[path]].js');
  let seen;
  globalThis.fetch = async (u, init) => { seen = { u, init }; return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  const env = { BACKEND_URL: 'https://app.example.com/' };

  let r = await onRequest({ request: new Request('https://zx.pages.dev/api/health?x=1', { headers: { 'cf-connecting-ip': '1.2.3.4', authorization: 'Bearer t' } }), env });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(seen.u, 'https://app.example.com/api/health?x=1');
  assert.strictEqual(seen.init.headers.get('x-forwarded-host'), 'zx.pages.dev');
  assert.strictEqual(seen.init.headers.get('x-forwarded-for'), '1.2.3.4');
  assert.strictEqual(seen.init.headers.get('authorization'), 'Bearer t');
  assert.strictEqual(seen.init.body, undefined);

  r = await onRequest({ request: new Request('https://zx.pages.dev/api/videos/1', { method: 'PATCH', body: '{"a":1}', headers: { 'content-type': 'application/json' } }), env });
  assert.strictEqual(seen.init.method, 'PATCH');
  assert.strictEqual(Buffer.from(seen.init.body).toString(), '{"a":1}');

  r = await onRequest({ request: new Request('https://zx.pages.dev/api/health'), env: {} });
  assert.strictEqual(r.status, 500);

  globalThis.fetch = async () => { throw new Error('down'); };
  r = await onRequest({ request: new Request('https://zx.pages.dev/api/health'), env });
  assert.strictEqual(r.status, 502);
  console.log('pages proxy: 4 checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
