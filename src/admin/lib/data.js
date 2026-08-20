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
