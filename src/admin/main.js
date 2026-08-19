import '../style.css'
import 'leaflet/dist/leaflet.css'
import { supabaseConfigured } from '../lib/supabase.js'
import {
  signIn,
  signOut,
  onAuthChange,
  requestPasswordReset,
  updatePassword,
  getCurrentUser,
} from './lib/auth.js'
import { renderVenuesSection, destroyVenuesMap } from './sections/venues.js'
import { renderVendorsSection } from './sections/vendors.js'
import { renderOffersSection } from './sections/offers.js'
import { renderCampaignsSection } from './sections/campaigns.js'
import { renderReportsSection } from './sections/reports.js'
import { renderSettingsSection } from './sections/settings.js'
import { escapeHtml } from './lib/dom.js'

const root = document.getElementById('admin-app')

const TABS = [
  { id: 'venues', label: 'Venues', render: renderVenuesSection },
  { id: 'vendors', label: 'Vendors', render: renderVendorsSection },
  { id: 'offers', label: 'Offers', render: renderOffersSection },
  { id: 'campaigns', label: 'Campaigns', render: renderCampaignsSection },
  { id: 'reports', label: 'Reports', render: renderReportsSection },
  { id: 'settings', label: 'Settings', render: renderSettingsSection },
]

let activeTab = TABS[0].id
let currentView = null
let landingTabApplied = false

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
  onAuthChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      currentView = 'reset'
      renderResetPassword()
      return
    }

    if (session) {
      // Supabase silently refreshes the token in the background; don't yank
      // the admin back to their landing tab mid-work when that fires.
      if (currentView === 'dashboard' && event === 'TOKEN_REFRESHED') return

      let user
      try {
        user = await getCurrentUser()
      } catch {
        user = session.user
      }

      if (!landingTabApplied) {
        landingTabApplied = true
        if (user?.user_metadata?.landing_tab) activeTab = user.user_metadata.landing_tab
      }

      currentView = 'dashboard'
      renderDashboard(user)
    } else {
      landingTabApplied = false
      currentView = 'login'
      renderLogin()
    }
  })
}

function renderLogin() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="login-form" class="card w-full max-w-sm p-6 space-y-4">
        <h1 class="text-xl font-black text-center">Hot Hand Buys — Admin</h1>
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
    } catch (err) {
      errorEl.textContent = 'Sign-in failed — check your email and password.'
    }
  })

  document.getElementById('forgot-link').addEventListener('click', () => renderForgotPassword())
}

function renderForgotPassword() {
  root.innerHTML = `
    <div class="min-h-dvh flex items-center justify-center px-6">
      <form id="forgot-form" class="card w-full max-w-sm p-6 space-y-4">
        <h1 class="text-xl font-black text-center">Reset your password</h1>
        <p class="text-sm text-white/50 text-center">Enter your email and we'll send a reset link.</p>
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
      <form id="reset-form" class="card w-full max-w-sm p-6 space-y-4">
        <h1 class="text-xl font-black text-center">Set a new password</h1>
        <div>
          <label class="field-label" for="new-password">New password</label>
          <input id="new-password" name="password" type="password" required minlength="6" autocomplete="new-password" class="field-input" />
        </div>
        <div>
          <label class="field-label" for="confirm-password">Confirm password</label>
          <input id="confirm-password" name="confirm" type="password" required minlength="6" autocomplete="new-password" class="field-input" />
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
    if (fd.get('password') !== fd.get('confirm')) {
      errorEl.textContent = "Passwords don't match."
      return
    }
    try {
      await updatePassword(fd.get('password'))
      currentView = 'dashboard'
      renderDashboard(await getCurrentUser())
    } catch (err) {
      errorEl.textContent = err.message
    }
  })
}

function renderDashboard(user) {
  const meta = user?.user_metadata ?? {}
  const label = meta.username || user?.email || ''

  root.innerHTML = `
    <div class="min-h-dvh">
      <header class="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <h1 class="font-black">Hot Hand Buys — Admin</h1>
        <div class="flex items-center gap-3">
          <button data-tab="settings" class="flex items-center gap-2 hover:opacity-80" title="Settings">
            <span class="avatar-preview !w-8 !h-8 !text-xs">
              ${meta.avatar_url ? `<img src="${escapeHtml(meta.avatar_url)}" alt="" />` : escapeHtml((label || '?').slice(0, 2).toUpperCase())}
            </span>
            <span class="text-sm text-white/60 hidden sm:inline">${escapeHtml(label)}</span>
          </button>
          <button id="sign-out" class="btn-secondary text-sm py-1.5 px-3">Sign out</button>
        </div>
      </header>
      <nav class="flex gap-1 px-4 pt-3 border-b border-white/10 overflow-x-auto">
        ${TABS.map(
          (t) => `
          <button data-tab="${t.id}"
            class="px-3 py-2 text-sm font-semibold rounded-t-lg whitespace-nowrap transition-colors ${
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
      renderDashboard(user)
    })
  )

  const content = document.getElementById('tab-content')
  const tab = TABS.find((t) => t.id === activeTab)
  content.innerHTML = '<p class="text-white/40 text-sm">Loading…</p>'
  tab.render(content, user).catch((err) => {
    content.innerHTML = `<p class="text-red-400 text-sm">${err.message}</p>`
  })
}

boot()
