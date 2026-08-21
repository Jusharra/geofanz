import { listPartnerLeads, updatePartnerLeadStatus, listProblemReports, updateProblemReportStatus } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'
import { toastSuccess, toastError } from '../lib/toast.js'

let activeSubTab = 'leads'

const LEAD_STATUSES = ['new', 'contacted', 'converted', 'declined']
const REPORT_STATUSES = ['new', 'investigating', 'resolved']

const CATEGORY_LABELS = {
  no_deals: "Can't see deals",
  code_wont_scan: "Code wouldn't scan",
  vendor_refused: 'Vendor refused code',
  site_down: "Site won't load",
  other: 'Other',
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export async function renderInboxSection(container) {
  const [leads, reports] = await Promise.all([listPartnerLeads(), listProblemReports()])
  const newLeads = leads.filter((l) => l.status === 'new').length
  const newReports = reports.filter((r) => r.status === 'new').length

  const subTabs = [
    { id: 'leads', label: 'Partner leads', count: newLeads },
    { id: 'reports', label: 'Problem reports', count: newReports },
  ]

  container.innerHTML = `
    <h2 class="font-condensed font-bold uppercase tracking-wide text-lg mb-3">Inbox</h2>
    <div class="flex gap-1 mb-4 border-b border-white/10 overflow-x-auto">
      ${subTabs.map(
        (t) => `
        <button data-subtab="${t.id}"
          class="px-3 py-2 font-condensed font-bold uppercase tracking-wide text-xs whitespace-nowrap border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            activeSubTab === t.id ? 'text-white border-hot' : 'text-white/40 border-transparent hover:text-white/70'
          }">${t.label}${t.count > 0 ? `<span class="bg-hot text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">${t.count}</span>` : ''}</button>
      `
      ).join('')}
    </div>
    <div id="inbox-body"></div>
  `

  container.querySelectorAll('[data-subtab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      activeSubTab = btn.dataset.subtab
      renderInboxSection(container)
    })
  )

  const body = container.querySelector('#inbox-body')
  if (activeSubTab === 'leads') renderLeads(body, leads)
  else renderReports(body, reports)
}

function renderLeads(body, leads) {
  body.innerHTML = `
    <div class="space-y-2">
      ${leads
        .map(
          (l) => `
        <div class="card p-3.5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold text-sm">${escapeHtml(l.business_name)}</p>
              <p class="text-xs text-white/50">${escapeHtml(l.contact_name)} · ${escapeHtml(l.contact_info)}</p>
              ${l.sells ? `<p class="text-xs text-white/40 mt-1">Sells: ${escapeHtml(l.sells)}</p>` : ''}
              ${l.event_interest ? `<p class="text-xs text-white/40">Wants: ${escapeHtml(l.event_interest)}</p>` : ''}
            </div>
            <div class="text-right shrink-0">
              <select data-lead-status="${l.id}" class="field-select text-xs py-1">
                ${LEAD_STATUSES.map((s) => `<option value="${s}" ${s === l.status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
              <p class="text-xs text-white/30 mt-1">${relativeTime(l.created_at)}</p>
            </div>
          </div>
        </div>
      `
        )
        .join('') || '<p class="text-sm text-white/40">No partner leads yet.</p>'}
    </div>
  `

  body.querySelectorAll('[data-lead-status]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      try {
        await updatePartnerLeadStatus(sel.dataset.leadStatus, sel.value)
        toastSuccess('Lead updated.')
        renderInboxSection(body.parentElement)
      } catch (err) {
        toastError(err.message)
      }
    })
  )
}

function renderReports(body, reports) {
  body.innerHTML = `
    <div class="space-y-2">
      ${reports
        .map(
          (r) => `
        <div class="card p-3.5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold text-sm">${escapeHtml(CATEGORY_LABELS[r.category] ?? r.category)}</p>
              ${r.details ? `<p class="text-xs text-white/60 mt-1">${escapeHtml(r.details)}</p>` : ''}
              <p class="text-xs text-white/40 mt-1">${r.venues?.name ? `Near ${escapeHtml(r.venues.name)}` : 'No venue context'}${r.contact_info ? ` · ${escapeHtml(r.contact_info)}` : ''}</p>
            </div>
            <div class="text-right shrink-0">
              <select data-report-status="${r.id}" class="field-select text-xs py-1">
                ${REPORT_STATUSES.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
              <p class="text-xs text-white/30 mt-1">${relativeTime(r.created_at)}</p>
            </div>
          </div>
        </div>
      `
        )
        .join('') || '<p class="text-sm text-white/40">No problem reports yet.</p>'}
    </div>
  `

  body.querySelectorAll('[data-report-status]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      try {
        await updateProblemReportStatus(sel.dataset.reportStatus, sel.value)
        toastSuccess('Report updated.')
        renderInboxSection(body.parentElement)
      } catch (err) {
        toastError(err.message)
      }
    })
  )
}
