// Starts the real app against in-memory stand-ins for Supabase and Google, so every screen can be tried
// with no accounts at all.   node test/dev.js   then open http://localhost:3100
const path = require('path');
const express = require('express');
const { createApp } = require('../src/app');
const { createFake } = require('./fake-supabase');
const { createFakeGoogle } = require('./fake-google');

const port = Number(process.env.PORT) || 3100;
const fake = createFake();
const g = createFakeGoogle();
const app = createApp({
  createClient: fake.createClient,
  config: {
    supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon',
    allowedEmails: (process.env.ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    google: { clientId: 'dev', clientSecret: 'dev', tokenKey: 'dev-only-key', authEndpoint: `http://localhost:${port}/fake-google-consent` },
  },
  supabaseBrowserBundle: path.join(__dirname, 'stub-supabase-browser.js'),
  google: { fetchImpl: g.fetchImpl },
  mailer: { enabled: true, async send(m) { console.log('[dev mail]', m.to, '|', m.subject); return true; } },
});

const outer = express();
// Stands in for Google's consent screen: approve straight away and go back to the app.
outer.get('/fake-google-consent', (req, res) => {
  const back = new URL(req.query.redirect_uri);
  if (req.query.deny) back.searchParams.set('error', 'access_denied'); else back.searchParams.set('code', 'good-code');
  back.searchParams.set('state', req.query.state);
  res.redirect(back.toString());
});
outer.get('/__fake-google-state', (req, res) => res.json({ events: g.events.size, files: [...g.files.values()].map((f) => ({ name: f.name, mimeType: f.mimeType })) }));
outer.use(app);
outer.listen(port, () => console.log(`Dev server with fake Supabase and Google on http://localhost:${port}`));
