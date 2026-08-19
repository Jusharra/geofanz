import {
  listCampaigns,
  upsertCampaign,
  deleteCampaign,
  setCampaignVenues,
  listOffers,
  listVenues,
} from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'

let editingId = null

export async function renderCampaignsSection(container) {
  const [campaigns, offers, venues] = await Promise.all([listCampaigns(), listOffers(), listVenues()])

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold">Campaigns</h2>
          <button id="campaign-new" class="text-sm px-3 py-1.5 rounded-lg bg-hot font-semibold">+ New campaign</button>
        </div>
        <div class="space-y-2" id="campaign-list"></div>
      </div>
      <div class="bg-surface rounded-xl border border-white/10 p-4">
        <form id="campaign-form" class="space-y-3">
          <label class="text-sm block">Offer
            <select name="offer_id" required class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2">
              ${offers.map((o) => `<option value="${o.id}">${escapeHtml(o.headline)} — ${escapeHtml(o.vendors?.dba_name ?? '')}</option>`).join('')}
            </select>
          </label>
          <label class="text-sm block">Name
            <input name="name" placeholder="Boise State — Oct 10" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-sm">Starts
              <input name="starts_at" type="datetime-local" required class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
            </label>
            <label class="text-sm">Ends
              <input name="ends_at" type="datetime-local" required class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
            </label>
          </div>
          <label class="text-sm block">Price paid
            <input name="price_paid" type="number" step="0.01" min="0" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>

          <fieldset class="text-sm">
            <legend class="mb-1">Venues</legend>
            <div id="campaign-venues" class="flex flex-wrap gap-2">
              ${venues
                .map(
                  (v) => `
                <label class="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs cursor-pointer">
                  <input type="checkbox" name="venue_ids" value="${v.id}" class="w-3.5 h-3.5" /> ${escapeHtml(v.name)}
                </label>
              `
                )
                .join('')}
            </div>
          </fieldset>

          <div class="flex gap-4">
            <label class="text-sm flex items-center gap-2">
              <input type="checkbox" name="approved" class="w-4 h-4" /> Approved
            </label>
            <label class="text-sm flex items-center gap-2">
              <input type="checkbox" name="active" checked class="w-4 h-4" /> Active
            </label>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 rounded-lg bg-hot font-bold">Save campaign</button>
            <button type="button" id="campaign-cancel" class="px-4 py-2 rounded-lg bg-white/10">Cancel</button>
          </div>
          <p id="campaign-error" class="text-sm text-red-400"></p>
        </form>
      </div>
    </div>
  `

  renderList(container, campaigns)
  wireForm(container, offers)

  container.querySelector('#campaign-new').addEventListener('click', () => resetForm(container))
  container.querySelector('#campaign-cancel').addEventListener('click', () => resetForm(container))
}

function renderList(container, campaigns) {
  const list = container.querySelector('#campaign-list')
  list.innerHTML = campaigns
    .map((c) => {
      const venueNames = (c.campaign_venues ?? []).map((cv) => cv.venues?.name).filter(Boolean).join(', ')
      const status = c.approved ? 'approved' : 'pending approval'
      return `
      <div class="flex items-center justify-between bg-surface rounded-lg border border-white/10 px-3 py-2">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(c.name || c.offers?.headline || 'Untitled campaign')}</p>
          <p class="text-xs text-white/40">${escapeHtml(c.vendors?.dba_name ?? '')} · ${status} · ${venueNames || 'no venues'}</p>
          <p class="text-xs text-white/30">${formatRange(c.starts_at, c.ends_at)}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-edit="${c.id}" class="text-xs px-2 py-1 rounded bg-white/10">Edit</button>
          <button data-delete="${c.id}" class="text-xs px-2 py-1 rounded bg-red-900/50">Delete</button>
        </div>
      </div>
    `
    })
    .join('') || '<p class="text-sm text-white/40">No campaigns yet.</p>'

  list.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const c = campaigns.find((x) => x.id === btn.dataset.edit)
      if (c) fillForm(container, c)
    })
  )
  list.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const c = campaigns.find((x) => x.id === btn.dataset.delete)
      if (!confirm(`Delete campaign "${c?.name || c?.offers?.headline}"?`)) return
      await deleteCampaign(btn.dataset.delete)
      renderCampaignsSection(container)
    })
  )
}

function formatRange(startsAt, endsAt) {
  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return `${fmt(startsAt)} → ${fmt(endsAt)}`
}

function toLocalInputValue(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function wireForm(container, offers) {
  const form = container.querySelector('#campaign-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = container.querySelector('#campaign-error')
    errorEl.textContent = ''
    const fd = new FormData(form)
    const offerId = fd.get('offer_id')
    const offer = offers.find((o) => o.id === offerId)
    const venueIds = fd.getAll('venue_ids')

    const payload = {
      offer_id: offerId,
      vendor_id: offer?.vendor_id,
      name: fd.get('name') || null,
      starts_at: new Date(fd.get('starts_at')).toISOString(),
      ends_at: new Date(fd.get('ends_at')).toISOString(),
      price_paid: fd.get('price_paid') ? Number(fd.get('price_paid')) : null,
      approved: fd.get('approved') === 'on',
      active: fd.get('active') === 'on',
    }
    if (editingId) payload.id = editingId

    try {
      const saved = await upsertCampaign(payload)
      await setCampaignVenues(saved.id, venueIds)
      renderCampaignsSection(container)
    } catch (err) {
      errorEl.textContent = err.message
    }
  })
}

function fillForm(container, campaign) {
  editingId = campaign.id
  const form = container.querySelector('#campaign-form')
  form.querySelector('[name=offer_id]').value = campaign.offer_id ?? ''
  form.querySelector('[name=name]').value = campaign.name ?? ''
  form.querySelector('[name=starts_at]').value = toLocalInputValue(campaign.starts_at)
  form.querySelector('[name=ends_at]').value = toLocalInputValue(campaign.ends_at)
  form.querySelector('[name=price_paid]').value = campaign.price_paid ?? ''
  form.querySelector('[name=approved]').checked = !!campaign.approved
  form.querySelector('[name=active]').checked = !!campaign.active

  const selectedVenueIds = new Set((campaign.campaign_venues ?? []).map((cv) => cv.venue_id))
  form.querySelectorAll('[name=venue_ids]').forEach((cb) => {
    cb.checked = selectedVenueIds.has(cb.value)
  })
}

function resetForm(container) {
  editingId = null
  const form = container.querySelector('#campaign-form')
  form.reset()
  form.querySelectorAll('[name=venue_ids]').forEach((cb) => (cb.checked = false))
}
