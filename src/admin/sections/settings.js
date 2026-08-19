import { getCurrentUser, updateEmail, updatePassword, updateProfile } from '../lib/auth.js'
import { uploadAvatar } from '../lib/storage.js'
import { escapeHtml } from '../lib/dom.js'

const LANDING_TABS = [
  { id: 'venues', label: 'Venues' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'offers', label: 'Offers' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'reports', label: 'Reports' },
]

export async function renderSettingsSection(container) {
  const user = await getCurrentUser()
  const meta = user.user_metadata ?? {}

  container.innerHTML = `
    <div class="max-w-2xl space-y-6">
      ${section('Profile', profileFormHtml(user, meta))}
      ${section('Account', accountFormHtml(user))}
      ${section('Notifications', notificationsFormHtml(meta))}
      ${section('Preferences', preferencesFormHtml(meta))}
    </div>
  `

  wireProfileForm(container, user, meta)
  wireAccountForms(container, user)
  wireNotificationsForm(container)
  wirePreferencesForm(container)
}

function section(title, bodyHtml) {
  return `
    <section class="card p-5">
      <h2 class="text-lg font-bold mb-4">${title}</h2>
      ${bodyHtml}
    </section>
  `
}

function initials(user, meta) {
  const source = meta.username || user.email || '?'
  return source.trim().slice(0, 2).toUpperCase()
}

// ---------- profile: avatar + username ----------

function profileFormHtml(user, meta) {
  return `
    <form id="profile-form" class="space-y-4">
      <div class="flex items-center gap-4">
        <div class="avatar-preview" id="avatar-preview">
          ${meta.avatar_url ? `<img src="${escapeHtml(meta.avatar_url)}" alt="" />` : initials(user, meta)}
        </div>
        <div>
          <label class="btn-secondary inline-block cursor-pointer text-sm">
            Change avatar
            <input type="file" id="avatar-input" accept="image/png,image/jpeg,image/webp" class="hidden" />
          </label>
          <p class="field-hint">PNG, JPG, or WebP. Under 3MB.</p>
        </div>
      </div>
      <div>
        <label class="field-label" for="username">Username</label>
        <input id="username" name="username" class="field-input" value="${escapeHtml(meta.username ?? '')}" placeholder="How you'll be identified in the admin" />
      </div>
      <button type="submit" class="btn-primary">Save profile</button>
      <p id="profile-status" class="text-sm"></p>
    </form>
  `
}

function wireProfileForm(container, user, meta) {
  const form = container.querySelector('#profile-form')
  const preview = container.querySelector('#avatar-preview')
  const fileInput = container.querySelector('#avatar-input')

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]
    if (!file) return
    const statusEl = container.querySelector('#profile-status')
    statusEl.className = 'text-sm text-white/50'
    statusEl.textContent = 'Uploading…'
    try {
      const url = await uploadAvatar(user.id, file)
      await updateProfile({ avatar_url: url })
      preview.innerHTML = `<img src="${escapeHtml(url)}" alt="" />`
      statusEl.className = 'text-sm text-green-400'
      statusEl.textContent = 'Avatar updated.'
    } catch (err) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = err.message
    }
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = container.querySelector('#profile-status')
    statusEl.textContent = ''
    const fd = new FormData(form)
    try {
      await updateProfile({ username: fd.get('username') || null })
      statusEl.className = 'text-sm text-green-400'
      statusEl.textContent = 'Saved.'
    } catch (err) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = err.message
    }
  })
}

// ---------- account: email + password ----------

function accountFormHtml(user) {
  return `
    <div class="space-y-6">
      <form id="email-form" class="space-y-3">
        <div>
          <label class="field-label" for="email">Email</label>
          <input id="email" name="email" type="email" required class="field-input" value="${escapeHtml(user.email)}" />
          <p class="field-hint">Changing this sends a confirmation link to the new address before it takes effect.</p>
        </div>
        <button type="submit" class="btn-secondary">Update email</button>
        <p id="email-status" class="text-sm"></p>
      </form>

      <form id="password-form" class="space-y-3 pt-4 border-t border-white/10">
        <div>
          <label class="field-label" for="new-password">New password</label>
          <input id="new-password" name="password" type="password" required minlength="6" autocomplete="new-password" class="field-input" />
        </div>
        <div>
          <label class="field-label" for="confirm-password">Confirm password</label>
          <input id="confirm-password" name="confirm" type="password" required minlength="6" autocomplete="new-password" class="field-input" />
        </div>
        <button type="submit" class="btn-secondary">Update password</button>
        <p id="password-status" class="text-sm"></p>
      </form>
    </div>
  `
}

