import { listVendors, upsertVendor, deleteVendor } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'
import { toastSuccess, toastError } from '../lib/toast.js'

let editingId = null

export async function renderVendorsSection(container) {
  const vendors = await listVendors()

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-condensed font-bold uppercase tracking-wide text-lg">Vendors</h2>
          <button id="vendor-new" class="btn-primary text-sm py-1.5 px-3">+ New vendor</button>
        </div>
        <div class="space-y-2" id="vendor-list"></div>
      </div>
      <div class="card p-4">
        <form id="vendor-form" class="space-y-4">
          <div>
            <label class="field-label" for="dba_name">DBA name</label>
            <input id="dba_name" name="dba_name" required class="field-input" />
          </div>
          <div>
            <label class="field-label" for="owner_name">Owner name</label>
            <input id="owner_name" name="owner_name" class="field-input" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label" for="v-email">Email</label>
              <input id="v-email" name="email" type="email" class="field-input" />
            </div>
            <div>
              <label class="field-label" for="v-phone">Phone</label>
              <input id="v-phone" name="phone" class="field-input" />
            </div>
          </div>
          <div>
            <label class="field-label" for="v-city">City</label>
            <input id="v-city" name="city" class="field-input" />
          </div>
          <div>
            <label class="field-label" for="billing_status">Billing status</label>
            <select id="billing_status" name="billing_status" class="field-select">
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <label class="switch">
            <input type="checkbox" name="active" checked />
            <span class="track"><span class="thumb"></span></span>
            <span class="text-sm">Active</span>
          </label>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="btn-primary">Save vendor</button>
            <button type="button" id="vendor-cancel" class="btn-secondary">Cancel</button>
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
      <div class="flex items-center justify-between card px-3 py-2.5">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(v.dba_name)} ${v.active ? '' : '<span class="text-white/30">(inactive)</span>'}</p>
          <p class="text-xs text-white/40">${v.billing_status} · ${escapeHtml(v.city ?? '')}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button data-edit="${v.id}" class="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">Edit</button>
          <button data-delete="${v.id}" class="text-xs px-2.5 py-1 rounded-lg bg-red-950/60 text-red-300 hover:bg-red-900/60 transition-colors">Delete</button>
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
      toastSuccess(`Deleted "${v?.dba_name}".`)
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
      toastSuccess('Vendor saved.')
      renderVendorsSection(container)
    } catch (err) {
      errorEl.textContent = err.message
      toastError(err.message)
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
