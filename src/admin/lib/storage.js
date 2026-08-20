import { supabase } from '../../lib/supabase.js'

const AVATAR_MAX_BYTES = 3 * 1024 * 1024

export async function uploadAvatar(userId, file) {
  if (file.size > AVATAR_MAX_BYTES) {
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

// ---------- offer media ----------
// Shared 'offer-media' bucket (see migration 005), split into folders by
// kind. Paths are UUID-named -- unlike the avatar, nothing here overwrites
// a prior upload, so no upsert/cache-busting needed.

const IMAGE_MAX_BYTES = 3 * 1024 * 1024
const VIDEO_MAX_BYTES = 8 * 1024 * 1024 // matches the ~8MB guidance in 003

async function uploadOfferMedia(file, folder, maxBytes) {
  if (file.size > maxBytes) {
    throw new Error(`File must be under ${Math.round(maxBytes / (1024 * 1024))}MB.`)
  }
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `${folder}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from('offer-media').upload(path, file, { cacheControl: '3600' })
  if (error) throw error

  const { data } = supabase.storage.from('offer-media').getPublicUrl(path)
  return data.publicUrl
}

export const uploadOfferImage = (file) => uploadOfferMedia(file, 'images', IMAGE_MAX_BYTES)
export const uploadOfferPoster = (file) => uploadOfferMedia(file, 'posters', IMAGE_MAX_BYTES)
export const uploadOfferVideo = (file) => uploadOfferMedia(file, 'videos', VIDEO_MAX_BYTES)
