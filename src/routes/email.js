// Daily email: a button to send yourself today's email now, and the scheduled run (called by Vercel Cron).
const crypto = require('crypto');
const express = require('express');
const { wrap, check, HttpError } = require('../lib/http');
const { buildDigest, todayIn } = require('../lib/digest');
const { addDays, weekday } = require('../lib/dates');

async function loadFor(db, userId, today) {
  const weekStart = addDays(today, -weekday(today));
  const pick = (q) => (userId ? q.eq('user_id', userId) : q);
  const [settings, videos, routine] = await Promise.all([
    pick(db.from('settings').select('*')).maybeSingle(),
    pick(db.from('videos').select('position,title,stage')).order('position', { ascending: true }),
    pick(db.from('routine_done').select('week_start,task_key')).gte('week_start', weekStart).limit(500),
  ]);
  return {
    settings: check(settings, 'load settings'),
    videos: check(videos, 'load videos'),
    ticked: new Set((check(routine, 'load routine') || []).map((r) => `${r.week_start}|${r.task_key}`)),
  };
}

// Signed-in routes (after the sign-in check): "send me today's email now".
function emailRoutes({ templates, config, mailer }) {
  const router = express.Router();
  router.post('/email/test', wrap(async (req, res) => {
    if (!mailer.enabled) throw new HttpError(503, 'Email is not set up on this server yet. Add RESEND_API_KEY in the environment variables and redeploy (see the README).');
    const today = todayIn(config.timezone);
    const data = await loadFor(req.db, null, today);
    if (!data.settings) throw new HttpError(409, 'Open the dashboard once first so your plan is created.');
    const mail = buildDigest({ ...data, templates, today, appUrl: config.publicUrl });
    try { await mailer.send({ to: req.user.email, subject: mail.subject, html: mail.html, text: mail.text }); } catch (e) { throw new HttpError(e.status || 502, e.message); }
    res.json({ sent: true, to: req.user.email });
  }));
  return router;
}

// Scheduled route: runs without anyone signed in, so it is protected by CRON_SECRET and reads with the service key.
function cronRoute({ createClient, config, templates, mailer }) {
  const router = express.Router();
  router.get('/cron/daily', wrap(async (req, res) => {
    const secret = config.cronSecret;
    if (!secret || !config.supabaseServiceKey) throw new HttpError(503, 'The daily email is not set up (CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY are needed).');
    const given = Buffer.from(String(req.headers.authorization || ''));
    const want = Buffer.from(`Bearer ${secret}`);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new HttpError(401, 'Not allowed.');
    if (!mailer.enabled) throw new HttpError(503, 'RESEND_API_KEY is missing.');

    const admin = createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const today = todayIn(config.timezone);
    const out = { date: today, sent: 0, skipped: [], errors: [] };
    const wanted = new Set(config.allowedEmails || []);
    const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new HttpError(502, `Could not list users: ${error.message}`);
    for (const user of (list && list.users) || []) {
      const email = String(user.email || '').toLowerCase();
      if (!user.email_confirmed_at || (wanted.size && !wanted.has(email))) continue;
      try {
        const data = await loadFor(admin, user.id, today);
        if (!data.settings) { out.skipped.push(`${email}: no plan yet`); continue; }
        if (data.settings.daily_email === false) { out.skipped.push(`${email}: turned off`); continue; }
        const mail = buildDigest({ ...data, templates, today, appUrl: config.publicUrl });
        await mailer.send({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
        out.sent++;
      } catch (e) { out.errors.push(`${email}: ${e.message}`); }
    }
    res.json(out);
  }));
  return router;
}

module.exports = { emailRoutes, cronRoute };
