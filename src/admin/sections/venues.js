import L from 'leaflet'
import { listVenues, upsertVenue, deleteVenue } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'
import { toastSuccess, toastError } from '../lib/toast.js'

const FRESNO = { lat: 36.7378, lng: -119.7871 }
const VENUE_TYPES = ['stadium', 'arena', 'airport', 'venue', 'test']

let map, marker, circle
let editingId = null
let distanceUnit = 'meters'

function formatDistance(meters) {
  if (distanceUnit === 'feet') return `${Math.round(meters * 3.28084)}ft`
  return `${meters}m`
}

export async function renderVenuesSection(container, user) {
  // Internal re-renders (after save/delete) call this without `user` --
  // keep whatever preference was already resolved instead of resetting it.
  if (user) distanceUnit = user.user_metadata?.distance_unit === 'feet' ? 'feet' : 'meters'
  const venues = await listVenues()

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
              <input id="v-lat" name="latitude" required type="number" step="any" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="v-lng">Longitude</label>
              <input id="v-lng" name="longitude" required type="number" step="any" class="field-input" />
            </div>
          </div>

          <div>
            <label class="field-label" for="radius_meters">Radius: <span id="radius-value" class="text-hot font-bold normal-case">${formatDistance(800)}</span></label>
            <input id="radius_meters" name="radius_meters" type="range" min="25" max="3219" step="25" value="800" class="field-range" />
            <p class="field-hint">Up to 2 miles (3,219m).</p>
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
          <p class="text-xs text-white/40">${v.venue_type} · ${formatDistance(v.radius_meters)} · ${escapeHtml(v.city ?? '')}</p>
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
  setTimeout(() => map.invalidateSize(), 50)
}

function setLatLngInputs(container, lat, lng) {
  container.querySelector('[name=latitude]').value = lat.toFixed(6)
  container.querySelector('[name=longitude]').value = lng.toFixed(6)
}

function wireForm(container) {
  const form = container.querySelector('#venue-form')
  const radiusInput = form.querySelector('[name=radius_meters]')
  const radiusValue = container.querySelector('#radius-value')
  radiusInput.addEventListener('input', () => {
    radiusValue.textContent = formatDistance(Number(radiusInput.value))
    circle.setRadius(Number(radiusInput.value))
  })

  const latInput = form.querySelector('[name=latitude]')
  const lngInput = form.querySelector('[name=longitude]')
  const syncMapFromInputs = () => {
    const lat = Number(latInput.value)
    const lng = Number(lngInput.value)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      marker.setLatLng([lat, lng])
      circle.setLatLng([lat, lng])
      map.setView([lat, lng])
    }
  }
  latInput.addEventListener('change', syncMapFromInputs)
  lngInput.addEventListener('change', syncMapFromInputs)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = container.querySelector('#venue-error')
    errorEl.textContent = ''
    const fd = new FormData(form)
    const payload = {
      name: fd.get('name'),
      description: fd.get('description') || null,
      city: fd.get('city') || null,
      state_province: fd.get('state_province') || null,
      venue_type: fd.get('venue_type'),
      active: fd.get('active') === 'on',
      latitude: Number(fd.get('latitude')),
      longitude: Number(fd.get('longitude')),
      radius_meters: Number(fd.get('radius_meters')),
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

  marker.setLatLng([venue.latitude, venue.longitude])
  circle.setLatLng([venue.latitude, venue.longitude])
  circle.setRadius(venue.radius_meters)
  map.setView([venue.latitude, venue.longitude], 15)
  setTimeout(() => map.invalidateSize(), 50)
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
  if (marker) {
    marker.setLatLng([FRESNO.lat, FRESNO.lng])
    circle.setLatLng([FRESNO.lat, FRESNO.lng])
    circle.setRadius(800)
    map.setView([FRESNO.lat, FRESNO.lng], 13)
  }
}
