import { h, s, debounce } from '../lib/dom.js';
import { field, toast, errorText, emptyState } from '../lib/ui.js';
import { seriesColor } from '../lib/constants.js';
import { sum } from '../lib/format.js';
import { state, saveReview, isPublished } from '../store.js';
import { nice } from '../lib/dates.js';
import { datesOf } from '../store.js';
import { viewsChart } from './viewschart.js';

function blockPanel(block, videos) {
  const slice = videos.slice((block - 1) * 4, block * 4);
  if (!slice.length) return null;
  const pub = slice.filter(isPublished);
  const withViews = pub.filter((v) => v.views_7d != null);
  const avg = withViews.length ? Math.round(sum(withViews.map((v) => v.views_7d)) / withViews.length) : null;
  const saved = state.reviews[block] || { worked: '', change_next: '' };
  const status = h('span', { class: 'muted small', role: 'status' });
  const draft = { worked: saved.worked, change_next: saved.change_next };
  const save = debounce(async () => {
    status.textContent = 'Saving…';
    try { await saveReview(block, draft); status.textContent = 'Saved'; } catch (e) { status.textContent = errorText(e); }
  }, 1000);
  const ta = (key, label, ph) => field(label, h('textarea', { rows: 3, maxlength: 5000, placeholder: ph, oninput: (e) => { draft[key] = e.target.value; status.textContent = 'Unsaved changes…'; save(); } }, draft[key]));
  return h('section', { class: 'panel stack' },
    h('div', { class: 'panel-h', style: { marginBottom: 0 } }, h('div', null, h('h2', null, `Weeks ${slice[0].position} to ${slice[slice.length - 1].position}`), h('p', { class: 'muted small' }, `${nice(datesOf(slice[0]).publish)} to ${nice(datesOf(slice[slice.length - 1]).publish)}`)), status),
    h('div', { class: 'row gap-l wrap small' }, h('span', null, `${pub.length} of ${slice.length} published`), h('span', null, avg == null ? 'No view counts yet' : `${avg.toLocaleString()} views on average`)),
    ta('worked', 'What worked', 'Which videos did people finish? What was easy to make?'),
    ta('change_next', 'What I will change next', 'One or two specific changes for the next four weeks'));
}

export function renderReview() {
  const blocks = Math.ceil(state.videos.length / 4);
  const pubCount = state.videos.filter(isPublished).length;
  const current = Math.min(blocks, Math.floor(pubCount / 4) + 1);
  const panels = [];
  for (let b = 1; b <= blocks; b++) if (b <= current + 0) panels.push(b);
  panels.reverse();
  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Review'), h('p', null, 'Look back every four videos: keep what works, change one thing.'))),
    h('section', { class: 'panel' }, h('div', { class: 'panel-h' }, h('h2', null, 'Views in the first 7 days')), viewsChart(state.videos, () => window.__rerender())),
    panels.map((b) => blockPanel(b, state.videos)));
}
