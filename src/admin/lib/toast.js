// Shared toast notifications for the admin app. Independent of any one
// section's DOM lifecycle -- appends to <body> once, reused across every
// tab switch and re-render.

let containerEl = null

function ensureContainer() {
  if (containerEl && document.body.contains(containerEl)) return containerEl
  containerEl = document.createElement('div')
  containerEl.id = 'toast-container'
  containerEl.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none'
  document.body.appendChild(containerEl)
  return containerEl
}

const STYLES = {
  success: 'bg-green-950/90 border-green-700/60 text-green-300',
  error: 'bg-red-950/90 border-red-700/60 text-red-300',
  info: 'bg-surface border-white/15 text-white/80',
}

export function showToast(message, type = 'info', duration = 4000) {
  const container = ensureContainer()
  const el = document.createElement('div')
  el.className = `pointer-events-auto max-w-sm border rounded-xl px-4 py-3 text-sm shadow-lg animate-reveal ${STYLES[type] ?? STYLES.info}`
  el.textContent = message
  container.appendChild(el)

  setTimeout(() => {
    el.style.transition = 'opacity 200ms ease'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 200)
  }, duration)
}

export const toastSuccess = (msg) => showToast(msg, 'success')
export const toastError = (msg) => showToast(msg, 'error')
