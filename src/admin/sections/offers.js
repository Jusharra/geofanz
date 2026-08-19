import { listOffers, upsertOffer, deleteOffer, listVendors } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'

const OFFER_TYPES = ['text', 'image', 'video', 'download', 'coupon', 'link']

// Non-blocking heads-up per CLAUDE.md: unlicensed team/league marks in offer
// copy are a business risk worth flagging, not worth hard-blocking a save.
const TRADEMARK_FLAGS = [
  'bulldogs', 'nfl', 'nba', 'nhl', 'mlb', 'ncaa', 'official sponsor',
  'official partner', 'championship', 'super bowl',
]

let editingId = null

export async function renderOffersSection(container) {
  const [offers, vendors] = await Promise.all([listOffers(), listVendors()])

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold">Offers</h2>
          <button id="offer-new" class="text-sm px-3 py-1.5 rounded-lg bg-hot font-semibold">+ New offer</button>
        </div>
        <div class="space-y-2" id="offer-list"></div>
      </div>
      <div class="bg-surface rounded-xl border border-white/10 p-4">
        <form id="offer-form" class="space-y-3">
          <label class="text-sm block">Vendor
            <select name="vendor_id" required class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2">
              ${vendors.map((v) => `<option value="${v.id}">${escapeHtml(v.dba_name)}</option>`).join('')}
            </select>
          </label>
          <label class="text-sm block">Headline
            <input name="headline" required class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>
          <label class="text-sm block">Deal text
            <input name="deal_text" placeholder="2 for $20, $5 off…" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>
          <label class="text-sm block">Description
            <textarea name="description" rows="2" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"></textarea>
          </label>
          <p id="trademark-warning" class="hidden text-xs text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2"></p>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-sm">Offer type
              <select name="offer_type" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2">
                ${OFFER_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </label>
            <label class="text-sm">Display code
              <input name="display_code" placeholder="Shown at redemption" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
            </label>
          </div>
          <label class="text-sm block">CTA URL
            <input name="cta_url" type="url" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>
          <label class="text-sm flex items-center gap-2">
            <input type="checkbox" name="active" checked class="w-4 h-4" /> Active
          </label>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 rounded-lg bg-hot font-bold">Save offer</button>
            <button type="button" id="offer-cancel" class="px-4 py-2 rounded-lg bg-white/10">Cancel</button>
          </div>
          <p id="offer-error" class="text-sm text-red-400"></p>
        </form>
      </div>
    </div>
  `

  renderList(container, offers)
  wireForm(container)

  container.querySelector('#offer-new').addEventListener('click', () => resetForm(container))
  container.querySelector('#offer-cancel').addEventListener('click', () => resetForm(container))
}

function renderList(container, offers) {
  const list = container.querySelector('#offer-list')
  list.innerHTML = offers
    .map(
      (o) => `
      <div class="flex items-center justify-between bg-surface rounded-lg border border-white/10 px-3 py-2">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(o.headline)} ${o.active ? '' : '<span class="text-white/30">(inactive)</span>'}</p>
          <p class="text-xs text-white/40">${escapeHtml(o.vendors?.dba_name ?? '—')} · ${o.offer_type}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-edit="${o.id}" class="text-xs px-2 py-1 rounded bg-white/10">Edit</button>
          <button data-delete="${o.id}" class="text-xs px-2 py-1 rounded bg-red-900/50">Delete</button>
        </div>
      </div>
    `
    )
    .join('') || '<p class="text-sm text-white/40">No offers yet.</p>'

  list.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const o = offers.find((x) => x.id === btn.dataset.edit)
      if (o) fillForm(container, o)
    })
  )
  list.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const o = offers.find((x) => x.id === btn.dataset.delete)
      if (!confirm(`Delete offer "${o?.headline}"? Campaigns using it will be deleted too.`)) return
      await deleteOffer(btn.dataset.delete)
      renderOffersSection(container)
    })
  )
}

function checkTrademarks(container) {
  const form = container.querySelector('#offer-form')
  const text = [
    form.querySelector('[name=headline]').value,
    form.querySelector('[name=deal_text]').value,
    form.querySelector('[name=description]').value,
  ]
    .join(' ')
    .toLowerCase()

  const hit = TRADEMARK_FLAGS.find((flag) => text.includes(flag))
  const warning = container.querySelector('#trademark-warning')
  if (hit) {
    warning.textContent = `Possible unlicensed trademark reference ("${hit}"). Double-check this offer doesn't imply a team/league endorsement before approving a campaign for it.`
    warning.classList.remove('hidden')
  } else {
    warning.classList.add('hidden')
  }
}

function wireForm(container) {
  const form = container.querySelector('#offer-form')
  ;['headline', 'deal_text', 'description'].forEach((name) => {
    form.querySelector(`[name=${name}]`).addEventListener('input', () => checkTrademarks(container))
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = container.querySelector('#offer-error')
    errorEl.textContent = ''
    const fd = new FormData(form)
    const payload = {
      vendor_id: fd.get('vendor_id'),
      headline: fd.get('headline'),
      deal_text: fd.get('deal_text') || null,
      description: fd.get('description') || null,
      offer_type: fd.get('offer_type'),
      display_code: fd.get('display_code') || null,
      cta_url: fd.get('cta_url') || null,
      active: fd.get('active') === 'on',
    }
    if (editingId) payload.id = editingId

    try {
      await upsertOffer(payload)
      renderOffersSection(container)
    } catch (err) {
      errorEl.textContent = err.message
    }
  })
}

function fillForm(container, offer) {
  editingId = offer.id
  const form = container.querySelector('#offer-form')
  form.querySelector('[name=vendor_id]').value = offer.vendor_id ?? ''
  form.querySelector('[name=headline]').value = offer.headline ?? ''
  form.querySelector('[name=deal_text]').value = offer.deal_text ?? ''
  form.querySelector('[name=description]').value = offer.description ?? ''
  form.querySelector('[name=offer_type]').value = offer.offer_type ?? 'text'
  form.querySelector('[name=display_code]').value = offer.display_code ?? ''
  form.querySelector('[name=cta_url]').value = offer.cta_url ?? ''
  form.querySelector('[name=active]').checked = !!offer.active
  checkTrademarks(container)
}

function resetForm(container) {
  editingId = null
  container.querySelector('#offer-form').reset()
  container.querySelector('#trademark-warning').classList.add('hidden')
}
