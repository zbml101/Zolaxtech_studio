const express = require('express');
const { wrap, check } = require('../lib/http');
const { planDates } = require('../lib/dates');
const { buildCalendar } = require('../lib/ics');
const { toCsv } = require('../lib/csv');

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
    const dates = (v) => planDates(settings, v.position);
    const csv = toCsv(
      [
        { label: 'Week', value: (v) => v.position },
        { label: 'Series', value: (v) => v.series },
        { label: 'Title', value: (v) => v.title },
        { label: 'Amharic title', value: (v) => v.title_am },
        { label: 'Stage', value: (v) => v.stage },
        { label: 'Script day', value: (v) => dates(v).script },
        { label: 'Record day', value: (v) => dates(v).record },
        { label: 'Edit day', value: (v) => dates(v).edit },
        { label: 'Publish day', value: (v) => dates(v).publish },
        { label: 'Views after 7 days', value: (v) => v.views_7d },
        { label: 'Video link', value: (v) => v.video_url },
      ],
      videos,
    );
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zolaxtech-videos.csv"',
      'Cache-Control': 'no-store',
    });
    res.send(csv);
  }));

  return router;
};
