// Ctrl+K / Cmd+K: jump anywhere or start something new.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { state } from '../store.js';
import { setTheme, currentTheme } from './settings.js';
import { openNewVideo } from './pipeline.js';

const PAGES = [['', 'Dashboard', 'home'], ['today', 'Today', 'today'], ['pipeline', 'Pipeline', 'pipeline'], ['ideas', 'Ideas', 'idea'], ['playbook', 'Playbook', 'book'], ['review', 'Review', 'chart'], ['settings', 'Settings', 'gear']];

export function openPalette() {
  if (document.querySelector('.palette')) return;
  const prev = document.activeElement;
  const items = () => [
    ...PAGES.map(([r, label, ic]) => ({ group: 'Go to', label, ic, run: () => { location.hash = `#/${r}`; } })),
    { group: 'Actions', label: 'New video', ic: 'plus', run: () => openNewVideo() },
    { group: 'Actions', label: currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', ic: currentTheme() === 'dark' ? 'sun' : 'moon', run: () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); } },
    ...state.videos.map((v) => ({ group: 'Videos', label: `${v.position}. ${v.title}`, ic: 'play', run: () => { location.hash = `#/video/${v.id}`; } })),
  ];
  let query = '', sel = 0, shown = [];
  const list = h('ul', { role: 'listbox' });
  const input = h('input', { type: 'text', placeholder: 'Search videos, screens and actions', 'aria-label': 'Command', role: 'combobox', 'aria-expanded': 'true', oninput: (e) => { query = e.target.value; sel = 0; draw(); } });
  function close() { scrim.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); }
  function choose(i) { const it = shown[i]; if (!it) return; close(); it.run(); }
  function draw() {
    const q = query.toLowerCase().trim();
    shown = items().filter((i) => !q || i.label.toLowerCase().includes(q)).slice(0, 14);
    list.replaceChildren();
    let g = null;
    shown.forEach((it, i) => {
      if (it.group !== g) { g = it.group; list.appendChild(h('li', { class: 'grp', role: 'presentation' }, g)); }
      list.appendChild(h('li', { role: 'presentation' }, h('button', { role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onclick: () => choose(i), onmousemove: () => { if (sel !== i) { sel = i; draw(); } } }, icon(it.ic), h('span', null, it.label))));
    });
    if (!shown.length) list.appendChild(h('li', { class: 'grp' }, 'Nothing matches.'));
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
  }
  const scrim = h('div', { class: 'scrim center', style: { alignItems: 'flex-start' }, onclick: (e) => { if (e.target === scrim) close(); } }, h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, input, list));
  document.body.appendChild(scrim);
  document.addEventListener('keydown', onKey, true);
  draw(); input.focus();
}
