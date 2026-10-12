import { h, mount } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { toast, errorText } from './lib/ui.js';
import { initAuth, getSession, onAuth, isRecovering, accessToken, signOut } from './auth.js';
import { setTokenProvider, setSignedOutHandler } from './api.js';
import { state, subscribe, load, reset, isOverdue } from './store.js';
import { renderAuth } from './views/auth.js';
import { renderDashboard } from './views/dashboard.js';
import { renderToday } from './views/today.js';
import { renderPipeline } from './views/pipeline.js';
import { renderIdeas } from './views/ideas.js';
import { renderPlaybook } from './views/playbook.js';
import { renderReview } from './views/review.js';
import { renderSettings } from './views/settings.js';
import { openDrawer, closeDrawer } from './views/drawer.js';
import { openPalette } from './views/palette.js';
import { rundown } from './views/shared.js';

const app = document.getElementById('app');
const NAV = [['', 'Dashboard', 'home'], ['today', 'Today', 'today'], ['pipeline', 'Pipeline', 'pipeline'], ['ideas', 'Ideas', 'idea'], ['playbook', 'Playbook', 'book'], ['review', 'Review', 'chart'], ['settings', 'Settings', 'gear']];
const TABBAR = ['', 'today', 'pipeline', 'ideas', 'settings'];

let shell = null;      // { content, side, tabbar, top }
let baseRoute = '';    // the screen behind the video panel
let loading = false;

// ---------------------------------------------------------------- boot
function bootScreen(text, sub) {
  return h('div', { class: 'boot', role: 'status' }, h('div', { class: 'spinner' }), h('strong', null, text), sub ? h('p', { class: 'small' }, sub) : null);
}

function showAuth(opts) { shell = null; closeDrawer(); mount(app); renderAuth(app, opts); }

async function enter() {
  if (loading) return;
  loading = true;
  mount(app, bootScreen('Loading your plan…'));
  const slow = setTimeout(() => mount(app, bootScreen('Waking up the server…', 'Free hosting sleeps when idle. This can take up to a minute the first time.')), 4000);
  try {
    await load();
    clearTimeout(slow);
    buildShell();
    route();
  } catch (e) {
    clearTimeout(slow);
    if (e.status === 401) return;
    mount(app, h('div', { class: 'boot' }, h('strong', null, 'Could not load your plan'), h('p', { class: 'muted' }, errorText(e)),
      h('div', { class: 'row gap' }, h('button', { class: 'btn primary', onclick: () => { loading = false; enter(); } }, 'Try again'), h('button', { class: 'btn ghost', onclick: () => signOut() }, 'Sign out'))));
  } finally { loading = false; }
}

