// Sends email through Resend (resend.com, free plan, no card). Plain fetch, no extra package.
function createMailer({ apiKey, from, fetchImpl = fetch }) {
  return {
    enabled: Boolean(apiKey),
    async send({ to, subject, html, text }) {
      if (!apiKey) throw Object.assign(new Error('Email is not set up on this server (RESEND_API_KEY is missing).'), { status: 503 });
      const r = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw Object.assign(new Error(`The email service refused the message (${r.status}). ${body.slice(0, 200)}`), { status: 502 });
      }
      return true;
    },
  };
}
module.exports = { createMailer };
