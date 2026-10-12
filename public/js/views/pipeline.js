import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { modal, field, seriesTag, toast, emptyState, errorText } from '../lib/ui.js';
import { STAGES, stageIndex, stageLabel, seriesColor } from '../lib/constants.js';
import { nice, addDays, weekday, parse, monthName, fmt } from '../lib/dates.js';
import { lsGet, lsSet } from '../lib/dom.js';
import { state, datesOf, isOverdue, isPublished, setStage, reorder, moveVideo, addVideo, nextUp } from '../store.js';

let mode = lsGet('zx-pipe-mode', 'board');
let seriesFilter = 'All';
let query = '';
let showAllPlanned = false;
let calMonth = null; // {y, m}

const go = (id) => { location.hash = `#/video/${id}`; };
const visible = () => state.videos.filter((v) => (seriesFilter === 'All' || v.series === seriesFilter) && (!query || (v.title + ' ' + v.key_points).toLowerCase().includes(query.toLowerCase())));

// ---------------------------------------------------------------- add a video
export function openNewVideo(prefill = {}) {
  const series = [...new Set(state.videos.map((v) => v.series))];
  modal({
    title: 'New video',
    content: (close) => {
      let busy = false;
      const next = nextUp();
      const form = h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        if (busy) return;
        const f = new FormData(e.target);
        const where = f.get('where');
        const body = { title: String(f.get('title')).trim(), series: String(f.get('series')).trim(), key_points: String(f.get('key_points')).trim() };
        if (!body.title || !body.series) return toast('Add a title and a series.', 'error');
        if (where === 'next' && next) body.position = next.position;
        busy = true;
        try { const row = await addVideo(body); close(); go(row.id); } catch (err) { busy = false; toast(errorText(err), 'error'); }
      } },
        field('Title', h('input', { type: 'text', name: 'title', maxlength: 200, required: true, value: prefill.title || '', placeholder: 'How to use Gmail labels and filters' })),
        field('Series', h('input', { type: 'text', name: 'series', maxlength: 60, required: true, list: 'series-list', value: prefill.series || series[0] || '' })),
        h('datalist', { id: 'series-list' }, series.map((s) => h('option', { value: s }))),
        field('Key points', h('textarea', { name: 'key_points', maxlength: 2000, rows: 3, placeholder: 'What the viewer learns, in a few lines' }, prefill.key_points || '')),
        field('Where in the plan', h('select', { name: 'where' },
          h('option', { value: 'end' }, 'At the end of the plan'),
          next ? h('option', { value: 'next' }, `Make it the next video (week ${next.position}; later videos move one week)`) : null)),
        h('div', { class: 'row end gap' }, h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn primary' }, 'Add video')));
      return form;
    },
  });
}

// ---------------------------------------------------------------- board
function card(v) {
  const d = datesOf(v);
  const late = isOverdue(v);
  const nextDate = stageIndex(v.stage) < 2 ? ['Script', d.script] : stageIndex(v.stage) < 4 ? ['Edit', d.edit] : ['Publish', d.publish];
  const el = h('button', { class: 'vcard', style: { '--sc': seriesColor(v.series) }, draggable: 'true', 'aria-label': `Week ${v.position}: ${v.title}`,
    onclick: () => go(v.id),
    ondragstart: (e) => { e.dataTransfer.setData('text/plain', v.id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => el.classList.add('dragging'), 0); },
    ondragend: () => el.classList.remove('dragging') },
    h('span', { class: 't' }, v.title),
    h('span', { class: 'm' }, h('span', null, `Week ${v.position}`), isPublished(v) ? h('span', { class: 'pill ok' }, nice(d.publish)) : late ? h('span', { class: 'pill late' }, 'Behind') : h('span', null, `${nextDate[0]} ${nice(nextDate[1])}`)));
  return el;
}

function board(list) {
  return h('div', { class: 'board' }, STAGES.map((s) => {
    const items = list.filter((v) => v.stage === s.id);
    const cap = s.id === 'planned' && !showAllPlanned ? 6 : s.id === 'published' ? 8 : Infinity;
    const shown = s.id === 'published' ? items.slice(-8).reverse() : items.slice(0, cap);
    const col = h('div', { class: 'col', 'aria-label': `${s.label}, ${items.length} videos`,
      ondragover: (e) => { e.preventDefault(); col.classList.add('over'); },
      ondragleave: (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); },
      ondrop: (e) => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) setStage(id, s.id); } },
      h('div', { class: 'col-h' }, h('b', null, s.label), h('span', null, items.length)),
      shown.map(card),
      s.id === 'planned' && items.length > 6 ? h('button', { class: 'more', onclick: () => { showAllPlanned = !showAllPlanned; window.__rerender(); } }, showAllPlanned ? 'Show fewer' : `Show all ${items.length}`) : null,
      !items.length ? h('p', { class: 'muted small', style: { padding: '6px 4px' } }, s.hint) : null);
    return col;
  }));
}

