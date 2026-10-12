// Checks the Google Workspace features against stand-ins for Supabase and Google.
const assert = require('assert');
const { createApp } = require('../src/app');
const { createFake } = require('./fake-supabase');
const { createFakeGoogle } = require('./fake-google');

const fake = createFake();
const g = createFakeGoogle();
const google = { clientId: 'cid', clientSecret: 'secret', tokenKey: 'a-long-random-key-for-tests' };
const app = createApp({ createClient: fake.createClient, config: { supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon', google }, google: { fetchImpl: g.fetchImpl } });
const off = createApp({ createClient: fake.createClient, config: { supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon' } });

(async () => {
  const server = app.listen(0), serverOff = off.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const baseOff = `http://127.0.0.1:${serverOff.address().port}`;
  const call = async (method, path, { token = 'test-token-ada@example.com', body, b = base } = {}) => {
    const res = await fetch(b + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch (_) { /* empty */ }
    return { status: res.status, json };
  };
  let passed = 0;
  const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };
  console.log('Google Workspace tests');

  await call('POST', '/api/bootstrap');
  const videos = (await call('GET', '/api/state')).json.videos;

  await test('without Google keys the routes say so, and the app config reports it', async () => {
    assert.strictEqual((await call('GET', '/api/google/status', { b: baseOff })).status, 503);
    assert.strictEqual((await (await fetch(baseOff + '/api/config')).json()).googleEnabled, false);
    assert.strictEqual((await (await fetch(base + '/api/config')).json()).googleEnabled, true);
  });

  await test('status before connecting', async () => {
    const s = (await call('GET', '/api/google/status')).json;
    assert.deepStrictEqual([s.configured, s.connected], [true, false]);
    assert.strictEqual((await call('POST', '/api/google/calendar/sync')).status, 409);
  });

  let state;
  await test('auth url carries a signed state and the right scopes', async () => {
    const url = new URL((await call('POST', '/api/google/auth-url')).json.url);
    assert.strictEqual(url.searchParams.get('access_type'), 'offline');
    assert.ok(url.searchParams.get('scope').includes('calendar.events') && url.searchParams.get('scope').includes('drive.file'));
    assert.ok(!url.searchParams.get('scope').includes('auth/drive '), 'must not ask for full Drive');
    assert.ok(url.searchParams.get('redirect_uri').endsWith('/google/callback'));
    state = url.searchParams.get('state');
  });

  await test('connect refuses a state from someone else or a bad code', async () => {
    assert.strictEqual((await call('POST', '/api/google/connect', { token: 'test-token-eve@example.com', body: { code: 'good-code', state } })).status, 400);
    assert.strictEqual((await call('POST', '/api/google/connect', { body: { code: 'good-code', state: state + 'x' } })).status, 400);
    assert.strictEqual((await call('POST', '/api/google/connect', { body: { code: 'bad', state } })).status, 400);
  });

  await test('connect refuses when a permission was unticked', async () => {
    g.state.scope = 'openid email https://www.googleapis.com/auth/drive.file';
    assert.strictEqual((await call('POST', '/api/google/connect', { body: { code: 'good-code', state } })).status, 400);
    g.state.scope = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file';
  });

  await test('connect stores an encrypted token, never the plain one', async () => {
    const r = await call('POST', '/api/google/connect', { body: { code: 'good-code', state } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.email, 'ada@gmail.com');
    const row = fake.tables.google_connections[0];
    assert.ok(row.refresh_token_enc && !row.refresh_token_enc.includes('rt-1'));
    assert.strictEqual((await call('GET', '/api/google/status')).json.connected, true);
    assert.strictEqual((await call('GET', '/api/google/status', { token: 'test-token-bob@example.com' })).json.connected, false);
  });

  await test('calendar sync creates four all-day events per video, then does nothing the second time', async () => {
    const r1 = (await call('POST', '/api/google/calendar/sync')).json;
    assert.strictEqual(r1.created, videos.length * 4);
    const ev = [...g.events.values()][0];
    assert.ok(ev.start.date && ev.end.date > ev.start.date && ev.transparency === 'transparent');
    const r2 = (await call('POST', '/api/google/calendar/sync')).json;
    assert.deepStrictEqual([r2.created, r2.updated, r2.deleted, r2.unchanged], [0, 0, 0, videos.length * 4]);
    assert.ok((await call('GET', '/api/google/status')).json.lastSync);
  });

  await test('moving a video updates its events; deleting one removes them; published ones are left alone', async () => {
    await call('POST', '/api/videos/reorder', { body: { ids: [videos[1].id, videos[0].id, ...videos.slice(2).map((x) => x.id)] } });
    const r = (await call('POST', '/api/google/calendar/sync')).json;
    assert.strictEqual(r.updated, 8); assert.strictEqual(r.created, 0);
    await call('DELETE', `/api/videos/${videos[5].id}`);
    const r2 = (await call('POST', '/api/google/calendar/sync')).json;
    assert.strictEqual(r2.deleted, 4);
    await call('PATCH', `/api/videos/${videos[2].id}`, { body: { stage: 'published' } });
    await call('POST', '/api/videos/reorder', { body: { ids: (await call('GET', '/api/state')).json.videos.map((x) => x.id).reverse() } });
    const r3 = (await call('POST', '/api/google/calendar/sync')).json;
    assert.strictEqual(r3.deleted, 0);
  });

  await test('an event the person deleted in Google comes back on the next sync', async () => {
    const [id, ev] = [...g.events].find(([, e]) => e.status === 'confirmed');
    ev.status = 'cancelled';
    const r = (await call('POST', '/api/google/calendar/sync')).json;
    assert.ok(r.created >= 1 && g.events.get(id).status === 'confirmed');
  });

  const vid = (await call('GET', '/api/state')).json.videos[0];
  await test('script to Google Docs: creates once, returns the same link, and replaces on request', async () => {
    await call('PATCH', `/api/videos/${vid.id}`, { body: { script: { hook: { en: 'Hello <world>', am: 'ሰላም' } } } });
    const a = (await call('POST', `/api/google/docs/script/${vid.id}`, { body: {} })).json;
    assert.ok(a.url && !a.existed);
    const doc = [...g.files.values()].find((f) => f.mimeType === 'application/vnd.google-apps.document');
    assert.ok(doc.media.includes('Hello &lt;world&gt;') && doc.media.includes('ሰላም'), 'escaped, Amharic kept');
    assert.ok([...g.files.values()].some((f) => f.folder && f.name === 'ZolaxTech Studio'));
    const b = (await call('POST', `/api/google/docs/script/${vid.id}`, { body: {} })).json;
    assert.deepStrictEqual([b.url, b.existed], [a.url, true]);
    await call('PATCH', `/api/videos/${vid.id}`, { body: { script: { hook: { en: 'Second draft', am: '' } } } });
    const c = (await call('POST', `/api/google/docs/script/${vid.id}`, { body: { replace: true } })).json;
    assert.strictEqual(c.url, a.url);
    assert.ok(doc.media.includes('Second draft'));
    assert.strictEqual((await call('GET', '/api/state')).json.videos.find((x) => x.id === vid.id).doc_url, a.url);
  });

  await test('video list to Google Sheets: creates, then replaces the same sheet', async () => {
    const a = (await call('POST', '/api/google/sheets/export')).json;
    assert.ok(a.url.includes('/spreadsheets/d/'));
    const sheet = [...g.files.values()].find((f) => f.mimeType === 'application/vnd.google-apps.spreadsheet');
    assert.ok(sheet.media.startsWith('Week,Series,Title') && !sheet.media.startsWith('﻿'));
    const b = (await call('POST', '/api/google/sheets/export')).json;
    assert.strictEqual(b.url, a.url); assert.ok(b.replaced);
    assert.strictEqual((await call('GET', '/api/google/status')).json.sheetUrl, a.url);
  });

  await test('if Google access is removed, the connection is cleared with a clear message', async () => {
    g.state.deniedRefresh = true;
    // force a fresh token: connect again as another user with the same fake
    const s2 = new URL((await call('POST', '/api/google/auth-url', { token: 'test-token-zed@example.com' })).json.url).searchParams.get('state');
    g.state.deniedRefresh = false;
    await call('POST', '/api/google/connect', { token: 'test-token-zed@example.com', body: { code: 'good-code', state: s2 } });
    g.state.deniedRefresh = true;
    const r = await call('POST', '/api/google/calendar/sync', { token: 'test-token-zed@example.com' });
    assert.strictEqual(r.status, 409); assert.ok(/connect google again/i.test(r.json.error));
    assert.strictEqual((await call('GET', '/api/google/status', { token: 'test-token-zed@example.com' })).json.connected, false);
    g.state.deniedRefresh = false;
  });

  await test('disconnect revokes at Google and removes the stored token', async () => {
    assert.strictEqual((await call('DELETE', '/api/google/connection')).status, 200);
    assert.ok(g.state.revoked);
    assert.strictEqual((await call('GET', '/api/google/status')).json.connected, false);
  });

  console.log(`\n${passed} tests passed`);
  server.close(); serverOff.close();
})();
