// Only approved, email-confirmed accounts may use the app.
const assert = require('assert');
const { createApp } = require('../src/app');
const { createFake } = require('./fake-supabase');

const app = createApp({ createClient: createFake().createClient, config: { supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon', allowedEmails: ['ada@example.com', 'unconfirmed-bob@example.com'] } });
(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, who) => { const r = await fetch(base + path, { headers: who ? { Authorization: `Bearer test-token-${who}` } : {} }); return { status: r.status, json: await r.json().catch(() => null) }; };
  let passed = 0;
  const test = async (n, fn) => { try { await fn(); passed++; console.log('  ok  ', n); } catch (e) { console.error('  FAIL', n, '\n      ', e.message); process.exitCode = 1; } };
  console.log('Access tests');
  await test('an approved, confirmed person gets in (any letter case)', async () => {
    assert.strictEqual((await get('/api/state', 'ada@example.com')).status, 200);
    assert.strictEqual((await get('/api/state', 'ADA@Example.com')).status, 200);
  });
  await test('a signed-up stranger is refused with a clear message', async () => {
    const r = await get('/api/state', 'eve@example.com');
    assert.strictEqual(r.status, 403); assert.ok(/not approved/i.test(r.json.error));
    assert.strictEqual((await get('/api/videos/00000000-0000-4000-8000-000000000000', 'eve@example.com')).status, 403);
    assert.strictEqual((await get('/api/google/status', 'eve@example.com')).status, 403);
  });
  await test('an approved address that was never confirmed is refused (nobody can sign up as someone else)', async () => {
    assert.strictEqual((await get('/api/state', 'unconfirmed-bob@example.com')).status, 403);
  });
  await test('no token is still 401, and public pages stay public', async () => {
    assert.strictEqual((await get('/api/state')).status, 401);
    const c = await get('/api/config'); assert.strictEqual(c.status, 200); assert.strictEqual(c.json.restricted, true);
  });
  console.log(`\n${passed} tests passed`); server.close();
})();
