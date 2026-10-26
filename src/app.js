// Builds the Express app. Everything it needs from the outside (the Supabase client factory and
// the Supabase settings) is passed in, which also lets the tests run it with an in-memory stand-in.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { HttpError } = require('./lib/http');
const { authMiddleware } = require('./auth');
const { loadTemplates } = require('./seed');
const { createMailer } = require('./lib/mail');
const { emailRoutes, cronRoute } = require('./routes/email');
const { createGoogle } = require('./lib/google');
const { STAGES, IDEA_FORMATS, PRIORITIES } = require('./constants');

function createApp({ createClient, config, supabaseBrowserBundle, google: googleOptions = {}, mailer: mailerOverride }) {
  const google = createGoogle({ config: config.google || {}, fetchImpl: googleOptions.fetchImpl });
  const templates = loadTemplates();
  const mailer = mailerOverride || createMailer({ apiKey: config.resendKey, from: config.mailFrom || 'ZolaxTech Studio <onboarding@resend.dev>' });
  config.timezone = config.timezone || 'Africa/Addis_Ababa';
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // the hosting platform puts a proxy in front of the app

  const connect = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'];
  if (config.supabaseUrl) {
    try {
      const u = new URL(config.supabaseUrl);
      connect.push(u.origin, u.origin.replace(/^http/, 'ws'));
    } catch (_) { /* ignore a bad URL here; the config check reports it */ }
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: connect,
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
    }),
  );
  app.use(compression());
  app.use((req, res, next) => (req.path === '/api/restore' ? next() : express.json({ limit: '1mb' })(req, res, next)));

  // ---------------------------------------------------------------- API
  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  api.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  // These two values are meant to be public: the browser needs them to sign in with Supabase.
  api.get('/config', (req, res) => res.json({ supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey, googleEnabled: google.enabled, emailEnabled: mailer.enabled, restricted: Boolean(config.allowedEmails && config.allowedEmails.length) }));
  // Open /api/diagnose in the browser to see, without signing in, whether the server is set up correctly.
  api.get('/diagnose', async (req, res) => {
    const out = { node: process.version, env: { SUPABASE_URL: Boolean(config.supabaseUrl), SUPABASE_ANON_KEY: Boolean(config.supabaseAnonKey), PUBLIC_URL: Boolean(config.publicUrl), approvedEmails: (config.allowedEmails || []).length, google: google.enabled },
      supabaseHost: null, supabaseReachable: null, tables: null, templates: Boolean(templates && templates.routine && templates.routine.tasks.length) };
    try { out.supabaseHost = new URL(config.supabaseUrl).host; } catch (_) { out.supabaseHost = 'the SUPABASE_URL is not a valid address'; }
    if (out.supabaseHost && config.supabaseAnonKey) {
      const headers = { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` };
      try {
        const r = await fetch(`${config.supabaseUrl}/auth/v1/health`, { headers });
        out.supabaseReachable = r.ok ? 'yes' : `answered ${r.status} (check SUPABASE_ANON_KEY)`;
      } catch (e) { out.supabaseReachable = `no: ${e.cause && e.cause.code ? e.cause.code : e.message}`; }
      out.tables = {};
      for (const t of ['settings', 'videos', 'ideas', 'todos', 'routine_done', 'reviews', 'google_connections']) {
        try {
          const r = await fetch(`${config.supabaseUrl}/rest/v1/${t}?select=*&limit=0`, { headers });
          const body = await r.text();
          out.tables[t] = r.ok || /permission denied|row-level/i.test(body) ? 'ok' : `missing or blocked (${r.status}): ${body.slice(0, 120)}`;
        } catch (e) { out.tables[t] = `error: ${e.message}`; }
      }
    }
    res.set('Cache-Control', 'no-store').json(out);
  });
  api.get('/templates', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ ...templates, stages: STAGES, ideaFormats: IDEA_FORMATS, priorities: PRIORITIES });
  });

  api.use(cronRoute({ createClient, config, templates, mailer })); // scheduled run: has its own secret, no sign-in
  api.use(authMiddleware({ createClient, config }));
  api.use(require('./routes/state')());
  api.use(require('./routes/videos')());
  api.use(require('./routes/data')({ templates }));
  api.use(require('./routes/exports')());
  api.use(require('./routes/restore')());
  api.use(emailRoutes({ templates, config, mailer }));
  api.use(require('./routes/google')({ google, templates, config }));
  api.use((req, res) => res.status(404).json({ error: 'That address does not exist.' }));
  app.use('/api', api);

  // ---------------------------------------------------------------- the web app itself
  if (supabaseBrowserBundle) {
    app.get('/vendor/supabase.js', (req, res) => res.sendFile(supabaseBrowserBundle));
  }
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // ---------------------------------------------------------------- errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const detail = (e) => (req.user && e && e.detail ? { detail: e.detail } : {});
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...detail(err) });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too much text to save at once.' });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'The request was not valid JSON.' });
    console.error('[server] unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment.', ...(req.user ? { detail: `${(err && err.name) || 'Error'}: ${String((err && err.message) || err).slice(0, 200)}` } : {}) });
  });

  return app;
}

module.exports = { createApp };
