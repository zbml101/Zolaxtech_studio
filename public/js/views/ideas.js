import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { modal, field, seriesTag, toast, emptyState, errorText, confirmDialog } from '../lib/ui.js';
import { FORMATS, PRIORITIES, seriesColor } from '../lib/constants.js';
import { state, addIdea, patchIdea, deleteIdea, promoteIdea, nextUp } from '../store.js';

let q = '', series = 'All', fmtF = 'All', prio = 'All', hideUsed = true;

function openAdd() {
  const all = [...new Set([...state.ideas.map((i) => i.series), ...state.videos.map((v) => v.series)])];
  modal({ title: 'New idea', content: (close) => h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { idea: String(f.get('idea')).trim(), series: String(f.get('series')).trim() || 'General', format: f.get('format'), priority: f.get('priority'), why: String(f.get('why')).trim() };
    if (!body.idea) return toast('Write the idea first.', 'error');
    try { await addIdea(body); close(); toast('Idea saved.', 'success'); } catch (err) { toast(errorText(err), 'error'); }
  } },
    field('Idea', h('input', { type: 'text', name: 'idea', maxlength: 300, required: true, placeholder: 'Five free tools every beginner should know' })),
    h('div', { class: 'row gap' },
      h('div', { class: 'grow' }, field('Series', h('input', { type: 'text', name: 'series', list: 'idea-series', maxlength: 60, value: all[0] || 'General' }))),
      h('datalist', { id: 'idea-series' }, all.map((s) => h('option', { value: s }))),
      h('div', { class: 'grow' }, field('Format', h('select', { name: 'format' }, FORMATS.map((f) => h('option', { value: f }, f))))),
      h('div', { class: 'grow' }, field('Priority', h('select', { name: 'priority' }, PRIORITIES.map((p) => h('option', { value: p, selected: p === 'Medium' }, p)))))),
    field('Why it can spread', h('textarea', { name: 'why', maxlength: 500, rows: 3, placeholder: 'Who shares it and why' })),
    h('div', { class: 'row end gap' }, h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn primary' }, 'Save idea'))) });
}

async function promote(idea, asNext) {
  const n = nextUp();
  try {
    await promoteIdea(idea.id, asNext && n ? n.position : null);
    toast(asNext ? 'Added as the next video.' : 'Added to the end of the pipeline.', 'success');
  } catch (e) { toast(errorText(e), 'error'); }
}

export function renderIdeas() {
  const seriesList = ['All', ...new Set(state.ideas.map((i) => i.series))];
  const items = state.ideas.filter((i) =>
    (!hideUsed || !i.used) && (series === 'All' || i.series === series) && (fmtF === 'All' || i.format === fmtF) && (prio === 'All' || i.priority === prio) &&
    (!q || (i.idea + ' ' + i.why).toLowerCase().includes(q.toLowerCase())));
  const order = { High: 0, Medium: 1, Low: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  const rerender = (el) => window.__rerender(el);

  const select = (label, value, options, set) => h('select', { 'aria-label': label, style: { width: 'auto' }, onchange: (e) => { set(e.target.value); rerender(); } },
    options.map((o) => h('option', { value: o, selected: o === value }, o === 'All' ? `${label}: all` : o)));

  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Ideas'), h('p', null, `${state.ideas.filter((i) => !i.used).length} ideas waiting. Move the best ones into the pipeline.`)),
      h('button', { class: 'btn primary', onclick: openAdd }, icon('plus'), 'New idea')),
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', placeholder: 'Search ideas', 'aria-label': 'Search ideas', style: { maxWidth: '240px' }, value: q, oninput: (e) => { q = e.target.value; rerender(e.target); } }),
      select('Series', series, seriesList, (v) => { series = v; }),
      select('Format', fmtF, ['All', ...FORMATS], (v) => { fmtF = v; }),
      select('Priority', prio, ['All', ...PRIORITIES], (v) => { prio = v; }),
      h('label', { class: 'row gap-s small' }, h('input', { type: 'checkbox', style: { width: 'auto' }, checked: hideUsed, onchange: (e) => { hideUsed = e.target.checked; rerender(); } }), 'Hide ideas already in the pipeline')),
    items.length ? h('div', { class: 'panel' }, items.map((i) => h('div', { class: `idea${i.used ? ' used' : ''}` },
      h('div', null,
        h('div', { style: { fontWeight: 600 } }, i.idea),
        h('div', { class: 'row gap wrap', style: { marginTop: '4px' } }, seriesTag(i.series, seriesColor(i.series)), h('span', { class: 'pill' }, i.format),
          h('span', { class: i.priority === 'High' ? 'pill now' : 'pill' }, i.priority))),
      i.why ? h('div', { class: 'why' }, i.why) : null,
      h('div', { class: 'acts' }, i.used ? h('span', { class: 'pill ok' }, 'In pipeline') : [
        h('button', { class: 'btn sm', onclick: () => promote(i, false) }, 'Add to pipeline'),
        h('button', { class: 'btn sm ghost', onclick: () => promote(i, true) }, 'Make it next')],
        h('button', { class: 'icon-btn', 'aria-label': `Delete idea: ${i.idea}`, onclick: async () => {
          if (await confirmDialog({ title: 'Delete this idea?', body: i.idea, confirm: 'Delete idea' })) { try { await deleteIdea(i.id); } catch (e) { toast(errorText(e), 'error'); } }
        } }, icon('trash'))))))
      : emptyState('No ideas match', 'Change the filters, or save a new idea while it is fresh.', h('button', { class: 'btn', onclick: openAdd }, icon('plus'), 'New idea')));
}