// ---------------------------------------------------------------- list with drag to reorder
function list(items) {
  const filtered = items.length !== state.videos.length;
  let dragId = null;
  const wrap = h('div', { class: 'vlist', role: 'list' });
  const clear = () => wrap.querySelectorAll('.drop-before,.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  items.forEach((v) => {
    const d = datesOf(v);
    const row = h('div', { class: `vrow${isPublished(v) ? ' done' : ''}`, role: 'listitem', draggable: filtered ? null : 'true',
      ondragstart: (e) => { dragId = v.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', v.id); setTimeout(() => row.classList.add('dragging'), 0); },
      ondragend: () => { dragId = null; row.classList.remove('dragging'); clear(); },
      ondragover: (e) => {
        if (!dragId || dragId === v.id) return;
        e.preventDefault(); clear();
        const r = row.getBoundingClientRect();
        row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      },
      ondrop: (e) => {
        e.preventDefault();
        if (!dragId || dragId === v.id) return;
        const r = row.getBoundingClientRect();
        const after = e.clientY >= r.top + r.height / 2;
        const ids = state.videos.map((x) => x.id).filter((x) => x !== dragId);
        const at = ids.indexOf(v.id) + (after ? 1 : 0);
        ids.splice(at, 0, dragId);
        clear(); dragId = null;
        reorder(ids);
      } },
      h('span', { class: 'grip', title: filtered ? 'Clear the filter to reorder' : 'Drag to move', 'aria-hidden': 'true' }, icon('grip')),
      h('span', { class: 'n' }, v.position),
      h('button', { class: 'tt', onclick: () => go(v.id) }, v.title),
      h('span', { class: 'c-series' }, seriesTag(v.series, seriesColor(v.series))),
      h('span', { class: 'c-rec small muted' }, `Rec ${nice(d.record)}`),
      h('span', { class: 'c-pub' }, isPublished(v) ? h('span', { class: 'pill ok' }, 'Published') : isOverdue(v) ? h('span', { class: 'pill late' }, 'Behind') : h('span', { class: 'pill' }, stageLabel(v.stage))),
      h('span', { class: 'mv' },
        h('button', { class: 'icon-btn', 'aria-label': `Move ${v.title} one week earlier`, disabled: filtered || v.position === 1, onclick: () => moveVideo(v.id, -1) }, icon('up')),
        h('button', { class: 'icon-btn', 'aria-label': `Move ${v.title} one week later`, disabled: filtered || v.position === state.videos.length, onclick: () => moveVideo(v.id, 1) }, icon('down'))));
    wrap.appendChild(row);
  });
  return wrap;
}

// ---------------------------------------------------------------- month calendar
function calendar(items) {
  if (!calMonth) { const t = parse(state.today); calMonth = { y: t.getUTCFullYear(), m: t.getUTCMonth() }; }
  const { y, m } = calMonth;
  const first = fmt(new Date(Date.UTC(y, m, 1)));
  const start = addDays(first, -weekday(first));
  const events = new Map();
  const put = (date, ev) => { if (!events.has(date)) events.set(date, []); events.get(date).push(ev); };
  for (const v of items) {
    const d = datesOf(v);
    put(d.script, { v, kind: 'script', label: `Script · ${v.position}` });
    put(d.record, { v, kind: 'record', label: `Record · ${v.position}` });
    put(d.edit, { v, kind: 'edit', label: `Edit · ${v.position}` });
    put(d.publish, { v, kind: 'publish', label: `Publish · ${v.position}` });
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    if (i >= 35 && parse(date).getUTCMonth() !== m) break;
    const evs = events.get(date) || [];
    const inMonth = parse(date).getUTCMonth() === m;
    cells.push(h('div', { class: `cell${inMonth ? '' : ' out'}${date === state.today ? ' today' : ''}` },
      h('span', { class: 'd' }, parse(date).getUTCDate()),
      evs.slice(0, 3).map((e) => h('button', { class: `ev ${e.kind}`, style: { '--sc': seriesColor(e.v.series) }, title: e.v.title, onclick: () => go(e.v.id) }, e.label)),
      evs.length > 3 ? h('span', { class: 'muted small' }, `+${evs.length - 3} more`) : null));
  }
  const shift = (n) => { const d = new Date(Date.UTC(y, m + n, 1)); calMonth = { y: d.getUTCFullYear(), m: d.getUTCMonth() }; window.__rerender(); };
  return h('div', { class: 'stack' },
    h('div', { class: 'row gap' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => shift(-1) }, icon('left')),
      h('h2', { style: { minWidth: '150px', textAlign: 'center' } }, `${monthName(m)} ${y}`),
      h('button', { class: 'icon-btn', 'aria-label': 'Next month', onclick: () => shift(1) }, icon('right')),
      h('button', { class: 'btn ghost sm', onclick: () => { calMonth = null; window.__rerender(); } }, 'Today')),
    h('div', { class: 'cal' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => h('div', { class: 'dh' }, d)), cells));
}

// ---------------------------------------------------------------- the screen
export function renderPipeline() {
  const series = ['All', ...new Set(state.videos.map((v) => v.series))];
  const items = visible();
  const setMode = (m) => { mode = m; lsSet('zx-pipe-mode', m); window.__rerender(); };
  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Pipeline'), h('p', null, `${state.videos.length} videos, one per week. Drag a card to change its stage.`)),
      h('button', { class: 'btn primary', onclick: () => openNewVideo() }, icon('plus'), 'New video')),
    h('div', { class: 'toolbar' },
      h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'View' },
        [['board', 'Board', 'pipeline'], ['list', 'List', 'list'], ['calendar', 'Calendar', 'calendar']].map(([k, label, ic]) =>
          h('button', { class: mode === k ? 'on' : '', 'aria-pressed': mode === k ? 'true' : 'false', onclick: () => setMode(k) }, icon(ic), label))),
      h('input', { type: 'search', placeholder: 'Search videos', 'aria-label': 'Search videos', style: { maxWidth: '220px' }, value: query,
        oninput: (e) => { query = e.target.value; window.__rerender(e.target); } }),
      h('div', { class: 'chips' }, series.map((s) => h('button', { class: `chip${seriesFilter === s ? ' on' : ''}`, onclick: () => { seriesFilter = s; window.__rerender(); } }, s)))),
    !items.length ? emptyState('No videos match', 'Clear the search or pick another series.') :
      mode === 'board' ? board(items) : mode === 'list' ? list(items) : calendar(items));
}
