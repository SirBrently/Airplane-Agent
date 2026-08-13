// email.js — sends the branded leaseback report to the prospect (spec §3).
//
// Provider-agnostic over HTTP so we add no dependencies: whichever key is
// present wins — Resend (RESEND_API_KEY) or SendGrid (SENDGRID_API_KEY).
// The sender address comes from LEAD_EMAIL_FROM. If nothing is configured the
// module reports isConfigured() === false and /lead simply skips the send, so
// the endpoint keeps working (and returns the report) with no email keys set.

function provider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  return null;
}

function isConfigured() {
  return Boolean(provider() && process.env.LEAD_EMAIL_FROM);
}

async function sendReport({ to, subject, html }) {
  const p = provider();
  if (!p) throw new Error('No email provider configured (set RESEND_API_KEY or SENDGRID_API_KEY)');
  if (!process.env.LEAD_EMAIL_FROM) throw new Error('LEAD_EMAIL_FROM is not set');
  if (!to) throw new Error('No recipient address');
  const from = process.env.LEAD_EMAIL_FROM;

  if (p === 'resend') {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!resp.ok) throw new Error(`Resend ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return { provider: 'resend', id: (await resp.json()).id || null };
  }

  // SendGrid
  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  if (!resp.ok) throw new Error(`SendGrid ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return { provider: 'sendgrid', id: resp.headers.get('x-message-id') || null };
}

module.exports = { isConfigured, sendReport, provider };
