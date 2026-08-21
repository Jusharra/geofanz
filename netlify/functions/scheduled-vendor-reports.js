// Runs daily (see netlify.toml). Finds vendors whose report_frequency is
// due -- weekly means 7+ days since last_report_sent_at, monthly means
// 30+ days, null last_report_sent_at always counts as due -- and emails
// each one their campaign_report numbers via the same template as the
// admin "Send now" button.
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './lib/sendgrid.js'
import { buildVendorReportHtml } from './lib/vendor-report-html.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const FREQUENCY_DAYS = { weekly: 7, monthly: 30 }

function isDue(vendor) {
  const days = FREQUENCY_DAYS[vendor.report_frequency]
  if (!days) return false
  if (!vendor.last_report_sent_at) return true
  const elapsedMs = Date.now() - new Date(vendor.last_report_sent_at).getTime()
  return elapsedMs >= days * 24 * 60 * 60 * 1000
}

export const handler = async () => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: vendors, error: vendorErr } = await adminClient
    .from('vendors')
    .select('id, dba_name, email, report_frequency, last_report_sent_at')
    .in('report_frequency', ['weekly', 'monthly'])
    .eq('active', true)
    .not('email', 'is', null)
  if (vendorErr) {
    return { statusCode: 500, body: JSON.stringify({ error: vendorErr.message }) }
  }

  const due = (vendors || []).filter(isDue)
  const results = []

  for (const vendor of due) {
    try {
      const { data: rows, error: reportErr } = await adminClient
        .from('campaign_report')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('starts_at', { ascending: false })
      if (reportErr) throw reportErr

      await sendEmail({
        to: vendor.email,
        subject: `Hot Hand Buys — ${vendor.dba_name}'s report`,
        html: buildVendorReportHtml(vendor.dba_name, rows),
      })

      await adminClient.from('vendors').update({ last_report_sent_at: new Date().toISOString() }).eq('id', vendor.id)
      results.push({ vendor: vendor.dba_name, ok: true })
    } catch (err) {
      results.push({ vendor: vendor.dba_name, ok: false, error: err.message })
    }
  }

  return { statusCode: 200, body: JSON.stringify({ checked: (vendors || []).length, sent: results }) }
}
