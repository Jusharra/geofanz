import { supabase } from '../../lib/supabase.js'

function check(result) {
  if (result.error) throw result.error
  return result.data
}

// ---------- venues ----------

export async function listVenues() {
  return check(await supabase.from('venues').select('*').order('created_at', { ascending: false }))
}

export async function upsertVenue(venue) {
  return check(await supabase.from('venues').upsert(venue).select().single())
}

export async function deleteVenue(id) {
  check(await supabase.from('venues').delete().eq('id', id))
}

// ---------- vendors ----------

export async function listVendors() {
  return check(await supabase.from('vendors').select('*').order('created_at', { ascending: false }))
}

export async function upsertVendor(vendor) {
  return check(await supabase.from('vendors').upsert(vendor).select().single())
}

export async function deleteVendor(id) {
  check(await supabase.from('vendors').delete().eq('id', id))
}

// ---------- offers ----------

export async function listOffers() {
  return check(
    await supabase
      .from('offers')
      .select('*, vendors(dba_name)')
      .order('created_at', { ascending: false })
  )
}

export async function upsertOffer(offer) {
  return check(await supabase.from('offers').upsert(offer).select().single())
}

export async function deleteOffer(id) {
  check(await supabase.from('offers').delete().eq('id', id))
}

// ---------- campaigns ----------

export async function listCampaigns() {
  return check(
    await supabase
      .from('campaigns')
      .select('*, vendors(dba_name), offers(headline), campaign_venues(venue_id, venues(name))')
      .order('created_at', { ascending: false })
  )
}

export async function upsertCampaign(campaign) {
  return check(await supabase.from('campaigns').upsert(campaign).select().single())
}

export async function deleteCampaign(id) {
  check(await supabase.from('campaigns').delete().eq('id', id))
}

export async function setCampaignVenues(campaignId, venueIds) {
  check(await supabase.from('campaign_venues').delete().eq('campaign_id', campaignId))
  if (venueIds.length === 0) return
  check(
    await supabase
      .from('campaign_venues')
      .insert(venueIds.map((venue_id) => ({ campaign_id: campaignId, venue_id })))
  )
}

// ---------- reports ----------

export async function listCampaignReports() {
  return check(await supabase.from('campaign_report').select('*').order('starts_at', { ascending: false }))
}

export async function listCampaignHourly(campaignId) {
  return check(
    await supabase.from('campaign_hourly').select('*').eq('campaign_id', campaignId).order('hour', { ascending: true })
  )
}

// Internal-only -- never surface this data to a vendor. See CLAUDE.md /
// the migration comments: outside_scans and denied_pct are distribution
// diagnostics, not vendor performance.
export async function listVenueDiagnostics() {
  return check(
    await supabase.from('venue_diagnostics').select('*').order('day', { ascending: false })
  )
}

// Fraud/quality signals for the redemption-token system -- also
// internal-only. See migration 007's comments on token_integrity.
export async function listTokenIntegrity() {
  return check(await supabase.from('token_integrity').select('*'))
}

// ---------- activity ----------

export async function listRecentActivity() {
  return check(await supabase.from('recent_activity').select('*').order('at', { ascending: false }))
}

// ---------- inbox: partner leads + problem reports ----------

export async function listPartnerLeads() {
  return check(await supabase.from('partner_leads').select('*').order('created_at', { ascending: false }))
}

export async function updatePartnerLeadStatus(id, status) {
  check(await supabase.from('partner_leads').update({ status }).eq('id', id))
}

export async function listProblemReports() {
  return check(
    await supabase
      .from('problem_reports')
      .select('*, venues(name)')
      .order('created_at', { ascending: false })
  )
}

export async function updateProblemReportStatus(id, status) {
  check(await supabase.from('problem_reports').update({ status }).eq('id', id))
}

// ---------- vendor staff ----------

export async function listVendorUsers() {
  return check(
    await supabase
      .from('vendor_users')
      .select('*, vendors(dba_name)')
      .order('created_at', { ascending: false })
  )
}

export async function setVendorUserActive(userId, active) {
  check(await supabase.from('vendor_users').update({ active }).eq('user_id', userId))
}

// Server-side only -- this is the one call that touches the service role
// key, via the invite-vendor Netlify function. Sends the caller's own
// access token so the function can verify authorization through RLS
// rather than trusting the request body.
export async function inviteVendorStaff(email, vendorId, role) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const res = await fetch('/.netlify/functions/invite-vendor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, vendorId, role }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Invite failed')
  return body
}
