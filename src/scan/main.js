import '../style.css'
import { supabaseConfigured } from '../lib/supabase.js'
import { getPosition } from '../lib/geolocation.js'
import {
  signIn,
  signOut,
  onAuthChange,
  requestPasswordReset,
  updatePassword,
  updateProfile,
  getCurrentUser,
} from '../admin/lib/auth.js'
import { getMyVendorUser } from './lib/vendor.js'
import { redeemToken } from './lib/redeem.js'
import { startCamera, stopCamera, scanLoop } from './lib/camera.js'
import { escapeHtml } from '../admin/lib/dom.js'

const root = document.getElementById('scan-app')

let currentView = null
let cameraStream = null
let stopScan = null

function boot() {
  if (!supabaseConfigured) {
    root.innerHTML = `
      <div class="min-h-dvh flex items-center justify-center px-6 text-center">
        <p class="text-white/60">Supabase isn't configured in this environment.</p>
      </div>
    `
    return
  }

  root.innerHTML = '<div class="min-h-dvh"></div>'

  onAuthChange(async (event, session) => {
    teardownCamera()

    if (event === 'PASSWORD_RECOVERY') {
      currentView = 'reset'
      renderResetPassword()
      return
    }

    if (!session) {
      currentView = 'login'
      renderLogin()
      return
    }

    if (currentView === 'scanner' && event === 'TOKEN_REFRESHED') return

    const user = await getCurrentUser()
    const vendorUser = await getMyVendorUser(user.id)

    if (vendorUser && !user.user_metadata?.vendor_password_set) {
      currentView = 'set-password'
      renderSetPassword()
      return
    }

    currentView = 'scanner'
    renderScanner(vendorUser)
  })
}

// ---------- auth screens ----------

function renderLogin() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="login-form" class="card w-full max-w-sm p-6 space-y-4">
        <div class="text-center">
          <div class="wordmark inline-block">Hot Hand <em>Buys</em></div>
          <p class="field-label !mb-0 !mt-1">Scan</p>
        </div>
        <div>
          <label class="field-label" for="login-email">Email</label>
          <input id="login-email" name="email" type="email" required autocomplete="username" class="field-input" />
        </div>
        <div>
          <label class="field-label" for="login-password">Password</label>
          <input id="login-password" name="password" type="password" required autocomplete="current-password" class="field-input" />
        </div>
        <button type="submit" class="btn-primary w-full">Sign in</button>
        <button type="button" id="forgot-link" class="w-full text-sm text-white/50 hover:text-white/80">Forgot password?</button>
        <p id="login-error" class="text-sm text-red-400 text-center"></p>
      </form>
    </div>
  `
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = document.getElementById('login-error')
    errorEl.textContent = ''
    const fd = new FormData(e.target)
    try {
      await signIn(fd.get('email'), fd.get('password'))
    } catch {
      errorEl.textContent = 'Sign-in failed — check your email and password.'
    }
  })
  document.getElementById('forgot-link').addEventListener('click', () => renderForgotPassword())
}

function renderForgotPassword() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="forgot-form" class="card w-full max-w-sm p-6 space-y-4">
        <h1 class="font-condensed font-bold uppercase text-xl text-center">Reset your password</h1>
        <div>
          <label class="field-label" for="forgot-email">Email</label>
          <input id="forgot-email" name="email" type="email" required autocomplete="username" class="field-input" />
        </div>
        <button type="submit" class="btn-primary w-full">Send reset link</button>
        <button type="button" id="back-to-login" class="w-full text-sm text-white/50 hover:text-white/80">Back to sign in</button>
        <p id="forgot-status" class="text-sm text-center"></p>
      </form>
    </div>
  `
  document.getElementById('back-to-login').addEventListener('click', () => renderLogin())
  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const submitBtn = e.target.querySelector('button[type=submit]')
    submitBtn.disabled = true
    try {
      await requestPasswordReset(fd.get('email'))
    } catch {
      // same message either way -- don't reveal whether an email is registered
    }
    const statusEl = document.getElementById('forgot-status')
    statusEl.className = 'text-sm text-center text-white/60'
    statusEl.textContent = 'If that email has an account, a reset link is on its way.'
  })
}

