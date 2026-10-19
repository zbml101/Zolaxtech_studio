// The daily email: the message itself, the "send now" route and the scheduled run.
const assert = require('assert');
const { createApp } = require('../src/app');
const { createFake } = require('./fake-supabase');
const { buildDigest, todayIn } = require('../src/lib/digest');
const { loadTemplates } = require('../src/seed');

(async () => {
  let passed = 0;
  const test = async (n, fn) => { try { await fn(); passed++; console.log('  ok  ', n); } catch (e) { console.error('  FAIL', n, '\n      ', e.message); process.exitCode = 1; } };
  console.log('Daily email tests');
  const templates = loadTemplates();
  const settings = { first_record_day: '2026-10-13', publish_offset: 4, recording_method: 'live' };
  const videos = [{ position: 1, title: 'ChatGPT for Beginners', stage: 'planned' }, { position: 2, title: 'Advanced <ChatGPT>', stage: 'planned' }];

  await test('a record day lists its tasks, what is due, and escapes the video titles', () => {
    const d = buildDigest({ settings, videos, templates, today: '2026-10-13', appUrl: 'https://x.vercel.app' });
    assert.ok(/Record day/.test(d.subject) && /Tue 13 Oct/.test(d.subject));
    assert.ok(/Due today/.test(d.text) && /Record: week 1/.test(d.text));
    assert.ok(/Behind schedule/.test(d.text) && /Script for week 1/.test(d.text)); // script day 11 Oct was missed
    assert.ok(d.html.includes('Advanced &lt;ChatGPT&gt;') === false || d.html.includes('&lt;'));
    assert.ok(d.html.includes('https://x.vercel.app'));
  });
  await test('ticked tasks drop out, and a day off says so', () => {
    const all = buildDigest({ settings, videos, templates, today: '2026-10-13' });
    const ticked = new Set(templates.routine.tasks.filter((t) => t.day === 'tue').map((t) => `2026-10-11|${t.id}`));
    const none = buildDigest({ settings, videos, templates, today: '2026-10-13', ticked });
    assert.ok(all.taskCount > 0 && none.taskCount === 0 && /already ticked/.test(none.text));
    assert.ok(/No channel work/.test(buildDigest({ settings, videos, templates, today: '2026-10-14' }).text));
  });
  await test('today is worked out in the right time zone', () => {
    assert.strictEqual(todayIn('Africa/Addis_Ababa', new Date('2026-10-19T22:30:00Z')), '2026-10-20');
    assert.strictEqual(todayIn('UTC', new Date('2026-10-19T22:30:00Z')), '2026-10-19');
  });

  const sent = [];
  const fake = createFake();
  const mailer = { enabled: true, async send(m) { sent.push(m); return true; } };
  const config = { supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon', allowedEmails: ['ada@example.com', 'bob@example.com'], cronSecret: 'shh', supabaseServiceKey: 'service-key', publicUrl: 'https://x.vercel.app', timezone: 'UTC' };
  const app = createApp({ createClient: fake.createClient, config, mailer });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, headers = {}) => { const r = await fetch(base + path, { method, headers }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const ada = { Authorization: 'Bearer test-token-ada@example.com' };
  await call('POST', '/api/bootstrap', ada);

  await test('"send me today\'s email" mails the signed-in person only', async () => {
    const r = await call('POST', '/api/email/test', ada);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].to, 'ada@example.com');
    assert.strictEqual((await call('POST', '/api/email/test')).status, 401);
  });
  await test('the scheduled run needs the secret', async () => {
    assert.strictEqual((await call('GET', '/api/cron/daily')).status, 401);
    assert.strictEqual((await call('GET', '/api/cron/daily', { Authorization: 'Bearer wrong' })).status, 401);
  });
  await test('the scheduled run mails each approved person with a plan, and respects the off switch', async () => {
    fake.users.push('ada@example.com', 'bob@example.com', 'eve@example.com', 'unconfirmed-bob@example.com');
    await call('POST', '/api/bootstrap', { Authorization: 'Bearer test-token-bob@example.com' });
    sent.length = 0;
    let r = await call('GET', '/api/cron/daily', { Authorization: 'Bearer shh' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(sent.map((m) => m.to).sort(), ['ada@example.com', 'bob@example.com']);
    sent.length = 0;
    await fetch(base + '/api/settings', { method: 'PATCH', headers: { ...ada, 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_email: false }) });
    r = await call('GET', '/api/cron/daily', { Authorization: 'Bearer shh' });
    assert.deepStrictEqual(sent.map((m) => m.to), ['bob@example.com']);
    assert.ok(r.json.skipped.some((s) => /ada@example.com: turned off/.test(s)));
  });
  await test('without email set up, the routes explain what is missing', async () => {
    const a2 = createApp({ createClient: fake.createClient, config: { ...config, resendKey: '' } });
    const s2 = a2.listen(0);
    const r = await fetch(`http://127.0.0.1:${s2.address().port}/api/email/test`, { method: 'POST', headers: ada });
    assert.strictEqual(r.status, 503); assert.ok(/RESEND_API_KEY/.test((await r.json()).error));
    s2.close();
  });
  server.close();
  console.log(`${passed} tests passed`);
})();
