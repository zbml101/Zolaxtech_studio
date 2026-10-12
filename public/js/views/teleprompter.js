// Full-screen teleprompter: scrolls the script at a steady speed while you read it aloud.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { lsGet, lsSet } from '../lib/dom.js';
import { clamp } from '../lib/format.js';

export function openTeleprompter({ title, parts, script, lang: startLang = 'en' }) {
  let lang = startLang;
  let speed = clamp(Number(lsGet('zx-tp-speed', 40)), 5, 200);
  let size = clamp(Number(lsGet('zx-tp-size', 44)), 20, 100);
  let mirror = false;
  let playing = false;
  let last = 0, raf = 0, pos = 0;

  const view = h('div', { class: 'tp-view', tabindex: '0', 'aria-label': 'Script text' });
  const text = h('div', { class: 'tp-text' });
  view.appendChild(text);
  const speedLabel = h('span', null, String(speed));
  const playBtn = h('button', { class: 'btn', onclick: () => toggle() });

  function build() {
    text.replaceChildren();
    text.style.fontSize = size + 'px';
    text.classList.toggle('mirror', mirror);
    text.setAttribute('lang', lang === 'am' ? 'am' : 'en');
    text.classList.toggle('am', lang === 'am');
    let any = false;
    for (const p of parts) {
      const t = ((script[p.id] || {})[lang] || '').trim();
      if (!t) continue;
      any = true;
      text.appendChild(h('div', { class: 'tp-h' }, p.title));
      t.split(/\n{2,}|\n/).filter(Boolean).forEach((para) => text.appendChild(h('p', null, para)));
    }
    if (!any) text.appendChild(h('p', null, lang === 'am' ? 'The Amharic script is empty. Write it in the Script tab, or switch to English.' : 'The English script is empty. Write it in the Script tab, or switch to Amharic.'));
    text.appendChild(h('div', { class: 'tp-h' }, 'The end'));
  }

  function paintPlay() { playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), playing ? 'Pause' : 'Start'); }
  function tick(t) {
    if (!playing) return;
    if (last) { pos += (speed * (t - last)) / 1000; view.scrollTop = pos; if (view.scrollTop + 2 < Math.floor(pos) - 2) { playing = false; paintPlay(); return; } }
    last = t; raf = requestAnimationFrame(tick);
  }
  function toggle(force) {
    playing = force === undefined ? !playing : force;
    paintPlay(); last = 0; pos = view.scrollTop;
    if (playing) raf = requestAnimationFrame(tick); else cancelAnimationFrame(raf);
  }
  function setSpeed(n) { speed = clamp(n, 5, 200); lsSet('zx-tp-speed', speed); speedLabel.textContent = speed; range.value = speed; }

  const range = h('input', { type: 'range', min: 5, max: 200, value: speed, 'aria-label': 'Scroll speed', oninput: (e) => setSpeed(Number(e.target.value)) });
  const sizeRange = h('input', { type: 'range', min: 20, max: 100, value: size, 'aria-label': 'Text size', oninput: (e) => { size = Number(e.target.value); lsSet('zx-tp-size', size); text.style.fontSize = size + 'px'; } });
  const langSel = h('select', { 'aria-label': 'Language', style: { width: 'auto', background: '#1b1b1b', color: '#fff', borderColor: '#333' }, onchange: (e) => { lang = e.target.value; build(); view.scrollTop = 0; pos = 0; } },
    h('option', { value: 'en', selected: lang === 'en' }, 'English'), h('option', { value: 'am', selected: lang === 'am' }, 'Amharic'));

  const prev = document.activeElement;
  function close() { toggle(false); document.removeEventListener('keydown', onKey, true); root.remove(); document.body.style.overflow = ''; if (prev && prev.focus) prev.focus(); }
  function onKey(e) {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSpeed(speed + 5); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSpeed(speed - 5); }
    else if (e.key === 'Home') { view.scrollTop = 0; pos = 0; }
  }

  const root = h('div', { class: 'tp', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Teleprompter: ${title}` },
    h('div', { class: 'tp-bar' },
      playBtn,
      h('label', null, 'Speed ', range, speedLabel),
      h('label', null, 'Size ', sizeRange),
      langSel,
      h('label', null, h('input', { type: 'checkbox', style: { width: 'auto' }, onchange: (e) => { mirror = e.target.checked; text.classList.toggle('mirror', mirror); } }), 'Mirror'),
      h('span', { style: { marginLeft: 'auto', opacity: .7 } }, 'Space: start or pause · Up and down: speed · Esc: close'),
      h('button', { class: 'btn', onclick: close }, icon('x'), 'Close')),
    h('div', { style: { position: 'relative', flex: 1, display: 'flex', minHeight: 0 } }, view, h('div', { class: 'tp-line' })));
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey, true);
  view.addEventListener('wheel', () => { pos = view.scrollTop; });
  build(); paintPlay(); view.focus();
}
