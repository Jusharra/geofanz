// Invites a vendor staff account by email and links it to a vendor.
// Runs server-side only -- this is the one place SUPABASE_SERVICE_ROLE_KEY
// is allowed to exist, per CLAUDE.md's hard constraint #2.
//
// Auth model: the caller's own JWT is used to open a request-scoped
// client that respects RLS, so "is this caller allowed to invite
// people" is answered by Postgres (admin_vendor_users policy -- true
// for anyone NOT already a vendor_user), not by trusting the request
// body. The service-role client is used only for the two actions that
// require it: sending the invite and inserting the resulting link.
import { createClient } from '@supabase/supabase-js'

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

  let email, vendorId, role
  try {
    ;({ email, vendorId, role } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }
  if (!email || !vendorId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email and vendorId are required' }) }
  }
  role = role === 'owner' ? 'owner' : 'staff'

  // Acts as the caller -- RLS decides whether they're allowed to manage
  // vendor_users (admin_vendor_users policy: true for non-vendor accounts).
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !userData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid session' }) }
  }

  const { error: probeErr } = await callerClient
    .from('vendor_users')
    .select('user_id', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
  if (probeErr) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Not authorized to invite staff' }) }
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const site = process.env.URL || `https://${event.headers.host}`
  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${site}/scan`,
  })
  if (inviteErr) {
    return { statusCode: 400, body: JSON.stringify({ error: inviteErr.message }) }
  }

  const { error: linkErr } = await adminClient
    .from('vendor_users')
    .insert({ user_id: inviteData.user.id, vendor_id: vendorId, role, email })
  if (linkErr) {
    return { statusCode: 400, body: JSON.stringify({ error: linkErr.message }) }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
