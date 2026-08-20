import jsQR from 'jsqr'

export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  })
  videoEl.srcObject = stream
  await videoEl.play()
  return stream
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

// Decodes frames until onDetect fires once. Returns a stop function --
// call it to cancel (e.g. when navigating away) without waiting for a hit.
export function scanLoop(videoEl, canvasEl, onDetect) {
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true })
  let active = true

  function tick() {
    if (!active) return
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      canvasEl.width = videoEl.videoWidth
      canvasEl.height = videoEl.videoHeight
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height)
      const frame = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height)
      const code = jsQR(frame.data, frame.width, frame.height)
      if (code) {
        active = false
        onDetect(code.data)
        return
      }
    }
    requestAnimationFrame(tick)
  }
  tick()

  return () => {
    active = false
  }
}
