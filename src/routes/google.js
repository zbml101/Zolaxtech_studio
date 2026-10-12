// Google Workspace: connect an account, put the schedule on Google Calendar, send scripts to Google Docs,
// and send the video list to Google Sheets. All of it is one-way (Studio to Google).
const crypto = require('crypto');
const express = require('express');
const { wrap, check, HttpError } = require('../lib/http');
const { planDates } = require('../lib/dates');
const { addDays } = require('../lib/dates');
const v = require('../lib/validate');
const { videosCsv } = require('../lib/videos-csv');

const KINDS = [['script', 'Script'], ['record', 'Record'], ['edit', 'Edit'], ['publish', 'Publish']];
const eventId = (videoId, kind) => 'zx' + crypto.createHash('sha1').update(`${videoId}:${kind}`).digest('hex');

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = (t) => esc(t).split(/\r?\n/).join('<br>');

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); }
  }));
}

module.exports = function googleRoutes({ google, templates, config }) {
  const router = express.Router();
  const origin = (req) => (config.publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  router.use('/google', (req, res, next) => {
    if (!google.enabled) return next(new HttpError(503, 'Google is not set up on this server yet. The owner needs to add the Google keys (see README).'));
    next();
  });

  async function connectionRow(req) {
    return check(await req.db.from('google_connections').select('*').maybeSingle(), 'load Google connection');
  }

  // A working access token for this person, or a clear error telling them to connect.
  async function session(req) {
    const row = await connectionRow(req);
    if (!row) throw new HttpError(409, 'Connect Google first: Settings, then Google Workspace.');
    let refresh;
    try { refresh = google.open(row.refresh_token_enc); } catch (_) { throw new HttpError(409, 'The saved Google connection cannot be read. Connect Google again.'); }
    try { return { token: await google.accessToken(req.user.id, refresh), row }; } catch (e) {
      if (e.revoked) await req.db.from('google_connections').delete().eq('user_id', req.user.id);
      throw e;
    }
  }

  router.get('/google/status', wrap(async (req, res) => {
    const row = await connectionRow(req);
    const settings = check(await req.db.from('settings').select('google_sheet_id').maybeSingle(), 'load settings');
    res.json({
      configured: true, connected: Boolean(row), email: row ? row.google_email : '',
      lastSync: row ? row.calendar_synced_at : null,
      folderUrl: row && row.folder_id ? `https://drive.google.com/drive/folders/${row.folder_id}` : null,
      sheetUrl: settings && settings.google_sheet_id ? `https://docs.google.com/spreadsheets/d/${settings.google_sheet_id}/edit` : null,
    });
  }));

  router.post('/google/auth-url', wrap(async (req, res) => {
    res.json({ url: google.authUrl(req.user.id, `${origin(req)}/google/callback`) });
  }));

  router.post('/google/connect', wrap(async (req, res) => {
    const code = v.text(req.body && req.body.code, 'Code', { min: 1, max: 2000 });
    if (!google.verifyState(req.body.state, req.user.id)) throw new HttpError(400, 'That Google sign-in expired or belongs to another account. Start the connection again.');
    const { refreshToken, email } = await google.exchangeCode(code, `${origin(req)}/google/callback`);
    check(await req.db.from('google_connections').upsert(
      { user_id: req.user.id, refresh_token_enc: google.seal(refreshToken), google_email: email, folder_id: null, calendar_synced_at: null },
      { onConflict: 'user_id' }), 'save Google connection');
    google.forget(req.user.id);
    res.json({ connected: true, email });
  }));

  router.delete('/google/connection', wrap(async (req, res) => {
    const row = await connectionRow(req);
    if (row) { try { await google.revoke(google.open(row.refresh_token_enc)); } catch (_) { /* removing our copy is what matters */ } }
    check(await req.db.from('google_connections').delete().eq('user_id', req.user.id), 'remove Google connection');
    google.forget(req.user.id);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- Calendar
  router.post('/google/calendar/sync', wrap(async (req, res) => {
    const { token } = await session(req);
    const settings = check(await req.db.from('settings').select('*').single(), 'load settings');
    const videos = check(await req.db.from('videos').select('id,position,series,title,stage').order('position', { ascending: true }), 'load videos');

    const desired = new Map();
    const keep = new Set();
    for (const vid of videos) {
      const d = planDates(settings, vid.position);
      for (const [kind, label] of KINDS) {
        const id = eventId(vid.id, kind);
        keep.add(id);
        if (vid.stage === 'published') continue; // finished work stays on the calendar as it was
        desired.set(id, {
          id, summary: `${label}: ${vid.title}`, transparency: 'transparent',
          description: `Week ${vid.position} · ${vid.series}\nOpen in Studio: ${origin(req)}/#/video/${vid.id}`,
          start: { date: d[kind] }, end: { date: addDays(d[kind], 1) },
          extendedProperties: { private: { zxApp: 'studio', zxVideo: vid.id, zxKind: kind } },
        });
      }
    }

    const existing = new Map((await google.listStudioEvents(token)).map((e) => [e.id, e]));
    const stats = { created: 0, updated: 0, deleted: 0, unchanged: 0 };
    const jobs = [];
    for (const [id, ev] of desired) {
      const ex = existing.get(id);
      if (!ex) jobs.push(async () => {
        try { await google.insertEvent(token, ev); } catch (e) {
          if (e.google && e.google.status === 409) await google.patchEvent(token, id, { ...ev, status: 'confirmed' }); else throw e; // an event the person deleted keeps its id
        }
        stats.created += 1;
      });
      else if (ex.summary !== ev.summary || ex.description !== ev.description || !ex.start || ex.start.date !== ev.start.date) {
        jobs.push(async () => { await google.patchEvent(token, id, ev); stats.updated += 1; });
      } else stats.unchanged += 1;
    }
    for (const id of existing.keys()) if (!keep.has(id)) jobs.push(async () => { await google.deleteEvent(token, id); stats.deleted += 1; });
    await pool(jobs, 5, (job) => job());

    const when = new Date().toISOString();
    check(await req.db.from('google_connections').update({ calendar_synced_at: when }).eq('user_id', req.user.id), 'save sync time');
    res.json({ ...stats, syncedAt: when });
  }));

  // ---------------------------------------------------------------- Docs
  async function folderFor(req, s) {
    const id = await google.ensureFolder(s.token, s.row.folder_id);
    if (id !== s.row.folder_id) check(await req.db.from('google_connections').update({ folder_id: id }).eq('user_id', req.user.id), 'save folder');
    return id;
  }

  router.post('/google/docs/script/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'video id');
    const replace = Boolean(req.body && req.body.replace);
    const vid = check(await req.db.from('videos').select('*').eq('id', id).single(), 'load video');
    if (vid.doc_url && !replace) return res.json({ url: vid.doc_url, existed: true });

    const s = await session(req);
    const folderId = await folderFor(req, s);
    const script = vid.script || {};
    const rows = templates.script.parts.map((p) => {
      const part = script[p.id] || {};
      return `<h2>${esc(p.title)}</h2><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th style="width:50%">English</th><th>Amharic</th></tr><tr><td>${para(part.en)}</td><td>${para(part.am)}</td></tr></table>`;
    }).join('\n');
    const html = `<html><head><meta charset="utf-8"></head><body><h1>${esc(vid.title)}</h1>${vid.title_am ? `<p>${esc(vid.title_am)}</p>` : ''}<p>Week ${vid.position} · ${esc(vid.series)}</p>${rows}</body></html>`;

    const file = await google.uploadConverted(s.token, {
      name: `Week ${vid.position}: ${vid.title} (script)`, mimeType: 'application/vnd.google-apps.document',
      media: html, mediaType: 'text/html; charset=UTF-8', folderId, existingId: replace ? vid.doc_id : null,
    });
    const url = file.url || `https://docs.google.com/document/d/${file.id}/edit`;
    check(await req.db.from('videos').update({ doc_id: file.id, doc_url: url }).eq('id', id), 'save document link');
    res.json({ url, existed: false, replaced: file.replaced });
  }));

  // ---------------------------------------------------------------- Sheets
  router.post('/google/sheets/export', wrap(async (req, res) => {
    const s = await session(req);
    const settings = check(await req.db.from('settings').select('*').single(), 'load settings');
    const videos = check(await req.db.from('videos').select('id,position,series,title,title_am,stage,views_7d,video_url').order('position', { ascending: true }), 'load videos');
    const folderId = await folderFor(req, s);
    const csv = videosCsv(settings, videos).replace(/^﻿/, '');
    const file = await google.uploadConverted(s.token, {
      name: `${settings.channel_name} content plan`, mimeType: 'application/vnd.google-apps.spreadsheet',
      media: csv, mediaType: 'text/csv; charset=UTF-8', folderId, existingId: settings.google_sheet_id,
    });
    check(await req.db.from('settings').update({ google_sheet_id: file.id }).eq('user_id', req.user.id), 'save sheet link');
    res.json({ url: `https://docs.google.com/spreadsheets/d/${file.id}/edit`, replaced: file.replaced });
  }));

  return router;
};
