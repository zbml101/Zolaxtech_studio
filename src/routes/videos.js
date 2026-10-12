const express = require('express');
const { wrap, check, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { STAGES } = require('../constants');

const LIST_COLUMNS =
  'id,position,series,title,title_am,key_points,stage,checklist,views_7d,video_url,notes,published_at,updated_at';

function scriptValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) v.bad('The script must be an object of sections.');
  const keys = Object.keys(value);
  if (keys.length > 40) v.bad('The script has too many sections.');
  const out = {};
  for (const key of keys) {
    if (!/^[a-z0-9_-]{1,30}$/i.test(key)) v.bad('A script section has an invalid name.');
    const part = value[key] || {};
    out[key] = {
      en: v.text(part.en === undefined ? '' : part.en, 'English script', { max: 20000, trim: false }),
      am: v.text(part.am === undefined ? '' : part.am, 'Amharic script', { max: 20000, trim: false }),
    };
  }
  return out;
}

function checklistValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) v.bad('The checklist must be an object.');
  const keys = Object.keys(value);
  if (keys.length > 100) v.bad('The checklist has too many items.');
  const out = {};
  for (const key of keys) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(key)) v.bad('A checklist item has an invalid name.');
    if (value[key] === true) out[key] = true;
  }
  return out;
}

const PATCHABLE = {
  title: (x) => v.text(x, 'Title', { min: 1, max: 200 }),
  title_am: (x) => v.text(x, 'Amharic title', { max: 200 }),
  series: (x) => v.text(x, 'Series', { min: 1, max: 60 }),
  key_points: (x) => v.text(x, 'Key points', { max: 2000, trim: false }),
  stage: (x) => v.oneOf(x, STAGES, 'Stage'),
  views_7d: (x) => (x === null ? null : v.int(x, 'Views', { min: 0, max: 1_000_000_000 })),
  video_url: (x) => v.text(x, 'Video link', { max: 300 }),
  notes: (x) => v.text(x, 'Notes', { max: 10000, trim: false }),
  script: scriptValue,
  checklist: checklistValue,
};

module.exports = function videoRoutes() {
  const router = express.Router();

  // Add a video at a week number (everything after it moves one week later).
  router.post('/videos', wrap(async (req, res) => {
    const body = req.body || {};
    const series = v.text(body.series, 'Series', { min: 1, max: 60 });
    const title = v.text(body.title, 'Title', { min: 1, max: 200 });
    const keyPoints = v.text(body.key_points === undefined ? '' : body.key_points, 'Key points', { max: 2000 });
    const position = body.position === undefined || body.position === null ? null : v.int(body.position, 'Week', { min: 1, max: 500 });
    const row = check(
      await req.db.rpc('add_video_at', { p_position: position, p_series: series, p_title: title, p_key_points: keyPoints }),
      'add video',
    );
    delete row.script;
    res.status(201).json(row);
  }));

  // Put all videos in a new order. The body lists every video id, first week first.
  router.post('/videos/reorder', wrap(async (req, res) => {
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) v.bad('Send the list of video ids.');
    ids.forEach((id) => v.uuid(id, 'video id'));
    if (new Set(ids).size !== ids.length) v.bad('Each video can appear only once.');
    check(await req.db.rpc('reorder_videos', { p_ids: ids }), 'reorder videos');
    res.json({ ok: true });
  }));

  router.get('/videos/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'video id');
    const row = check(await req.db.from('videos').select('*').eq('id', id).single(), 'load video');
    res.json(row);
  }));

  router.patch('/videos/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'video id');
    const patch = v.pick(req.body, PATCHABLE);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to change.');

    if (patch.stage !== undefined) {
      const current = check(await req.db.from('videos').select('stage,published_at').eq('id', id).single(), 'load video');
      patch.published_at = patch.stage === 'published' ? current.published_at || new Date().toISOString() : null;
    }

    const columns = patch.script !== undefined ? '*' : LIST_COLUMNS;
    const row = check(await req.db.from('videos').update(patch).eq('id', id).select(columns).single(), 'update video');
    res.json(row);
  }));

  router.delete('/videos/:id', wrap(async (req, res) => {
    const id = v.uuid(req.params.id, 'video id');
    check(await req.db.rpc('delete_video', { p_id: id }), 'delete video');
    res.json({ ok: true });
  }));

  return router;
};
