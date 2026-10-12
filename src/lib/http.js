// Small helpers for errors and async routes.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 does not catch errors from async functions, so wrap each route.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Turn a Supabase error object into an HttpError. Details stay in the server log.
function check({ data, error }, what = 'database request') {
  if (error) {
    console.error(`[db] ${what} failed:`, error.code || '', error.message);
    if (['42P01', '42703', 'PGRST205', 'PGRST204', 'PGRST202'].includes(error.code)) {
      throw new HttpError(500, 'The database is missing part of its setup. In Supabase open SQL Editor, run db/schema.sql again, then reload this page.');
    }
    if (/invalid api key|jwt|apikey/i.test(error.message || '')) {
      throw new HttpError(500, 'The server cannot use its Supabase key. Check SUPABASE_URL and SUPABASE_ANON_KEY in the SnapDeploy environment variables.');
    }
    if (error.code === 'PGRST116') throw new HttpError(404, 'That item was not found.');
    if (error.code === '23514' || error.code === '22P02' || error.code === '22007') {
      throw new HttpError(400, 'Some of the values are not allowed. Check the fields and try again.');
    }
    if (error.code === '42501') throw new HttpError(403, 'You do not have access to that.');
    throw new HttpError(500, 'Something went wrong while saving. Try again in a moment.');
  }
  return data;
}

module.exports = { HttpError, wrap, check };
