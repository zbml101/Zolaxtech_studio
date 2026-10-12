// Checks the Supabase login token that the browser sends with every request, and gives
// the route a database client that acts as that user (so row-level security protects the data).
const { HttpError } = require('./lib/http');

function authMiddleware({ createClient, config }) {
  const cache = new Map(); // token -> { user, expires }

  const clientOptions = (headers) => ({
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(headers ? { global: { headers } } : {}),
  });

  return async function auth(req, res, next) {
    try {
      const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
      if (!match) throw new HttpError(401, 'Sign in to continue.');
      const token = match[1];

      let entry = cache.get(token);
      if (!entry || entry.expires < Date.now()) {
        const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, clientOptions());
        const { data, error } = await anon.auth.getUser(token);
        if (error || !data || !data.user) throw new HttpError(401, 'Your session has ended. Sign in again.');
        entry = { user: data.user, expires: Date.now() + 60_000 };
        if (cache.size > 200) cache.clear();
        cache.set(token, entry);
      }

      // Closed access: only approved, email-confirmed accounts get in, however they signed up.
      const allowed = config.allowedEmails;
      if (allowed && allowed.length) {
        const email = String(entry.user.email || '').toLowerCase();
        if (!allowed.includes(email) || !entry.user.email_confirmed_at) {
          throw new HttpError(403, 'This account is not approved to use ZolaxTech Studio. Ask the owner to add your email address.');
        }
      }

      req.user = entry.user;
      req.db = createClient(config.supabaseUrl, config.supabaseAnonKey, clientOptions({ Authorization: `Bearer ${token}` }));
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { authMiddleware };
