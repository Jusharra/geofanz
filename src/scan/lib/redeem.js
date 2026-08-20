import { supabase } from '../../lib/supabase.js'

export async function redeemToken(tokenOrCode, lat, lng, saleAmount) {
  const { data, error } = await supabase.rpc('redeem_token', {
    p_token: tokenOrCode,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
    p_sale_amount: saleAmount ?? null,
  })
  if (error) throw error
  return data?.[0]
}
