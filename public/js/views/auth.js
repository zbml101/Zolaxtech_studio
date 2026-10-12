import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { field } from '../lib/ui.js';
import * as auth from '../auth.js';

function timeline() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const tc = h('span', { class: 'tc' }, '00:00:00:00');
  const t0 = performance.now();
  (function tick(now) {
    if (!tc.isConnected && now - t0 > 500) return;
    const t = ((now - t0) / 1000) % 8;
    tc.textContent = `00:00:${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 30)).padStart(2, '0')}`;
    requestAnimationFrame(tick);
  })(t0);
  const clip = (col, label, color, p, span = 1) => h('div', { class: 'clip', style: { gridColumn: `${col + 1} / span ${span}`, '--c': color, '--p': p } }, label);
  const track = (name, ...kids) => h('div', { class: 'tl-track' }, h('b', null, name), ...kids);
  return h('div', { class: 'tl', 'aria-hidden': 'true' },
    h('div', { class: 'tl-top' }, h('span', { class: 'rec' }, h('i'), 'REC'), tc, h('span', null, 'Week 1')),
    h('div', { class: 'tl-ruler' }, h('span'), days.map((d) => h('span', null, d))),
    track('SCRIPT', clip(1, 'Write', 'var(--s-ai)', 0)),
    track('RECORD', clip(3, 'Record', 'var(--s-pc)', 2 / 7)),
    track('VOICE', h('div', { class: 'wave', style: { gridColumn: '4 / span 2' } }, Array.from({ length: 22 }, (_, k) => h('i', { style: { '--k': k } })))),
    track('EDIT', clip(5, 'Edit', 'var(--s-web)', 4 / 7)),
    track('PUBLISH', clip(7, 'Publish', 'var(--s-com)', 6 / 7)),
    h('div', { class: 'playhead' }));
}

export function renderAuth(root, { mode = 'signin', notice } = {}) {
  let current = mode;
  let msg = notice ? { kind: 'err', text: notice } : null;
  let busy = false;
  let typed = '';
  const draw = () => mount(root, view());
  const set = (m, n) => { current = m; msg = n || null; draw(); };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim() || typed;
    typed = email;
    const password = String(f.get('password') || '');
    busy = true; msg = null; draw();
    try {
      if (current === 'signin') await auth.signIn(email, password);
      else if (current === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const started = await auth.signUp(email, password);
        if (!started) { busy = false; return set('check', { kind: 'ok', text: `We sent a confirmation link to ${email}. Open it, then sign in.` }); }
      } else if (current === 'forgot') {
        await auth.sendReset(email);
        busy = false; return set('signin', { kind: 'ok', text: `If ${email} has an account, a reset link is on its way.` });
      } else if (current === 'recovery') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        await auth.setNewPassword(password);
        location.reload();
        return;
      }
    } catch (err) { msg = { kind: 'err', text: err.message }; }
    busy = false; draw();
  }

  const titles = { signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', recovery: 'Choose your password', check: 'Check your email' };
  const cta = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', recovery: 'Save new password' };

  function view() {
    const showEmail = current !== 'recovery' && current !== 'check';
    const showPass = current === 'signin' || current === 'signup' || current === 'recovery';
    return h('div', { class: 'auth' },
      h('section', { class: 'auth-art' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('play')), h('span', null, h('b', null, 'ZolaxTech Studio'), h('span', null, 'Your weekly video desk'))),
        h('div', null,
          h('h1', null, 'One video a week, every week.'),
          h('p', { class: 'am', lang: 'am' }, 'በየሳምንቱ አንድ ቪዲዮ፣ በቋሚነት።')),
        timeline()),
      h('section', { class: 'auth-form' },
        h('form', { class: 'auth-card', onsubmit: submit, novalidate: true },
          h('h2', null, titles[current]),
          auth.isRestricted() && (current === 'signin' || current === 'signup') ? h('p', { class: 'muted small' }, 'Private studio: only approved email addresses can use this app.') : null,
          current === 'forgot' ? h('p', { class: 'muted' }, 'Enter your email and we will send you a link to set a new password.') : null,
          msg ? h('div', { class: `notice ${msg.kind}`, role: msg.kind === 'err' ? 'alert' : 'status' }, msg.text) : null,
          showEmail ? field('Email', h('input', { type: 'email', name: 'email', autocomplete: 'email', required: true, inputmode: 'email', value: typed })) : null,
          showPass ? field(current === 'recovery' ? 'New password' : 'Password',
            h('input', { type: 'password', name: 'password', autocomplete: current === 'signin' ? 'current-password' : 'new-password', required: true, minlength: 8 }),
            current === 'signin' ? null : 'At least 8 characters.') : null,
          current !== 'check' ? h('button', { class: 'btn primary', type: 'submit', disabled: busy }, busy ? 'Please wait…' : cta[current]) : null,
          h('div', { class: 'row between wrap small' },
            current === 'signin' ? [
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => set('forgot') }, 'Forgot password?'),
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => set('signup') }, 'Create an account')] : null,
            current === 'signup' || current === 'forgot' || current === 'check' ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => set('signin') }, 'Back to sign in') : null))));
  }
  draw();
}
