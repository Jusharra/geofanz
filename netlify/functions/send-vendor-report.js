// Admin-triggered "Send now" -- emails one vendor's campaign_report rows
// to their address on file. Same auth model as invite-vendor.js: the
// caller's own JWT identifies them, and anyone with no vendor_users row
// of their own is the site admin.
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './lib/sendgrid.js'
import { buildVendorReportHtml } from './lib/vendor-report-html.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing Authorization header' }) }
  }

  let vendorId
  try {
    ;({ vendorId } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }
  if (!vendorId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'vendorId is required' }) }
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '')

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  const { data: ownRow, error: ownErr } = await callerClient
    .from('vendor_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (ownErr || ownRow) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Not authorized to send reports' }) }
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: vendor, error: vendorErr } = await adminClient
    .from('vendors')
    .select('id, dba_name, email')
    .eq('id', vendorId)
    .single()
  if (vendorErr || !vendor) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Vendor not found' }) }
  }
  if (!vendor.email) {
    return { statusCode: 400, body: JSON.stringify({ error: `${vendor.dba_name} has no email on file` }) }
  }

  const { data: rows, error: reportErr } = await adminClient
    .from('campaign_report')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('starts_at', { ascending: false })
  if (reportErr) {
    return { statusCode: 500, body: JSON.stringify({ error: reportErr.message }) }
  }

  try {
    await sendEmail({
      to: vendor.email,
      subject: `Hot Hand Buys — ${vendor.dba_name}'s report`,
      html: buildVendorReportHtml(vendor.dba_name, rows),
    })
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) }
  }

  await adminClient.from('vendors').update({ last_report_sent_at: new Date().toISOString() }).eq('id', vendorId)

  return { statusCode: 200, body: JSON.stringify({ ok: true, sentTo: vendor.email }) }
}
