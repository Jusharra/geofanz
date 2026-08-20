import { listCampaignReports, listCampaignHourly, listVenueDiagnostics } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'
import { downloadCsv } from '../lib/csv.js'

let activeSubTab = 'vendor'
let selectedCampaignId = null

const SUB_TABS = [
  { id: 'vendor', label: 'Vendor report' },
  { id: 'hourly', label: 'Hourly chart' },
  { id: 'diagnostics', label: 'Diagnostics (internal)' },
]

export async function renderReportsSection(container) {
  container.innerHTML = `
    <div class="flex gap-1 mb-4 border-b border-white/10 overflow-x-auto">
      ${SUB_TABS.map(
        (t) => `
        <button data-subtab="${t.id}"
          class="px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
            activeSubTab === t.id ? 'text-white border-hot' : 'text-white/40 border-transparent hover:text-white/70'
          }">${t.label}</button>
      `
      ).join('')}
    </div>
    <div id="reports-body"></div>
  `

  container.querySelectorAll('[data-subtab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      activeSubTab = btn.dataset.subtab
      renderReportsSection(container)
    })
  )

  const body = container.querySelector('#reports-body')
  if (activeSubTab === 'vendor') await renderVendorReport(body)
  else if (activeSubTab === 'hourly') await renderHourly(body)
  else await renderDiagnostics(body)
}

// ---------- vendor report ----------

