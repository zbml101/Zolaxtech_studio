// Restore from a backup file, the careful way: it only ADDS what is missing and never overwrites or deletes anything.
//  - videos are matched by title; their script sections, notes, key points, link and views are filled in only where yours are empty
//  - ideas, to-dos and 4-week reviews are added only if you do not already have them
const express = require('express');
const { wrap, check, HttpError } = require('../lib/http');

const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');
const norm = (x) => str(x, 500).trim().toLowerCase();
const isEmpty = (x) => !x || !String(x).trim();

module.exports = function restoreRoutes() {
  const router = express.Router();
  router.post('/restore', express.json({ limit: '4mb' }), wrap(async (req, res) => {
    const b = req.body;
    if (!b || b.app !== 'ZolaxTech Studio' || b.version !== 1) throw new HttpError(400, 'This is not a ZolaxTech Studio backup file.');
    const r = { videos_filled: 0, ideas_added: 0, todos_added: 0, reviews_added: 0, videos_not_found: 0 };

    // videos
    const live = check(await req.db.from('videos').select('*'), 'load videos');
    const byTitle = new Map(live.map((x) => [norm(x.title), x]));
    for (const old of Array.isArray(b.videos) ? b.videos : []) {
      const cur = byTitle.get(norm(old && old.title));
      if (!cur) { r.videos_not_found++; continue; }
      const patch = {};
      if (isEmpty(cur.notes) && !isEmpty(old.notes)) patch.notes = str(old.notes, 10000);
      if (isEmpty(cur.key_points) && !isEmpty(old.key_points)) patch.key_points = str(old.key_points, 2000);
      if (isEmpty(cur.video_url) && !isEmpty(old.video_url)) patch.video_url = str(old.video_url, 300);
      if (isEmpty(cur.title_am) && !isEmpty(old.title_am)) patch.title_am = str(old.title_am, 200);
      if ((cur.views_7d === null || cur.views_7d === undefined) && Number.isInteger(old.views_7d) && old.views_7d >= 0) patch.views_7d = old.views_7d;
      const script = { ...(cur.script || {}) };
      let scriptChanged = false;
      for (const [k, part] of Object.entries(old.script && typeof old.script === 'object' ? old.script : {})) {
        if (!/^[a-z0-9_-]{1,30}$/i.test(k) || !part) continue;
        const have = script[k] || {};
        const next = { en: have.en || '', am: have.am || '' };
        if (isEmpty(have.en) && !isEmpty(part.en)) { next.en = str(part.en, 20000); scriptChanged = true; }
        if (isEmpty(have.am) && !isEmpty(part.am)) { next.am = str(part.am, 20000); scriptChanged = true; }
        script[k] = next;
      }
      if (scriptChanged) patch.script = script;
      if (Object.keys(patch).length) {
        check(await req.db.from('videos').update(patch).eq('id', cur.id), 'restore video');
        r.videos_filled++;
      }
    }

    // ideas
    const haveIdeas = new Set(check(await req.db.from('ideas').select('idea'), 'load ideas').map((x) => norm(x.idea)));
    for (const i of Array.isArray(b.ideas) ? b.ideas : []) {
      if (!i || isEmpty(i.idea) || haveIdeas.has(norm(i.idea))) continue;
      check(await req.db.from('ideas').insert({ series: str(i.series, 60) || 'Other', idea: str(i.idea, 300).trim(), format: i.format, priority: i.priority, why: str(i.why, 500), used: i.used === true }), 'restore idea');
      haveIdeas.add(norm(i.idea)); r.ideas_added++;
    }

    // to-dos (not linked to videos, since ids differ after a rebuild)
    const haveTodos = new Set(check(await req.db.from('todos').select('title'), 'load to-dos').map((x) => norm(x.title)));
    for (const t of Array.isArray(b.todos) ? b.todos : []) {
      if (!t || isEmpty(t.title) || haveTodos.has(norm(t.title))) continue;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(t.due_date || '') ? t.due_date : null;
      check(await req.db.from('todos').insert({ title: str(t.title, 200).trim(), due_date: due, done: t.done === true, tag: str(t.tag, 40) }), 'restore to-do');
      haveTodos.add(norm(t.title)); r.todos_added++;
    }

    // reviews
    const haveBlocks = new Set(check(await req.db.from('reviews').select('block'), 'load reviews').map((x) => x.block));
    for (const rv of Array.isArray(b.reviews) ? b.reviews : []) {
      if (!rv || !Number.isInteger(rv.block) || rv.block < 1 || rv.block > 30 || haveBlocks.has(rv.block)) continue;
      check(await req.db.from('reviews').insert({ user_id: req.user.id, block: rv.block, worked: str(rv.worked, 5000), change_next: str(rv.change_next, 5000) }), 'restore review');
      haveBlocks.add(rv.block); r.reviews_added++;
    }
    res.json(r);
  }));
  return router;
};
