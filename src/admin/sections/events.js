import { listEvents, upsertEvent, deleteEvent, listVenues } from '../lib/data.js'
import { escapeHtml, toLocalInputValue } from '../lib/dom.js'
import { toastSuccess, toastError } from '../lib/toast.js'

let editingId = null

const fmt = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Upcoming first (soonest at the top), then past ones with the most recent
// first -- the next game is what you're looking for, not last season's.
function sortEvents(events) {
  const now = Date.now()
  const upcoming = events.filter((e) => new Date(e.ends_at).getTime() >= now)
  const past = events.filter((e) => new Date(e.ends_at).getTime() < now)
  upcoming.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  past.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
  return [...upcoming, ...past]
}

export async function renderEventsSection(container) {
  const [events, venues] = await Promise.all([listEvents(), listVenues()])

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-condensed font-bold uppercase tracking-wide text-lg">Events</h2>
          <button id="event-new" class="btn-primary text-sm py-1.5 px-3">+ New event</button>
        </div>
        <div class="space-y-2" id="event-list"></div>
      </div>
      <div class="card p-4">
        <form id="event-form" class="space-y-4">
          <div>
            <label class="field-label" for="ev-venue">Venue</label>
            <select id="ev-venue" name="venue_id" required class="field-select">
              ${venues.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('')}
            </select>
            ${venues.length ? '' : '<p class="field-hint text-amber-400">Add a venue first — an event has to happen somewhere.</p>'}
          </div>
          <div>
            <label class="field-label" for="ev-name">Name</label>
            <input id="ev-name" name="name" required placeholder="Fresno State vs. Boise State" class="field-input" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label" for="ev-starts">Starts</label>
              <input id="ev-starts" name="starts_at" type="datetime-local" required class="field-input" />
            </div>
            <div>
              <label class="field-label" for="ev-ends">Ends</label>
              <input id="ev-ends" name="ends_at" type="datetime-local" required class="field-input" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label" for="ev-doors">Doors open (optional)</label>
              <input id="ev-doors" name="doors_open_at" type="datetime-local" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="ev-attendance">Expected attendance (optional)</label>
              <input id="ev-attendance" name="expected_attendance" type="number" step="1" min="0" inputmode="numeric" placeholder="e.g. 38000" class="field-input" />
            </div>
          </div>
          <label class="switch">
            <input type="checkbox" name="active" checked />
            <span class="track"><span class="thumb"></span></span>
            <span class="text-sm">Active</span>
          </label>
          <p class="field-hint -mt-2">Inactive events drop off the Dashboard's slot counts.</p>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="btn-primary">Save event</button>
            <button type="button" id="event-cancel" class="btn-secondary">Cancel</button>
          </div>
          <p id="event-error" class="text-sm text-red-400"></p>
        </form>
      </div>
    </div>
  `

  renderList(container, sortEvents(events))
  wireForm(container)

  container.querySelector('#event-new').addEventListener('click', () => resetForm(container))
  container.querySelector('#event-cancel').addEventListener('click', () => resetForm(container))
}

function renderList(container, events) {
  const list = container.querySelector('#event-list')
  const now = Date.now()
  list.innerHTML =
    events
      .map((e) => {
        const over = new Date(e.ends_at).getTime() < now
        return `
      <div class="flex items-center justify-between card px-3 py-2.5 ${over ? 'opacity-60' : ''}">
        <div class="min-w-0">
          <p class="font-semibold text-sm truncate">${escapeHtml(e.name)} ${e.active ? '' : '<span class="text-white/30">(inactive)</span>'}</p>
          <p class="text-xs text-white/40">${escapeHtml(e.venues?.name ?? '—')}${e.expected_attendance != null ? ` · ~${Number(e.expected_attendance).toLocaleString()} expected` : ''}</p>
          <p class="text-xs text-white/30">${fmt(e.starts_at)} → ${fmt(e.ends_at)}${over ? ' · ended' : ''}</p>
        </div>
        <div class="flex gap-2 shrink-0 ml-2">
          <button data-edit="${e.id}" class="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">Edit</button>
          <button data-delete="${e.id}" class="text-xs px-2.5 py-1 rounded-lg bg-red-950/60 text-red-300 hover:bg-red-900/60 transition-colors">Delete</button>
        </div>
      </div>`
      })
      .join('') || '<p class="text-sm text-white/40">No events yet.</p>'

  list.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const e = events.find((x) => x.id === btn.dataset.edit)
      if (e) fillForm(container, e)
    })
  )
  list.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const e = events.find((x) => x.id === btn.dataset.delete)
      if (!confirm(`Delete event "${e?.name}"? Campaigns linked to it are kept, just unlinked from the event.`)) return
      try {
        await deleteEvent(btn.dataset.delete)
        toastSuccess(`Deleted "${e?.name}".`)
        renderEventsSection(container)
      } catch (err) {
        toastError(err.message)
      }
    })
  )
}

function wireForm(container) {
  const form = container.querySelector('#event-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = container.querySelector('#event-error')
    errorEl.textContent = ''
    const fd = new FormData(form)

    const startsAt = new Date(fd.get('starts_at'))
    const endsAt = new Date(fd.get('ends_at'))
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      errorEl.textContent = 'Set both a start and an end time.'
      return
    }
    if (endsAt <= startsAt) {
      errorEl.textContent = 'The event has to end after it starts.'
      return
    }

    const rawDoors = fd.get('doors_open_at')
    const rawAttendance = String(fd.get('expected_attendance') ?? '').trim()
    const attendance = rawAttendance === '' ? null : Number(rawAttendance)
    if (attendance !== null && (!Number.isInteger(attendance) || attendance < 0)) {
      errorEl.textContent = 'Expected attendance has to be a whole number, or blank.'
      return
    }

    const payload = {
      venue_id: fd.get('venue_id'),
      name: String(fd.get('name')).trim(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      doors_open_at: rawDoors ? new Date(rawDoors).toISOString() : null,
      expected_attendance: attendance,
      active: fd.get('active') === 'on',
    }
    if (editingId) payload.id = editingId

    try {
      await upsertEvent(payload)
      toastSuccess('Event saved.')
      editingId = null
      renderEventsSection(container)
    } catch (err) {
      errorEl.textContent = err.message
      toastError(err.message)
    }
  })
}

function fillForm(container, event) {
  editingId = event.id
  const form = container.querySelector('#event-form')
  form.querySelector('[name=venue_id]').value = event.venue_id
  form.querySelector('[name=name]').value = event.name ?? ''
  form.querySelector('[name=starts_at]').value = toLocalInputValue(event.starts_at)
  form.querySelector('[name=ends_at]').value = toLocalInputValue(event.ends_at)
  form.querySelector('[name=doors_open_at]').value = toLocalInputValue(event.doors_open_at)
  form.querySelector('[name=expected_attendance]').value = event.expected_attendance ?? ''
  form.querySelector('[name=active]').checked = !!event.active
  container.querySelector('#event-error').textContent = ''
}

function resetForm(container) {
  editingId = null
  container.querySelector('#event-form').reset()
  container.querySelector('#event-error').textContent = ''
}
