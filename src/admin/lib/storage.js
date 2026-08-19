import { supabase } from '../../lib/supabase.js'

const MAX_BYTES = 3 * 1024 * 1024

export async function uploadAvatar(userId, file) {
  if (file.size > MAX_BYTES) {
    throw new Error('Image must be under 3MB.')
  }
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `${userId}/avatar.${ext}`

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  // Cache-bust so the new image shows immediately instead of the old
  // cached one at the same URL.
  return `${data.publicUrl}?t=${Date.now()}`
}
