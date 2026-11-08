import { listSlotAvailability } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'

let showPast = false

const money = (n) => `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

// "Sorted by upcoming event date": soonest event first, then venues with no
// event yet, then (only if asked for) events already over, most recent first.
function arrange(rows) {
  const now = Date.now()
  const dated = rows.filter((r) => r.starts_at)
  const upcoming = dated.filter((r) => new Date(r.starts_at).getTime() >= now)
  const past = dated.filter((r) => new Date(r.starts_at).getTime() < now)
  const undated = rows.filter((r) => !r.starts_at)

  upcoming.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  past.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
  undated.sort((a, b) => String(a.venue_name).localeCompare(String(b.venue_name)))
  return { upcoming, undated, past }
}

export async function renderDashboardSection(container) {
  const rows = await listSlotAvailability()
  const { upcoming, undated, past } = arrange(rows)
  const shown = [...upcoming, ...undated, ...(showPast ? past : [])]

  // Deliberately no grand-total revenue: slot_availability counts a
  // campaign's full price once per venue it runs at, so summing the column
  // would overstate anything that's booked at more than one venue.
  const upcomingEvents = upcoming.filter((r) => r.event_name).length
  const totalOpen = [...upcoming].reduce((sum, r) => sum + Math.max(0, Number(r.slots_open ?? 0)), 0)

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h2 class="font-condensed font-bold uppercase tracking-wide text-lg">Dashboard</h2>
      <label class="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
        <input type="checkbox" id="show-past" class="accent-hot" ${showPast ? 'checked' : ''} />
        Include past events${past.length ? ` (${past.length})` : ''}
      </label>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-4 max-w-md">
      <div class="card px-4 py-3">
        <p class="field-label !mb-0">Upcoming events</p>
        <p class="font-display text-2xl text-hot tabular-nums">${upcomingEvents}</p>
      </div>
      <div class="card px-4 py-3">
        <p class="field-label !mb-0">Open slots, upcoming</p>
        <p class="font-display text-2xl tabular-nums">${totalOpen}</p>
      </div>
    </div>

    <h3 class="font-condensed font-bold uppercase tracking-wide text-sm text-white/70 mb-2">Slots by event</h3>
    <p class="text-xs text-white/40 mb-3">"6 of 10 gone" is the line that closes vendors — this is where you read it. House ads only fill what's left unsold.</p>

    <div class="overflow-x-auto rounded-xl border border-white/10">
      <table class="w-full text-sm">
        <thead class="bg-surface text-white/50 text-xs uppercase">
          <tr>
            <th class="text-left px-3 py-2">Venue</th>
            <th class="text-left px-3 py-2">Event</th>
            <th class="text-right px-3 py-2">Sold</th>
            <th class="text-right px-3 py-2">Open</th>
            <th class="text-right px-3 py-2">House filling</th>
            <th class="text-right px-3 py-2">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${
            shown
              .map((r) => {
                const sold = Number(r.paid_slots_sold ?? 0)
                const open = Number(r.slots_open ?? 0)
                const over = open < 0
                const isPast = r.starts_at && new Date(r.starts_at).getTime() < Date.now()
                return `
            <tr class="border-t border-white/5 ${isPast ? 'opacity-60' : ''}">
              <td class="px-3 py-2">${escapeHtml(r.venue_name)}</td>
              <td class="px-3 py-2">
                ${r.event_name ? `${escapeHtml(r.event_name)}<span class="block text-xs text-white/40">${fmtDate(r.starts_at)}</span>` : '<span class="text-white/30">no event</span>'}
              </td>
              <td class="px-3 py-2 text-right whitespace-nowrap">${sold} <span class="text-white/40">of ${r.slot_limit}</span></td>
              <td class="px-3 py-2 text-right ${over ? 'text-amber-400 font-bold' : open === 0 ? 'text-white/40' : 'text-live font-semibold'}">${over ? `0 <span class="text-xs font-normal">(over by ${-open})</span>` : open}</td>
              <td class="px-3 py-2 text-right">${Number(r.house_filling ?? 0)}</td>
              <td class="px-3 py-2 text-right font-semibold">${money(r.revenue)}</td>
            </tr>`
              })
              .join('') ||
            `<tr><td colspan="6" class="px-3 py-6 text-center text-white/40">No venues or events yet.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `

  container.querySelector('#show-past').addEventListener('change', (e) => {
    showPast = e.target.checked
    renderDashboardSection(container)
  })
}
