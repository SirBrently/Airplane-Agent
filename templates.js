// templates.js — follow-up email templates for the leaseback funnel (spec §4).
//
// Each renderer returns { subject, html, text } and takes plain values (no
// template placeholders leak out). The credibility rule (§2) and the hard rules
// from Sophie's system prompt are enforced here in one place: operators are
// "potential" fits, and the planning package defers all tax/legal questions to
// the prospect's CPA/attorney and never promises financing terms.
//
// The scheduled follow-up job (roadmap "Next") renders one of these and hands
// { subject, html } straight to email.sendReport().

const BOOKING_URL = process.env.BOOKING_URL || 'https://gojetswest.com/booking-calendar';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Shared branded wrapper (dark navy + gold), email-client-safe table layout.
function shell({ title, bodyHtml, footerHtml }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;background:#060e1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060e1a">
  <tr><td align="center" style="padding:28px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
      <tr><td style="padding:0 4px 18px">
        <div style="font:700 12px/1 Arial,sans-serif;letter-spacing:3px;color:#d4af37">JETS WEST AVIATION</div>
      </td></tr>
      <tr><td style="padding:0 4px;font:400 16px/1.7 Arial,sans-serif;color:#c6d5ea">${bodyHtml}</td></tr>
      <tr><td style="padding:22px 4px 0;font:400 12px/1.6 Arial,sans-serif;color:#6b82a0;border-top:1px solid #14243a">${footerHtml}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function ctaButton(url, label) {
  return `<a href="${esc(url)}" style="display:inline-block;font:600 15px/1 Arial,sans-serif;color:#08131f;background:#d4af37;padding:13px 24px;border-radius:8px;text-decoration:none">${esc(label)}</a>`;
}

// ---------------------------------------------------------------------------
// Day-1 follow-up (§4: confirm receipt; ask whether any operator stood out)
// ---------------------------------------------------------------------------
function renderDay1({ firstName, operatorCount, location, bookingUrl = BOOKING_URL } = {}) {
  const name = firstName ? esc(firstName) : 'there';
  const count = operatorCount ? `${operatorCount} ` : '';
  const where = location ? ` near ${esc(location)}` : ' in your area';

  const bodyHtml = `
    <p style="margin:0 0 16px">Hi ${name},</p>
    <p style="margin:0 0 16px">Yesterday we sent over a shortlist of ${count}aviation operators${where} that could be a fit for a leaseback. One quick question: <strong style="color:#eaf2ff">did any of them stand out?</strong></p>
    <p style="margin:0 0 16px">You don’t need to call anyone — that’s what we’re here for. Point us at the one or two that interest you and we’ll go get the real numbers: actual utilization, aircraft preferences, and the economics straight from the operator.</p>
    <p style="margin:0 0 16px">If none jumped out, no problem. We can widen the search or walk you through what a leaseback would actually look like for your situation.</p>
    <p style="margin:0 0 24px">Just reply to this email, or grab a time below.</p>
    <p style="margin:0 0 26px">${ctaButton(bookingUrl, 'Book a 15-minute call →')}</p>
    <p style="margin:0">— Stan Snyder<br><span style="color:#8fa6c2">JetsWest Aviation</span></p>`;

  const footerHtml = `The operators we shared are <strong style="color:#8fa6c2">potential</strong> fits identified from public information. Jets West confirms real demand before any introduction.`;

  const text = [
    `Hi ${firstName || 'there'},`, '',
    `Yesterday we sent over a shortlist of ${operatorCount ? operatorCount + ' ' : ''}aviation operators${location ? ' near ' + location : ' in your area'} that could be a fit for a leaseback. One quick question: did any of them stand out?`, '',
    `You don't need to call anyone — that's what we're here for. Point us at the one or two that interest you and we'll go get the real numbers: actual utilization, aircraft preferences, and the economics straight from the operator.`, '',
    `If none jumped out, no problem. We can widen the search or walk you through what a leaseback would actually look like for your situation.`, '',
    `Just reply to this email, or grab a time: ${bookingUrl}`, '',
    `— Stan Snyder, JetsWest Aviation`, '',
    `The operators we shared are potential fits identified from public information. Jets West confirms real demand before any introduction.`,
  ].join('\n');

  return {
    subject: 'Did any of those operators stand out?',
    html: shell({ title: 'Did any of those operators stand out?', bodyHtml, footerHtml }),
    text,
  };
}

// ---------------------------------------------------------------------------
// Leaseback Planning Package (§4 "After call" + §5 sphere of influence)
// ---------------------------------------------------------------------------
function renderPlanningPackage({ firstName, bookingUrl = BOOKING_URL, planningPackageUrl } = {}) {
  const name = firstName ? esc(firstName) : 'there';
  const item = (t) => `<tr><td style="padding:0 0 10px;font:400 15px/1.6 Arial,sans-serif;color:#c6d5ea">✈&nbsp; ${t}</td></tr>`;

  const bodyHtml = `
    <p style="margin:0 0 16px">Hi ${name},</p>
    <p style="margin:0 0 16px">Good talking. As promised, here’s your <strong style="color:#eaf2ff">Leaseback Planning Package</strong> — everything you and your advisors need to evaluate putting an aircraft on leaseback.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
      ${item('<strong style="color:#eaf2ff">Pro forma model</strong> — revenue and expense assumptions you can adjust')}
      ${item('<strong style="color:#eaf2ff">Utilization scenarios</strong> — conservative, expected, and high-hour cases')}
      ${item('<strong style="color:#eaf2ff">Operator comparison worksheet</strong> — the local operators we identified, side by side')}
      ${item('<strong style="color:#eaf2ff">CPA &amp; advisor discussion guide</strong> — the questions worth asking before you commit')}
    </table>
    ${planningPackageUrl ? `<p style="margin:0 0 24px">${ctaButton(planningPackageUrl, 'Open your planning package →')}</p>` : ''}
    <p style="margin:0 0 16px">A note on the numbers: these model <em>potential</em> outcomes based on typical utilization. Actual demand and economics get confirmed once we approach operators on your behalf — we don’t guess.</p>
    <p style="margin:0 0 16px">One ask: if a spouse, CPA, financial advisor, or business partner will weigh in, loop them in now — we’d rather everyone see the same numbers early. If you don’t have an advisor who knows aircraft leasebacks, we can introduce you to one who does.</p>
    <p style="margin:0 0 24px">When you’re ready, we’ll approach two or three of these operators for real demand and terms.</p>
    <p style="margin:0 0 26px">${ctaButton(bookingUrl, 'Book the next call →')}</p>
    <p style="margin:0">— Stan Snyder<br><span style="color:#8fa6c2">JetsWest Aviation</span></p>`;

  const footerHtml = `Jets West does not provide tax or legal advice — your CPA and attorney run the final numbers; this package is to give them a running start. Operators shown are <strong style="color:#8fa6c2">potential</strong> leaseback fits; current demand has not yet been verified.`;

  const text = [
    `Hi ${firstName || 'there'},`, '',
    `Good talking. As promised, here's your Leaseback Planning Package — everything you and your advisors need to evaluate putting an aircraft on leaseback.`, '',
    `- Pro forma model — revenue and expense assumptions you can adjust`,
    `- Utilization scenarios — conservative, expected, and high-hour cases`,
    `- Operator comparison worksheet — the local operators we identified, side by side`,
    `- CPA & advisor discussion guide — the questions worth asking before you commit`, '',
    planningPackageUrl ? `Open your planning package: ${planningPackageUrl}\n` : '',
    `A note on the numbers: these model potential outcomes based on typical utilization. Actual demand and economics get confirmed once we approach operators on your behalf — we don't guess.`, '',
    `One ask: if a spouse, CPA, financial advisor, or business partner will weigh in, loop them in now — we'd rather everyone see the same numbers early. If you don't have an advisor who knows aircraft leasebacks, we can introduce you to one who does.`, '',
    `When you're ready, we'll approach two or three of these operators for real demand and terms. Book a time: ${bookingUrl}`, '',
    `— Stan Snyder, JetsWest Aviation`, '',
    `Jets West does not provide tax or legal advice — your CPA and attorney run the final numbers. Operators shown are potential leaseback fits; current demand has not yet been verified.`,
  ].filter((l) => l !== '').join('\n');

  return {
    subject: 'Your leaseback planning package',
    html: shell({ title: 'Your leaseback planning package', bodyHtml, footerHtml }),
    text,
  };
}

module.exports = { renderDay1, renderPlanningPackage };
