// A stand-in for the Supabase browser library, used only for local testing without a real project.
(function () {
  var KEY = 'stub-session';
  var listeners = [];
  function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function emit(ev, s) { listeners.forEach(function (fn) { fn(ev, s); }); }
  function mk(email) { return { access_token: 'test-token-' + email, user: { email: email } }; }
  window.supabase = { createClient: function () {
    return { auth: {
      getSession: function () { return Promise.resolve({ data: { session: read() } }); },
      onAuthStateChange: function (fn) { listeners.push(fn); return { data: { subscription: { unsubscribe: function () {} } } }; },
      signInWithPassword: function (c) {
        if (c.password === 'wrongpass') return Promise.resolve({ error: { message: 'Invalid login credentials' } });
        var s = mk(c.email); localStorage.setItem(KEY, JSON.stringify(s)); setTimeout(function () { emit('SIGNED_IN', s); }, 0);
        return Promise.resolve({ error: null });
      },
      signUp: function (c) { var s = mk(c.email); localStorage.setItem(KEY, JSON.stringify(s)); setTimeout(function () { emit('SIGNED_IN', s); }, 0); return Promise.resolve({ data: { session: s }, error: null }); },
      signOut: function () { localStorage.removeItem(KEY); emit('SIGNED_OUT', null); return Promise.resolve({ error: null }); },
      resetPasswordForEmail: function () { return Promise.resolve({ error: null }); },
      updateUser: function () { return Promise.resolve({ error: null }); },
    } };
  } };
})();
