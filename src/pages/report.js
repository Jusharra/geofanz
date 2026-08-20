import '../style.css'
import { supabase, supabaseConfigured } from '../lib/supabase.js'
import { getSessionId } from '../lib/session.js'
import { getPosition } from '../lib/geolocation.js'

const root = document.getElementById('report-app')

const CATEGORIES = [
  { value: 'no_deals', label: "I can't see any deals" },
  { value: 'code_wont_scan', label: "My code wouldn't scan" },
  { value: 'vendor_refused', label: "A vendor wouldn't accept my code" },
  { value: 'site_down', label: "The site won't load" },
  { value: 'other', label: 'Something else' },
]

// Best-effort only -- never block submission on this, never ask
// permission if it hasn't already been granted elsewhere on the site.
async function findNearbyVenueId() {
  try {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: 'geolocation' })
      if (status.state !== 'granted') return null
    }
    const pos = await getPosition()
    const { data } = await supabase.rpc('check_fence', {
      p_lat: pos.coords.latitude,
      p_lng: pos.coords.longitude,
      p_accuracy_m: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
    })
    return data?.[0]?.venue_id ?? null
  } catch {
    return null
  }
}

function render() {
  root.innerHTML = `
    <h2 class="text-2xl font-black mb-2">Something not working?</h2>
    <p class="text-white/60 text-sm mb-6">Tell us what happened and we'll fix it.</p>

    <form id="report-form" class="space-y-4">
      <div>
        <label class="field-label" for="category">What went wrong?</label>
        <select id="category" name="category" required class="field-select">
          <option value="" disabled selected>Choose one…</option>
          ${CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="field-label" for="details">Tell us more</label>
        <textarea id="details" name="details" rows="4" class="field-textarea"></textarea>
      </div>
      <div>
        <label class="field-label" for="contact_info">Your email or phone (optional)</label>
        <input id="contact_info" name="contact_info" placeholder="Only if you want a reply" class="field-input" />
      </div>
      <button type="submit" class="btn-primary w-full">Send</button>
      <p id="report-status" class="text-sm text-center"></p>
    </form>

    <p class="text-white/40 text-xs mt-6 text-center">If a vendor refused a valid code, tell us. We follow up with them directly.</p>
  `

  const form = document.getElementById('report-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('report-status')
    const submitBtn = form.querySelector('button[type=submit]')
    statusEl.className = 'text-sm text-center'
    statusEl.textContent = ''

    if (!supabaseConfigured) {
      statusEl.className = 'text-sm text-center text-red-400'
      statusEl.textContent = 'Not configured in this environment.'
      return
    }

    const fd = new FormData(form)
    submitBtn.disabled = true

    const venueId = await findNearbyVenueId()

    const { error } = await supabase.from('problem_reports').insert({
      category: fd.get('category'),
      details: fd.get('details') || null,
      contact_info: fd.get('contact_info') || null,
      session_id: getSessionId(),
      venue_id: venueId,
    })

    if (error) {
      statusEl.className = 'text-sm text-center text-red-400'
      statusEl.textContent = "Something went wrong — mind trying again in a moment?"
      submitBtn.disabled = false
      return
    }

    root.innerHTML = `
      <h2 class="text-2xl font-black mb-2">Got it.</h2>
      <p class="text-white/60 text-sm">Thanks for the report — we'll look into it.</p>
    `
  })
}

render()
