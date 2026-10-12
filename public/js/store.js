// The app's data in one place. Screens read from `state`, call the actions, and redraw when the store says it changed.
import { api } from './api.js';
import { toast, confetti, errorText } from './lib/ui.js';
import { todayISO, sundayOf, planDates, weekday, addDays } from './lib/dates.js';

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const state = {
  ready: false,
  email: '',
  settings: null,
  videos: [],
  ideas: [],
  todos: [],
  routine: new Set(), // "weekStart|taskKey"
  reviews: {},        // block -> row
  templates: null,
  scripts: new Map(), // id -> full video row (with script), loaded when a video is opened
  today: todayISO(),
  google: { configured: false, connected: false }, // Google Workspace link, loaded with the rest
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = () => subs.forEach((fn) => fn());

// ---------------------------------------------------------------- loading
function apply(data) {
  state.email = data.email || state.email;
  state.settings = data.settings;
  state.videos = data.videos.map(stripScript);
  state.ideas = data.ideas;
  state.todos = data.todos;
  state.routine = new Set(data.routine.map((r) => `${r.week_start}|${r.task_key}`));
  state.reviews = Object.fromEntries(data.reviews.map((r) => [r.block, r]));
  state.today = todayISO();
}
const stripScript = (v) => { const { script, ...rest } = v; return rest; };

export async function load() {
  if (!state.templates) state.templates = await api.get('/templates');
  let data = await api.get('/state');
  if (data.needsBootstrap) {
    await api.post('/bootstrap');
    data = await api.get('/state');
  }
  apply(data);
  await loadGoogle();
  state.ready = true;
  emit();
}

export async function refresh() {
  try { apply(await api.get('/state')); emit(); } catch (e) { toast(errorText(e), 'error'); }
}

export function reset() {
  Object.assign(state, { ready: false, email: '', settings: null, videos: [], ideas: [], todos: [], routine: new Set(), reviews: {}, scripts: new Map() });
}

// ---------------------------------------------------------------- derived
export const datesOf = (v) => planDates(state.settings, v.position);
export const videoById = (id) => state.videos.find((v) => v.id === id);
export const isPublished = (v) => v.stage === 'published';
export const isOverdue = (v) => !isPublished(v) && datesOf(v).publish < state.today;
export const nextUp = () => state.videos.find((v) => !isPublished(v)) || null;

// The video whose recording day falls in the week that starts on `weekStart`.
export function videoForWeek(weekStart) {
  const end = addDays(weekStart, 6);
  return state.videos.find((v) => { const r = datesOf(v).record; return r >= weekStart && r <= end; }) || null;
}

export function tasksFor(dayKey) {
  const method = state.settings.recording_method;
  return state.templates.routine.tasks.filter((t) => t.day === dayKey && (t.applies === 'both' || t.applies === method));
}
export const isTicked = (weekStart, key) => state.routine.has(`${weekStart}|${key}`);

// How much of a week's routine is done: { done, total }
export function weekProgress(weekStart) {
  let done = 0, total = 0;
  for (const d of DAY_KEYS) for (const t of tasksFor(d)) { total++; if (isTicked(weekStart, t.id)) done++; }
  return { done, total };
}
export function dayProgress(weekStart, dayKey) {
  const list = tasksFor(dayKey);
  return { done: list.filter((t) => isTicked(weekStart, t.id)).length, total: list.length };
}

// ---------------------------------------------------------------- videos
function mergeVideo(row) {
  const i = state.videos.findIndex((v) => v.id === row.id);
  const clean = stripScript(row);
  if (i >= 0) state.videos[i] = { ...state.videos[i], ...clean };
  if (row.script !== undefined) state.scripts.set(row.id, row);
}

export async function patchVideo(id, patch, { quiet = false } = {}) {
  const before = videoById(id);
  const snapshot = before ? { ...before } : null;
  if (before) {
    const { script, ...visible } = patch;
    Object.assign(before, visible);
    if (visible.stage !== undefined) before.published_at = visible.stage === 'published' ? before.published_at || new Date().toISOString() : null;
  }
  if (!quiet) emit();
  try {
    const row = await api.patch(`/videos/${id}`, patch);
    mergeVideo(row);
    if (!quiet) emit();
    return row;
  } catch (e) {
    if (before && snapshot) Object.assign(before, snapshot);
    emit();
    toast(errorText(e), 'error');
    throw e;
  }
}

export async function setStage(id, stage) {
  const v = videoById(id);
  if (!v || v.stage === stage) return;
  const was = v.stage;
  await patchVideo(id, { stage });
  if (stage === 'published' && was !== 'published') {
    confetti();
    toast(`Published: week ${v.position} is done. Keep the streak going.`, 'success');
  }
}

export async function loadFullVideo(id) {
  if (state.scripts.has(id)) return state.scripts.get(id);
  const row = await api.get(`/videos/${id}`);
  state.scripts.set(id, row);
  return row;
}

export async function addVideo(body) {
  const row = await api.post('/videos', body);
  await refresh();
  toast('Added to the pipeline.', 'success');
  return row;
}

export async function deleteVideo(id) {
  await api.del(`/videos/${id}`);
  state.scripts.delete(id);
  await refresh();
}

export async function reorder(ids) {
  const byId = new Map(state.videos.map((v) => [v.id, v]));
  const prev = state.videos;
  state.videos = ids.map((id, i) => ({ ...byId.get(id), position: i + 1 }));
  emit();
  try { await api.post('/videos/reorder', { ids }); } catch (e) { state.videos = prev; emit(); toast(errorText(e), 'error'); }
}

export function moveVideo(id, delta) {
  const ids = state.videos.map((v) => v.id);
  const i = ids.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return reorder(ids);
}

// ---------------------------------------------------------------- ideas
export async function addIdea(body) {
  const row = await api.post('/ideas', body);
  state.ideas.unshift(row); emit();
  return row;
}
export async function patchIdea(id, patch) {
  const i = state.ideas.findIndex((x) => x.id === id);
  const prev = { ...state.ideas[i] };
  Object.assign(state.ideas[i], patch); emit();
  try { state.ideas[i] = await api.patch(`/ideas/${id}`, patch); emit(); } catch (e) { state.ideas[i] = prev; emit(); toast(errorText(e), 'error'); }
}
export async function deleteIdea(id) {
  await api.del(`/ideas/${id}`);
  state.ideas = state.ideas.filter((x) => x.id !== id); emit();
}
export async function promoteIdea(id, position) {
  await api.post(`/ideas/${id}/promote`, { position });
  await refresh();
}

// ---------------------------------------------------------------- to-dos
export async function addTodo(body) {
  const row = await api.post('/todos', body);
  state.todos.unshift(row); emit();
}
export async function patchTodo(id, patch) {
  const i = state.todos.findIndex((x) => x.id === id);
  const prev = { ...state.todos[i] };
  Object.assign(state.todos[i], patch); emit();
  try { state.todos[i] = await api.patch(`/todos/${id}`, patch); emit(); } catch (e) { state.todos[i] = prev; emit(); toast(errorText(e), 'error'); }
}
export async function deleteTodo(id) {
  const prev = state.todos;
  state.todos = state.todos.filter((x) => x.id !== id); emit();
  try { await api.del(`/todos/${id}`); } catch (e) { state.todos = prev; emit(); toast(errorText(e), 'error'); }
}

// ---------------------------------------------------------------- routine, reviews, settings
export async function tick(weekStart, key, done) {
  const k = `${weekStart}|${key}`;
  if (done) state.routine.add(k); else state.routine.delete(k);
  emit();
  try { await api.put('/routine', { week_start: weekStart, task_key: key, done }); } catch (e) {
    if (done) state.routine.delete(k); else state.routine.add(k);
    emit(); toast(errorText(e), 'error');
  }
}

export async function saveReview(block, body) {
  const row = await api.put(`/reviews/${block}`, body);
  state.reviews[block] = row;
  return row;
}

export async function saveSettings(patch) {
  const prev = { ...state.settings };
  Object.assign(state.settings, patch); emit();
  try { state.settings = await api.patch('/settings', patch); emit(); } catch (e) { state.settings = prev; emit(); toast(errorText(e), 'error'); throw e; }
}

export const weekStartOf = (iso) => sundayOf(iso);
export const dayKeyOf = (iso) => DAY_KEYS[weekday(iso)];

// ---------------------------------------------------------------- Google Workspace
export async function loadGoogle() {
  try { state.google = await api.get('/google/status'); } catch (e) {
    state.google = { configured: e.status !== 503 ? state.google.configured : false, connected: false };
    if (e.status === 503) state.google.configured = false;
  }
  emit();
}

export async function connectGoogle() {
  const { url } = await api.post('/google/auth-url');
  location.href = url;
}
export async function finishGoogleConnect(code, stateParam) {
  const r = await api.post('/google/connect', { code, state: stateParam });
  await loadGoogle();
  return r;
}
export async function disconnectGoogle() {
  await api.del('/google/connection');
  await loadGoogle();
}
export async function syncCalendar() {
  const r = await api.post('/google/calendar/sync');
  await loadGoogle();
  return r;
}
export async function exportSheet() {
  const r = await api.post('/google/sheets/export');
  await loadGoogle();
  return r;
}
export async function sendScriptToDocs(id, replace = false) {
  const r = await api.post(`/google/docs/script/${id}`, { replace });
  const v = videoById(id);
  if (v) v.doc_url = r.url;
  emit();
  return r;
}
