import '../style.css'
import 'leaflet/dist/leaflet.css'
import { supabaseConfigured } from '../lib/supabase.js'
import { signIn, signOut, onAuthChange, requestPasswordReset, updatePassword } from './lib/auth.js'
import { renderVenuesSection, destroyVenuesMap } from './sections/venues.js'
import { renderVendorsSection } from './sections/vendors.js'
import { renderOffersSection } from './sections/offers.js'
import { renderCampaignsSection } from './sections/campaigns.js'
import { renderReportsSection } from './sections/reports.js'

const root = document.getElementById('admin-app')

const TABS = [
  { id: 'venues', label: 'Venues', render: renderVenuesSection },
  { id: 'vendors', label: 'Vendors', render: renderVendorsSection },
  { id: 'offers', label: 'Offers', render: renderOffersSection },
  { id: 'campaigns', label: 'Campaigns', render: renderCampaignsSection },
  { id: 'reports', label: 'Reports', render: renderReportsSection },
]

let activeTab = TABS[0].id

function boot() {
  if (!supabaseConfigured) {
    root.innerHTML = `
      <div class="min-h-dvh flex items-center justify-center px-6 text-center">
        <p class="text-white/60">Supabase isn't configured in this environment. Admin needs a real project — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
      </div>
    `
    return
  }

  root.innerHTML = '<div class="min-h-dvh"></div>'

  // INITIAL_SESSION fires once on subscribe with the current state (including
  // an in-progress recovery flow parsed from the URL), so this alone covers
  // both first paint and every later auth change -- no separate getSession().
  onAuthChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      renderResetPassword()
    } else if (session) {
      renderDashboard()
    } else {
      renderLogin()
    }
  })
}

function renderLogin() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="login-form" class="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-6 space-y-4">
        <h1 class="text-xl font-black text-center">Hot Hand Buys — Admin</h1>
        <label class="text-sm block">Email
          <input name="email" type="email" required autocomplete="username"
            class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
        </label>
        <label class="text-sm block">Password
          <input name="password" type="password" required autocomplete="current-password"
            class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
        </label>
        <button type="submit" class="w-full py-2.5 rounded-lg bg-hot font-bold">Sign in</button>
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
    } catch (err) {
      errorEl.textContent = 'Sign-in failed — check your email and password.'
    }
  })

  document.getElementById('forgot-link').addEventListener('click', () => renderForgotPassword())
}

function renderForgotPassword() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="forgot-form" class="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-6 space-y-4">
        <h1 class="text-xl font-black text-center">Reset your password</h1>
        <p class="text-sm text-white/50 text-center">Enter your email and we'll send a reset link.</p>
        <label class="text-sm block">Email
          <input name="email" type="email" required autocomplete="username"
            class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
        </label>
        <button type="submit" class="w-full py-2.5 rounded-lg bg-hot font-bold">Send reset link</button>
        <button type="button" id="back-to-login" class="w-full text-sm text-white/50 hover:text-white/80">Back to sign in</button>
        <p id="forgot-status" class="text-sm text-center"></p>
      </form>
    </div>
  `

  document.getElementById('back-to-login').addEventListener('click', () => renderLogin())

  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('forgot-status')
    const fd = new FormData(e.target)
    const submitBtn = e.target.querySelector('button[type=submit]')
    submitBtn.disabled = true
    try {
      await requestPasswordReset(fd.get('email'))
    } catch (err) {
      // Fall through to the same message either way -- don't reveal
      // whether an email is registered.
    }
    statusEl.className = 'text-sm text-center text-white/60'
    statusEl.textContent = "If that email has an account, a reset link is on its way. Check your inbox."
  })
}

function renderResetPassword() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="reset-form" class="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-6 space-y-4">
        <h1 class="text-xl font-black text-center">Set a new password</h1>
        <label class="text-sm block">New password
          <input name="password" type="password" required minlength="6" autocomplete="new-password"
            class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
        </label>
        <label class="text-sm block">Confirm password
          <input name="confirm" type="password" required minlength="6" autocomplete="new-password"
            class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
        </label>
        <button type="submit" class="w-full py-2.5 rounded-lg bg-hot font-bold">Update password</button>
        <p id="reset-error" class="text-sm text-red-400 text-center"></p>
      </form>
    </div>
  `

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = document.getElementById('reset-error')
    errorEl.textContent = ''
    const fd = new FormData(e.target)
    if (fd.get('password') !== fd.get('confirm')) {
      errorEl.textContent = "Passwords don't match."
      return
    }
    try {
      await updatePassword(fd.get('password'))
      renderDashboard()
    } catch (err) {
      errorEl.textContent = err.message
    }
  })
}

function renderDashboard() {
  root.innerHTML = `
    <div class="min-h-dvh">
      <header class="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <h1 class="font-black">Hot Hand Buys — Admin</h1>
        <button id="sign-out" class="text-sm px-3 py-1.5 rounded-lg bg-white/10">Sign out</button>
      </header>
      <nav class="flex gap-1 px-4 pt-3 border-b border-white/10 overflow-x-auto">
        ${TABS.map(
          (t) => `
          <button data-tab="${t.id}"
            class="px-3 py-2 text-sm font-semibold rounded-t-lg whitespace-nowrap ${
              t.id === activeTab ? 'bg-surface text-white' : 'text-white/40 hover:text-white/70'
            }">${t.label}</button>
        `
        ).join('')}
      </nav>
      <main id="tab-content" class="p-4"></main>
    </div>
  `

  document.getElementById('sign-out').addEventListener('click', () => {
    if (activeTab === 'venues') destroyVenuesMap()
    signOut()
  })
  document.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (activeTab === 'venues' && btn.dataset.tab !== 'venues') destroyVenuesMap()
      activeTab = btn.dataset.tab
      renderDashboard()
    })
  )

  const content = document.getElementById('tab-content')
  const tab = TABS.find((t) => t.id === activeTab)
  content.innerHTML = '<p class="text-white/40 text-sm">Loading…</p>'
  tab.render(content).catch((err) => {
    content.innerHTML = `<p class="text-red-400 text-sm">${err.message}</p>`
  })
}

boot()
