// A small in-memory stand-in for Supabase, used only by the tests and by `npm run dev:fake`.
// It copies the parts of the supabase-js API that the server uses, including row-level security
// (every query only sees the signed-in user's rows) and the three database functions.
const crypto = require('crypto');
const { weekday } = require('../src/lib/dates');

const STAGES = ['planned', 'scripted', 'recorded', 'edited', 'thumbnail', 'scheduled', 'published'];
const PRIMARY = { settings: ['user_id'], google_connections: ['user_id'], routine_done: ['user_id', 'week_start', 'task_key'], reviews: ['user_id', 'block'] };

function createFake() {
  const tables = { settings: [], videos: [], ideas: [], todos: [], routine_done: [], reviews: [], google_connections: [] };
  const users = [];
  let tick = 0;
  const stamp = () => new Date(Date.now() + tick++).toISOString();
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const defaults = {
    settings: () => ({ channel_name: 'ZolaxTech', publish_offset: 4, recording_method: 'live', created_at: stamp(), updated_at: stamp() }),
    videos: () => ({ id: crypto.randomUUID(), title_am: '', key_points: '', stage: 'planned', script: {}, checklist: {}, views_7d: null, video_url: '', notes: '', published_at: null, created_at: stamp(), updated_at: stamp() }),
    ideas: () => ({ id: crypto.randomUUID(), series: 'General', format: 'Long', priority: 'Medium', why: '', used: false, video_id: null, created_at: stamp() }),
    todos: () => ({ id: crypto.randomUUID(), due_date: null, done: false, done_at: null, video_id: null, tag: '', created_at: stamp() }),
    routine_done: () => ({ done_at: stamp() }),
    google_connections: () => ({ google_email: '', folder_id: null, calendar_synced_at: null, created_at: stamp() }),
    reviews: () => ({ worked: '', change_next: '', updated_at: stamp() }),
  };

  function userFor(token) {
    const m = /^test-token-(.+)$/.exec(token || '');
    if (!m) return null;
    const h = crypto.createHash('sha1').update(m[1]).digest('hex');
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    return { id, email: m[1], email_confirmed_at: m[1].startsWith('unconfirmed-') ? null : '2026-01-01T00:00:00Z' };
  }

  const err = (code, message) => ({ data: null, error: { code, message } });

  function checkRow(table, row) {
    if (table === 'videos' && !STAGES.includes(row.stage)) return err('23514', 'bad stage');
    if (table === 'settings' && weekday(row.first_record_day) !== 2) return err('23514', 'first_record_day must be a Tuesday');
    return null;
  }

  class Query {
    constructor(table, uid, bypass) {
      this.table = table; this.uid = uid; this.bypass = bypass; this.op = 'select'; this.filters = []; this.sort = null;
      this.limitN = null; this.payload = null; this.returning = false; this.mode = 'many'; this.cols = '*'; this.opts = {};
    }
    select(cols = '*') { if (this.op === 'select') this.cols = cols; else { this.returning = true; this.cols = cols; } return this; }
    insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    upsert(rows, opts) { this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; this.opts = opts || {}; return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
    order(c, { ascending = true } = {}) { this.sort = { c, ascending }; return this; }
    limit(n) { this.limitN = n; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    then(res, rej) { return Promise.resolve(this.exec()).then(res, rej); }

    project(rows) {
      let out = rows;
      if (this.cols && this.cols !== '*') {
        const keys = this.cols.split(',').map((s) => s.trim());
        out = rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])));
      }
      return clone(out);
    }

    finish(rows, returnData) {
      if (!returnData) return { data: null, error: null };
      const out = this.project(rows);
      if (this.mode === 'single') return out.length === 1 ? { data: out[0], error: null } : err('PGRST116', 'JSON object requested, multiple (or no) rows returned');
      if (this.mode === 'maybe') return { data: out[0] || null, error: null };
      return { data: out, error: null };
    }

    exec() {
      if (!this.uid && !this.bypass) return err('42501', 'not signed in');
      const store = tables[this.table];
      const mine = () => (this.bypass ? store.slice() : store.filter((r) => r.user_id === this.uid));
      const matching = () => mine().filter((r) => this.filters.every((f) => f(r)));

      if (this.op === 'select') {
        let rows = matching();
        if (this.sort) {
          const { c, ascending } = this.sort;
          rows = rows.slice().sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (ascending ? 1 : -1));
        }
        if (this.limitN) rows = rows.slice(0, this.limitN);
        return this.finish(rows, true);
      }

      if (this.op === 'insert' || this.op === 'upsert') {
        const added = [];
        for (const input of this.payload) {
          if (input.user_id && input.user_id !== this.uid) return err('42501', 'row-level security');
          const row = { ...defaults[this.table](), ...input, user_id: this.uid };
          const bad = checkRow(this.table, row);
          if (bad) return bad;
          const keys = this.op === 'upsert' && this.opts.onConflict ? this.opts.onConflict.split(',') : PRIMARY[this.table] || ['id'];
          const existing = store.find((r) => keys.every((k) => r[k] === row[k]));
          if (existing) {
            if (this.op === 'insert') return err('23505', 'duplicate key');
            if (this.opts.ignoreDuplicates) { added.push(existing); continue; }
            Object.assign(existing, input, { user_id: this.uid });
            if ('updated_at' in existing) existing.updated_at = stamp();
            added.push(existing);
          } else {
            store.push(row);
            added.push(row);
          }
        }
        return this.finish(added, this.returning);
      }

      if (this.op === 'update') {
        const rows = matching();
        for (const r of rows) {
          const next = { ...r, ...this.payload };
          const bad = checkRow(this.table, next);
          if (bad) return bad;
          Object.assign(r, this.payload);
          if ('updated_at' in r) r.updated_at = stamp();
        }
        return this.finish(rows, this.returning);
      }

      if (this.op === 'delete') {
        for (const r of matching()) store.splice(store.indexOf(r), 1);
        return { data: null, error: null };
      }
      return err('XX000', 'unsupported');
    }
  }

  const rpcs = {
    add_video_at(uid, { p_position, p_series, p_title, p_key_points }) {
      const mine = tables.videos.filter((v) => v.user_id === uid);
      const max = mine.reduce((m, v) => Math.max(m, v.position), 0);
      const pos = Math.max(1, Math.min(p_position == null ? max + 1 : p_position, max + 1));
      mine.filter((v) => v.position >= pos).forEach((v) => { v.position += 1; });
      const row = { ...defaults.videos(), user_id: uid, position: pos, series: p_series, title: p_title, key_points: p_key_points || '' };
      tables.videos.push(row);
      return { data: clone(row), error: null };
    },
    delete_video(uid, { p_id }) {
      const row = tables.videos.find((v) => v.id === p_id && v.user_id === uid);
      if (!row) return { data: null, error: null };
      tables.videos.splice(tables.videos.indexOf(row), 1);
      tables.videos.filter((v) => v.user_id === uid && v.position > row.position).forEach((v) => { v.position -= 1; });
      tables.ideas.filter((i) => i.video_id === p_id).forEach((i) => { i.video_id = null; });
      return { data: null, error: null };
    },
    reorder_videos(uid, { p_ids }) {
      const mine = tables.videos.filter((v) => v.user_id === uid);
      if (p_ids.length !== mine.length) return err('P0001', 'reorder_videos needs every video id exactly once');
      p_ids.forEach((id, i) => { const v = mine.find((x) => x.id === id); if (v) v.position = i + 1; });
      return { data: null, error: null };
    },
  };

  function createClient(url, key, opts = {}) {
    const header = (opts.global && opts.global.headers && opts.global.headers.Authorization) || '';
    const user = userFor(header.replace(/^Bearer /i, ''));
    const service = key === 'service-key';
    return {
      auth: {
        admin: { async listUsers() { return { data: { users: users.map((e) => userFor(`test-token-${e}`)) }, error: null }; } },
        async getUser(token) {
          const u = userFor(token);
          return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
        },
      },
      from: (table) => new Query(table, user && user.id, service),
      async rpc(name, args) {
        if (!user) return err('42501', 'not signed in');
        return rpcs[name](user.id, args);
      },
    };
  }

  return { createClient, tables, users };
}

module.exports = { createFake };
