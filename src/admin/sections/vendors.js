import { listVendors, upsertVendor, deleteVendor } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'

let editingId = null

export async function renderVendorsSection(container) {
  const vendors = await listVendors()

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold">Vendors</h2>
          <button id="vendor-new" class="text-sm px-3 py-1.5 rounded-lg bg-hot font-semibold">+ New vendor</button>
        </div>
        <div class="space-y-2" id="vendor-list"></div>
      </div>
      <div class="bg-surface rounded-xl border border-white/10 p-4">
        <form id="vendor-form" class="space-y-3">
          <label class="text-sm block">DBA name
            <input name="dba_name" required class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>
          <label class="text-sm block">Owner name
            <input name="owner_name" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-sm">Email
              <input name="email" type="email" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
            </label>
            <label class="text-sm">Phone
              <input name="phone" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
            </label>
          </div>
          <label class="text-sm block">City
            <input name="city" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2" />
          </label>
          <label class="text-sm block">Billing status
            <select name="billing_status" class="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2">
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="past_due">past_due</option>
              <option value="canceled">canceled</option>
            </select>
          </label>
          <label class="text-sm flex items-center gap-2">
            <input type="checkbox" name="active" checked class="w-4 h-4" /> Active
          </label>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 rounded-lg bg-hot font-bold">Save vendor</button>
            <button type="button" id="vendor-cancel" class="px-4 py-2 rounded-lg bg-white/10">Cancel</button>
          </div>
          <p id="vendor-error" class="text-sm text-red-400"></p>
        </form>
      </div>
    </div>
  `

  renderList(container, vendors)
  wireForm(container)

  container.querySelector('#vendor-new').addEventListener('click', () => resetForm(container))
  container.querySelector('#vendor-cancel').addEventListener('click', () => resetForm(container))
}

function renderList(container, vendors) {
  const list = container.querySelector('#vendor-list')
  list.innerHTML = vendors
    .map(
      (v) => `
      <div class="flex items-center justify-between bg-surface rounded-lg border border-white/10 px-3 py-2">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(v.dba_name)} ${v.active ? '' : '<span class="text-white/30">(inactive)</span>'}</p>
          <p class="text-xs text-white/40">${v.billing_status} · ${escapeHtml(v.city ?? '')}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-edit="${v.id}" class="text-xs px-2 py-1 rounded bg-white/10">Edit</button>
          <button data-delete="${v.id}" class="text-xs px-2 py-1 rounded bg-red-900/50">Delete</button>
        </div>
      </div>
    `
    )
    .join('') || '<p class="text-sm text-white/40">No vendors yet.</p>'

  list.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const v = vendors.find((x) => x.id === btn.dataset.edit)
      if (v) fillForm(container, v)
    })
  )
  list.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const v = vendors.find((x) => x.id === btn.dataset.delete)
      if (!confirm(`Delete vendor "${v?.dba_name}"? Their offers/campaigns will be deleted too.`)) return
      await deleteVendor(btn.dataset.delete)
      renderVendorsSection(container)
    })
  )
}

function wireForm(container) {
  const form = container.querySelector('#vendor-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const errorEl = container.querySelector('#vendor-error')
    errorEl.textContent = ''
    const fd = new FormData(form)
    const payload = {
      dba_name: fd.get('dba_name'),
      owner_name: fd.get('owner_name') || null,
      email: fd.get('email') || null,
      phone: fd.get('phone') || null,
      city: fd.get('city') || null,
      billing_status: fd.get('billing_status'),
      active: fd.get('active') === 'on',
    }
    if (editingId) payload.id = editingId

    try {
      await upsertVendor(payload)
      renderVendorsSection(container)
    } catch (err) {
      errorEl.textContent = err.message
    }
  })
}

function fillForm(container, vendor) {
  editingId = vendor.id
  const form = container.querySelector('#vendor-form')
  form.querySelector('[name=dba_name]').value = vendor.dba_name ?? ''
  form.querySelector('[name=owner_name]').value = vendor.owner_name ?? ''
  form.querySelector('[name=email]').value = vendor.email ?? ''
  form.querySelector('[name=phone]').value = vendor.phone ?? ''
  form.querySelector('[name=city]').value = vendor.city ?? ''
  form.querySelector('[name=billing_status]').value = vendor.billing_status ?? 'trial'
  form.querySelector('[name=active]').checked = !!vendor.active
}

function resetForm(container) {
  editingId = null
  container.querySelector('#vendor-form').reset()
}
