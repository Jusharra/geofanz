import { listCampaignReports } from '../lib/data.js'
import { escapeHtml } from '../lib/dom.js'

export async function renderReportsSection(container) {
  const rows = await listCampaignReports()

  const money = (n) => `$${Number(n ?? 0).toFixed(2)}`
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  container.innerHTML = `
    <h2 class="text-lg font-bold mb-3">Campaign reports</h2>
    <div class="overflow-x-auto rounded-xl border border-white/10">
      <table class="w-full text-sm">
        <thead class="bg-surface text-white/50 text-xs uppercase">
          <tr>
            <th class="text-left px-3 py-2">Campaign</th>
            <th class="text-left px-3 py-2">Vendor</th>
            <th class="text-left px-3 py-2">Window</th>
            <th class="text-right px-3 py-2">Views</th>
            <th class="text-right px-3 py-2">Unlocks</th>
            <th class="text-right px-3 py-2">Clicks</th>
            <th class="text-right px-3 py-2">Unique</th>
            <th class="text-right px-3 py-2">Avg dist (m)</th>
            <th class="text-right px-3 py-2">Redemptions</th>
            <th class="text-right px-3 py-2">Attributed sales</th>
            <th class="text-right px-3 py-2">Price paid</th>
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
              <td class="px-3 py-2 text-right">${r.unlocks}</td>
              <td class="px-3 py-2 text-right">${r.clicks}</td>
              <td class="px-3 py-2 text-right">${r.unique_visitors}</td>
              <td class="px-3 py-2 text-right">${r.avg_distance_m ?? '—'}</td>
              <td class="px-3 py-2 text-right">${r.redemptions}</td>
              <td class="px-3 py-2 text-right">${money(r.attributed_sales)}</td>
              <td class="px-3 py-2 text-right">${money(r.price_paid)}</td>
            </tr>
          `
            )
            .join('') || `<tr><td colspan="11" class="px-3 py-6 text-center text-white/40">No campaigns yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `
}
