// Loading everything the app needs in one request, and creating a new user's starting plan.
const express = require('express');
const { wrap, check } = require('../lib/http');
const { nextTuesday, addDays } = require('../lib/dates');
const { loadSeed } = require('../seed');

const { videoColumns, setDocColumn, isMissingColumn } = require('../lib/columns');

const today = () => new Date().toISOString().slice(0, 10);

module.exports = function stateRoutes() {
  const router = express.Router();
  const seed = loadSeed();

  router.get('/state', wrap(async (req, res) => {
    const since = addDays(today(), -35);
    const listVideos = async () => {
      let r = await req.db.from('videos').select(videoColumns()).order('position', { ascending: true });
      if (isMissingColumn(r.error)) { setDocColumn(false); r = await req.db.from('videos').select(videoColumns()).order('position', { ascending: true }); } else if (!r.error) setDocColumn(true);
      return r;
    };
    const [settings, videos, ideas, todos, routine, reviews] = await Promise.all([
      req.db.from('settings').select('*').maybeSingle(),
      listVideos(),
      req.db.from('ideas').select('*').order('created_at', { ascending: false }),
      req.db.from('todos').select('*').order('created_at', { ascending: false }),
      req.db.from('routine_done').select('week_start,task_key').gte('week_start', since).limit(1000),
      req.db.from('reviews').select('*'),
    ]);
    const settingsRow = check(settings, 'load settings');
    if (!settingsRow) return res.json({ needsBootstrap: true, email: req.user.email });
    res.json({
      email: req.user.email,
      settings: settingsRow,
      videos: check(videos, 'load videos'),
      ideas: check(ideas, 'load ideas'),
      todos: check(todos, 'load todos'),
      routine: check(routine, 'load routine'),
      reviews: check(reviews, 'load reviews'),
    });
  }));

  // Creates the starting plan the first time a person signs in. Safe to call again: it does nothing if the plan exists.
  router.post('/bootstrap', wrap(async (req, res) => {
    const existing = check(await req.db.from('settings').select('*').maybeSingle(), 'check settings');
    if (existing) return res.json({ created: false });

    check(await req.db.from('settings').insert({ first_record_day: nextTuesday(today()) }), 'create settings');
    check(await req.db.from('videos').insert(seed.videos), 'create starting videos');
    check(await req.db.from('ideas').insert(seed.ideas), 'create starting ideas');
    res.json({ created: true });
  }));

  return router;
};
