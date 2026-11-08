import L from 'leaflet'
import { listVenues, upsertVenue, deleteVenue } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'
import { toastSuccess, toastError } from '../lib/toast.js'

const FRESNO = { lat: 36.7378, lng: -119.7871 }
const VENUE_TYPES = ['stadium', 'arena', 'airport', 'venue', 'test']

let map, marker, circle
let editingId = null
let distanceUnit = 'meters'
// Overlapping renders (double auth event at boot, rapid tab clicks, save
// while a previous load is still in flight) each await the venue list, then
// build a map. Only the newest one is allowed to touch the DOM/map globals.
let renderSeq = 0

function formatDistance(meters) {
  if (distanceUnit === 'feet') return `${Math.round(meters * 3.28084)}ft`
  return `${meters}m`
}

export async function renderVenuesSection(container, user) {
  // Internal re-renders (after save/delete) call this without `user` --
  // keep whatever preference was already resolved instead of resetting it.
  const seq = ++renderSeq
  if (user) distanceUnit = user.user_metadata?.distance_unit === 'feet' ? 'feet' : 'meters'
  const venues = await listVenues()
  // A newer render started, or the tab was left, while we were loading.
  if (seq !== renderSeq || !container.isConnected) return

  if (map) {
    map.remove()
    map = marker = circle = undefined
  }

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-condensed font-bold uppercase tracking-wide text-lg">Venues</h2>
          <button id="venue-new" class="btn-primary text-sm py-1.5 px-3">+ New venue</button>
        </div>
        <div class="space-y-2" id="venue-list"></div>
      </div>
      <div class="card p-4">
        <form id="venue-form" class="space-y-4">
          <input type="hidden" name="id" />
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="field-label" for="v-name">Name</label>
              <input id="v-name" name="name" required class="field-input" />
            </div>
            <div class="col-span-2">
              <label class="field-label" for="v-description">Description</label>
              <input id="v-description" name="description" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="v-city">City</label>
              <input id="v-city" name="city" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="v-state">State</label>
              <input id="v-state" name="state_province" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="venue_type">Type</label>
              <select id="venue_type" name="venue_type" class="field-select">
                ${VENUE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <label class="switch mt-6">
              <input type="checkbox" name="active" checked />
              <span class="track"><span class="thumb"></span></span>
              <span class="text-sm">Active</span>
            </label>
          </div>

          <div id="venue-map" class="w-full h-64 rounded-xl overflow-hidden border border-white/10"></div>
          <p class="field-hint -mt-2">Click the map or drag the marker to set the venue's location.</p>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label" for="v-lat">Latitude</label>
              <input id="v-lat" name="latitude" required inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="36.7378" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="v-lng">Longitude</label>
              <input id="v-lng" name="longitude" required inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="-119.7871" class="field-input" />
            </div>
          </div>

          <div>
            <label class="field-label" for="radius_meters">Radius: <span id="radius-value" class="text-hot font-bold normal-case">${formatDistance(800)}</span></label>
            <input id="radius_meters" name="radius_meters" type="range" min="25" max="3219" step="25" value="800" class="field-range" />
            <p class="field-hint">Up to 2 miles (3,219m).</p>
          </div>

          <div class="rounded-xl border border-white/10 p-3 space-y-4">
            <p class="text-xs font-bold uppercase tracking-wide text-hot">When it's live &amp; how many offers</p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="field-label" for="v-mode">Mode</label>
                <select id="v-mode" name="mode" class="field-select">
                  <option value="event">Event</option>
                  <option value="always_on">Always on</option>
                </select>
              </div>
              <div>
                <label class="field-label" for="v-slots">Slot limit</label>
                <input id="v-slots" name="slot_limit" type="number" step="1" min="1" max="30" value="10" inputmode="numeric" class="field-input" />
              </div>
            </div>
            <p class="field-hint -mt-2">Event = offers run in their campaign window. Always on = offers also have to fall inside the open hours below. Slot limit is how many offers a visitor sees at once (1–30).</p>

            <div id="hours-fields" class="hidden grid grid-cols-2 gap-3">
              <div>
                <label class="field-label" for="v-open">Open hour (0–23)</label>
                <input id="v-open" name="open_hour" type="number" step="1" min="0" max="23" inputmode="numeric" placeholder="e.g. 6" class="field-input" />
              </div>
              <div>
                <label class="field-label" for="v-close">Close hour (0–23)</label>
                <input id="v-close" name="close_hour" type="number" step="1" min="0" max="23" inputmode="numeric" placeholder="e.g. 22" class="field-input" />
              </div>
              <p class="field-hint col-span-2 -mt-2">Close hour is inclusive: 22 stays open until 10:59 PM. Leave both blank for open all day. Overnight windows (open later than close) aren't supported.</p>
            </div>

            <div>
              <label class="field-label" for="v-tz">Timezone</label>
              <input id="v-tz" name="timezone" value="America/Los_Angeles" autocomplete="off" spellcheck="false" class="field-input" />
              <p class="field-hint">Used for the open hours. Fresno is America/Los_Angeles.</p>
            </div>
          </div>

          <div class="flex gap-2 pt-2">
            <button type="submit" class="btn-primary">Save venue</button>
            <button type="button" id="venue-cancel" class="btn-secondary">Cancel</button>
          </div>
          <p id="venue-error" class="text-sm text-red-400"></p>
        </form>
      </div>
    </div>
  `

  renderVenueList(container, venues)
  initMap(container)
  wireForm(container)
  resetForm(container)

  container.querySelector('#venue-new').addEventListener('click', () => resetForm(container))
  container.querySelector('#venue-cancel').addEventListener('click', () => resetForm(container))
}

function renderVenueList(container, venues) {
  const list = container.querySelector('#venue-list')
  list.innerHTML = venues
    .map(
      (v) => `
      <div class="flex items-center justify-between card px-3 py-2.5">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(v.name)} ${v.active ? '' : '<span class="text-white/30">(inactive)</span>'}</p>
          <p class="text-xs text-white/40">${v.venue_type} · ${formatDistance(v.radius_meters)} · ${escapeHtml(v.city ?? '')} · ${v.mode === 'always_on' ? 'always on' : 'event'} · ${v.slot_limit ?? 10} slots</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-edit="${v.id}" class="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">Edit</button>
          <button data-delete="${v.id}" class="text-xs px-2.5 py-1 rounded-lg bg-red-950/60 text-red-300 hover:bg-red-900/60 transition-colors">Delete</button>
        </div>
      </div>
    `
    )
    .join('') || '<p class="text-sm text-white/40">No venues yet.</p>'

  list.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const v = venues.find((x) => x.id === btn.dataset.edit)
      if (v) fillForm(container, v)
    })
  )
  list.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const v = venues.find((x) => x.id === btn.dataset.delete)
      if (!confirm(`Delete venue "${v?.name}"? This cannot be undone.`)) return
      await deleteVenue(btn.dataset.delete)
      toastSuccess(`Deleted "${v?.name}".`)
      renderVenuesSection(container)
    })
  )
}

function initMap(container) {
  const el = container.querySelector('#venue-map')
  map = L.map(el).setView([FRESNO.lat, FRESNO.lng], 13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  marker = L.marker([FRESNO.lat, FRESNO.lng], { draggable: true }).addTo(map)
  circle = L.circle([FRESNO.lat, FRESNO.lng], { radius: 800, color: '#ff3d1a' }).addTo(map)

  marker.on('drag', () => {
    const { lat, lng } = marker.getLatLng()
    circle.setLatLng([lat, lng])
    setLatLngInputs(container, lat, lng)
  })

  map.on('click', (e) => {
    marker.setLatLng(e.latlng)
    circle.setLatLng(e.latlng)
    setLatLngInputs(container, e.latlng.lat, e.latlng.lng)
  })

  // Vite renders the map div at 0 height during the initial layout pass.
  invalidateSoon()
}

// The map can be destroyed (tab switch, re-render, sign-out) before this
// fires; hold a reference and only touch it if it's still the live one.
function invalidateSoon() {
  const m = map
  setTimeout(() => {
    if (map === m && m) m.invalidateSize()
  }, 50)
}

function setLatLngInputs(container, lat, lng) {
  // Leaflet reports the raw position on the repeating world map (e.g. -479.7
  // for -119.7 one world to the west); fold it back into -180..180.
  const p = L.latLng(lat, lng).wrap()
  container.querySelector('[name=latitude]').value = Math.max(-90, Math.min(90, p.lat)).toFixed(6)
  container.querySelector('[name=longitude]').value = p.lng.toFixed(6)
}

// The lat/lng boxes are plain text (not type="number") on purpose: a number
// box silently drops characters depending on the keyboard/region, which is
// how "-119.7899" became -11978995792944772. Accept a "." or "," decimal and
// the fancy minus some keyboards produce.
function parseCoord(raw) {
  const t = String(raw ?? '').trim().replace(/−/g, '-').replace(/\s+/g, '')
  const s = /^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN
}

// Google Maps hands you "36.7321, -119.7899" in one go; paste it in either box.
function parseCoordPair(text) {
  const m = String(text ?? '').trim().match(/^(-?\d+(?:\.\d+)?)(?:\s*;\s*|\s*,\s+|\s+)(-?\d+(?:\.\d+)?)$/)
  return m ? { lat: m[1], lng: m[2] } : null
}

function readCoordinates(latRaw, lngRaw) {
  const lat = parseCoord(latRaw)
  const lng = parseCoord(lngRaw)
  if (Number.isNaN(lat) || Math.abs(lat) > 90) {
    return { problem: `Latitude has to be a number between -90 and 90 (you entered "${latRaw}"). Fresno is about 36.7.` }
  }
  if (Number.isNaN(lng) || Math.abs(lng) > 180) {
    const dropped = !String(lngRaw).includes('.') && String(lngRaw).replace(/\D/g, '').length > 6
    return {
      problem: `Longitude has to be a number between -180 and 180 (you entered "${lngRaw}"${dropped ? ' — looks like the decimal point is missing' : ''}). Fresno is about -119.8.`,
    }
  }
  return { lat, lng }
}

// Hours only mean something for an always-on venue.
function toggleHoursFields(container) {
  const mode = container.querySelector('[name=mode]').value
  container.querySelector('#hours-fields').classList.toggle('hidden', mode !== 'always_on')
}

// Everything get_live_offers does with these columns, checked up front so a
// bad value is a clear message here instead of an empty or broken fan page.
function scheduleProblem({ mode, slotLimit, openHour, closeHour, timezone }) {
  if (!Number.isInteger(slotLimit) || slotLimit < 1 || slotLimit > 30) {
    return 'Slot limit has to be a whole number from 1 to 30.'
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
  } catch {
    return `"${timezone}" isn't a timezone I recognize. Use a name like America/Los_Angeles.`
  }
  if (mode === 'always_on') {
    const hourOk = (h) => h === null || (Number.isInteger(h) && h >= 0 && h <= 23)
    if (!hourOk(openHour) || !hourOk(closeHour)) return 'Open and close hours have to be whole numbers from 0 to 23.'
    if ((openHour === null) !== (closeHour === null)) {
      return 'Set both an open hour and a close hour, or leave both blank for open all day.'
    }
    if (openHour !== null && openHour > closeHour) {
      return "Open hour has to be earlier than close hour. Overnight windows (like 22 to 2) aren't supported yet."
    }
  }
  return null
}

