import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { field } from '../lib/ui.js';
import * as auth from '../auth.js';

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

  const titles = { signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', recovery: 'Choose a new password', check: 'Check your email' };
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
        h('div', { class: 'week-demo', 'aria-hidden': 'true' },
          [['Sun', 'Script'], ['Mon', 'Read'], ['Tue', 'Record'], ['Wed', 'Rest'], ['Thu', 'Edit'], ['Fri', 'Plan'], ['Sat', 'Publish']].map(([d, r]) =>
            h('div', { class: `day${d === 'Tue' ? ' today' : ''}${d === 'Wed' ? ' off' : ''}` }, h('span', { class: 'dow' }, d), h('span', { class: 'role' }, r))))),
      h('section', { class: 'auth-form' },
        h('form', { class: 'auth-card', onsubmit: submit, novalidate: true },
          h('h2', null, titles[current]),
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
