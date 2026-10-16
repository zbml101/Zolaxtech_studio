// Vercel entry point: the whole app runs as one serverless function (no sleeping container, no card needed).
// If the app cannot even load, the page shows why instead of a bare "500 FUNCTION_INVOCATION_FAILED".
let handler;
try {
  handler = require('../server.js');
} catch (err) {
  const text = 'ZolaxTech Studio could not start.\n\n' + String((err && err.stack) || err).split('\n').slice(0, 8).join('\n') + '\n';
  console.error(text);
  handler = (req, res) => { res.statusCode = 500; res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(text); };
}
module.exports = (req, res) => handler(req, res);