function wireForm(container) {
  const form = container.querySelector('#venue-form')
  form.querySelector('[name=mode]').addEventListener('change', () => toggleHoursFields(container))
  const radiusInput = form.querySelector('[name=radius_meters]')
  const radiusValue = container.querySelector('#radius-value')
  radiusInput.addEventListener('input', () => {
    radiusValue.textContent = formatDistance(Number(radiusInput.value))
    circle.setRadius(Number(radiusInput.value))
  })

  const latInput = form.querySelector('[name=latitude]')
  const lngInput = form.querySelector('[name=longitude]')
  const syncMapFromInputs = () => {
    if (latInput.value === '' || lngInput.value === '') return
    const { lat, lng, problem } = readCoordinates(latInput.value, lngInput.value)
    if (problem) return
    marker.setLatLng([lat, lng])
    circle.setLatLng([lat, lng])
    map.setView([lat, lng])
  }
  latInput.addEventListener('change', syncMapFromInputs)
  lngInput.addEventListener('change', syncMapFromInputs)
  ;[latInput, lngInput].forEach((input) =>
    input.addEventListener('paste', (e) => {
      const pair = parseCoordPair(e.clipboardData?.getData('text'))
      if (!pair) return
      e.preventDefault()
      latInput.value = pair.lat
      lngInput.value = pair.lng
      syncMapFromInputs()
    })
  )

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = container.querySelector('#venue-error')
    errorEl.textContent = ''
    const fd = new FormData(form)
    const { lat, lng, problem } = readCoordinates(fd.get('latitude'), fd.get('longitude'))
    if (problem) {
      errorEl.textContent = problem
      toastError(problem)
      return
    }
    const mode = fd.get('mode') === 'always_on' ? 'always_on' : 'event'
    const hourOf = (v) => (String(v ?? '').trim() === '' ? null : Number(v))
    const schedule = {
      mode,
      slotLimit: Number(String(fd.get('slot_limit') ?? '').trim() || NaN),
      openHour: hourOf(fd.get('open_hour')),
      closeHour: hourOf(fd.get('close_hour')),
      timezone: String(fd.get('timezone') ?? '').trim() || 'America/Los_Angeles',
    }
    const scheduleErr = scheduleProblem(schedule)
    if (scheduleErr) {
      errorEl.textContent = scheduleErr
      toastError(scheduleErr)
      return
    }

    const payload = {
      name: fd.get('name'),
      description: fd.get('description') || null,
      city: fd.get('city') || null,
      state_province: fd.get('state_province') || null,
      venue_type: fd.get('venue_type'),
      active: fd.get('active') === 'on',
      latitude: lat,
      longitude: lng,
      radius_meters: Number(fd.get('radius_meters')),
      mode,
      slot_limit: schedule.slotLimit,
      timezone: schedule.timezone,
      // Hours only apply to always-on venues; don't leave stale ones behind.
      open_hour: mode === 'always_on' ? schedule.openHour : null,
      close_hour: mode === 'always_on' ? schedule.closeHour : null,
    }
    if (editingId) payload.id = editingId

    try {
      await upsertVenue(payload)
      toastSuccess('Venue saved.')
      renderVenuesSection(container)
    } catch (err) {
      errorEl.textContent = err.message
      toastError(err.message)
    }
  })
}

