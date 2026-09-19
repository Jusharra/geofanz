// Fires a plain notification email when a public form (partner.html or
// report.html) writes a new row to partner_leads / problem_reports. No
// auth -- these forms are anonymous by design, same as the insert
// itself (see migration 014's `submit_partner_lead` / `submit_problem_report`
// policies, `to anon, authenticated with check (true)`). The destination
// address is a fixed mapping, never client-supplied, so this can't be
// used as an open relay.
//
// Best-effort only: the DB insert already succeeded by the time this
// runs (see src/pages/partner.js / report.js), so a failure here is
// logged, not surfaced to the fan -- they already saw "thanks, got it."
import { sendEmail, MailNotConfiguredError } from './lib/mailer.js'

const DESTINATIONS = {
  partner_lead: 'vendors@hothandbuys.us',
  problem_report: 'hello@hothandbuys.us',
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  let kind, fields
  try {
    ;({ kind, fields } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const to = DESTINATIONS[kind]
  if (!to) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown kind' }) }
  }

  const rows = Object.entries(fields || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 10px 4px 0;color:#999;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`)
    .join('')

  const subject = kind === 'partner_lead' ? 'New Partner With Us submission' : 'New problem report'

  // If the submitter left an email, make Reply go straight to them.
  const contact = String(fields?.['Contact info'] ?? '').trim()
  const replyTo = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(contact) ? contact : undefined

  try {
    await sendEmail({
      to,
      replyTo,
      subject: `Hot Hand Buys — ${subject}`,
      html: `<table role="presentation" style="font-family:Arial,sans-serif;font-size:14px;">${rows}</table><p style="color:#999;font-size:12px;">Full details and status tracking are in the admin Inbox.</p>`,
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true, emailed: true }) }
  } catch (err) {
    // Swallow -- see file header. Netlify function logs still capture the
    // detail; the response only says *whether* it sent, never why, since
    // this endpoint is public.
    console.error('notify-inbox-submission failed:', err.message)
    const reason = err instanceof MailNotConfiguredError ? 'not_configured' : 'send_failed'
    return { statusCode: 200, body: JSON.stringify({ ok: true, emailed: false, reason }) }
  }
}
