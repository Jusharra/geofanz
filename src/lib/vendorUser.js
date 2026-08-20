import { supabase } from './supabase.js'

// Shared between /admin (to block scoped vendor accounts from the full
// dashboard) and /scan (to identify which vendor a signed-in user belongs
// to). null means this user isn't in vendor_users -- treated as the site
// admin, same convention as redeem_token's own vendor-scoping check.
export async function getMyVendorUser(userId) {
  const { data, error } = await supabase
    .from('vendor_users')
    .select('vendor_id, role, vendors(dba_name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}
