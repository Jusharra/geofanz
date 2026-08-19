// Wraps getCurrentPosition as a promise with the options CLAUDE.md specifies.
// Rejects with a normal GeolocationPositionError on denial/timeout — the
// caller treats denial as a real, expected state, not an exception path.
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('geolocation_unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60000,
    })
  })
}

// 3-decimal coarse coordinates (~110m) — the privacy floor from CLAUDE.md.
export function coarsen(value) {
  return Math.round(value * 1000) / 1000
}