async function renderVendorReport(body) {
  const rows = await listCampaignReports()
  const money = (n) => `$${Number(n ?? 0).toFixed(2)}`
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const pct = (n) => (n == null ? '—' : `${n}%`)

  body.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm text-white/50">What the vendor sees when you hand them this on Monday.</p>
      <button id="export-csv" class="btn-secondary text-sm py-1.5 px-3">Download CSV</button>
    </div>
    <div class="overflow-x-auto rounded-xl border border-white/10">
      <table class="w-full text-sm">
        <thead class="bg-surface text-white/50 text-xs uppercase">
          <tr>
            <th class="text-left px-3 py-2">Campaign</th>
            <th class="text-left px-3 py-2">Vendor</th>
            <th class="text-left px-3 py-2">Window</th>
            <th class="text-right px-3 py-2">Views</th>
            <th class="text-right px-3 py-2">Unique people</th>
            <th class="text-right px-3 py-2">Unlocks</th>
            <th class="text-right px-3 py-2">Clicks</th>
            <th class="text-right px-3 py-2">Video plays</th>
            <th class="text-right px-3 py-2">Video completes</th>
            <th class="text-right px-3 py-2">Engagement</th>
            <th class="text-right px-3 py-2">Redemptions</th>
            <th class="text-right px-3 py-2">Attributed sales</th>
            <th class="text-right px-3 py-2">Price paid</th>
            <th class="text-right px-3 py-2 text-hot">Cost / person</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr class="border-t border-white/5">
              <td class="px-3 py-2">${escapeHtml(r.campaign_name || r.headline)}</td>
              <td class="px-3 py-2 text-white/60">${escapeHtml(r.vendor)}</td>
              <td class="px-3 py-2 text-white/40 whitespace-nowrap">${fmtDate(r.starts_at)}–${fmtDate(r.ends_at)}</td>
              <td class="px-3 py-2 text-right">${r.views}</td>
              <td class="px-3 py-2 text-right">${r.unique_people}</td>
              <td class="px-3 py-2 text-right">${r.unlocks}</td>
              <td class="px-3 py-2 text-right">${r.clicks}</td>
              <td class="px-3 py-2 text-right">${r.video_plays}</td>
              <td class="px-3 py-2 text-right">${r.video_completions}</td>
              <td class="px-3 py-2 text-right">${pct(r.engagement_pct)}</td>
              <td class="px-3 py-2 text-right">${r.redemptions}</td>
              <td class="px-3 py-2 text-right">${money(r.attributed_sales)}</td>
              <td class="px-3 py-2 text-right">${money(r.price_paid)}</td>
              <td class="px-3 py-2 text-right font-bold text-hot">${r.cost_per_person != null ? `$${r.cost_per_person}` : '—'}</td>
            </tr>
          `
            )
            .join('') || `<tr><td colspan="14" class="px-3 py-6 text-center text-white/40">No campaigns yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `

  body.querySelector('#export-csv').addEventListener('click', () => {
    downloadCsv('campaign_report.csv', rows)
  })
}

// ---------- hourly chart ----------

async function renderHourly(body) {
  const campaigns = await listCampaignReports()
  if (!selectedCampaignId && campaigns[0]) selectedCampaignId = campaigns[0].campaign_id

  body.innerHTML = `
    <div class="mb-4 max-w-sm">
      <label class="field-label" for="hourly-campaign">Campaign</label>
      <select id="hourly-campaign" class="field-select">
        ${campaigns
          .map(
            (c) =>
              `<option value="${c.campaign_id}" ${c.campaign_id === selectedCampaignId ? 'selected' : ''}>${escapeHtml(c.campaign_name || c.headline)} — ${escapeHtml(c.vendor)}</option>`
          )
          .join('')}
      </select>
    </div>
    <div id="hourly-chart"></div>
  `

  if (campaigns.length === 0) {
    body.querySelector('#hourly-chart').innerHTML = '<p class="text-sm text-white/40">No campaigns yet.</p>'
    return
  }

  body.querySelector('#hourly-campaign').addEventListener('change', (e) => {
    selectedCampaignId = e.target.value
    renderChart(body.querySelector('#hourly-chart'))
  })

  await renderChart(body.querySelector('#hourly-chart'))
}

async function renderChart(chartEl) {
  chartEl.innerHTML = '<p class="text-white/40 text-sm">Loading…</p>'
  const rows = await listCampaignHourly(selectedCampaignId)

  if (rows.length === 0) {
    chartEl.innerHTML = '<p class="text-sm text-white/40">No activity logged for this campaign yet.</p>'
    return
  }

  const max = Math.max(...rows.map((r) => r.views), 1)
  const fmtHour = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric' })

  chartEl.innerHTML = `
    <p class="text-xs text-white/40 mb-3">This is the chart that sells the next game — it shows exactly when the crowd was live, so you know when to staff.</p>
    <div class="card p-4 flex items-end gap-2 overflow-x-auto" style="height: 220px">
      ${rows
        .map((r) => {
          const h = Math.max(4, Math.round((r.views / max) * 180))
          return `
          <div class="flex flex-col items-center justify-end h-full shrink-0" style="width: 40px" title="${r.views} views, ${r.unique_people} unique, ${r.unlocks} unlocks">
            <span class="text-[10px] text-white/50 mb-1">${r.views}</span>
            <div class="w-full bg-hot rounded-t" style="height: ${h}px"></div>
            <span class="text-[10px] text-white/40 mt-1 whitespace-nowrap">${fmtHour(r.hour)}</span>
          </div>
        `
        })
        .join('')}
    </div>
  `
}

// ---------- diagnostics (internal only) ----------

async function renderDiagnostics(body) {
  const rows = await listVenueDiagnostics()

  body.innerHTML = `
    <div class="mb-4 px-4 py-3 rounded-xl bg-amber-950/40 border border-amber-800/50">
      <p class="text-sm font-bold text-amber-400">Internal only — never show this to a vendor.</p>
      <p class="text-xs text-amber-400/80 mt-1">High <strong>outside scans</strong> means your flyers are landing too far from the gate. High <strong>denied %</strong> means your location-permission copy isn't convincing people. Watch <strong>avg GPS accuracy</strong> near the stadium structure — 50m+ means your fence needs more buffer than the 150m clamp.</p>
    </div>
    <div class="overflow-x-auto rounded-xl border border-white/10">
      <table class="w-full text-sm">
        <thead class="bg-surface text-white/50 text-xs uppercase">
          <tr>
            <th class="text-left px-3 py-2">Venue</th>
            <th class="text-left px-3 py-2">Day</th>
            <th class="text-right px-3 py-2">Inside views</th>
            <th class="text-right px-3 py-2">Outside scans</th>
            <th class="text-right px-3 py-2">Denied</th>
            <th class="text-right px-3 py-2">Denied %</th>
            <th class="text-right px-3 py-2">Avg outside dist (m)</th>
            <th class="text-right px-3 py-2">Avg GPS accuracy (m)</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const badAccuracy = r.avg_gps_accuracy_m != null && r.avg_gps_accuracy_m >= 50
              const badDenied = r.denied_pct != null && r.denied_pct >= 20
              return `
              <tr class="border-t border-white/5">
                <td class="px-3 py-2">${escapeHtml(r.venue_name)}</td>
                <td class="px-3 py-2 text-white/40">${r.day ? new Date(r.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                <td class="px-3 py-2 text-right">${r.inside_views}</td>
                <td class="px-3 py-2 text-right">${r.outside_scans}</td>
                <td class="px-3 py-2 text-right">${r.permission_denied}</td>
                <td class="px-3 py-2 text-right ${badDenied ? 'text-amber-400 font-bold' : ''}">${r.denied_pct != null ? `${r.denied_pct}%` : '—'}</td>
                <td class="px-3 py-2 text-right">${r.avg_outside_distance_m ?? '—'}</td>
                <td class="px-3 py-2 text-right ${badAccuracy ? 'text-amber-400 font-bold' : ''}">${r.avg_gps_accuracy_m ?? '—'}</td>
              </tr>
            `
            })
            .join('') || `<tr><td colspan="8" class="px-3 py-6 text-center text-white/40">No activity yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `
}