function renderResetPassword() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="reset-form" class="card w-full max-w-sm p-6 space-y-4">
        <h1 class="font-condensed font-bold uppercase text-xl text-center">Set a new password</h1>
        <div>
          <label class="field-label" for="new-password">New password</label>
          <input id="new-password" name="password" type="password" required minlength="6" autocomplete="new-password" class="field-input" />
        </div>
        <button type="submit" class="btn-primary w-full">Update password</button>
        <p id="reset-error" class="text-sm text-red-400 text-center"></p>
      </form>
    </div>
  `
  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = document.getElementById('reset-error')
    errorEl.textContent = ''
    const fd = new FormData(e.target)
    try {
      await updatePassword(fd.get('password'))
      // updateUser() fires USER_UPDATED, which falls through boot()'s
      // general session branch -- without this, a vendor whose
      // vendor_password_set is still false would land right back on
      // renderSetPassword and be asked to do this a second time.
      await updateProfile({ vendor_password_set: true })
      const user = await getCurrentUser()
      const vendorUser = await getMyVendorUser(user.id)
      currentView = 'scanner'
      renderScanner(vendorUser)
    } catch (err) {
      errorEl.textContent = err.message
    }
  })
}

function renderSetPassword() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="set-password-form" class="card w-full max-w-sm p-6 space-y-4">
        <h1 class="font-condensed font-bold uppercase text-xl text-center">Welcome — set a password</h1>
        <p class="text-sm text-white/50 text-center">You're in. Set a password now so you can sign back in next time.</p>
        <div>
          <label class="field-label" for="sp-password">Password</label>
          <input id="sp-password" name="password" type="password" required minlength="6" autocomplete="new-password" class="field-input" />
        </div>
        <button type="submit" class="btn-primary w-full">Continue to scanner</button>
        <p id="sp-error" class="text-sm text-red-400 text-center"></p>
      </form>
    </div>
  `
  document.getElementById('set-password-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = document.getElementById('sp-error')
    errorEl.textContent = ''
    const fd = new FormData(e.target)
    try {
      await updatePassword(fd.get('password'))
      await updateProfile({ vendor_password_set: true })
      const user = await getCurrentUser()
      const vendorUser = await getMyVendorUser(user.id)
      currentView = 'scanner'
      renderScanner(vendorUser)
    } catch (err) {
      errorEl.textContent = err.message
    }
  })
}

// ---------- scanner ----------

function teardownCamera() {
  stopScan?.()
  stopScan = null
  stopCamera(cameraStream)
  cameraStream = null
}