async function start() {
  mount(app, bootScreen('Starting…'));
  const slow = setTimeout(() => mount(app, bootScreen('Waking up the server…', 'Free hosting sleeps when idle. This can take up to a minute the first time.')), 4000);
  try { await initAuth(); } catch (e) {
    clearTimeout(slow);
    mount(app, h('div', { class: 'boot' }, h('strong', null, 'The app could not start'), h('p', { class: 'muted' }, errorText(e)), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reload')));
    return;
  }
  clearTimeout(slow);
  if (isRecovering()) return showAuth({ mode: 'recovery' });
  if (getSession()) enter(); else showAuth();
}

setTokenProvider(accessToken);
setSignedOutHandler(() => { if (shell) { reset(); showAuth({ notice: 'Your session has ended. Sign in again.' }); } });
onAuth((event) => {
  if (event === 'PASSWORD_RECOVERY') showAuth({ mode: 'recovery' });
  else if (event === 'SIGNED_OUT') { reset(); showAuth(); }
  else if (event === 'SIGNED_IN' && !state.ready && !isRecovering()) enter();
});

// ---------------------------------------------------------------- shell
function buildShell() {
  const content = h('main', { class: 'page', id: 'content', tabindex: '-1' });
  const side = h('aside', { class: 'side' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, icon('play')), h('span', null, h('b', null, 'Studio'), h('span', { id: 'channel' }, state.settings.channel_name))),
    h('nav', { class: 'nav', 'aria-label': 'Main' }, NAV.map(([r, label, ic]) => h('a', { href: `#/${r}`, 'data-route': r }, icon(ic), label, r === 'pipeline' ? h('span', { class: 'badge', id: 'late-badge', hidden: true }) : null))),
    h('div', { class: 'side-foot' },
      h('button', { class: 'btn ghost sm', onclick: openPalette }, icon('search'), 'Search', h('span', { class: 'kbd', style: { marginLeft: 'auto' } }, /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K')),
      h('div', { class: 'me', title: state.email }, state.email)));
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABBAR.map((r) => { const [, label, ic] = NAV.find((n) => n[0] === r); return h('a', { href: `#/${r}`, 'data-route': r }, icon(ic), label); }));
  const top = h('div', { class: 'topbar', id: 'topbar' });
  const skip = h('a', { class: 'sr', href: '#content', onclick: (e) => { e.preventDefault(); content.focus(); } }, 'Skip to content');
  mount(app, skip, h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, content)), tabbar);
  shell = { content, side, tabbar, top };
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || '', a: parts[1], b: parts[2] };
}

function renderContent(focus) {
  if (!shell || !state.ready) return;
  const { name, a } = parseRoute();
  const screen = name === 'video' ? baseRoute : name;
  const rerender = () => window.__rerender();
  const y = window.scrollY;
  let view;
  try {
    view = { '': renderDashboard, today: () => renderToday(screen === 'today' && name !== 'video' ? a : undefined, rerender), pipeline: renderPipeline, ideas: renderIdeas, playbook: renderPlaybook, review: renderReview, settings: () => renderSettings(rerender) }[screen] || renderDashboard;
    mount(shell.content, view());
  } catch (e) {
    console.error(e);
    mount(shell.content, h('div', { class: 'empty' }, h('strong', null, 'This screen could not be drawn'), h('p', { class: 'muted' }, 'Reload the page. If it keeps happening, your data is safe; it is only the display.')));
  }
  mount(shell.top, screen === '' || screen === 'today' ? h('span', { class: 'grow' }) : rundown(), h('button', { class: 'btn ghost sm', onclick: openPalette, 'aria-label': 'Open search' }, icon('search'), h('span', { class: 'kbd' }, 'Ctrl K')));
  shell.side.querySelectorAll('[data-route]').forEach((n) => n.classList.toggle('on', n.dataset.route === screen));
  shell.tabbar.querySelectorAll('[data-route]').forEach((n) => n.classList.toggle('on', n.dataset.route === screen));
  const late = state.videos.filter(isOverdue).length;
  const badge = document.getElementById('late-badge');
  if (badge) { badge.hidden = !late; badge.textContent = late; }
  const ch = document.getElementById('channel'); if (ch) ch.textContent = state.settings.channel_name;
  window.scrollTo(0, y);
  if (focus && focus.getAttribute) {
    const again = document.querySelector(`[aria-label="${focus.getAttribute('aria-label')}"]`);
    if (again) { const pos = focus.selectionStart; again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) { /* not a text field */ } }
  }
}
window.__rerender = (focus) => renderContent(focus);

function route() {
  if (!shell || !state.ready) return;
  const { name, a, b } = parseRoute();
  if (name === 'video' && a) {
    renderContent();
    openDrawer(a, b || 'overview', () => { location.hash = `#/${baseRoute}`; });
    return;
  }
  closeDrawer();
  baseRoute = name === 'video' ? '' : name;
  renderContent();
  if (!document.querySelector('.scrim')) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => {
  const { name } = parseRoute();
  if (name !== 'video') window.scrollTo(0, 0);
  route();
});
subscribe(() => renderContent());

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && shell) { e.preventDefault(); openPalette(); }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

start();
