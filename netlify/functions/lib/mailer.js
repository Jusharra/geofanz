// Sends mail through the business mailbox over SMTP (Hostinger). Replaces the
// SendGrid helper: the domain's MX/SPF/DKIM already point at Hostinger, so
// sending as that same mailbox keeps deliverability aligned with no extra
// vendor. Credentials are Netlify env vars only -- never the repo, never the
// browser.
//
//   SMTP_HOST  smtp.hostinger.com
//   SMTP_PORT  465 (implicit TLS) or 587 (STARTTLS)
//   SMTP_USER  the mailbox, e.g. hello@hothandbuys.us
//   SMTP_PASS  that mailbox's password
//   SMTP_FROM  optional display address; defaults to SMTP_USER (Hostinger only
//              lets you send as the authenticated mailbox or its aliases)
import nodemailer from 'nodemailer'

export class MailNotConfiguredError extends Error {
  constructor(missing) {
    super(`Email isn't set up yet — missing Netlify env var(s): ${missing.join(', ')}`)
    this.name = 'MailNotConfiguredError'
    this.missing = missing
  }
}

let cached = null

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  const missing = Object.entries({ SMTP_HOST, SMTP_USER, SMTP_PASS })
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) throw new MailNotConfiguredError(missing)

  const port = Number(SMTP_PORT) || 465
  if (!cached) {
    cached = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // Netlify functions get ~10s; fail fast instead of hanging until the
      // platform kills the invocation with no useful error.
      connectionTimeout: 6000,
      greetingTimeout: 6000,
      socketTimeout: 8000,
    })
  }
  return cached
}

export async function sendEmail({ to, subject, html, replyTo }) {
  const transport = getTransport()
  const address = process.env.SMTP_FROM || process.env.SMTP_USER
  await transport.sendMail({
    from: { name: 'Hot Hand Buys', address },
    to,
    replyTo,
    subject,
    html,
  })
}
