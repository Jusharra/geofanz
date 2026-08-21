// Thin SendGrid wrapper. Throws a clear, catchable error if the API key
// hasn't been configured yet in Netlify env vars -- callers surface that
// as a toast rather than a raw 500.
export async function sendEmail({ to, from, subject, html }) {
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = from || process.env.SENDGRID_FROM_EMAIL
  if (!apiKey) throw new Error('SENDGRID_API_KEY is not set in Netlify env vars yet')
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL is not set in Netlify env vars yet')

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: 'Hot Hand Buys' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SendGrid ${res.status}: ${body.slice(0, 300)}`)
  }
}