function wireAccountForms(container, user) {
  const emailForm = container.querySelector('#email-form')
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = container.querySelector('#email-status')
    statusEl.textContent = ''
    const fd = new FormData(emailForm)
    const newEmail = fd.get('email')
    if (newEmail === user.email) return
    try {
      await updateEmail(newEmail)
      statusEl.className = 'text-sm text-green-400'
      statusEl.textContent = 'Check your new inbox for a confirmation link.'
    } catch (err) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = err.message
    }
  })

  const passwordForm = container.querySelector('#password-form')
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = container.querySelector('#password-status')
    statusEl.textContent = ''
    const fd = new FormData(passwordForm)
    if (fd.get('password') !== fd.get('confirm')) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = "Passwords don't match."
      return
    }
    try {
      await updatePassword(fd.get('password'))
      statusEl.className = 'text-sm text-green-400'
      statusEl.textContent = 'Password updated.'
      passwordForm.reset()
    } catch (err) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = err.message
    }
  })
}

// ---------- notifications ----------
// Stored preferences only -- there's no email-sending pipeline wired up
// yet (CLAUDE.md is deliberately light on notification infra for v1).
// Saving these just remembers what should be turned on once one exists.

const NOTIFICATION_TOGGLES = [
  { key: 'notify_new_redemption', label: 'A redemption is logged', hint: 'Someone redeems a display code at a register.' },
  { key: 'notify_campaign_ending', label: 'A campaign is ending soon', hint: 'A campaign\'s time window ends within 24 hours.' },
  { key: 'notify_weekly_summary', label: 'Weekly performance summary', hint: 'Views, unlocks, and redemptions across all campaigns.' },
]

function notificationsFormHtml(meta) {
  const toggles = NOTIFICATION_TOGGLES.map(
    (t) => `
    <label class="switch">
      <input type="checkbox" name="${t.key}" ${meta[t.key] ? 'checked' : ''} />
      <span class="track"><span class="thumb"></span></span>
      <span>
        <span class="block text-sm font-medium">${t.label}</span>
        <span class="block text-xs text-white/40">${t.hint}</span>
      </span>
    </label>
  `
  ).join('')

  return `
    <p class="field-hint mb-4">Emails aren't wired up yet -- these just save your preference for when they are.</p>
    <form id="notifications-form" class="space-y-4">
      ${toggles}
      <button type="submit" class="btn-secondary">Save preferences</button>
      <p id="notifications-status" class="text-sm"></p>
    </form>
  `
}

function wireNotificationsForm(container) {
  const form = container.querySelector('#notifications-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = container.querySelector('#notifications-status')
    statusEl.textContent = ''
    const fd = new FormData(form)
    const partial = Object.fromEntries(NOTIFICATION_TOGGLES.map((t) => [t.key, fd.get(t.key) === 'on']))
    try {
      await updateProfile(partial)
      statusEl.className = 'text-sm text-green-400'
      statusEl.textContent = 'Saved.'
    } catch (err) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = err.message
    }
  })
}

// ---------- preferences ----------

function preferencesFormHtml(meta) {
  return `
    <form id="preferences-form" class="space-y-4">
      <div>
        <label class="field-label" for="landing-tab">Default tab on login</label>
        <select id="landing-tab" name="landing_tab" class="field-select">
          ${LANDING_TABS.map(
            (t) => `<option value="${t.id}" ${meta.landing_tab === t.id ? 'selected' : ''}>${t.label}</option>`
          ).join('')}
        </select>
      </div>
      <div>
        <label class="field-label" for="distance-unit">Distance unit</label>
        <select id="distance-unit" name="distance_unit" class="field-select">
          <option value="meters" ${meta.distance_unit !== 'feet' ? 'selected' : ''}>Meters</option>
          <option value="feet" ${meta.distance_unit === 'feet' ? 'selected' : ''}>Feet</option>
        </select>
        <p class="field-hint">Used for the radius display on the Venues tab. Storage stays in meters either way.</p>
      </div>
      <button type="submit" class="btn-secondary">Save preferences</button>
      <p id="preferences-status" class="text-sm"></p>
    </form>
  `
}

function wirePreferencesForm(container) {
  const form = container.querySelector('#preferences-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = container.querySelector('#preferences-status')
    statusEl.textContent = ''
    const fd = new FormData(form)
    try {
      await updateProfile({
        landing_tab: fd.get('landing_tab'),
        distance_unit: fd.get('distance_unit'),
      })
      statusEl.className = 'text-sm text-green-400'
      statusEl.textContent = 'Saved.'
    } catch (err) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = err.message
    }
  })
}
