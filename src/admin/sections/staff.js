import { listVendorUsers, setVendorUserActive, inviteVendorStaff, listVendors } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'

export async function renderStaffSection(container) {
  const [staff, vendors] = await Promise.all([listVendorUsers(), listVendors()])

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <h2 class="text-lg font-bold mb-3">Vendor staff</h2>
        <p class="text-sm text-white/50 mb-3">Staff accounts sign in at <code class="text-hot">/scan</code> and can only redeem codes for their own business.</p>
        <div class="space-y-2" id="staff-list"></div>
      </div>
      <div class="card p-4">
        <h3 class="font-bold mb-3">Invite staff</h3>
        <form id="invite-form" class="space-y-4">
          <div>
            <label class="field-label" for="invite-vendor">Vendor</label>
            <select id="invite-vendor" name="vendorId" required class="field-select">
              ${vendors.map((v) => `<option value="${v.id}">${escapeHtml(v.dba_name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="field-label" for="invite-email">Email</label>
            <input id="invite-email" name="email" type="email" required class="field-input" />
          </div>
          <div>
            <label class="field-label" for="invite-role">Role</label>
            <select id="invite-role" name="role" class="field-select">
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <button type="submit" class="btn-primary">Send invite</button>
          <p id="invite-status" class="text-sm"></p>
        </form>
      </div>
    </div>
  `

  renderList(container, staff)
  wireInviteForm(container)
}

function renderList(container, staff) {
  const list = container.querySelector('#staff-list')
  list.innerHTML = staff
    .map(
      (s) => `
      <div class="flex items-center justify-between card px-3 py-2.5">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(s.email ?? 'Unknown')} ${s.active ? '' : '<span class="text-white/30">(revoked)</span>'}</p>
          <p class="text-xs text-white/40">${escapeHtml(s.vendors?.dba_name ?? '—')} · ${s.role}</p>
        </div>
        <button data-toggle="${s.user_id}" data-active="${s.active}"
          class="text-xs px-2.5 py-1 rounded-lg transition-colors ${
            s.active ? 'bg-red-950/60 text-red-300 hover:bg-red-900/60' : 'bg-white/10 hover:bg-white/20'
          }">${s.active ? 'Revoke' : 'Reinstate'}</button>
      </div>
    `
    )
    .join('') || '<p class="text-sm text-white/40">No staff invited yet.</p>'

  list.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const nextActive = btn.dataset.active !== 'true'
      await setVendorUserActive(btn.dataset.toggle, nextActive)
      renderStaffSection(container)
    })
  )
}

function wireInviteForm(container) {
  const form = container.querySelector('#invite-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = container.querySelector('#invite-status')
    statusEl.textContent = ''
    const fd = new FormData(form)
    const submitBtn = form.querySelector('button[type=submit]')
    submitBtn.disabled = true
    try {
      await inviteVendorStaff(fd.get('email'), fd.get('vendorId'), fd.get('role'))
      statusEl.className = 'text-sm text-green-400'
      statusEl.textContent = 'Invite sent.'
      renderStaffSection(container)
    } catch (err) {
      statusEl.className = 'text-sm text-red-400'
      statusEl.textContent = err.message
      submitBtn.disabled = false
    }
  })
}
