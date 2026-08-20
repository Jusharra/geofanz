// Best-effort conversion of a YouTube/Vimeo URL (or an already-embeddable
// one) into an iframe src with autoplay=1. Autoplay here is fine -- it only
// fires after the fan taps play, never on page load.
export function toEmbedUrl(url) {
  try {
    const u = new URL(url)

    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1)
      return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) {
        u.searchParams.set('autoplay', '1')
        return u.toString()
      }
      const id = u.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`
    }
    if (u.hostname.includes('vimeo.com')) {
      if (u.hostname.includes('player.vimeo.com')) {
        u.searchParams.set('autoplay', '1')
        return u.toString()
      }
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id) return `https://player.vimeo.com/video/${id}?autoplay=1`
    }

    u.searchParams.set('autoplay', '1')
    return u.toString()
  } catch {
    return url
  }
}
