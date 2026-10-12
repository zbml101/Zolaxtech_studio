// The video editor: a side panel with Overview, Script, Checklist and Results.
import { h, debounce, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { confirmDialog, field, seriesTag, toast, errorText } from '../lib/ui.js';
import { seriesColor } from '../lib/constants.js';
import { words, speakMinutes, sum } from '../lib/format.js';
import { nice, niceLong } from '../lib/dates.js';
import { state, videoById, datesOf, patchVideo, loadFullVideo, deleteVideo, moveVideo, setStage, isOverdue } from '../store.js';
import { stageBar } from './shared.js';
import { milestones } from './dashboard.js';
import { openTeleprompter } from './teleprompter.js';

const TABS = [['overview', 'Overview'], ['script', 'Script'], ['checklist', 'Checklist'], ['results', 'Results']];
let current = null; // { id, el, dispose }

export function closeDrawer() {
  if (!current) return;
  current.dispose();
  current.el.remove();
  document.body.style.overflow = '';
  current = null;
}

export async function openDrawer(id, tab = 'overview', onClose) {
  if (current && current.id === id) { current.setTab(tab); return; }
  closeDrawer();
  const v0 = videoById(id);
  if (!v0) { toast('That video no longer exists.', 'error'); onClose(); return; }

  let full = null;
  let activeTab = TABS.some((t) => t[0] === tab) ? tab : 'overview';
  const prev = document.activeElement;
  const body = h('div', { class: 'drawer-b' }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
  const head = h('div', { class: 'drawer-h' });
  const save = h('span', { class: 'savestate', role: 'status', 'aria-live': 'polite' });
  const setSave = (text, err) => { save.textContent = text; save.classList.toggle('err', Boolean(err)); };

  // ----- saving: every change goes through one queue so a slow request never overwrites a newer one
  let queue = Promise.resolve();
  const pending = { patch: {}, timer: null };
  function queueSave(patch, quiet = true) {
    setSave('Saving…');
    queue = queue.then(() => patchVideo(id, patch, { quiet })).then(() => { setSave('Saved'); drawHead(); }).catch((e) => { setSave(errorText(e), true); });
    return queue;
  }
  const saveScript = debounce(() => queueSave({ script: full.script }), 1200);
  const saveField = (key) => (e) => {
    const value = e.target.value;
    const cur = videoById(id);
    if (cur && (cur[key] || '') === value) return;
    return queueSave({ [key]: value }, false);
  };

  function drawHead() {
    const v = videoById(id);
    if (!v) return;
    mount(head,
      h('div', { class: 'row between gap' },
        h('div', { class: 'row gap wrap' }, h('span', { class: 'pill' }, `Week ${v.position}`), seriesTag(v.series, seriesColor(v.series)),
          isOverdue(v) ? h('span', { class: 'pill late' }, 'Behind') : null),
        h('div', { class: 'row gap-s' }, save, h('button', { class: 'icon-btn', 'aria-label': 'Close video', onclick: () => requestClose() }, icon('x')))),
      h('h2', null, v.title),
      stageBar(v, { onPick: (s) => setStage(id, s).then(drawHead).catch(() => {}) }),
      h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, label]) =>
        h('button', { role: 'tab', class: k === activeTab ? 'on' : '', 'aria-selected': k === activeTab ? 'true' : 'false', onclick: () => setTab(k) }, label))));
  }

  function setTab(k) {
    saveScript.cancel();
    if (full && activeTab === 'script') queueSave({ script: full.script });
    activeTab = k;
    history.replaceState(null, '', `#/video/${id}/${k}`);
    drawHead(); drawBody();
  }

  // ----- tabs
  function overview() {
    const v = videoById(id);
    const d = datesOf(v);
    return h('div', { class: 'stack-l' },
      milestones(v),
      h('div', { class: 'stack' },
        field('Title', h('input', { type: 'text', value: v.title, maxlength: 200, onchange: saveField('title') })),
        field('Title in Amharic', h('input', { type: 'text', class: 'am', lang: 'am', value: v.title_am, maxlength: 200, onchange: saveField('title_am') })),
        field('Series', h('input', { type: 'text', value: v.series, maxlength: 60, onchange: saveField('series') })),
        field('Key points', h('textarea', { rows: 4, maxlength: 2000, onchange: saveField('key_points') }, v.key_points)),
        field('Notes', h('textarea', { rows: 5, maxlength: 10000, onchange: saveField('notes'), placeholder: 'Links, ideas, things to fix next time' }, v.notes))),
      h('section', { class: 'panel flat' },
        h('div', { class: 'panel-h' }, h('h3', null, 'Schedule'), h('span', { class: 'muted small' }, `Records ${niceLong(d.record)}`)),
        h('p', { class: 'muted small' }, 'Dates come from the week number. Move the video to change them; every video in between shifts by one week.'),
        h('div', { class: 'row gap wrap', style: { marginTop: '10px' } },
          h('button', { class: 'btn', disabled: v.position === 1, onclick: async () => { await moveVideo(id, -1); drawHead(); drawBody(); } }, icon('up'), 'One week earlier'),
          h('button', { class: 'btn', disabled: v.position === state.videos.length, onclick: async () => { await moveVideo(id, 1); drawHead(); drawBody(); } }, icon('down'), 'One week later'))),
      h('div', null, h('button', { class: 'btn danger', onclick: async () => {
        const ok = await confirmDialog({ title: 'Delete this video?', body: 'Its script and checklist are deleted too, and later videos move one week earlier.', confirm: 'Delete video' });
        if (!ok) return;
        try { await deleteVideo(id); closeDrawer(); onClose(); toast('Video deleted.'); } catch (e) { toast(errorText(e), 'error'); }
      } }, icon('trash'), 'Delete video')));
  }

  function scriptTab() {
    const parts = state.templates.script.parts;
    const script = full.script;
    const target = sum(parts.map((p) => p.minutes));
    const totalEn = h('strong'), totalAm = h('strong'), est = h('strong');
    const recount = () => {
      const en = sum(parts.map((p) => words((script[p.id] || {}).en || '')));
      const am = sum(parts.map((p) => words((script[p.id] || {}).am || '')));
      totalEn.textContent = `${en} words`; totalAm.textContent = `${am} words`;
      est.textContent = `${speakMinutes(Math.max(en, am)).toFixed(1)} min`;
    };
    const copyAll = async (lang) => {
      const text = parts.map((p) => `${p.title}\n${(script[p.id] || {})[lang] || ''}`.trim()).join('\n\n');
      try { await navigator.clipboard.writeText(text); toast(`Copied the ${lang === 'am' ? 'Amharic' : 'English'} script.`, 'success'); } catch (_) { toast('Copy was blocked by the browser. Select the text and copy it by hand.', 'error'); }
    };
    const partEl = (p) => {
      const val = script[p.id] || { en: '', am: '' };
      const cEn = h('span'), cAm = h('span');
      const upd = () => { cEn.textContent = `${words(val.en)} words`; cAm.textContent = `${words(val.am)} words`; recount(); };
      const area = (lang, label) => {
        const ta = h('textarea', { lang: lang === 'am' ? 'am' : 'en', class: lang === 'am' ? 'am' : '', 'aria-label': `${p.title}, ${label}`, maxlength: 20000, placeholder: lang === 'am' ? 'የአማርኛ ስክሪፕት እዚህ ይጻፉ' : 'Write what you will say, in short spoken sentences',
          oninput: (e) => { val[lang] = e.target.value; script[p.id] = val; upd(); setSave('Unsaved changes…'); saveScript(); } }, val[lang]);
        return h('div', null, h('div', { class: 'lab' }, h('span', null, label), lang === 'en' ? cEn : cAm), ta);
      };
      upd();
      return h('section', { class: 'part' },
        h('div', { class: 'part-h' }, h('b', null, p.title), h('span', { class: 'muted small' }, `about ${p.minutes} min`)),
        h('p', { class: 'hint' }, p.hint),
        h('div', { class: 'script-cols' }, area('en', 'English'), area('am', 'Amharic')));
    };
    const el = h('div', { class: 'stack-l' },
      h('div', { class: 'panel flat row between wrap gap' },
        h('div', { class: 'row gap-l wrap small' }, h('span', null, 'English ', totalEn), h('span', null, 'Amharic ', totalAm), h('span', null, 'Speaking time ', est, h('span', { class: 'muted' }, ` of about ${target} min`))),
        h('div', { class: 'row gap-s wrap' },
          h('button', { class: 'btn sm', onclick: () => copyAll('en') }, icon('copy'), 'Copy English'),
          h('button', { class: 'btn sm', onclick: () => copyAll('am') }, icon('copy'), 'Copy Amharic'),
          h('button', { class: 'btn primary sm', onclick: () => { saveScript.flush && saveScript.cancel(); queueSave({ script }); openTeleprompter({ title: videoById(id).title, parts, script }); } }, icon('play'), 'Teleprompter'))),
      parts.map(partEl));
    recount();
    return el;
  }

  function checklistTab() {
    const items = state.templates.checklist.items;
    const v = videoById(id);
    const list = { ...(v.checklist || {}) };
    const done = () => items.filter((i) => list[i.id]).length;
    const label = h('span', { class: 'muted small' });
    const bar = h('i', { style: { width: '0%', background: 'var(--fern)' } });
    const paint = () => { label.textContent = `${done()} of ${items.length} done`; bar.style.width = `${(done() / items.length) * 100}%`; };
    const phases = [...new Set(items.map((i) => i.phase))];
    paint();
    return h('div', { class: 'stack-l' },
      h('div', { class: 'progress-line' }, h('div', { class: 'row between' }, h('h3', null, 'Before it goes live'), label), h('div', { class: 'bar' }, bar)),
      phases.map((ph) => h('section', { class: 'phase' }, h('h3', null, ph),
        items.filter((i) => i.phase === ph).map((i) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: Boolean(list[i.id]), onchange: (e) => { if (e.target.checked) list[i.id] = true; else delete list[i.id]; paint(); queueSave({ checklist: { ...list } }); } }),
          h('span', { class: 'box' }, icon('check')),
          h('span', { class: 't' }, h('span', { class: 'tt' }, i.text), h('span', { class: 'meta' }, i.when)))))));
  }

  function resultsTab() {
    const v = videoById(id);
    const d = datesOf(v);
    const live = v.stage === 'published';
    return h('div', { class: 'stack-l' },
      h('p', { class: live ? '' : 'muted' }, live ? `Published ${v.published_at ? nice(v.published_at.slice(0, 10)) : ''}. Planned for ${nice(d.publish)}.` : `Planned for ${niceLong(d.publish)}. Mark the video as published to record results.`),
      h('div', { class: 'stack' },
        field('Video link', h('input', { type: 'url', value: v.video_url, maxlength: 300, placeholder: 'https://youtu.be/…', onchange: saveField('video_url') })),
        field('Views in the first 7 days', h('input', { type: 'number', min: 0, step: 1, value: v.views_7d == null ? '' : v.views_7d, placeholder: 'Check YouTube Studio 7 days after publishing',
          onchange: (e) => { const t = e.target.value.trim(); if (t === '') return queueSave({ views_7d: null }, false); const n = Number(t); if (!Number.isInteger(n) || n < 0) return toast('Enter a whole number, like 240.', 'error'); queueSave({ views_7d: n }, false); } }), 'Used for the chart on the Review screen.')),
      v.video_url ? h('a', { class: 'btn', href: v.video_url, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Open on YouTube') : null);
  }

  function drawBody() {
    body.scrollTop = 0;
    const render = { overview, script: scriptTab, checklist: checklistTab, results: resultsTab }[activeTab];
    mount(body, render());
  }

  // ----- open / close
  function requestClose() {
    saveScript.cancel();
    const finish = () => { closeDrawer(); onClose(); };
    if (full && activeTab === 'script') queueSave({ script: full.script }).then(finish); else finish();
  }
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.tp, .dialog, .palette')) requestClose(); };
  const onUnload = () => { if (full) patchVideo(id, { script: full.script }, { quiet: true }).catch(() => {}); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onUnload);

  const el = h('div', { class: 'scrim', onclick: (e) => { if (e.target === el) requestClose(); } },
    h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Video: ${v0.title}` }, head, body));
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  current = {
    id, el, setTab: (k) => { if (k !== activeTab) setTab(k); },
    dispose: () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); saveScript.cancel(); if (prev && prev.focus) prev.focus(); },
  };
  drawHead();
  try {
    full = await loadFullVideo(id);
    if (!full.script) full.script = {};
    drawBody();
  } catch (e) {
    mount(body, h('div', { class: 'empty' }, h('strong', null, 'Could not open this video'), h('p', { class: 'muted' }, errorText(e)), h('button', { class: 'btn', onclick: () => { closeDrawer(); onClose(); } }, 'Close')));
  }
}
