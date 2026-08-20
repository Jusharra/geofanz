import { supabase } from '../../lib/supabase.js'

export { getMyVendorUser } from '../../lib/vendorUser.js'

export async function listVendors() {
  const { data, error } = await supabase.from('vendors').select('id, dba_name').eq('active', true).order('dba_name')
  if (error) throw error
  return data
}
