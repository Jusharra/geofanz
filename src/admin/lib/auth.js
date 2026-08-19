import { supabase } from '../../lib/supabase.js'

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}

// Sends a reset-password email. redirectTo must be on Supabase's allow list
// (Authentication -> URL Configuration -> Redirect URLs) or Supabase silently
// falls back to the project's Site URL instead of landing back on /admin.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/admin`,
  })
  if (error) throw error
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// Passes the event through (not just the session) so callers can tell a
// normal sign-in apart from PASSWORD_RECOVERY, which needs its own screen
// instead of dropping straight into the dashboard.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session))
  return () => data.subscription.unsubscribe()
}