function fillForm(container, venue) {
  editingId = venue.id
  const form = container.querySelector('#venue-form')
  form.querySelector('[name=name]').value = venue.name ?? ''
  form.querySelector('[name=description]').value = venue.description ?? ''
  form.querySelector('[name=city]').value = venue.city ?? ''
  form.querySelector('[name=state_province]').value = venue.state_province ?? ''
  form.querySelector('[name=venue_type]').value = venue.venue_type ?? 'venue'
  form.querySelector('[name=active]').checked = !!venue.active
  form.querySelector('[name=latitude]').value = venue.latitude
  form.querySelector('[name=longitude]').value = venue.longitude
  form.querySelector('[name=radius_meters]').value = venue.radius_meters
  container.querySelector('#radius-value').textContent = formatDistance(venue.radius_meters)
  form.querySelector('[name=mode]').value = venue.mode ?? 'event'
  form.querySelector('[name=slot_limit]').value = venue.slot_limit ?? 10
  form.querySelector('[name=open_hour]').value = venue.open_hour ?? ''
  form.querySelector('[name=close_hour]').value = venue.close_hour ?? ''
  form.querySelector('[name=timezone]').value = venue.timezone ?? 'America/Los_Angeles'
  toggleHoursFields(container)

  marker.setLatLng([venue.latitude, venue.longitude])
  circle.setLatLng([venue.latitude, venue.longitude])
  circle.setRadius(venue.radius_meters)
  map.setView([venue.latitude, venue.longitude], 15)
  invalidateSoon()
}

export function destroyVenuesMap() {
  if (map) {
    map.remove()
    map = marker = circle = undefined
  }
}

function resetForm(container) {
  editingId = null
  const form = container.querySelector('#venue-form')
  form.reset()
  form.querySelector('[name=radius_meters]').value = 800
  container.querySelector('#radius-value').textContent = formatDistance(800)
  toggleHoursFields(container)
  if (marker) {
    marker.setLatLng([FRESNO.lat, FRESNO.lng])
    circle.setLatLng([FRESNO.lat, FRESNO.lng])
    circle.setRadius(800)
    map.setView([FRESNO.lat, FRESNO.lng], 13)
  }
}
