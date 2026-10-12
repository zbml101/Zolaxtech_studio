// Runs the real server against the in-memory Supabase stand-in and checks every API route.
const assert = require('assert');
const { createApp } = require('../src/app');
const { createFake } = require('./fake-supabase');

const fake = createFake();
const app = createApp({ createClient: fake.createClient, config: { supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon' } });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
}

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token = 'test-token-ada@example.com', body, raw } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) return { status: res.status, text: await res.text(), headers: res.headers };
    let json = null;
    try { json = await res.json(); } catch (_) { /* empty */ }
    return { status: res.status, json };
  };

  console.log('ZolaxTech Studio API tests');

  await test('public routes work without signing in', async () => {
    assert.strictEqual((await call('GET', '/api/health', { token: null })).json.ok, true);
    const cfg = (await call('GET', '/api/config', { token: null })).json;
    assert.strictEqual(cfg.supabaseUrl, 'https://fake.supabase.co');
    const t = (await call('GET', '/api/templates', { token: null })).json;
    assert.ok(t.routine.tasks.length >= 20 && t.checklist.items.length === 23 && t.script.parts.length === 9);
    assert.deepStrictEqual(t.stages.length, 7);
  });

  await test('protected routes need a valid token', async () => {
    assert.strictEqual((await call('GET', '/api/state', { token: null })).status, 401);
    assert.strictEqual((await call('GET', '/api/state', { token: 'nonsense' })).status, 401);
  });

  await test('a new user is asked to bootstrap, then gets the starting plan', async () => {
    assert.strictEqual((await call('GET', '/api/state')).json.needsBootstrap, true);
    assert.strictEqual((await call('POST', '/api/bootstrap')).json.created, true);
    assert.strictEqual((await call('POST', '/api/bootstrap')).json.created, false);
    const s = (await call('GET', '/api/state')).json;
    assert.strictEqual(s.videos.length, 41);
    assert.ok(s.ideas.length >= 55);
    assert.strictEqual(s.videos[1].title, 'Advanced ChatGPT Tutorial | Prompt Engineering, Research and Productivity');
    assert.strictEqual(s.videos[2].position, 3);
    assert.ok(!('script' in s.videos[0]), 'list should not include script text');
    const d = new Date(s.settings.first_record_day + 'T00:00:00Z');
    assert.strictEqual(d.getUTCDay(), 2, 'first record day is a Tuesday');
  });

  let state;
  await test('each user only sees their own data', async () => {
    const other = (await call('GET', '/api/state', { token: 'test-token-bob@example.com' })).json;
    assert.strictEqual(other.needsBootstrap, true);
    state = (await call('GET', '/api/state')).json;
  });

  await test('video: edit fields, stage and published_at', async () => {
    const id = state.videos[0].id;
    let r = await call('PATCH', `/api/videos/${id}`, { body: { title_am: 'ሰላም', views_7d: 120, notes: 'Good' } });
    assert.strictEqual(r.json.title_am, 'ሰላም');
    assert.strictEqual(r.json.views_7d, 120);
    r = await call('PATCH', `/api/videos/${id}`, { body: { stage: 'published' } });
    assert.ok(r.json.published_at, 'published_at set');
    r = await call('PATCH', `/api/videos/${id}`, { body: { stage: 'edited' } });
    assert.strictEqual(r.json.published_at, null);
    assert.strictEqual((await call('PATCH', `/api/videos/${id}`, { body: { stage: 'bogus' } })).status, 400);
    assert.strictEqual((await call('PATCH', `/api/videos/${id}`, { body: {} })).status, 400);
    assert.strictEqual((await call('PATCH', `/api/videos/not-a-uuid`, { body: { title: 'x' } })).status, 400);
  });

  await test('video: script and checklist save and load', async () => {
    const id = state.videos[1].id;
    const script = { hook: { en: 'Hello', am: 'ሰላም' }, why: { en: 'Because', am: '' } };
    const r = await call('PATCH', `/api/videos/${id}`, { body: { script, checklist: { 'script-write': true, 'rec-mic': false } } });
    assert.strictEqual(r.json.script.hook.am, 'ሰላም');
    assert.deepStrictEqual(r.json.checklist, { 'script-write': true });
    const full = (await call('GET', `/api/videos/${id}`)).json;
    assert.strictEqual(full.script.why.en, 'Because');
    assert.strictEqual((await call('PATCH', `/api/videos/${id}`, { body: { script: { 'bad key!': {} } } })).status, 400);
  });

  await test('video: add at a week, reorder, delete keeps week numbers tidy', async () => {
    let r = await call('POST', '/api/videos', { body: { series: 'AI Tools', title: 'New video', position: 2 } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.position, 2);
    let s = (await call('GET', '/api/state')).json;
    assert.strictEqual(s.videos.length, 42);
    assert.deepStrictEqual(s.videos.map((v) => v.position), Array.from({ length: 42 }, (_, i) => i + 1));
    assert.strictEqual(s.videos[1].title, 'New video');

    const ids = s.videos.map((v) => v.id);
    [ids[0], ids[1]] = [ids[1], ids[0]];
    assert.strictEqual((await call('POST', '/api/videos/reorder', { body: { ids } })).status, 200);
    s = (await call('GET', '/api/state')).json;
    assert.strictEqual(s.videos[0].title, 'New video');
    // A list that leaves out a video is refused by the database function, which the server reports as a failure.
    assert.ok((await call('POST', '/api/videos/reorder', { body: { ids: ids.slice(1) } })).status >= 400);

    assert.strictEqual((await call('DELETE', `/api/videos/${r.json.id}`)).status, 200);
    s = (await call('GET', '/api/state')).json;
    assert.strictEqual(s.videos.length, 41);
    assert.deepStrictEqual(s.videos.map((v) => v.position), Array.from({ length: 41 }, (_, i) => i + 1));
  });

  await test('ideas: add, edit, promote to a video, delete', async () => {
    let r = await call('POST', '/api/ideas', { body: { idea: 'Test idea', series: 'AI Tools', format: 'Short', priority: 'High', why: 'It spreads' } });
    assert.strictEqual(r.status, 201);
    const id = r.json.id;
    r = await call('PATCH', `/api/ideas/${id}`, { body: { priority: 'Low' } });
    assert.strictEqual(r.json.priority, 'Low');
    assert.strictEqual((await call('PATCH', `/api/ideas/${id}`, { body: { format: 'Podcast' } })).status, 400);
    r = await call('POST', `/api/ideas/${id}/promote`, { body: { position: 3 } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.video.position, 3);
    assert.strictEqual(r.json.video.title, 'Test idea');
    assert.strictEqual(r.json.idea.used, true);
    assert.strictEqual((await call('DELETE', `/api/ideas/${id}`)).status, 200);
    await call('DELETE', `/api/videos/${r.json.video.id}`);
  });

  await test('to-dos: add, tick, delete', async () => {
    let r = await call('POST', '/api/todos', { body: { title: 'Buy a pop filter', due_date: '2026-10-20' } });
    assert.strictEqual(r.status, 201);
    const id = r.json.id;
    r = await call('PATCH', `/api/todos/${id}`, { body: { done: true } });
    assert.strictEqual(r.json.done, true);
    assert.ok(r.json.done_at);
    assert.strictEqual((await call('POST', '/api/todos', { body: { title: '  ' } })).status, 400);
    assert.strictEqual((await call('DELETE', `/api/todos/${id}`)).status, 200);
  });

  await test('routine: tick and untick a task for a week', async () => {
    const week = new Date();
    week.setUTCDate(week.getUTCDate() - week.getUTCDay());
    const week_start = week.toISOString().slice(0, 10);
    assert.strictEqual((await call('PUT', '/api/routine', { body: { week_start, task_key: 'sun-write', done: true } })).status, 200);
    assert.strictEqual((await call('PUT', '/api/routine', { body: { week_start, task_key: 'sun-write', done: true } })).status, 200);
    let s = (await call('GET', '/api/state')).json;
    assert.strictEqual(s.routine.filter((x) => x.task_key === 'sun-write').length, 1);
    assert.strictEqual((await call('PUT', '/api/routine', { body: { week_start, task_key: 'sun-write', done: false } })).status, 200);
    s = (await call('GET', '/api/state')).json;
    assert.strictEqual(s.routine.length, 0);
    assert.strictEqual((await call('PUT', '/api/routine', { body: { week_start, task_key: 'nope', done: true } })).status, 400);
    assert.strictEqual((await call('PUT', '/api/routine', { body: { week_start: '2026-10-13', task_key: 'sun-write', done: true } })).status, 400);
  });

  await test('reviews: save a 4-week review', async () => {
    const r = await call('PUT', '/api/reviews/1', { body: { worked: 'Clear titles', change_next: 'Stronger hook' } });
    assert.strictEqual(r.json.worked, 'Clear titles');
    await call('PUT', '/api/reviews/1', { body: { worked: 'Clear titles v2' } });
    const s = (await call('GET', '/api/state')).json;
    assert.strictEqual(s.reviews.length, 1);
    assert.strictEqual(s.reviews[0].worked, 'Clear titles v2');
  });

  await test('settings: update, and refuse a day that is not a Tuesday', async () => {
    let r = await call('PATCH', '/api/settings', { body: { recording_method: 'voiceover', publish_offset: 3, channel_name: 'ZolaxTech' } });
    assert.strictEqual(r.json.recording_method, 'voiceover');
    r = await call('PATCH', '/api/settings', { body: { first_record_day: '2026-10-14' } });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.error, /Tuesday/);
    r = await call('PATCH', '/api/settings', { body: { first_record_day: '2026-10-20' } });
    assert.strictEqual(r.json.first_record_day, '2026-10-20');
  });

  await test('exports: calendar and CSV', async () => {
    const ics = await call('GET', '/api/export/calendar.ics', { raw: true });
    assert.match(ics.headers.get('content-type'), /text\/calendar/);
    assert.strictEqual((ics.text.match(/BEGIN:VEVENT/g) || []).length, 41 * 4);
    assert.ok(ics.text.includes('DTSTART;VALUE=DATE:20261018'), 'first script day is the Sunday before the first Tuesday');
    ics.text.split('\r\n').forEach((l) => assert.ok(Buffer.byteLength(l) <= 75, 'line too long: ' + l));
    const csv = await call('GET', '/api/export/videos.csv', { raw: true });
    const lines = csv.text.trim().split('\r\n');
    assert.strictEqual(lines.length, 42);
    assert.ok(lines[0].includes('Publish day'));
  });

  await test('unknown API address gives a clear 404', async () => {
    const r = await call('GET', '/api/nothing');
    assert.strictEqual(r.status, 404);
  });

  server.close();
  console.log(`\n${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
})();
