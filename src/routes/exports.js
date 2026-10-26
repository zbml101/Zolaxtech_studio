const express = require('express');
const { wrap, check } = require('../lib/http');
const { buildCalendar } = require('../lib/ics');
const { videosCsv } = require('../lib/videos-csv');

module.exports = function exportRoutes() {
  const router = express.Router();

  async function load(req) {
    const settings = check(await req.db.from('settings').select('*').single(), 'load settings');
    const videos = check(
      await req.db.from('videos').select('id,position,series,title,title_am,stage,views_7d,video_url').order('position', { ascending: true }),
      'load videos',
    );
    return { settings, videos };
  }

  router.get('/export/calendar.ics', wrap(async (req, res) => {
    const { settings, videos } = await load(req);
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zolaxtech-plan.ics"',
      'Cache-Control': 'no-store',
    });
    res.send(buildCalendar(videos, settings));
  }));

  router.get('/export/videos.csv', wrap(async (req, res) => {
    const { settings, videos } = await load(req);
    const csv = videosCsv(settings, videos);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zolaxtech-videos.csv"',
      'Cache-Control': 'no-store',
    });
    res.send(csv);
  }));

  // Everything this person owns, in one file (settings, videos with scripts and checklists, ideas, tasks, ticks, reviews).
  router.get('/export/backup.json', wrap(async (req, res) => {
    const get = async (table, order) => {
      let q = req.db.from(table).select('*');
      if (order) q = q.order(order, { ascending: true });
      return check(await q, `back up ${table}`);
    };
    const [videos, ideas, todos, routine_done, reviews] = await Promise.all([get('videos', 'position'), get('ideas', 'created_at'), get('todos', 'created_at'), get('routine_done'), get('reviews')]);
    const settings = check(await req.db.from('settings').select('*').maybeSingle(), 'back up settings');
    if (settings) delete settings.google_sheet_id; // tied to this Google account, not part of your content
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="zolaxtech-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    });
    res.send(JSON.stringify({ app: 'ZolaxTech Studio', version: 1, exported_at: new Date().toISOString(), email: req.user.email, settings, videos, ideas, todos, routine_done, reviews }, null, 2));
  }));

  return router;
};
