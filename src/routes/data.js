// Settings, ideas, to-dos, weekly routine ticks and reviews.
const express = require('express');
const { wrap, check, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { weekday } = require('../lib/dates');
const { IDEA_FORMATS, PRIORITIES, METHODS } = require('../constants');

module.exports = function dataRoutes({ templates }) {
  const router = express.Router();
  const taskIds = new Set(templates.routine.tasks.map((t) => t.id));

  // ---------------------------------------------------------------- settings
  const SETTINGS = {
    channel_name: (x) => v.text(x, 'Channel name', { min: 1, max: 60 }),
    first_record_day: (x) => {
      v.isoDate(x, 'First recording day');
      if (weekday(x) !== 2) v.bad('Pick a Tuesday: the plan records on Tuesdays.');
      return x;
    },
    publish_offset: (x) => v.int(x, 'Publish day', { min: 1, max: 6 }),
    recording_method: (x) => v.oneOf(x, METHODS, 'Recording method'),
    daily_email: (x) => v.bool(x, 'Daily email'),
  };

  router.patch('/settings', wrap(async (req, res) => {
    const patch = v.pick(req.body, SETTINGS);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to change.');
    const row = check(await req.db.from('settings').update(patch).eq('user_id', req.user.id).select().single(), 'update settings');
    res.json(row);
  }));

  // ---------------------------------------------------------------- ideas
  const IDEA = {
    series: (x) => v.text(x, 'Series', { min: 1, max: 60 }),
    idea: (x) => v.text(x, 'Idea', { min: 1, max: 300 }),
    format: (x) => v.oneOf(x, IDEA_FORMATS, 'Format'),
    priority: (x) => v.oneOf(x, PRIORITIES, 'Priority'),
    why: (x) => v.text(x, 'Why it can spread', { max: 500 }),
    used: (x) => v.bool(x, 'Used'),
  };

  router.post('/ideas', wrap(async (req, res) => {
    const body = v.pick(req.body, IDEA);
    if (!body.idea) v.bad('Idea cannot be empty.');
    const row = check(await req.db.from('ideas').insert(body).select().single(), 'add idea');
    res.status(201).json(row);
  }));

  router.patch('/ideas/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'idea id');
    const patch = v.pick(req.body, IDEA);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to change.');
    const row = check(await req.db.from('ideas').update(patch).eq('id', id).select().single(), 'update idea');
    res.json(row);
  }));

  router.delete('/ideas/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'idea id');
    check(await req.db.from('ideas').delete().eq('id', id), 'delete idea');
    res.json({ ok: true });
  }));

  // Turn an idea into a video in the calendar.
  router.post('/ideas/:id/promote', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'idea id');
    const body = req.body || {};
    const position = body.position === undefined || body.position === null ? null : v.int(body.position, 'Week', { min: 1, max: 500 });
    const idea = check(await req.db.from('ideas').select('*').eq('id', id).single(), 'load idea');
    const video = check(
      await req.db.rpc('add_video_at', { p_position: position, p_series: idea.series, p_title: idea.idea, p_key_points: idea.why || '' }),
      'add video from idea',
    );
    const updated = check(await req.db.from('ideas').update({ used: true, video_id: video.id }).eq('id', id).select().single(), 'mark idea used');
    delete video.script;
    res.status(201).json({ video, idea: updated });
  }));

  // ---------------------------------------------------------------- to-dos
  const TODO = {
    title: (x) => v.text(x, 'To-do', { min: 1, max: 200 }),
    due_date: (x) => (x === null ? null : v.isoDate(x, 'Due date')),
    done: (x) => v.bool(x, 'Done'),
    video_id: (x) => (x === null ? null : v.uuid(x, 'video id')),
    tag: (x) => v.text(x, 'Tag', { max: 40 }),
  };

  router.post('/todos', wrap(async (req, res) => {
    const body = v.pick(req.body, TODO);
    if (!body.title) v.bad('To-do cannot be empty.');
    const row = check(await req.db.from('todos').insert(body).select().single(), 'add to-do');
    res.status(201).json(row);
  }));

  router.patch('/todos/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'to-do id');
    const patch = v.pick(req.body, TODO);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to change.');
    if (patch.done !== undefined) patch.done_at = patch.done ? new Date().toISOString() : null;
    const row = check(await req.db.from('todos').update(patch).eq('id', id).select().single(), 'update to-do');
    res.json(row);
  }));

  router.delete('/todos/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'to-do id');
    check(await req.db.from('todos').delete().eq('id', id), 'delete to-do');
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- weekly routine ticks
  router.put('/routine', wrap(async (req, res) => {
    const body = req.body || {};
    const week = v.isoDate(body.week_start, 'Week start');
    if (weekday(week) !== 0) v.bad('Week start must be a Sunday.');
    if (!taskIds.has(body.task_key)) v.bad('That routine task does not exist.');
    const done = v.bool(body.done, 'Done');
    if (done) {
      check(
        await req.db.from('routine_done').upsert(
          { user_id: req.user.id, week_start: week, task_key: body.task_key },
          { onConflict: 'user_id,week_start,task_key', ignoreDuplicates: true },
        ),
        'tick task',
      );
    } else {
      check(await req.db.from('routine_done').delete().eq('week_start', week).eq('task_key', body.task_key), 'untick task');
    }
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- 4-week reviews
  router.put('/reviews/:block', wrap(async (req, res) => {
    const block = Number.parseInt(req.params.block, 10);
    v.int(block, 'Block', { min: 1, max: 30 });
    const body = v.pick(req.body, {
      worked: (x) => v.text(x, 'What worked', { max: 5000, trim: false }),
      change_next: (x) => v.text(x, 'What I change next', { max: 5000, trim: false }),
    });
    const row = check(
      await req.db.from('reviews').upsert({ user_id: req.user.id, block, ...body }, { onConflict: 'user_id,block' }).select().single(),
      'save review',
    );
    res.json(row);
  }));

  return router;
};