async function renderScanner(vendorUser) {
  const vendorLabel = vendorUser ? escapeHtml(vendorUser.vendors?.dba_name ?? 'Your business') : 'Admin (all vendors)'

  root.innerHTML = `
    <div class="min-h-dvh flex flex-col">
      <header class="app-header px-4 py-2.5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="wordmark shrink-0">Hot Hand <em>Buys</em></div>
          <div class="min-w-0">
            <p class="field-label !mb-0 !text-[10px]">Scanning for</p>
            <p class="font-condensed font-bold text-sm truncate">${vendorLabel}</p>
          </div>
        </div>
        <button id="sign-out" class="btn-secondary text-xs py-1.5 px-3 shrink-0">Sign out</button>
      </header>

      <main class="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-6">
        <div id="camera-wrap" class="w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black relative">
          <video id="camera-video" class="w-full h-full object-cover" playsinline muted></video>
          <canvas id="camera-canvas" class="hidden"></canvas>
          <p id="camera-status" class="absolute inset-0 flex items-center justify-center text-white/50 text-sm px-6 text-center"></p>
        </div>

        <div id="result-screen" class="hidden w-full max-w-sm"></div>

        <form id="manual-form" class="w-full max-w-sm card p-4 space-y-3">
          <p class="field-label">No signal? Key in the code</p>
          <input id="manual-code" name="code" placeholder="6-character code" maxlength="6"
            class="field-input uppercase text-center text-xl tracking-widest font-bold" />
          <input id="manual-sale" name="sale" type="number" step="0.01" min="0" placeholder="Sale amount (optional)" class="field-input" />
          <button type="submit" class="btn-primary w-full">Redeem</button>
        </form>
      </main>
    </div>
  `

  document.getElementById('sign-out').addEventListener('click', () => {
    teardownCamera()
    signOut()
  })

  document.getElementById('manual-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const code = fd.get('code')?.trim()
    if (!code) return
    const sale = fd.get('sale') ? Number(fd.get('sale')) : null
    await handleScan(code, sale)
    e.target.reset()
  })

  await setupCamera()
}

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission denied. Allow camera access in your browser/site settings, then tap Retry.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera found on this device.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is already in use by another app or tab.'
    case 'OverconstrainedError':
      return "No camera matches what's needed here."
    case 'SecurityError':
      return 'Camera requires a secure (https) connection.'
    default:
      return `Camera unavailable (${err?.name || 'unknown error'}: ${err?.message || 'no details'}).`
  }
}

async function setupCamera() {
  const video = document.getElementById('camera-video')
  const canvas = document.getElementById('camera-canvas')
  const status = document.getElementById('camera-status')

  try {
    cameraStream = await startCamera(video)
    status.textContent = ''
    armScanLoop(video, canvas)
  } catch (err) {
    status.innerHTML = `
      <span class="flex flex-col items-center gap-2 max-w-[240px]">
        <span>${escapeHtml(cameraErrorMessage(err))} Use the code entry below instead, or</span>
        <button id="retry-camera" class="btn-secondary text-xs">Retry camera</button>
      </span>
    `
    document.getElementById('retry-camera')?.addEventListener('click', () => {
      status.textContent = ''
      setupCamera()
    })
  }
}

function armScanLoop(video, canvas) {
  stopScan = scanLoop(video, canvas, (data) => {
    handleScan(data, null).finally(() => {
      // give the result screen a moment before the camera starts hunting again
      setTimeout(() => {
        if (currentView === 'scanner') armScanLoop(video, canvas)
      }, 2500)
    })
  })
}

async function handleScan(tokenOrCode, saleAmount) {
  const resultEl = document.getElementById('result-screen')
  const cameraWrap = document.getElementById('camera-wrap')

  let lat, lng
  try {
    const pos = await getPosition()
    lat = pos.coords.latitude
    lng = pos.coords.longitude
  } catch {
    // location is audit-only here; redemption proceeds without it
  }

  let result
  try {
    result = await redeemToken(tokenOrCode, lat, lng, saleAmount)
  } catch (err) {
    result = { status: 'not_found', message: err.message }
  }

  const isOk = result.status === 'ok'
  cameraWrap.classList.add('hidden')
  resultEl.classList.remove('hidden')
  resultEl.innerHTML = `
    <div class="rounded-2xl p-6 text-center ${isOk ? 'bg-green-600' : 'bg-red-600'}">
      <p class="font-display uppercase text-3xl tracking-wide">${isOk ? 'Redeemed' : escapeHtml(result.message ?? 'Error')}</p>
      ${result.offer_head ? `<p class="mt-2 font-condensed font-bold">${escapeHtml(result.offer_head)}</p>` : ''}
      ${result.deal_text ? `<p class="text-sm opacity-80">${escapeHtml(result.deal_text)}</p>` : ''}
    </div>
    <button id="scan-next" class="btn-secondary w-full mt-3">Scan next</button>
  `
  document.getElementById('scan-next').addEventListener('click', () => {
    resultEl.classList.add('hidden')
    resultEl.innerHTML = ''
    cameraWrap.classList.remove('hidden')
  })
}

boot()
