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

  return router;
};
